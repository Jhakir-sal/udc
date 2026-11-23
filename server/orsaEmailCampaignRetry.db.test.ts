import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { orsaEmailCampaignContacts, orsaEmailCampaignDeliveries, orsaRosterMembers } from "@shared/schema";
import { claimDelivery } from "./orsaEmailCampaign";

test("database retry claims are atomic, generation-bound, and honor suppression and delivery evidence", {
  skip: process.env.REPLIT_DEPLOYMENT === "1" || process.env.WEBSITE_SLOT_NAME !== undefined || process.env.NODE_ENV === "production",
}, async () => {
  const email = `orsa-retry-${crypto.randomUUID()}@example.test`;
  let memberId: string | undefined;
  let deliveryId: string | undefined;
  try {
    const [member] = await db.insert(orsaRosterMembers).values({
      normalizedEmail: email, active: true, displayName: "Synthetic retry test",
    }).returning({ id: orsaRosterMembers.id });
    memberId = member.id;
    const [delivery] = await db.insert(orsaEmailCampaignDeliveries).values({
      memberId, normalizedEmail: email, templateId: "launch-week", status: "needs_review",
      trackingTokenHash: crypto.randomBytes(24).toString("hex"),
    }).returning();
    deliveryId = delivery.id;
    const candidate = { id: memberId, email, displayName: "Synthetic retry test" };
    const snapshot = {
      id: memberId, email, retryDeliveryId: delivery.id,
      priorTrackingTokenHash: delivery.trackingTokenHash, priorAttemptedAt: delivery.attemptedAt.toISOString(),
    };
    const concurrent = await Promise.all([
      claimDelivery(candidate, "launch-week", undefined, snapshot),
      claimDelivery(candidate, "launch-week", undefined, snapshot),
    ]);
    assert.equal(concurrent.filter((result) => result.disposition === "claimed").length, 1);
    await db.update(orsaEmailCampaignDeliveries).set({ status: "needs_review" })
      .where(eq(orsaEmailCampaignDeliveries.id, delivery.id));
    assert.equal((await claimDelivery(candidate, "launch-week", undefined, snapshot)).disposition, "skipped");
    const [updated] = await db.select().from(orsaEmailCampaignDeliveries)
      .where(eq(orsaEmailCampaignDeliveries.id, delivery.id));
    const freshSnapshot = { ...snapshot, priorTrackingTokenHash: updated.trackingTokenHash };
    await db.update(orsaEmailCampaignDeliveries).set({ firstOpenedAt: new Date() })
      .where(eq(orsaEmailCampaignDeliveries.id, delivery.id));
    assert.equal((await claimDelivery(candidate, "launch-week", undefined, freshSnapshot)).disposition, "skipped");
    await db.update(orsaEmailCampaignDeliveries).set({ firstOpenedAt: null, status: "sent", sentAt: new Date() })
      .where(eq(orsaEmailCampaignDeliveries.id, delivery.id));
    assert.equal((await claimDelivery(candidate, "launch-week", undefined, freshSnapshot)).disposition, "skipped");
    await db.update(orsaEmailCampaignDeliveries).set({ status: "needs_review", sentAt: null })
      .where(eq(orsaEmailCampaignDeliveries.id, delivery.id));
    await db.update(orsaEmailCampaignContacts).set({ optedOutAt: new Date() })
      .where(eq(orsaEmailCampaignContacts.normalizedEmail, email));
    assert.equal((await claimDelivery(candidate, "launch-week", undefined, freshSnapshot)).disposition, "skipped");
  } finally {
    if (deliveryId) await db.delete(orsaEmailCampaignDeliveries).where(eq(orsaEmailCampaignDeliveries.id, deliveryId));
    await db.delete(orsaEmailCampaignContacts).where(eq(orsaEmailCampaignContacts.normalizedEmail, email));
    if (memberId) await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
  }
});