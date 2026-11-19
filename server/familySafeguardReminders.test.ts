import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { caseEvents, caseFamilyAuthorizations, caseFamilyMemberships, certificates, users } from "@shared/schema";
import { FAMILY_SHARING_TEXT, FAMILY_SHARING_VERSION } from "@shared/familySharing";
import { registerFamilySafeguardReminders } from "./familySafeguardReminders";
import { buildFamilySafeguardReminderEmail } from "./familySafeguardReminderEmail";

test("unverified restricted members still see concierge reminder actions", () => {
  const source = readFileSync("client/src/components/family-authorizations.tsx", "utf8");
  assert.ok(source.includes('mode === "admin" && member.membershipStatus === "active" && !member.idVerified'));
  assert.ok(source.includes('mode === "admin" && member.membershipStatus === "active" && !member.sharingAuthorized'));
  assert.ok(!source.includes('mode === "admin" && active && !member.idVerified'));
});

test("reminder emails are minimal sign-in links, not authentication or document requests", () => {
  for (const kind of ["id", "owner_approval"] as const) {
    const email = buildFamilySafeguardReminderEmail({ kind, to: "synthetic@example.invalid", appUrl: "https://example.invalid/" });
    assert.equal(email.to, "synthetic@example.invalid");
    assert.equal(email.disableProviderClickTracking, true);
    assert.ok(email.text.includes("does not approve anyone"));
    assert.ok(email.text.includes("do not reply with an ID"));
    assert.ok(!email.text.includes("token="));
    assert.equal((email as any).attachments, undefined);
    assert.ok(email.text.includes(kind === "id" ? "https://example.invalid/family-access" : "https://example.invalid/"));
  }
});

test("staff reminder HTTP flow scopes recipients, enforces confirmation and blocks concurrent duplicate sends", async () => {
  const suffix = randomUUID();
  const ownerId = `reminder-owner-${suffix}`, memberId = `reminder-member-${suffix}`;
  const adminId = `reminder-admin-${suffix}`, strangerId = `reminder-stranger-${suffix}`;
  const certId = `reminder-case-${suffix}`, otherCertId = `reminder-other-${suffix}`;
  const ids = [ownerId, memberId, adminId, strangerId];
  const sent: ReturnType<typeof buildFamilySafeguardReminderEmail>[] = [];
  let configured = true, accepted = true;
  const app = express();
  app.use(express.json());
  registerFamilySafeguardReminders(app, (req: any, _res, next) => {
    req.session = { userId: req.header("x-test-actor") }; next();
  }, {
    send: async email => { sent.push(email as any); return accepted; },
    configured: () => configured, appUrl: () => "https://example.invalid",
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (actor = adminId, target = memberId, kind = "id", caseId = certId, confirmed = true) => {
    const response = await fetch(`${base}/api/admin/case/${caseId}/family-members/${target}/remind`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-actor": actor },
      body: JSON.stringify({ kind, confirmed }),
    });
    return { status: response.status, data: await response.json() as any };
  };
  try {
    await db.insert(users).values(ids.map(id => ({
      id, email: `${id}@example.invalid`, firstName: "Synthetic", lastName: "Test",
      role: id === adminId ? "admin" as const : "user" as const, emailVerified: true,
    })));
    await db.insert(certificates).values([
      { id: certId, userId: ownerId, deceasedName: "Synthetic Reminder Case", status: "verified",
        dateOfDeath: "2026-01-01", dateOfBirth: "1940-01-01", certificateNumber: certId, issuingAuthority: "Synthetic test authority" },
      { id: otherCertId, userId: strangerId, deceasedName: "Synthetic Other Case", status: "verified",
        dateOfDeath: "2026-01-01", dateOfBirth: "1940-01-01", certificateNumber: otherCertId, issuingAuthority: "Synthetic test authority" },
    ]);
    const [membership] = await db.insert(caseFamilyMemberships).values({ certificateId: certId, userId: memberId, status: "active" }).returning();
    assert.equal((await request(ownerId)).status, 403);
    assert.equal((await request(memberId)).status, 403);
    assert.equal((await request(adminId, memberId, "id", certId, false)).status, 400);
    assert.equal((await request(adminId, strangerId)).status, 404);
    assert.equal((await request(adminId, memberId, "id", otherCertId)).status, 404);
    configured = false;
    assert.equal((await request()).status, 503);
    assert.equal(sent.length, 0);
    configured = true;
    const concurrent = await Promise.all([request(), request()]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 429]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, `${memberId}@example.invalid`);
    assert.ok(concurrent.some(result => result.data.emailSent === true));
    assert.equal((await request()).status, 429);
    const approval = await request(adminId, memberId, "owner_approval");
    assert.equal(approval.status, 200);
    assert.equal(sent[1].to, `${ownerId}@example.invalid`);
    assert.equal((await db.select().from(caseFamilyAuthorizations).where(eq(caseFamilyAuthorizations.membershipId, membership.id))).length, 0);
    await db.update(users).set({ idVerificationStatus: "verified", idVerifiedName: "Synthetic Test" }).where(eq(users.id, memberId));
    assert.equal((await request()).status, 409);
    await db.insert(caseFamilyAuthorizations).values({
      membershipId: membership.id, authorizedBy: ownerId, ownerSignature: "Synthetic Test",
      agreementVersion: FAMILY_SHARING_VERSION, agreementText: FAMILY_SHARING_TEXT, scope: "helper",
    });
    assert.equal((await request(adminId, memberId, "owner_approval")).status, 409);
    await db.update(caseFamilyMemberships).set({ status: "revoked" }).where(eq(caseFamilyMemberships.id, membership.id));
    assert.equal((await request()).status, 404);
    // A definite/uncertain email failure still reserves its request against instant retries.
    accepted = false;
    assert.equal((await request(adminId, ownerId)).status, 502);
    assert.equal((await request(adminId, ownerId)).status, 429);
    const events = await db.select().from(caseEvents).where(eq(caseEvents.certificateId, certId));
    assert.ok(events.some(event => event.eventType === "family_safeguard_reminder_failed"));
    assert.equal(sent.length, 3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(certificates).where(inArray(certificates.id, [certId, otherCertId]));
    await db.delete(users).where(inArray(users.id, ids));
    await pool.end();
  }
});
