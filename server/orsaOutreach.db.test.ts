import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { orsaEmailCampaignContacts, orsaEmailCampaignDeliveries, orsaRosterMembers } from "@shared/schema";
import { claimDelivery } from "./orsaEmailCampaign";
import { neverEmailedCandidates } from "./orsaOutreach";

test("never-emailed claims serialize across templates and preserve invitation and opt-out exclusions", {
  skip: process.env.REPLIT_DEPLOYMENT === "1" || process.env.WEBSITE_SLOT_NAME !== undefined || process.env.NODE_ENV === "production",
}, async () => {
  const email = `outreach-${crypto.randomUUID()}@example.invalid`;
  let memberId: string | undefined;
  try {
    const [member] = await db.insert(orsaRosterMembers).values({
      normalizedEmail: email, active: true, displayName: "Synthetic outreach check",
    }).returning({ id: orsaRosterMembers.id });
    memberId = member.id;
    const candidate = { id: memberId, email, displayName: "Synthetic outreach check", firstContactOnly: true as const };
    assert.equal((await neverEmailedCandidates([candidate])).length, 1);
    const concurrent = await Promise.all([
      claimDelivery(candidate, "launch-week", undefined),
      claimDelivery(candidate, "getting-started", undefined),
    ]);
    assert.equal(concurrent.filter(result => result.disposition === "claimed").length, 1);
    assert.equal((await neverEmailedCandidates([candidate])).length, 0);
    await db.delete(orsaEmailCampaignDeliveries).where(eq(orsaEmailCampaignDeliveries.memberId, memberId));
    await db.update(orsaRosterMembers).set({ invitationFirstAttemptAt: new Date(), invitationStatus: "needs_review" })
      .where(eq(orsaRosterMembers.id, memberId));
    assert.equal((await neverEmailedCandidates([candidate])).length, 0);
    assert.equal((await claimDelivery(candidate, "launch-week", undefined)).disposition, "skipped");
    await db.update(orsaRosterMembers).set({ invitationFirstAttemptAt: null, invitationStatus: "pending" })
      .where(eq(orsaRosterMembers.id, memberId));
    await db.update(orsaEmailCampaignContacts).set({ optedOutAt: new Date() })
      .where(eq(orsaEmailCampaignContacts.normalizedEmail, email));
    assert.equal((await claimDelivery(candidate, "launch-week", undefined)).disposition, "skipped");
  } finally {
    if (memberId) await db.delete(orsaEmailCampaignDeliveries).where(eq(orsaEmailCampaignDeliveries.memberId, memberId));
    await db.delete(orsaEmailCampaignContacts).where(eq(orsaEmailCampaignContacts.normalizedEmail, email));
    if (memberId) await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
  }
});
