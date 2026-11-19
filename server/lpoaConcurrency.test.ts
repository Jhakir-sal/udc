import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { users } from "@shared/models/auth";
import {
  caseEvents,
  caseIdentityReviews,
  certificates,
  lpoaDocuments,
  lpoaRequests,
  notifications,
} from "@shared/schema";

async function createFixture() {
  const suffix = randomUUID();
  const userId = `lpoa-concurrency-user-${suffix}`;
  const certificateId = `lpoa-concurrency-case-${suffix}`;
  const oldDocumentId = `lpoa-concurrency-old-${suffix}`;

  await db.insert(users).values({
    id: userId,
    email: `lpoa-concurrency-${suffix}@example.com`,
    firstName: "Riley",
    lastName: "Legal",
    role: "user",
    emailVerified: true,
    idVerificationStatus: "verified",
    idVerifiedName: "Riley Legal",
  });
  await db.insert(certificates).values({
    id: certificateId,
    userId,
    deceasedName: "Concurrency Test",
    dateOfDeath: "08/01/2026",
    dateOfBirth: "01/01/1950",
    certificateNumber: `LPOA-CONCURRENCY-${suffix}`,
    issuingAuthority: "Automated Test",
    nextOfKinName: "Riley Legal",
    estateStatus: "no",
  });
  await db.insert(lpoaDocuments).values({
    id: oldDocumentId,
    userId,
    certificateId,
    principalName: "Wrong Signer",
    principalAddress: "1 Main Street",
    signatureType: "typed",
    signatureData: "Wrong Signer",
    consentAgreed: true,
    validUntil: "08/29/2027",
    status: "active",
  });

  return {
    userId,
    certificateId,
    oldDocumentId,
    async cleanup() {
      await db.delete(notifications).where(eq(notifications.certificateId, certificateId));
      await db.delete(caseEvents).where(eq(caseEvents.certificateId, certificateId));
      await db.delete(lpoaRequests).where(eq(lpoaRequests.certificateId, certificateId));
      await db.delete(caseIdentityReviews).where(eq(caseIdentityReviews.certificateId, certificateId));
      await db.delete(lpoaDocuments).where(eq(lpoaDocuments.certificateId, certificateId));
      await db.delete(certificates).where(eq(certificates.id, certificateId));
      await db.delete(users).where(eq(users.id, userId));
    },
  };
}

function signatureDocument(userId: string, certificateId: string) {
  return {
    userId,
    certificateId,
    principalName: "Riley Legal",
    principalAddress: "1 Main Street",
    signatureType: "typed",
    signatureData: "Riley Legal",
    consentAgreed: true,
    validUntil: "08/29/2027",
    status: "active",
  };
}

test("parallel corrected signatures create only one active successor", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const results = await Promise.allSettled([
    storage.signLpoaDocument(signatureDocument(fixture.userId, fixture.certificateId)),
    storage.signLpoaDocument(signatureDocument(fixture.userId, fixture.certificateId)),
  ]);
  const documents = await storage.getLpoaDocumentsByCertificate(fixture.certificateId);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(documents.filter((document) => document.status === "active").length, 1);
  assert.equal(documents.find((document) => document.id === fixture.oldDocumentId)?.status, "superseded");
});

test("a concurrent correction request cannot revive a superseded LPOA", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const request = {
    certificateId: fixture.certificateId,
    userId: fixture.userId,
    reason: "Correct the signer name",
    status: "pending",
    requestedBy: "test-admin",
    requestedByName: "Test Admin",
    lastSentAt: null,
    sendAttemptCount: 0,
    emailSent: false,
    smsSent: false,
    inAppSent: false,
    completedAt: null,
    completedByDocumentId: null,
  };

  await Promise.allSettled([
    storage.claimLpoaRequestSend(
      request,
      60_000,
      request.reason,
      fixture.oldDocumentId,
    ),
    storage.signLpoaDocument(signatureDocument(fixture.userId, fixture.certificateId)),
  ]);

  const documents = await storage.getLpoaDocumentsByCertificate(fixture.certificateId);
  const latestRequest = await storage.getLatestLpoaRequest(fixture.certificateId, fixture.userId);
  assert.equal(documents.filter((document) => document.status === "active").length, 1);
  assert.equal(documents.find((document) => document.id === fixture.oldDocumentId)?.status, "superseded");
  assert.equal(documents.some((document) => document.status === "replacement_required"), false);
  assert.notEqual(latestRequest?.status, "pending");
});

test("signing an admin-requested correction completes that exact pending request", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const reason = "The signer name must match the verified legal name";
  const claim = await storage.claimLpoaRequestSend({
    certificateId: fixture.certificateId,
    userId: fixture.userId,
    reason,
    status: "pending",
    requestedBy: "test-admin",
    requestedByName: "Test Admin",
    lastSentAt: null,
    sendAttemptCount: 0,
    emailSent: false,
    smsSent: false,
    inAppSent: false,
    completedAt: null,
    completedByDocumentId: null,
  }, 60_000, reason, fixture.oldDocumentId);

  const signed = await storage.signLpoaDocument(
    signatureDocument(fixture.userId, fixture.certificateId),
    claim.request.id,
  );
  const completed = await storage.getLatestLpoaRequest(fixture.certificateId, fixture.userId);
  const documents = await storage.getLpoaDocumentsByCertificate(fixture.certificateId);

  assert.equal(completed?.id, claim.request.id);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.completedByDocumentId, signed.id);
  assert.equal(documents.filter((document) => document.status === "active").length, 1);
  assert.equal(documents.find((document) => document.id === fixture.oldDocumentId)?.status, "superseded");
});