import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { pool } from "./db";
import { FAMILY_SHARING_TEXT, FAMILY_SHARING_VERSION, memberIdVerified, sharingAccess, sharingSignatureMatches } from "@shared/familySharing";
import { registerFamilySharingRoutes } from "./familySharingRoutes";
import { caseRegistrationReference } from "@shared/caseRegistrationReference";
import { acceptFamilyInvitation, canFamilyAccessCase, getFamilyAccessibleCertificates, hashFamilyInvitationToken } from "./caseAuthorization";
import { caseEvents, caseFamilyAuthorizations, caseFamilyMemberships, certificates, familyDocuments, users, familyInvitations, familyInvitationChallenges } from "@shared/schema";

const verified = { idVerificationStatus: "verified", idVerifiedName: "Test Member" };
const active = { status: "active" };
const fullGrant = {
  authorizedBy: "owner", revokedAt: null, agreementVersion: FAMILY_SHARING_VERSION,
  memberAcceptedAt: new Date(), scope: "representative", reviewStatus: "approved",
  reviewedBy: "staff", reviewedAt: new Date(), evidenceDocumentId: "evidence",
  authorityExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
};

test("legacy memberships and email-only accounts do not imply ID or consent", () => {
  assert.equal(sharingAccess(verified, active, "owner", null).helperAccess, false);
  assert.equal(memberIdVerified({ idVerificationStatus: "verified" }), false);
  assert.equal(memberIdVerified({ idVerificationStatus: "pending", idVerifiedName: "Test Member" }), false);
  assert.equal(memberIdVerified({ idVerificationStatus: "verified", idOverrideAt: new Date() }), true);
  assert.equal(sharingAccess({ idVerificationStatus: "failed" }, active, "owner", fullGrant).helperAccess, false);
});

test("sharing scope and representative approval are independent", () => {
  assert.equal(sharingAccess(verified, active, "owner", fullGrant).representativeAccess, true);
  for (const patch of [
    { scope: "helper" }, { reviewStatus: "pending" }, { reviewStatus: "rejected" },
    { reviewedBy: null }, { reviewedAt: null }, { evidenceDocumentId: null },
  ]) {
    const access = sharingAccess(verified, active, "owner", { ...fullGrant, ...patch });
    assert.equal(access.helperAccess, true);
    assert.equal(access.representativeAccess, false);
  }
});

test("authority expires at the exact exclusive boundary without expiring ID or helper consent", () => {
  const end = new Date("2030-01-01T12:00:00.000Z");
  for (const [offset, expected] of [[-1, true], [0, false], [1, false]] as const) {
    const access = sharingAccess(verified, active, "owner", { ...fullGrant, authorityExpiresAt: end }, new Date(end.getTime() + offset));
    assert.equal(access.representativeAccess, expected);
    assert.equal(access.authorityStatus, expected ? "expiring" : "expired");
    assert.equal(access.idVerified, true);
    assert.equal(access.helperAccess, true);
  }
  for (const authorityExpiresAt of [null, undefined, "not-a-date"]) {
    const access = sharingAccess(verified, active, "owner", { ...fullGrant, authorityExpiresAt });
    assert.equal(access.representativeAccess, false);
    assert.equal(access.authorityStatus, "needs_review");
    assert.equal(access.helperAccess, true);
  }
  for (const days of [30, 31]) {
    const now = new Date(end.getTime() - days * 86400000);
    assert.equal(sharingAccess(verified, active, "owner", { ...fullGrant, authorityExpiresAt: end.toISOString() }, now).authorityStatus,
      days === 30 ? "expiring" : "current");
  }
  assert.equal(sharingAccess(verified, active, "owner", { ...fullGrant, reviewStatus: "revoked" }).representativeAccess, false);
});

test("revocation, changed owner, unsigned consent and unknown agreement fail closed", () => {
  for (const patch of [
    { revokedAt: new Date() }, { authorizedBy: "another-owner" },
    { memberAcceptedAt: null }, { agreementVersion: "forged" },
  ]) assert.equal(sharingAccess(verified, active, "owner", { ...fullGrant, ...patch }).helperAccess, false);
  assert.equal(sharingAccess(verified, { status: "revoked" }, "owner", fullGrant).helperAccess, false);
  assert.equal(sharingAccess(verified, active, null, fullGrant).helperAccess, false);
});

test("signatures use verified legal identity, not an arbitrary profile or typed name", () => {
  assert.equal(sharingSignatureMatches("TEST MEMBER", verified), true);
  assert.equal(sharingSignatureMatches("Someone Else", verified), false);
  assert.equal(sharingSignatureMatches("Test Member", { firstName: "Test", lastName: "Member" }), false);
});

test("member safeguards HTTP lifecycle enforces owner/member/staff separation and re-invite resets", async () => {
  const suffix = crypto.randomUUID();
  const ownerId = `sharing-owner-${suffix}`, memberId = `sharing-member-${suffix}`, adminId = `sharing-admin-${suffix}`;
  const certId = suffix, otherCertId = `sharing-other-${suffix}`;
  const evidenceId = `sharing-evidence-${suffix}`, otherEvidenceId = `sharing-wrong-evidence-${suffix}`;
  const inviteId = `sharing-invite-${suffix}`, challengeId = `sharing-challenge-${suffix}`;
  let ownerReady = true;
  const app = express();
  app.use(express.json());
  // This test-only authenticator exists only on this ephemeral test app.
  registerFamilySharingRoutes(app, (req: any, _res, next) => {
    req.session = { userId: req.header("x-test-user") }; next();
  }, async () => ownerReady);
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (actor: string, method: string, path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method, headers: { "x-test-user": actor, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() as any };
  };
  const path = `/api/case/${certId}/family-members/${memberId}`;
  const sig = { typedName: "Test Owner", confirmed: true, scope: "helper", agreementVersion: FAMILY_SHARING_VERSION };
  const acceptBody = (grantId: string) => ({ grantId, typedName: "Test Member", confirmed: true, agreementVersion: FAMILY_SHARING_VERSION });
  try {
    await db.insert(users).values([
      { id: ownerId, email: `${ownerId}@example.test`, firstName: "Test", lastName: "Owner", role: "user", emailVerified: true, idVerificationStatus: "verified", idVerifiedName: "Test Owner" },
      { id: memberId, email: `${memberId}@example.test`, firstName: "Test", lastName: "Member", role: "user", emailVerified: true, idVerificationStatus: "not_started" },
      { id: adminId, email: `${adminId}@example.test`, firstName: "Test", lastName: "Staff", role: "admin", emailVerified: true },
    ]);
    await db.insert(certificates).values([
      { id: certId, userId: ownerId, deceasedName: "Test Loved One", dateOfDeath: "2026-01-01",
        dateOfBirth: "1940-01-01", certificateNumber: certId, issuingAuthority: "Synthetic test authority" },
      { id: otherCertId, userId: ownerId, deceasedName: "Other Test Loved One", dateOfDeath: "2026-01-01",
        dateOfBirth: "1940-01-01", certificateNumber: otherCertId, issuingAuthority: "Synthetic test authority" },
    ]);
    const [membership] = await db.insert(caseFamilyMemberships).values({ certificateId: certId, userId: memberId, status: "active", role: "member" }).returning();
    const cert = { id: certId, userId: ownerId };
    assert.equal(await canFamilyAccessCase(cert, memberId), false);
    assert.equal(await canFamilyAccessCase(cert, ownerId), true);
    assert.equal((await getFamilyAccessibleCertificates(memberId)).length, 0);
    const checklist = await request(memberId, "GET", "/api/family-access/checklist");
    assert.equal(checklist.status, 200);
    assert.equal(checklist.data.members[0].helperAccess, false);
    assert.equal(checklist.data.members[0].grant, undefined);
    assert.equal(checklist.data.members[0].deceasedSsn, undefined);
    assert.equal((await request(memberId, "GET", `/api/case/${certId}/family-authorizations`)).status, 404);
    assert.equal((await request(adminId, "POST", path + "/authorize", sig)).status, 403);
    assert.equal((await request(ownerId, "POST", path + "/authorize", { ...sig, confirmed: false })).status, 400);
    assert.equal((await request(ownerId, "POST", path + "/authorize", { ...sig, typedName: "Wrong Signer" })).status, 400);
    ownerReady = false;
    assert.equal((await request(ownerId, "POST", path + "/authorize", sig)).status, 409);
    ownerReady = true;
    const helper = await request(ownerId, "POST", path + "/authorize", sig);
    assert.equal(helper.status, 201);
    const unsignedResponse = await fetch(`${base}/api/case/${certId}/family-authorization-documents/${helper.data.grantId}`, { headers: { "x-test-user": ownerId } });
    assert.equal(unsignedResponse.status, 200);
    assert.ok((await unsignedResponse.text()).includes("Not yet accepted"));
    assert.equal((await request(memberId, "POST", path + "/accept-sharing", acceptBody(helper.data.grantId))).status, 409);
    await db.update(users).set({ idVerificationStatus: "verified", idVerifiedName: "Test Member" }).where(eq(users.id, memberId));
    assert.equal(await canFamilyAccessCase(cert, memberId), false);
    assert.equal((await request(ownerId, "POST", path + "/accept-sharing", acceptBody(helper.data.grantId))).status, 403);
    assert.equal((await request(memberId, "POST", path + "/accept-sharing", { ...acceptBody(helper.data.grantId), typedName: "Test Owner" })).status, 400);
    assert.equal((await request(memberId, "POST", path + "/accept-sharing", { ...acceptBody(helper.data.grantId), grantId: "not-this-grant" })).status, 409);
    assert.equal((await request(memberId, "POST", path + "/accept-sharing", acceptBody(helper.data.grantId))).status, 200);
    assert.equal(await canFamilyAccessCase(cert, memberId), true);
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), false);
    assert.equal(await canFamilyAccessCase({ id: otherCertId, userId: ownerId }, memberId), false);
    assert.equal((await getFamilyAccessibleCertificates(memberId))[0].id, certId);

    const representative = await request(ownerId, "POST", path + "/authorize", { ...sig, scope: "representative" });
    assert.equal(representative.status, 201);
    assert.equal(await canFamilyAccessCase(cert, memberId), false);
    assert.equal((await request(memberId, "POST", path + "/accept-sharing", acceptBody(helper.data.grantId))).status, 409);
    assert.equal((await request(memberId, "POST", path + "/accept-sharing", acceptBody(representative.data.grantId))).status, 200);
    await db.insert(familyDocuments).values([
      { id: evidenceId, certificateId: certId, userId: ownerId, label: "Synthetic authority", fileName: "test.pdf", objectPath: `/objects/test-${evidenceId}` },
      { id: otherEvidenceId, certificateId: otherCertId, userId: ownerId, label: "Wrong case", fileName: "test.pdf", objectPath: `/objects/test-${otherEvidenceId}` },
    ]);
    const reviewPath = `/api/admin/case/${certId}/family-members/${memberId}/review-authority`;
    const review = { grantId: representative.data.grantId, decision: "approved", reason: "Reviewed synthetic test authority evidence.", evidenceDocumentId: evidenceId,
      authorityExpiresAt: new Date(Date.now() + 60 * 86400000).toISOString() };
    assert.equal((await request(adminId, "POST", reviewPath, { ...review, grantId: helper.data.grantId })).status, 409);
    assert.equal((await request(ownerId, "POST", reviewPath, review)).status, 403);
    assert.equal((await request(memberId, "POST", reviewPath, review)).status, 404);
    for (const authorityExpiresAt of [undefined, "bad-date", new Date(Date.now() - 1).toISOString()]) {
      assert.equal((await request(adminId, "POST", reviewPath, { ...review, authorityExpiresAt })).status, 400);
    }
    assert.equal((await request(adminId, "POST", reviewPath, { ...review, evidenceDocumentId: otherEvidenceId })).status, 400);
    assert.equal((await request(adminId, "POST", reviewPath, { ...review, evidenceDocumentId: undefined })).status, 400);
    const concurrent = await Promise.all([request(adminId, "POST", reviewPath, review), request(adminId, "POST", reviewPath, review)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), true);
    const getGrant = async () => (await db.select().from(caseFamilyAuthorizations).where(eq(caseFamilyAuthorizations.id, review.grantId)))[0];
    let currentGrant = await getGrant();
    const approvedAt = currentGrant.reviewedAt!.toISOString();
    // Simulate documentary expiry without depending on a wall-clock sleep.
    await db.update(caseFamilyAuthorizations).set({ authorityExpiresAt: new Date(Date.now() - 1) }).where(eq(caseFamilyAuthorizations.id, review.grantId));
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), false);
    assert.equal(await canFamilyAccessCase(cert, memberId), true);
    const expiredChecklist = await request(memberId, "GET", "/api/family-access/checklist");
    assert.equal(expiredChecklist.data.members[0].authorityStatus, "expired");
    assert.equal(expiredChecklist.data.members[0].idVerified, true);
    const renewal = { ...review, expectedReviewedAt: approvedAt };
    assert.equal((await request(ownerId, "POST", reviewPath, renewal)).status, 403);
    assert.equal((await request(adminId, "POST", reviewPath, { ...renewal, evidenceDocumentId: otherEvidenceId })).status, 400);
    assert.equal((await request(adminId, "POST", reviewPath, renewal)).status, 200);
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), true);
    assert.equal((await request(adminId, "POST", reviewPath, renewal)).status, 409);
    currentGrant = await getGrant();
    const revoke = { grantId: review.grantId, decision: "revoked", expectedReviewedAt: currentGrant.reviewedAt!.toISOString(),
      reason: "Authority revoked after new supporting information." };
    assert.equal((await request(ownerId, "POST", reviewPath, revoke)).status, 403);
    assert.equal((await request(adminId, "POST", reviewPath, revoke)).status, 200);
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), false);
    assert.equal(await canFamilyAccessCase(cert, memberId), true);
    currentGrant = await getGrant();
    assert.equal((await request(adminId, "POST", reviewPath, { ...review, expectedReviewedAt: currentGrant.reviewedAt!.toISOString() })).status, 200);
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), true);
    const reviews = await db.select().from(caseEvents).where(and(eq(caseEvents.certificateId, certId), eq(caseEvents.eventType, "family_representative_reviewed")));
    assert.equal(reviews.length, 4);
    assert.ok(reviews.some(event => event.description?.includes("Authority revoked after new supporting information.")));
    assert.ok(reviews.every(event => event.description?.includes("previousReview") && event.actorId === adminId));
    await db.update(caseFamilyAuthorizations).set({ authorityExpiresAt: null }).where(eq(caseFamilyAuthorizations.id, review.grantId));
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), false);
    assert.equal(await canFamilyAccessCase(cert, memberId), true);
    currentGrant = await getGrant();
    assert.equal((await request(adminId, "POST", reviewPath, { ...review, expectedReviewedAt: currentGrant.reviewedAt!.toISOString() })).status, 200);
    await db.delete(familyDocuments).where(eq(familyDocuments.id, evidenceId));
    assert.equal(await canFamilyAccessCase(cert, memberId, "representative"), false);
    assert.equal(await canFamilyAccessCase(cert, memberId), true);
    const grantRows = await db.select().from(caseFamilyAuthorizations).where(eq(caseFamilyAuthorizations.membershipId, membership.id));
    assert.equal(grantRows.length, 2);
    assert.equal(grantRows.find(g => g.id === helper.data.grantId)?.agreementText, FAMILY_SHARING_TEXT);
    assert.ok(grantRows.find(g => g.id === helper.data.grantId)?.revokedAt);
    const documentsPath = `/api/case/${certId}/family-authorization-documents`;
    const documents = await request(ownerId, "GET", documentsPath);
    assert.equal(documents.status, 200);
    assert.equal(documents.data.documents.length, 2);
    assert.equal(documents.data.documents.find((d: any) => d.id === helper.data.grantId).historical, true);
    assert.equal(documents.data.documents.find((d: any) => d.id === representative.data.grantId).historical, false);
    for (const denied of [memberId, "unrelated-user", ""]) {
      assert.equal((await request(denied, "GET", documentsPath)).status, 404);
      assert.equal((await request(denied, "GET", `${documentsPath}/${helper.data.grantId}`)).status, 404);
    }
    assert.equal((await request(adminId, "GET", documentsPath)).status, 200);
    assert.equal((await request(ownerId, "GET", `/api/case/${caseRegistrationReference(certId)}/family-authorization-documents`)).status, 404);
    assert.equal((await request(ownerId, "GET", `/api/case/${caseRegistrationReference(certId)}/family-authorization-documents/${helper.data.grantId}`)).status, 404);
    await db.update(users).set({ emailVerified: false }).where(eq(users.id, ownerId));
    assert.equal((await request(ownerId, "GET", documentsPath)).status, 404);
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, ownerId));
    assert.equal((await request(ownerId, "GET", `/api/case/${otherCertId}/family-authorization-documents/${helper.data.grantId}`)).status, 404);
    assert.equal((await request(ownerId, "GET", `${documentsPath}/unknown`)).status, 404);
    const documentUrl = `${base}${documentsPath}/${helper.data.grantId}`;
    const exported = await fetch(documentUrl, { headers: { "x-test-user": ownerId } });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("cache-control"), "private, no-store");
    assert.match(exported.headers.get("content-security-policy")!, /default-src 'none'/);
    assert.match(exported.headers.get("content-type")!, /text\/html/);
    const html = await exported.text();
    for (const text of [FAMILY_SHARING_TEXT.replace(/'/g, "&#39;"), FAMILY_SHARING_VERSION, "Test Owner", "Test Member", "HISTORICAL", "helper", "Revoked / superseded"]) {
      assert.ok(html.includes(text), `Missing signed record field: ${text}`);
    }
    assert.ok(!html.includes("/objects/"));
    const downloaded = await fetch(documentUrl + "?download=1", { headers: { "x-test-user": adminId } });
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get("content-disposition")!, /^attachment;/);
    await downloaded.text();
    const reviewedDocument = await fetch(`${base}${documentsPath}/${representative.data.grantId}`, { headers: { "x-test-user": adminId } });
    const reviewedHtml = await reviewedDocument.text();
    assert.ok(reviewedHtml.includes("approved"));
    assert.ok(reviewedHtml.includes(review.reason));
    assert.ok(!reviewedHtml.includes(otherEvidenceId));
    // Reproduce an older signed agreement verbatim, never today's template.
    const oldWording = "Earlier signed wording <script>alert('unsafe')</script>\nSecond line";
    await db.update(caseFamilyAuthorizations).set({ agreementText: oldWording, agreementVersion: "historical-v0" })
      .where(eq(caseFamilyAuthorizations.id, helper.data.grantId));
    const older = await fetch(documentUrl, { headers: { "x-test-user": ownerId } });
    const olderHtml = await older.text();
    assert.ok(olderHtml.includes("historical-v0"));
    assert.ok(olderHtml.includes("Earlier signed wording &lt;script&gt;alert(&#39;unsafe&#39;)&lt;/script&gt;\nSecond line"));
    assert.ok(!olderHtml.includes(FAMILY_SHARING_TEXT));
    await db.update(caseFamilyMemberships).set({ status: "revoked" }).where(eq(caseFamilyMemberships.id, membership.id));
    const revokedDocuments = await request(ownerId, "GET", documentsPath);
    assert.ok(revokedDocuments.data.documents.every((d: any) => d.historical));
    assert.equal(await canFamilyAccessCase(cert, memberId), false);
    await db.insert(familyInvitations).values({
      id: inviteId, certificateId: certId, email: `${memberId}@example.test`, recipientName: "Test Member",
      deceasedName: "Test Loved One", tokenHash: hashFamilyInvitationToken(inviteId), expiresAt: new Date(Date.now() + 600000), sentBy: ownerId,
    });
    await db.insert(familyInvitationChallenges).values({
      id: challengeId, invitationId: inviteId, userId: memberId, email: `${memberId}@example.test`,
      codeHash: "test-only-already-verified-proof", expiresAt: new Date(Date.now() + 600000),
    });
    await acceptFamilyInvitation({ invitationId: inviteId, challengeId, userId: memberId });
    assert.equal(await canFamilyAccessCase(cert, memberId), false);
    const [reinvited] = await db.select().from(caseFamilyMemberships).where(eq(caseFamilyMemberships.id, membership.id));
    assert.equal(reinvited.invitationId, inviteId);
    assert.equal(reinvited.status, "active");
    const [originalCert] = await db.select().from(certificates).where(eq(certificates.id, certId));
    assert.equal(originalCert.userId, ownerId);
    await db.update(caseFamilyMemberships).set({ status: "revoked" }).where(eq(caseFamilyMemberships.id, membership.id));
    assert.equal((await request(memberId, "POST", path + "/accept-sharing", acceptBody(representative.data.grantId))).status, 404);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(familyInvitationChallenges).where(eq(familyInvitationChallenges.id, challengeId));
    await db.delete(familyInvitations).where(eq(familyInvitations.id, inviteId));
    await db.delete(familyDocuments).where(inArray(familyDocuments.id, [evidenceId, otherEvidenceId]));
    await db.delete(certificates).where(inArray(certificates.id, [certId, otherCertId]));
    await db.delete(users).where(inArray(users.id, [ownerId, memberId, adminId]));
    await pool.end();
  }
});
