import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { cleanupLegacyFamilyInvitationTokens } from "../script/cleanup-family-invitation-tokens";
import { db } from "./db";
import { certificates, familyInvitations } from "@shared/schema";

test("legacy family invitation cleanup is idempotent and preserves current invitations", async () => {
  const suffix = crypto.randomUUID();
  const certificateId = `cleanup-cert-${suffix}`;
  const invitationIds = {
    expired: `cleanup-expired-${suffix}`,
    accepted: `cleanup-accepted-${suffix}`,
    revoked: `cleanup-revoked-${suffix}`,
    validLegacy: `cleanup-valid-${suffix}`,
    hashed: `cleanup-hashed-${suffix}`,
  };
  const now = new Date();

  await db.insert(certificates).values({
    id: certificateId,
    deceasedName: "Cleanup Test",
    dateOfDeath: "2026-01-01",
    dateOfBirth: "1940-01-01",
    certificateNumber: `CLEANUP-${suffix}`,
    issuingAuthority: "Test Authority",
  });

  try {
    await db.insert(familyInvitations).values([
      {
        id: invitationIds.expired, certificateId, email: `expired-${suffix}@example.com`,
        recipientName: "Expired", deceasedName: "Cleanup Test", token: `expired-${suffix}`,
        status: "pending", expiresAt: new Date(now.getTime() - 1),
      },
      {
        id: invitationIds.accepted, certificateId, email: `accepted-${suffix}@example.com`,
        recipientName: "Accepted", deceasedName: "Cleanup Test", token: `accepted-${suffix}`,
        status: "accepted", expiresAt: new Date(now.getTime() + 86_400_000),
      },
      {
        id: invitationIds.revoked, certificateId, email: `revoked-${suffix}@example.com`,
        recipientName: "Revoked", deceasedName: "Cleanup Test", token: `revoked-${suffix}`,
        status: "revoked", expiresAt: new Date(now.getTime() + 86_400_000),
      },
      {
        id: invitationIds.validLegacy, certificateId, email: `valid-${suffix}@example.com`,
        recipientName: "Valid", deceasedName: "Cleanup Test", token: `valid-${suffix}`,
        status: "pending", expiresAt: new Date(now.getTime() + 86_400_000),
      },
      {
        id: invitationIds.hashed, certificateId, email: `hashed-${suffix}@example.com`,
        recipientName: "Hashed", deceasedName: "Cleanup Test", token: null,
        tokenHash: crypto.createHash("sha256").update(`hashed-${suffix}`).digest("hex"),
        status: "accepted", expiresAt: new Date(now.getTime() - 1),
      },
    ]);

    const first = await cleanupLegacyFamilyInvitationTokens(now);
    assert.equal(first.clearedCount, 3);
    assert.ok(first.remainingValidPlaintextCount >= 1);

    const rows = await db.select().from(familyInvitations)
      .where(inArray(familyInvitations.id, Object.values(invitationIds)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.equal(byId.get(invitationIds.expired)?.token, null);
    assert.equal(byId.get(invitationIds.accepted)?.token, null);
    assert.equal(byId.get(invitationIds.revoked)?.token, null);
    assert.equal(byId.get(invitationIds.validLegacy)?.token, `valid-${suffix}`);
    assert.equal(
      byId.get(invitationIds.hashed)?.tokenHash,
      crypto.createHash("sha256").update(`hashed-${suffix}`).digest("hex"),
    );

    const second = await cleanupLegacyFamilyInvitationTokens(now);
    assert.equal(second.clearedCount, 0);
  } finally {
    await db.delete(familyInvitations).where(inArray(familyInvitations.id, Object.values(invitationIds)));
    await db.delete(certificates).where(eq(certificates.id, certificateId));
  }
});