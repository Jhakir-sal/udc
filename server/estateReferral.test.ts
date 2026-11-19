import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { certificates, users, caseEvents, estateReferrals, estateReferralRequests, estateReferralUpdates } from "@shared/schema";
import { ESTATE_REFERRAL_FIRMS, estateReferralFirmChoice, estateReferralLocalDate, estateReferralIsoDate, estateReferralSaveSchema } from "@shared/estateReferral";
import { buildEstateReferralRequestEmail } from "./estateReferralEmail";
import { registerEstateReferralRoutes } from "./estateReferralRoutes";

const defaults = {
  expectedVersion: 0, reason: "search_no_match" as const, status: "needed" as const,
  attorneyName: "", attorneyFirm: "", attorneyEmail: "", attorneyPhone: "",
  referredAt: null, nextFollowUpAt: "2030-01-01T15:00:00.000Z",
  familyPermissionConfirmed: false, resolutionSummary: "",
};

test("estate referral validation distinguishes a needed referral from an actual handoff", () => {
  assert.equal(ESTATE_REFERRAL_FIRMS[0].label, "Kustra & Bloom");
  assert.equal(estateReferralFirmChoice("kustra and bloom"), "kustra_bloom");
  assert.equal(estateReferralFirmChoice("Kustra & Bloom"), "kustra_bloom");
  assert.equal(estateReferralFirmChoice("Other Synthetic Firm"), "manual");
  assert.equal(estateReferralFirmChoice(""), "manual");
  assert.equal(estateReferralIsoDate("2025-"), null);
  assert.equal(estateReferralIsoDate("not-a-date"), null);
  assert.equal(estateReferralIsoDate(""), null);
  assert.equal(estateReferralLocalDate("invalid"), "");
  assert.equal(estateReferralLocalDate(estateReferralIsoDate("2025-06-09T14:15")), "2025-06-09T14:15");
  assert(estateReferralSaveSchema.safeParse(defaults).success);
  assert(!estateReferralSaveSchema.safeParse({ ...defaults, status: "referred" }).success);
  assert(!estateReferralSaveSchema.safeParse({ ...defaults, nextFollowUpAt: null }).success);
  assert(!estateReferralSaveSchema.safeParse({ ...defaults, status: "closed" }).success);
  assert(!estateReferralSaveSchema.safeParse({ ...defaults, attorneyEmail: "bad\nemail" }).success);
  assert(!estateReferralSaveSchema.safeParse({ ...defaults, arbitraryRecipient: "outside@example.invalid" }).success);
  const mail = buildEstateReferralRequestEmail({ to: "lawyer@example.invalid", recipientKind: "attorney", reference: "SAL-ER-SYNTHETIC" });
  assert.equal(mail.replyTo, "hello@stepsafterlife.com");
  assert.equal(mail.disableProviderClickTracking, true);
  assert(!("attachments" in mail));
  assert(!("cc" in mail));
  assert(!/https?:\/\/|token=|certificateId/.test(mail.text));
  assert(mail.text.includes("does not establish an attorney-client relationship"));
});

test("case-scoped referral tracking, preview confirmation, duplicate prevention and uncertain outcomes", async () => {
  const [adminId, ownerId, otherId, certId, otherCertId] = Array.from({ length: 5 }, () => randomUUID());
  let configured = true;
  let accepted = true;
  const sent: any[] = [];
  const app = express();
  app.use(express.json());
  registerEstateReferralRoutes(app, (req: any, _res, next) => {
    req.session = { userId: req.header("x-test-actor") }; next();
  }, { configured: () => configured, send: async mail => { sent.push(mail); return accepted; } });
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const path = (caseId = certId) => `/api/admin/case/${caseId}/estate-referral`;
  const request = async (method: string, suffix = "", body?: any, actor = adminId, caseId = certId) => {
    const result = await fetch(`${url}${path(caseId)}${suffix}`, {
      method, headers: { "content-type": "application/json", "x-test-actor": actor },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: result.status, data: await result.json() as any };
  };
  try {
    await db.insert(users).values([
      { id: adminId, email: `${adminId}@example.invalid`, role: "admin", firstName: "Synthetic", lastName: "Staff", emailVerified: true },
      { id: ownerId, email: `${ownerId}@example.invalid`, role: "user", emailVerified: true },
      { id: otherId, email: `${otherId}@example.invalid`, role: "user", emailVerified: true },
    ]);
    await db.insert(certificates).values([certId, otherCertId].map((id, i) => ({
      id, userId: i ? otherId : ownerId, deceasedName: "Synthetic Private Deceased",
      dateOfBirth: "1950-01-01", dateOfDeath: "2026-01-01", certificateNumber: `SYN-ER-${id}`,
      issuingAuthority: "Synthetic Test", estateStatus: "no",
    })));
    assert.equal((await request("GET", "", undefined, ownerId)).status, 403);
    assert.equal((await request("GET", "", undefined, otherId)).status, 403);
    assert.equal((await request("GET", "", undefined, "")).status, 403);
    const initial = await request("GET");
    assert.equal(initial.data.referralNeeded, true);
    assert.equal(initial.data.referral, null);
    assert.equal((await request("PUT", "", { ...defaults, status: "referred" })).status, 400);
    const needed = await request("PUT", "", defaults);
    assert.equal(needed.status, 200);
    assert.equal(needed.data.status, "needed");
    assert.equal(sent.length, 0);
    assert.equal((await request("POST", "/requests/preview", { expectedVersion: 1, recipientKind: "attorney" })).status, 409);
    const placed = {
      ...defaults, expectedVersion: 1, status: "referred", attorneyName: "Synthetic Counsel",
      attorneyEmail: "counsel@example.invalid", attorneyPhone: "+1 202 555 0123",
      referredAt: "2026-01-01T15:00:00.000Z", familyPermissionConfirmed: true,
    };
    const saved = await request("PUT", "", placed);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.version, 2);
    assert(saved.data.permissionConfirmedAt);
    assert.equal((await request("PUT", "", placed)).status, 409);
    const preview = await request("POST", "/requests/preview", { expectedVersion: 2, recipientKind: "attorney" });
    assert.equal(preview.status, 201);
    assert.equal(preview.data.to, "counsel@example.invalid");
    assert.equal(sent.length, 0);
    assert(!preview.data.text.includes("Synthetic Private Deceased"));
    const sendPath = `/requests/${preview.data.id}/send`;
    assert.equal((await request("POST", sendPath, {})).status, 400);
    assert.equal((await request("POST", sendPath, { confirmed: true }, adminId, otherCertId)).status, 404);
    const pair = await Promise.all([
      request("POST", sendPath, { confirmed: true }),
      request("POST", sendPath, { confirmed: true }),
    ]);
    assert.deepEqual(pair.map(p => p.status).sort(), [200, 409]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].text, preview.data.text);
    assert(!("cc" in sent[0]));
    let current = (await request("GET")).data;
    assert.equal(current.referral.status, "awaiting_update");
    assert.equal(current.referralNeeded, false);
    const familyPreview = await request("POST", "/requests/preview", { expectedVersion: current.referral.version, recipientKind: "family" });
    assert.equal(familyPreview.data.to, `${ownerId}@example.invalid`);
    // An edited recipient invalidates the earlier preview instead of sending stale routing.
    const revised = await request("PUT", "", { ...placed, expectedVersion: current.referral.version, status: "in_progress", attorneyEmail: "newcounsel@example.invalid" });
    assert.equal(revised.status, 200);
    assert.equal((await request("POST", `/requests/${familyPreview.data.id}/send`, { confirmed: true })).status, 409);
    current = (await request("GET")).data;
    const familyAgain = await request("POST", "/requests/preview", { expectedVersion: current.referral.version, recipientKind: "family" });
    configured = false;
    assert.equal((await request("POST", `/requests/${familyAgain.data.id}/send`, { confirmed: true })).status, 503);
    configured = true; accepted = false;
    assert.equal((await request("POST", `/requests/${familyAgain.data.id}/send`, { confirmed: true })).status, 502);
    assert.equal(sent.length, 2);
    assert.equal((await request("POST", `/requests/${familyAgain.data.id}/send`, { confirmed: true })).status, 409);
    assert.equal(sent.length, 2);
    const noRetry = await request("POST", "/requests/preview", { expectedVersion: current.referral.version, recipientKind: "family" });
    assert.equal((await request("POST", `/requests/${noRetry.data.id}/send`, { confirmed: true })).status, 429);
    assert.equal((await request("POST", "/updates", {
      expectedVersion: current.referral.version, source: "family", summary: "Family has scheduled an appointment.",
      reportedAt: new Date(Date.now() - 60000).toISOString(),
    })).status, 201);
    current = (await request("GET")).data;
    assert.equal(current.updates.length, 1);
    assert.equal(current.updates[0].source, "family");
    assert(current.requests.some((r: any) => r.status === "needs_review"));
    const closed = await request("PUT", "", {
      ...placed, expectedVersion: current.referral.version, status: "closed",
      resolutionSummary: "Family confirms the attorney has taken over coordination.", nextFollowUpAt: null,
    });
    assert.equal(closed.status, 200);
    assert.equal((await request("POST", "/requests/preview", { expectedVersion: closed.data.version, recipientKind: "attorney" })).status, 409);
    assert.equal((await request("GET")).data.referralNeeded, false);
    assert.equal(sent.length, 2);
    const history = await db.select().from(caseEvents).where(eq(caseEvents.certificateId, certId));
    assert(history.some(e => e.eventType === "estate_referral_status_received"));
    assert(history.some(e => e.eventType === "estate_referral_email_needs_review"));
  } finally {
    const referrals = await db.select({ id: estateReferrals.id }).from(estateReferrals).where(inArray(estateReferrals.certificateId, [certId, otherCertId]));
    if (referrals.length) {
      const ids = referrals.map(r => r.id);
      await db.delete(estateReferralRequests).where(inArray(estateReferralRequests.referralId, ids));
      await db.delete(estateReferralUpdates).where(inArray(estateReferralUpdates.referralId, ids));
      await db.delete(estateReferrals).where(inArray(estateReferrals.id, ids));
    }
    await db.delete(caseEvents).where(inArray(caseEvents.certificateId, [certId, otherCertId]));
    await db.delete(certificates).where(inArray(certificates.id, [certId, otherCertId]));
    await db.delete(users).where(inArray(users.id, [adminId, ownerId, otherId]));
    server.close();
    await pool.end();
  }
});
