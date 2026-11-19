import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { users } from "@shared/models/auth";
import { accountCompanyPhones, certificates, companyDirectory, connectedAccounts } from "@shared/schema";
import { matchPhoneCompany, registerAccountCompanyPhoneRoutes } from "./accountCompanyPhones";

test("company matching uses approved exact names/aliases and rejects ambiguity", () => {
  const company = { id: "a", name: "Synthetic Bank", aliases: ["Synthetic"], status: "active", verifiedAt: new Date() } as any;
  assert.equal(matchPhoneCompany({ accountName: "Synthetic checking" }, [company])?.id, "a");
  assert.equal(matchPhoneCompany({ accountName: "Not Synthetic Bank" }, [company]), undefined);
  assert.equal(matchPhoneCompany({ accountName: "Synthetic" }, [company, { ...company, id: "b" }]), undefined);
  assert.equal(matchPhoneCompany({ accountName: "Synthetic" }, [{ ...company, verifiedAt: null }]), undefined);
  assert.equal(matchPhoneCompany({ accountName: "Synthetic", companyId: "revoked" }, [company]), undefined);
});

test("HTTP phone lookup preserves case access, proof provenance, refresh failure and rename isolation", async (t) => {
  const [staff, owner, outsider, caseA, caseB, accountA, accountB, companyId] = Array.from({ length: 8 }, () => randomUUID());
  const domain = `phone-${companyId}.example`;
  let calls = 0;
  let fail = false;
  let held: (() => void) | undefined;
  let started: (() => void) | undefined;
  let shouldHold = false;
  const app = express();
  app.use(express.json());
  const authentication: express.RequestHandler = (req: any, res, next) => {
    const actor = req.header("x-phone-test-user");
    if (!actor) { res.status(401).json({ message: "Unauthorized" }); return; }
    req.session = { userId: actor }; next();
  };
  registerAccountCompanyPhoneRoutes(app, authentication, async (website) => {
    calls++;
    if (shouldHold) { started?.(); await new Promise<void>((resolve) => { held = resolve; }); }
    return fail ? { status: "unavailable" } : {
      status: "verified", evidence: { phone: "+12025550123", sourceUrl: `${new URL(website).origin}/contact`, checkedAt: new Date() },
    };
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const port = (server.address() as any).port;
  const request = (id: string, actor: string | null, body?: object) =>
    fetch(`http://127.0.0.1:${port}/api/accounts/${id}/company-phone`, {
      method: body ? "POST" : "GET",
      headers: { ...(actor ? { "x-phone-test-user": actor } : {}), "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  t.after(async () => {
    held?.();
    await db.delete(connectedAccounts).where(eq(connectedAccounts.certificateId, caseA));
    await db.delete(connectedAccounts).where(eq(connectedAccounts.certificateId, caseB));
    await db.delete(certificates).where(eq(certificates.id, caseA));
    await db.delete(certificates).where(eq(certificates.id, caseB));
    await db.delete(companyDirectory).where(eq(companyDirectory.id, companyId));
    for (const id of [staff, owner, outsider]) await db.delete(users).where(eq(users.id, id));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });
  await db.insert(users).values([
    { id: staff, email: `${staff}@example.test`, role: "admin", emailVerified: true },
    { id: owner, email: `${owner}@example.test`, role: "user", emailVerified: true },
    { id: outsider, email: `${outsider}@example.test`, role: "user", emailVerified: true },
  ]);
  await db.insert(certificates).values([caseA, caseB].map((id) => ({
    id, userId: id === caseA ? owner : outsider, deceasedName: "Synthetic phone lookup test",
    dateOfDeath: "2026-01-01", dateOfBirth: "1940-01-01", certificateNumber: id, issuingAuthority: "Synthetic test",
  })));
  await db.insert(companyDirectory).values({
    id: companyId, name: `Synthetic Bank ${companyId}`, aliases: [], category: "financial",
    officialDomain: domain, website: `https://${domain}/`, status: "active", verifiedAt: new Date(), source: "synthetic_test",
  });
  await db.insert(connectedAccounts).values([
    { id: accountA, certificateId: caseA, accountName: `Synthetic Bank ${companyId}`, accountType: "Checking", category: "financial" },
    { id: accountB, certificateId: caseB, accountName: "Unlisted Synthetic Provider", accountType: "Membership", category: "memberships" },
  ]);
  assert.equal((await request(accountA, null)).status, 401);
  assert.equal((await request(accountA, outsider)).status, 404);
  assert.equal((await request(randomUUID(), staff)).status, 404);
  assert.equal(calls, 0);
  const family = await (await request(accountA, owner)).json();
  assert.equal(family.status, "verified");
  assert.equal(family.phone, "+12025550123");
  assert.equal(family.canManage, false);
  assert.equal(family.sourceKind, "directory");
  assert.equal(calls, 1);
  assert.equal((await (await request(accountA, staff)).json()).phone, "+12025550123");
  assert.equal(calls, 1, "the stored evidence should prevent another website request");
  assert.equal((await request(accountA, owner, {})).status, 403);
  assert.equal((await request(accountA, staff, { phone: "+12025550199", status: "verified" })).status, 400);
  assert.equal((await request(accountB, staff, { officialWebsite: `https://${domain}/` })).status, 400);
  assert.equal((await request(accountB, staff, { officialWebsite: "http://bank.example/", confirmedOfficialWebsite: true })).status, 400);
  assert.equal((await (await request(accountB, staff)).json()).status, "needs_website");
  const manual = await (await request(accountB, staff, { officialWebsite: `https://${domain}/`, confirmedOfficialWebsite: true })).json();
  assert.equal(manual.status, "verified");
  assert.equal(manual.sourceKind, "staff_confirmed");
  assert.equal((await db.select().from(accountCompanyPhones).where(eq(accountCompanyPhones.accountId, accountB)))[0].verifiedBy, staff);
  fail = true;
  assert.equal((await (await request(accountA, staff, {})).json()).status, "unavailable");
  assert.equal((await (await request(accountA, staff)).json()).phone, null, "a failed recheck must not resurrect old verified evidence");
  fail = false;
  assert.equal((await (await request(accountA, staff)).json()).status, "verified");
  await db.update(connectedAccounts).set({ accountName: "Renamed Unlisted Provider" }).where(eq(connectedAccounts.id, accountA));
  assert.equal((await (await request(accountA, staff)).json()).status, "needs_website");
  shouldHold = true;
  const reached = new Promise<void>((resolve) => { started = resolve; });
  const pending = request(accountB, staff, {});
  await reached;
  await db.update(connectedAccounts).set({ accountName: "Different Synthetic Provider" }).where(eq(connectedAccounts.id, accountB));
  held!();
  assert.equal((await pending).status, 409);
  assert.equal((await (await request(accountB, staff)).json()).phone, null);
  await db.delete(connectedAccounts).where(eq(connectedAccounts.id, accountA));
  assert.equal((await db.select().from(accountCompanyPhones).where(eq(accountCompanyPhones.accountId, accountA))).length, 0);
});
