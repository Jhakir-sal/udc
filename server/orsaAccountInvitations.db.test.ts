import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { orsaRosterMembers, orsaRosterAudits } from "@shared/schema";
import { users } from "@shared/models/auth";
import { claimOrsaInvitation, finishOrsaInvitation } from "./orsaService";

test("database activation claims are atomic and bind retries to the reviewed email and attempt generation", {
  skip: process.env.REPLIT_DEPLOYMENT === "1" || process.env.WEBSITE_SLOT_NAME !== undefined || process.env.NODE_ENV === "production",
}, async () => {
  const id = randomUUID(), actor = randomUUID(), userId = randomUUID();
  const email = `orsa-activation-${id}@example.test`;
  const now = new Date("2026-10-02T14:00:00Z");
  await db.insert(orsaRosterMembers).values({ id, normalizedEmail: email, active: true });
  try {
    assert.equal((await claimOrsaInvitation(id, now, { email: "wrong@example.test", retryHeld: false })).disposition, "needs_review");
    const concurrent = await Promise.all([
      claimOrsaInvitation(id, now, { email, retryHeld: false }),
      claimOrsaInvitation(id, now, { email, retryHeld: false }),
    ]);
    assert.equal(concurrent.filter(result => result.disposition === "claimed").length, 1);
    const claim = concurrent.find(result => result.disposition === "claimed")!;
    if (claim.disposition !== "claimed") throw new Error("Missing atomic claim");
    await finishOrsaInvitation(id, claim.leaseId, false, actor, now);
    assert.equal((await claimOrsaInvitation(id, now, { email, retryHeld: false })).disposition, "needs_review");
    const [held] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
    const snapshot = { email, retryHeld: true, priorAttemptedAt: held.invitationAttemptedAt!.toISOString() };
    const retries = await Promise.all([
      claimOrsaInvitation(id, now, snapshot), claimOrsaInvitation(id, now, snapshot),
    ]);
    assert.equal(retries.filter(result => result.disposition === "claimed").length, 1);
    const retry = retries.find(result => result.disposition === "claimed")!;
    if (retry.disposition !== "claimed") throw new Error("Missing retry claim");
    await finishOrsaInvitation(id, retry.leaseId, false, actor, now);
    assert.equal((await claimOrsaInvitation(id, now, snapshot)).disposition, "needs_review");
    const [newAttempt] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
    assert.ok(newAttempt.invitationAttemptedAt!.getTime() > held.invitationAttemptedAt!.getTime());
    const fresh = await claimOrsaInvitation(id, now, { ...snapshot, priorAttemptedAt: newAttempt.invitationAttemptedAt!.toISOString() });
    assert.equal(fresh.disposition, "claimed");
    if (fresh.disposition !== "claimed") throw new Error("Missing fresh reviewed claim");
    await finishOrsaInvitation(id, fresh.leaseId, true, actor, now);
    assert.equal((await claimOrsaInvitation(id, now, { ...snapshot, priorAttemptedAt: newAttempt.invitationAttemptedAt!.toISOString() })).disposition, "needs_review");
    // Even an unverified existing account must use verification recovery, not a new invitation.
    await db.update(orsaRosterMembers).set({
      invitationStatus: "pending", invitationAttemptedAt: null, invitationFirstAttemptAt: null, invitationSentAt: null,
    }).where(eq(orsaRosterMembers.id, id));
    await db.insert(users).values({ id: userId, email, role: "planner", emailVerified: false });
    assert.equal((await claimOrsaInvitation(id, now, { email, retryHeld: false })).disposition, "needs_attention");
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actor));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
  }
});