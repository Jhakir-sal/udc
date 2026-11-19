import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { DatabaseStorage } from "./storage";
import {
  heartPlans,
  heartPlanIntakes,
  heartPlanDeletionJobs,
  planWishes,
  planDocuments,
  planAssets,
  planContacts,
  planLetters,
  planEvents,
  planActivationRequests,
} from "@shared/schema";

test("admin deletion cascades living-plan content and retains a cleanup audit", async () => {
  const storage = new DatabaseStorage();
  const suffix = randomUUID();
  const planId = `delete-plan-${suffix}`;
  const paidPlanId = `delete-paid-${suffix}`;
  const reportedPlanId = `delete-reported-${suffix}`;
  const planIds = [planId, paidPlanId, reportedPlanId];

  try {
    await db.insert(heartPlans).values([
      { id: planId, userId: `delete-user-${suffix}`, status: "active", tier: "free" },
      { id: paidPlanId, userId: `delete-paid-user-${suffix}`, status: "active", tier: "legacy", upgradedAt: new Date() },
      { id: reportedPlanId, userId: `delete-reported-user-${suffix}`, status: "active", tier: "free" },
    ]);
    await db.insert(heartPlanIntakes).values({ planId });
    await db.insert(planWishes).values({ planId, restingPreference: "undecided" });
    await db.insert(planDocuments).values({
      planId,
      label: "Test document",
      documentType: "other",
      fileName: "test.pdf",
      objectPath: `/objects/delete-test-${suffix}.pdf`,
    });
    await db.insert(planAssets).values({ planId, name: "Test account", category: "digital", assetType: "email_account" });
    await db.insert(planContacts).values({ planId, fullName: "Test Contact" });
    await db.insert(planLetters).values({
      planId,
      recipientName: "Test Recipient",
      messageType: "audio",
      objectPath: `/objects/delete-test-${suffix}.mp3`,
    });
    await db.insert(planEvents).values({ planId, eventType: "test", description: "Deletion test" });
    await db.insert(planActivationRequests).values({
      planId: reportedPlanId,
      requesterName: "Test Reporter",
      requesterEmail: "reporter@example.test",
      token: `delete-test-${suffix}`,
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    });

    assert.equal(await storage.deleteActiveHeartPlan({
      id: paidPlanId,
      deletedBy: "admin-test",
      deletedByName: "Admin Test",
      reason: "Testing paid deletion protection",
    }), undefined);
    assert.equal(await storage.deleteActiveHeartPlan({
      id: reportedPlanId,
      deletedBy: "admin-test",
      deletedByName: "Admin Test",
      reason: "Testing report deletion protection",
    }), undefined);

    const result = await storage.deleteActiveHeartPlan({
      id: planId,
      deletedBy: "admin-test",
      deletedByName: "Admin Test",
      reason: "Planner requested account cleanup",
    });
    assert.ok(result);
    assert.deepEqual(new Set(result.cleanupJob.objectPaths), new Set([
      `/objects/delete-test-${suffix}.pdf`,
      `/objects/delete-test-${suffix}.mp3`,
    ]));
    assert.ok(result.cleanupJob.cleanupNotBefore.getTime() >= Date.now() + 15 * 60 * 1000);

    assert.equal(await storage.getHeartPlan(planId), undefined);
    for (const table of [heartPlanIntakes, planWishes, planDocuments, planAssets, planContacts, planLetters, planEvents]) {
      assert.equal((await db.select().from(table).where(eq(table.planId, planId))).length, 0);
    }
    assert.equal((await db.select().from(heartPlanDeletionJobs).where(eq(heartPlanDeletionJobs.planId, planId))).length, 1);

    await storage.completeHeartPlanDeletionJob(result.cleanupJob.id);
    const [completed] = await db.select().from(heartPlanDeletionJobs).where(eq(heartPlanDeletionJobs.id, result.cleanupJob.id));
    assert.equal(completed.status, "complete");
    assert.equal(completed.attempts, 1);
    assert.ok(completed.completedAt);
  } finally {
    await db.delete(heartPlans).where(inArray(heartPlans.id, planIds));
    await db.delete(heartPlanDeletionJobs).where(inArray(heartPlanDeletionJobs.planId, planIds));
  }
});

test.after(async () => {
  await pool.end();
});