import test from "node:test";
import assert from "node:assert/strict";
import {
  HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS,
  canClaimIncompleteHeartPlanReminder,
  incompleteHeartPlanReminderCycle,
  incompleteHeartPlanReminderVariant,
} from "./heartPlanIntakeReminders";
import { buildIncompleteHeartPlanIntakeReminderEmail } from "./email";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { DatabaseStorage } from "./storage";
import { heartPlanIntakes, heartPlans } from "@shared/schema";
import { users } from "@shared/models/auth";

const createdAt = new Date("2025-01-01T00:00:00.000Z");

test("first incomplete-plan reminder is eligible only after 72 hours", () => {
  assert.equal(incompleteHeartPlanReminderCycle({
    createdAt,
    planStatus: "active",
    isPlanComplete: false,
    now: new Date(createdAt.getTime() + HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS - 1),
  }), null);
  assert.equal(incompleteHeartPlanReminderCycle({
    createdAt,
    planStatus: "active",
    isPlanComplete: false,
    now: new Date(createdAt.getTime() + HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS),
  }), 1);
});

test("filled-out and death-activated plans are never eligible", () => {
  const now = new Date(createdAt.getTime() + HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS * 2);
  assert.equal(incompleteHeartPlanReminderCycle({ createdAt, planStatus: "active", isPlanComplete: true, now }), null);
  assert.equal(incompleteHeartPlanReminderCycle({ createdAt, planStatus: "activated", isPlanComplete: false, now }), null);
});

test("benefit messages rotate over three cycles without legal promises", () => {
  assert.deepEqual([1, 2, 3, 4].map(incompleteHeartPlanReminderVariant), [0, 1, 2, 0]);
  const messages = ([0, 1, 2] as const).map((variant) =>
    buildIncompleteHeartPlanIntakeReminderEmail({ plannerName: "Planner", variant }).html,
  );
  assert.match(messages[0], /confusion and delays during probate/i);
  assert.match(messages[0], /does not.*guarantee.*probate/i);
  assert.match(messages[1], /time and administrative burden/i);
  assert.match(messages[2], /professional, administrative, or court costs/i);
  assert.match(messages[2], /not legal advice/i);
});

test("claim eligibility rejects a delivered cycle and honors lease and retry bounds", () => {
  const now = new Date("2025-01-10T00:00:00.000Z");
  assert.equal(canClaimIncompleteHeartPlanReminder({ cycle: 2, sentCycle: 2, now }), false);
  assert.equal(canClaimIncompleteHeartPlanReminder({
    cycle: 3, sentCycle: 2, leaseExpiresAt: new Date(now.getTime() + 1), now,
  }), false);
  assert.equal(canClaimIncompleteHeartPlanReminder({
    cycle: 3, sentCycle: 2, retryAt: new Date(now.getTime() + 1), now,
  }), false);
  assert.equal(canClaimIncompleteHeartPlanReminder({
    cycle: 3,
    sentCycle: 2,
    leaseExpiresAt: new Date(now.getTime() - 1),
    retryAt: new Date(now.getTime() - 1),
    now,
  }), true);
});

test("database reminder selection and claims exclude finished and demo plans", async () => {
  const storage = new DatabaseStorage();
  const testRun = randomUUID();
  const now = new Date("2026-09-06T12:00:00.000Z");
  const dueAt = new Date(now.getTime() - HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS);
  const userIds = ["eligible", "completed", "activated", "demo"].map((kind) => `reminder-test-${kind}-${testRun}`);
  const planIds = ["eligible", "completed", "activated", "demo"].map((kind) => `reminder-test-${kind}-${testRun}`);

  try {
    await db.insert(users).values([
      { id: userIds[0], email: `eligible-${testRun}@example.test`, firstName: "Eligible", role: "planner", isDemoAccount: false },
      { id: userIds[1], email: `completed-${testRun}@example.test`, firstName: "Completed", role: "planner", isDemoAccount: false },
      { id: userIds[2], email: `activated-${testRun}@example.test`, firstName: "Activated", role: "planner", isDemoAccount: false },
      { id: userIds[3], email: `demo-${testRun}@example.test`, firstName: "Demo", role: "planner", isDemoAccount: true },
    ]);
    await db.insert(heartPlans).values([
      { id: planIds[0], userId: userIds[0], status: "active" },
      { id: planIds[1], userId: userIds[1], status: "active" },
      { id: planIds[2], userId: userIds[2], status: "activated" },
      { id: planIds[3], userId: userIds[3], status: "active" },
    ]);
    await db.insert(heartPlanIntakes).values([
      { planId: planIds[0], createdAt: dueAt },
      { planId: planIds[1], createdAt: dueAt, completedAt: new Date(dueAt.getTime() + 1) },
      { planId: planIds[2], createdAt: dueAt },
      { planId: planIds[3], createdAt: dueAt },
    ]);

    const candidates = await storage.getDueIncompleteHeartPlanReminderCandidates(now);
    const testCandidates = candidates.filter((candidate) => planIds.includes(candidate.planId));
    assert.deepEqual(testCandidates.map((candidate) => candidate.planId), [planIds[0]]);

    const firstLeaseToken = randomUUID();
    const secondLeaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const claims = await Promise.all([
      storage.claimIncompleteHeartPlanReminder(planIds[0], 1, firstLeaseToken, now, leaseExpiresAt),
      storage.claimIncompleteHeartPlanReminder(planIds[0], 1, secondLeaseToken, now, leaseExpiresAt),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const winningToken = claims[0] ? firstLeaseToken : secondLeaseToken;

    assert.equal(
      await storage.completeIncompleteHeartPlanReminder(planIds[0], 1, winningToken, now),
      true,
    );
    assert.equal(
      await storage.claimIncompleteHeartPlanReminder(planIds[0], 1, randomUUID(), now, leaseExpiresAt),
      false,
    );

    const cycleTwoNow = new Date(now.getTime() + HEARTPLAN_INTAKE_REMINDER_INTERVAL_MS);
    const failedLeaseToken = randomUUID();
    assert.equal(
      await storage.claimIncompleteHeartPlanReminder(
        planIds[0],
        2,
        failedLeaseToken,
        cycleTwoNow,
        new Date(cycleTwoNow.getTime() + 10 * 60 * 1000),
      ),
      true,
    );
    const retryAt = new Date(cycleTwoNow.getTime() + 30 * 60 * 1000);
    await storage.failIncompleteHeartPlanReminder(planIds[0], 2, failedLeaseToken, retryAt);

    const beforeRetry = await storage.getDueIncompleteHeartPlanReminderCandidates(
      new Date(retryAt.getTime() - 1),
    );
    assert.equal(beforeRetry.some((candidate) => candidate.planId === planIds[0]), false);
    const atRetry = await storage.getDueIncompleteHeartPlanReminderCandidates(retryAt);
    assert.equal(atRetry.some((candidate) => candidate.planId === planIds[0]), true);
  } finally {
    await db.delete(heartPlans).where(inArray(heartPlans.id, planIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }
});

test.after(async () => {
  await pool.end();
});
