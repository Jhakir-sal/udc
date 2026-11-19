import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { caseEvents, certificates, nextOfKinPrivateIdentities, users } from "@shared/schema";
import { nextOfKinIdentityInput } from "@shared/nextOfKinIdentity";
import { openIdentity, sealIdentity, registerNextOfKinIdentity } from "./nextOfKinIdentity";

test("private identities validate dates and SSNs and authenticate encrypted case/contact binding", () => {
  const value = { ssn: "123456789", dob: "1980-02-29" };
  const secret = "synthetic-test-key-not-used-outside-tests";
  const sealed = sealIdentity(value, "case-a", "contact-a", secret);
  assert(!sealed.includes(value.ssn));
  assert(!sealed.includes(value.dob));
  assert.deepEqual(openIdentity(sealed, "case-a", "contact-a", secret), value);
  assert.notEqual(sealed, sealIdentity(value, "case-a", "contact-a", secret));
  for (const [caseId, token, key] of [["case-b", "contact-a", secret], ["case-a", "contact-b", secret], ["case-a", "contact-a", "wrong-key"]]) {
    assert.throws(() => openIdentity(sealed, caseId, token, key));
  }
  const input = { contactToken: "a".repeat(64), version: null, ...value };
  assert(nextOfKinIdentityInput.safeParse(input).success);
  assert(nextOfKinIdentityInput.safeParse({ ...input, ssn: "123-45-6789" }).success);
  for (const dob of ["1981-02-29", "1980-04-31", "2999-01-01", "not a date"]) {
    assert(!nextOfKinIdentityInput.safeParse({ ...input, dob }).success);
  }
  for (const ssn of ["000456789", "666456789", "900456789", "123006789", "123450000", "1234"]) {
    assert(!nextOfKinIdentityInput.safeParse({ ...input, ssn }).success);
  }
  assert(!nextOfKinIdentityInput.safeParse({ ...input, role: "admin" }).success);
});

test("private identity routes are staff-only, encrypted, case-bound, audited and explicit-reveal only", async () => {
  const admin = randomUUID(), family = randomUUID(), caseA = randomUUID(), caseB = randomUUID();
  const app = express(); app.use(express.json());
  registerNextOfKinIdentity(app, (req: any, _res, next) => {
    req.session = { userId: req.header("x-test-actor") }; next();
  });
  const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (method = "GET", body?: unknown, actor = admin, caseId = caseA) => {
    const response = await fetch(`${url}/api/admin/case/${caseId}/next-of-kin-private-identity${method === "POST" ? "/reveal" : ""}`, {
      method, headers: { "content-type": "application/json", "x-test-actor": actor },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return { status: response.status, data: await response.json() as any };
  };
  try {
    await db.insert(users).values([
      { id: admin, role: "admin", email: `${admin}@example.invalid` },
      { id: family, role: "user", email: `${family}@example.invalid` },
    ]);
    await db.insert(certificates).values([caseA, caseB].map(id => ({
      id, userId: family, deceasedName: "Synthetic Test Case",
      dateOfBirth: "1950-01-01", dateOfDeath: "2026-01-01",
      certificateNumber: `SYN-IDENTITY-${id}`, issuingAuthority: "Synthetic",
      nextOfKinName: "Synthetic Next of Kin",
    })));
    for (const method of ["GET", "POST", "PUT"]) {
      assert.equal((await request(method, method === "GET" ? undefined : {}, family)).status, 403);
      assert.equal((await request(method, method === "GET" ? undefined : {}, "")).status, 401);
    }
    assert.equal((await request("GET", undefined, admin, randomUUID())).status, 404);
    const meta = (await request()).data;
    assert.equal(meta.hasSsn, false);
    const payload = { contactToken: meta.contactToken, version: meta.version, ssn: "123456789", dob: "1980-02-29" };
    assert.equal((await request("PUT", { ...payload, dob: "1981-02-29" })).status, 400);
    assert.equal((await request("PUT", payload)).status, 200);
    const saved = (await request()).data;
    assert.equal(saved.hasSsn, true); assert.equal(saved.hasDob, true);
    assert(!JSON.stringify(saved).includes(payload.ssn));
    assert(!JSON.stringify(saved).includes(payload.dob));
    const [stored] = await db.select().from(nextOfKinPrivateIdentities).where(eq(nextOfKinPrivateIdentities.certificateId, caseA));
    assert(!JSON.stringify(stored).includes(payload.ssn)); assert(!JSON.stringify(stored).includes(payload.dob));
    assert.equal((await request("GET", undefined, admin, caseB)).data.hasSsn, false);
    assert.equal((await request("POST", { contactToken: meta.contactToken }, admin, caseB)).status, 409);
    const revealed = await request("POST", { contactToken: meta.contactToken });
    assert.equal(revealed.data.ssn, payload.ssn); assert.equal(revealed.data.dob, payload.dob);
    assert.equal((await request("PUT", { ...payload, ssn: "234567891" })).status, 409);
    const updates = await Promise.all([
      request("PUT", { ...payload, version: saved.version, ssn: "234567891" }),
      request("PUT", { ...payload, version: saved.version, ssn: "345678912" }),
    ]);
    assert.deepEqual(updates.map(r => r.status).sort(), [200, 409]);
    await db.update(certificates).set({ nextOfKinName: "Different Synthetic Person" }).where(eq(certificates.id, caseA));
    assert.equal((await request()).data.hasSsn, false);
    assert.equal((await request("POST", { contactToken: meta.contactToken })).status, 409);
    const changed = (await request()).data;
    assert.equal((await request("POST", { contactToken: changed.contactToken })).data.ssn, null);
    assert.equal((await request("PUT", { ...payload, contactToken: changed.contactToken, version: null })).status, 200);
    const current = (await request()).data;
    assert.equal((await request("PUT", { ...current, hasSsn: undefined, hasDob: undefined, ssn: null, dob: null })).status, 200);
    assert.equal((await request()).data.hasSsn, false);
    const audit = await db.select().from(caseEvents).where(eq(caseEvents.certificateId, caseA));
    assert(audit.some(event => event.eventType === "next_of_kin_identity_viewed"));
    assert(!JSON.stringify(audit).includes(payload.ssn)); assert(!JSON.stringify(audit).includes(payload.dob));
    await db.delete(certificates).where(eq(certificates.id, caseA));
    assert.equal((await db.select().from(nextOfKinPrivateIdentities).where(eq(nextOfKinPrivateIdentities.certificateId, caseA))).length, 0);
  } finally {
    await db.delete(caseEvents).where(inArray(caseEvents.certificateId, [caseA, caseB]));
    await db.delete(certificates).where(inArray(certificates.id, [caseA, caseB]));
    await db.delete(users).where(inArray(users.id, [admin, family]));
    server.close(); await once(server, "close"); await pool.end();
  }
});
