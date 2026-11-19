import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { registerOrsaEmailCampaignRoutes } from "./orsaEmailCampaign";
import type { OrsaEmailCampaignCandidate } from "./orsaEmailCampaign";

function fixture() {
  const candidates: OrsaEmailCampaignCandidate[] = ["one", "two", "three"].map(id => ({ id, email: `${id}@example.invalid`, displayName: id }));
  const previews = new Map<string, any>(), runs = new Map<string, any>(), submitted = new Set<string>();
  let providerCalls = 0, reservations = 0, warmingPaused = false, fail = false;
  const overrides: NonNullable<Parameters<typeof registerOrsaEmailCampaignRoutes>[3]> = {
    loadCandidates: async () => candidates, loadOptedOutEmails: async () => new Set(),
    loadAvailableCandidates: async (_id, rows) => rows.filter(row => !submitted.has(row.id)),
    loadRetryCandidates: async () => [], loadPriorDeliveries: async () => [],
    loadSentCounts: async () => ({}), loadEngagement: async () => ({}), loadNeedsReviewCounts: async () => ({}),
    loadOptoutsReviewed: async () => true,
    countAvailable: async () => ({ eligibleCount: candidates.length - submitted.size, alreadySentCount: submitted.size }),
    savePreview: async input => { const row = { id: randomUUID(), ...input }; previews.set(row.id, row); return row; },
    loadPreview: async id => previews.get(id) ?? null,
    createRun: async (preview, expiresAt) => { const row = { ...preview, status: "confirmed", expiresAt }; runs.set(row.id, row); return row; },
    loadRun: async id => runs.get(id) ?? null,
    pauseRun: async () => { for (const row of runs.values()) row.status = "paused"; },
    claimDelivery: async row => {
      if (submitted.has(row.id)) return { disposition: "skipped" };
      submitted.add(row.id);
      return { disposition: "claimed", deliveryId: row.id, unsubscribeToken: "a".repeat(48), trackingToken: "b".repeat(48) };
    },
    setDeliveryStatus: async () => {}, recordEngagement: async () => {},
    deliveryConfigured: () => true, isPublishedProduction: () => true,
    now: () => new Date("2026-10-06T16:00:00Z"),
    reserveWarmup: async () => {
      reservations++;
      if (warmingPaused) return { allowed: false, paused: true, waitingForReview: true, retryAfterSeconds: 0, reason: "Review daily delivery results." };
      if (reservations === 2) return { allowed: false, paused: false, waitingForReview: false, retryAfterSeconds: 1, reason: "Spacing." };
      return { allowed: true, reservationId: randomUUID() };
    },
    finishWarmup: async () => {}, pauseWarmup: async () => { warmingPaused = true; },
    warmingReason: async () => warmingPaused ? "Warming paused." : null,
    warmingOverview: async () => ({
      settings: { id: "test", enabled: true, paused: false, dailyReviewRequired: false, hourlyLimit: 10, dailyLimit: 25, minIntervalSeconds: 360,
        providerHourlyLimit: 20, reservedHourly: 10, pauseReason: null, nextSendAt: null, reviewedBy: "admin", updatedAt: new Date() },
      usage: { hourly: 0, daily: 0, otherHourly: 0, otherDaily: 0 }, remaining: { hourly: 10, daily: 25 }, nextAllowedAt: null,
    }),
    recoveryEligible: async () => true,
    send: async message => {
      providerCalls++;
      assert.equal(message.disableProviderClickTracking, true);
      assert.ok(message.warmupReservationId);
      assert.match(message.html, /copy this address into your browser/i);
      if (fail) throw Object.assign(new Error("Synthetic provider failure"), { code: 401 });
      return true;
    },
  };
  return { candidates, overrides, get providerCalls() { return providerCalls; },
    pause: () => { warmingPaused = true; }, fail: () => { fail = true; } };
}
async function withServer(f: ReturnType<typeof fixture>, callback: (post: (path: string, data: unknown) => Promise<Response>) => Promise<void>) {
  const app = express(); app.use(express.json());
  registerOrsaEmailCampaignRoutes(app, (req: any, _res, next) => { req.session = { userId: "synthetic-admin" }; next(); }, (_req, _res, next) => next(), f.overrides);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    await callback((path, data) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/orsa/email-campaign${path}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
async function confirm(post: Parameters<Parameters<typeof withServer>[1]>[0], recipientLimit: number) {
  const preview = await (await post("/preview", { templateId: "link-recovery", recipientLimit })).json();
  const response = await post("/confirm", { previewId: preview.previewId, expectedCount: preview.eligibleCount, confirmed: true });
  assert.equal(response.status, 200);
  return { preview, runId: (await response.json()).runId };
}
test("preview selects only the requested group; new roster additions never expand it", async () => {
  const f = fixture();
  await withServer(f, async post => {
    const { preview, runId } = await confirm(post, 1);
    assert.equal(preview.availableCount, 3); assert.equal(preview.eligibleCount, 1); assert.equal(f.providerCalls, 0);
    f.candidates.push({ id: "later", email: "later@example.invalid", displayName: null });
    const result = await (await post("/send-batch", { runId })).json();
    assert.equal(result.sent, 1); assert.equal(result.remaining, 0); assert.equal(f.providerCalls, 1);
  });
});
test("spacing returns a wait without claiming another recipient; the confirmed group resumes once", async () => {
  const f = fixture();
  await withServer(f, async post => {
    const { runId } = await confirm(post, 2);
    const first = await (await post("/send-batch", { runId })).json();
    assert.equal(first.sent, 1); assert.equal(first.remaining, 1); assert.equal(first.throttled, true);
    assert.equal(first.retryAfterSeconds, 1); assert.equal(first.paused, false);
    const second = await (await post("/send-batch", { runId })).json();
    assert.equal(second.sent, 1); assert.equal(second.remaining, 0); assert.equal(f.providerCalls, 2);
  });
});
test("review stop makes no provider call; failures stop at one and block subsequent sending", async () => {
  for (const mode of ["review", "provider"] as const) {
    const f = fixture();
    await withServer(f, async post => {
      const { runId } = await confirm(post, 3);
      if (mode === "review") f.pause(); else f.fail();
      const result = await (await post("/send-batch", { runId })).json();
      assert.equal(result.paused, true);
      assert.equal(f.providerCalls, mode === "review" ? 0 : 1);
      if (mode === "review") assert.equal(result.waitingForReview, true);
      else assert.match(result.reason, /401/);
      if (mode === "provider") assert.equal((await post("/send-batch", { runId })).status, 409);
    });
  }
});
