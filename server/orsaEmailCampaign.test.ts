import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import type { RequestHandler } from "express";
import {
  deliveryStatusForProviderResult,
  eligibleOrsaCampaignRecipients,
  isCampaignRecipientExcluded,
  isProductionCampaignEnvironment,
  isSupportedOrsaEmailCampaignTemplate,
  priorDeliveryDisposition,
  registerOrsaEmailCampaignRoutes,
  templateSendability,
} from "./orsaEmailCampaign";
import type { OrsaEmailCampaignCandidate } from "./orsaEmailCampaign";
import { eligibleRetryRecipients, isRetrySnapshot } from "./orsaEmailCampaignRetry";

test("campaign eligibility accepts only active unique individual email addresses", () => {
  const candidates = eligibleOrsaCampaignRecipients([
    { id: "individual", normalizedEmail: "one@example.com", sharedEligibilityEmail: null, active: true, displayName: "One" },
    { id: "shared-recipient", normalizedEmail: "shared@example.com", sharedEligibilityEmail: null, active: true, displayName: "Two" },
    { id: "other-shared-owner", normalizedEmail: null, sharedEligibilityEmail: "SHARED@example.com", active: true, displayName: "Three" },
    { id: "duplicate-a", normalizedEmail: "same@example.com", sharedEligibilityEmail: null, active: true, displayName: null },
    { id: "duplicate-b", normalizedEmail: "SAME@example.com", sharedEligibilityEmail: null, active: true, displayName: null },
    { id: "inactive", normalizedEmail: "inactive@example.com", sharedEligibilityEmail: null, active: false, displayName: null },
    { id: "invalid", normalizedEmail: "not-an-email", sharedEligibilityEmail: null, active: true, displayName: null },
  ]);
  assert.deepEqual(candidates, [
    { id: "individual", email: "one@example.com", displayName: "One" },
  ]);
});

test("opt-outs and any prior per-template delivery exclude a recipient", () => {
  const optouts = new Set(["stop@example.com"]);
  assert.equal(isCampaignRecipientExcluded(" STOP@example.com ", optouts, false), true);
  assert.equal(isCampaignRecipientExcluded("ok@example.com", optouts, true), true);
  assert.equal(isCampaignRecipientExcluded("ok@example.com", optouts, false), false);
  assert.equal(priorDeliveryDisposition(undefined), "claim");
  for (const status of ["sending", "sent", "needs_review"]) {
    assert.equal(priorDeliveryDisposition(status), "skip");
  }
});

test("provider acceptance alone is recorded as sent; failures require review", () => {
  assert.equal(deliveryStatusForProviderResult(true), "sent");
  assert.equal(deliveryStatusForProviderResult(false), "needs_review");
});

test("date-locked templates are only sendable on their Eastern suggested date", () => {
  assert.equal(templateSendability("launch-week", new Date("2026-09-29T03:59:00.000Z")).sendable, false);
  assert.equal(templateSendability("launch-week", new Date("2026-09-29T04:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("getting-started", new Date("2026-10-12T03:59:59.000Z")).sendable, false);
  assert.equal(templateSendability("getting-started", new Date("2026-10-12T04:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("getting-started", new Date("2026-10-12T16:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("getting-started", new Date("2026-10-13T16:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("trusted-contacts", new Date("2026-10-21T16:00:00.000Z")).sendable, false);
  assert.equal(templateSendability("trusted-contacts", new Date("2026-10-22T16:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("planning-for-loved-ones", new Date("2026-11-16T16:00:00.000Z")).sendable, false);
  assert.equal(templateSendability("thirty-days-left", new Date("2026-11-01T16:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("thirty-days-left", new Date("2026-11-02T16:00:00.000Z")).sendable, false);
  assert.equal(templateSendability("one-week-left", new Date("2026-11-24T16:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("ends-tomorrow", new Date("2026-11-30T16:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("launch-week", new Date("2026-12-01T16:00:00.000Z")).sendable, true);
  assert.equal(templateSendability("launch-week", new Date("2026-12-02T05:00:00.000Z")).sendable, false);
  assert.equal(templateSendability("launch-week", new Date("2026-10-05T16:00:00.000Z")).sendable, true);
});

test("campaign template validation and production guard are strict", () => {
  for (const id of ["launch-week", "getting-started", "trusted-contacts", "thirty-days-left", "planning-for-loved-ones", "one-week-left", "ends-tomorrow"]) {
    assert.equal(isSupportedOrsaEmailCampaignTemplate(id), true);
  }
  assert.equal(isSupportedOrsaEmailCampaignTemplate("invitation"), false);
  assert.equal(isSupportedOrsaEmailCampaignTemplate(""), false);
  assert.equal(isProductionCampaignEnvironment("production", "1"), true);
  assert.equal(isProductionCampaignEnvironment("development", "1"), false);
  assert.equal(isProductionCampaignEnvironment("production", undefined), false);
});

type MemoryDelivery = { memberId: string; email: string; status: string; id: string; trackingTokenHash?: string | null };

function campaignTestServer(options: {
  candidates?: OrsaEmailCampaignCandidate[];
  optedOut?: string[];
  previouslyEmailed?: string[];
  prior?: MemoryDelivery[];
  published?: boolean;
  reviewed?: boolean;
  now?: () => Date;
  send?: (to: string) => Promise<boolean>;
  onMessage?: (message: { html: string; text?: string }) => void;
  warming?: Parameters<typeof registerOrsaEmailCampaignRoutes>[3];
} = {}) {
  let candidates = [...(options.candidates || [])];
  const optedOut = new Set(options.optedOut || []);
  const previouslyEmailed = new Set(options.previouslyEmailed || []);
  const deliveries = [...(options.prior || [])];
  const previews = new Map<string, any>();
  const runs = new Map<string, any>();
  let nextId = 0;
  let nextPreviewId = 0;
  let nextRunId = 0;
  let sendCalls = 0;
  let adminId = "test-admin";
  let reviewed = options.reviewed ?? true;
  const tracking = new Map<string, { open: boolean; click: boolean }>();
  const app = express();
  app.use(express.json());
  const allow: RequestHandler = (req: any, _res, next) => {
    req.session = { userId: adminId };
    next();
  };
  const available = (inputCandidates: OrsaEmailCampaignCandidate[]) => inputCandidates.filter((candidate) =>
    !optedOut.has(candidate.email) &&
    !deliveries.some((delivery) => delivery.memberId === candidate.id || delivery.email === candidate.email));
  registerOrsaEmailCampaignRoutes(app, allow, allow, {
    loadCandidates: async () => candidates,
    loadNeverEmailed: async input => input.filter(candidate =>
      !previouslyEmailed.has(candidate.email) &&
      !deliveries.some(delivery => delivery.memberId === candidate.id || delivery.email === candidate.email)),
    loadOptedOutEmails: async (emails) => new Set(emails.filter((email) => optedOut.has(email))),
    loadAvailableCandidates: async (_templateId, inputCandidates) => available(inputCandidates),
    loadRetryCandidates: async (_templateId, inputCandidates) => eligibleRetryRecipients(inputCandidates,
      deliveries.map((row) => ({
        ...row, trackingTokenHash: row.trackingTokenHash ?? null,
        attemptedAt: new Date("2026-09-29T14:00:00Z"), sentAt: null, firstOpenedAt: null, firstClickedAt: null,
      })), optedOut),
    loadSentCounts: async () => ({ "launch-week": deliveries.filter((item) => item.status === "sent").length }),
    loadEngagement: async () => ({
      "launch-week": {
        submitted: deliveries.filter((item) => item.status === "sent").length,
        uniqueOpens: [...tracking.values()].filter((item) => item.open).length,
        uniqueClicks: [...tracking.values()].filter((item) => item.click).length,
      },
    }),
    countAvailable: async (_templateId, inputCandidates) => {
      const eligible = available(inputCandidates);
      const alreadySentCount = inputCandidates.filter((candidate) =>
        deliveries.some((delivery) => delivery.status === "sent" &&
          (delivery.memberId === candidate.id || delivery.email === candidate.email))).length;
      return { eligibleCount: eligible.length, alreadySentCount };
    },
    loadPriorDeliveries: async () => deliveries.map(({ memberId, email, status }) => ({ memberId, email, status })),
    loadNeedsReviewCounts: async () => ({
      "launch-week": deliveries.filter((item) => ["needs_review", "sending"].includes(item.status)).length,
    }),
    loadReviewRecords: async (templateId) => deliveries
      .filter((item) => ["needs_review", "sending"].includes(item.status))
      .map((item) => ({
        id: item.id, memberId: item.memberId, email: item.email, templateId, status: item.status,
        attemptedAt: new Date("2026-10-05T16:00:00.000Z"), sentAt: null,
      })),
    loadOptoutsReviewed: async () => reviewed,
    savePreview: async (input) => {
      const preview = { ...input, id: `00000000-0000-4000-8000-${String(++nextPreviewId).padStart(12, "0")}` };
      previews.set(preview.id, preview);
      return preview;
    },
    loadPreview: async (id) => previews.get(id) || null,
    createRun: async (preview, expiresAt) => {
      const existing = [...runs.values()].find((run) => run.previewId === preview.id);
      if (existing) return existing;
      const run = {
        ...preview,
        id: `10000000-0000-4000-8000-${String(++nextRunId).padStart(12, "0")}`,
        status: isRetrySnapshot(preview.recipientSnapshot) ? "retry_confirmed" : "confirmed",
        expiresAt,
      };
      runs.set(run.id, run);
      return run;
    },
    loadRun: async (id) => runs.get(id) || null,
    pauseRun: async (id) => {
      const current = runs.get(id);
      if (current) for (const run of runs.values()) {
        if (run.templateId === current.templateId && ["confirmed", "retry_confirmed"].includes(run.status)) run.status = "paused";
      }
    },
    saveSuppressions: async (emails) => emails.forEach((email) => optedOut.add(email)),
    markOptoutsReviewed: async () => { reviewed = true; },
    claimDelivery: async (candidate, _templateId, _actorId, retry) => {
      if (retry) {
        const delivery = deliveries.find((item) => item.id === retry.retryDeliveryId &&
          item.memberId === candidate.id && item.email === candidate.email);
        if (optedOut.has(candidate.email) || !delivery || delivery.status !== "needs_review" ||
          (delivery.trackingTokenHash ?? null) !== retry.priorTrackingTokenHash) return { disposition: "skipped" as const };
        delivery.status = "sending";
        delivery.trackingTokenHash = `retry-hash-${++nextId}`;
        return { disposition: "claimed" as const, deliveryId: delivery.id, unsubscribeToken: "a".repeat(48), trackingToken: String(nextId).padStart(48, "0") };
      }
      if (optedOut.has(candidate.email) ||
        deliveries.some((delivery) => delivery.memberId === candidate.id || delivery.email === candidate.email)) {
        return { disposition: "skipped" as const };
      }
      const id = `delivery-${++nextId}`;
      deliveries.push({ memberId: candidate.id, email: candidate.email, status: "sending", id });
      const trackingToken = String(nextId).padStart(48, "0");
      tracking.set(trackingToken, { open: false, click: false });
      return { disposition: "claimed" as const, deliveryId: id, unsubscribeToken: "a".repeat(48), trackingToken };
    },
    setDeliveryStatus: async (id, status) => {
      const delivery = deliveries.find((item) => item.id === id);
      if (delivery) delivery.status = status;
    },
    recordEngagement: async (token, kind) => {
      const item = tracking.get(token);
      if (item) item[kind] = true;
    },
    send: async (message) => {
      sendCalls++;
      options.onMessage?.(message);
      return options.send ? options.send(message.to) : true;
    },
    deliveryConfigured: () => true,
    isPublishedProduction: () => options.published === true,
    now: () => options.now ? options.now() : new Date("2026-10-05T16:00:00.000Z"),
    reserveWarmup: async () => ({ allowed: true, reservationId: crypto.randomUUID() }),
    finishWarmup: async () => {},
    pauseWarmup: async () => {},
    warmingReason: async () => null,
    warmingOverview: async () => ({
      settings: { id: "test", enabled: true, paused: false, dailyReviewRequired: false, hourlyLimit: 1000, dailyLimit: 1000,
        minIntervalSeconds: 60, providerHourlyLimit: 1000, reservedHourly: 0, pauseReason: null,
        nextSendAt: null, reviewedBy: "admin", updatedAt: new Date() },
      usage: { hourly: 0, daily: 0, otherHourly: 0, otherDaily: 0 },
      remaining: { hourly: 1000, daily: 1000 }, nextAllowedAt: null,
    }),
    recoveryEligible: async () => true,
    ...options.warming,
  });
  const server = createServer(app);
  return {
    get sendCalls() { return sendCalls; },
    deliveries,
    setCandidates(value: OrsaEmailCampaignCandidate[]) { candidates = value; },
    setAdmin(value: string) { adminId = value; },
    addOptout(email: string) { optedOut.add(email); },
    markPreviouslyEmailed(email: string) { previouslyEmailed.add(email); },
    seedRun(templateId: string, snapshot: Array<{ id: string; email: string }>, expiresAt = new Date("2026-10-12T16:00:00.000Z")) {
      const id = `20000000-0000-4000-8000-${String(++nextRunId).padStart(12, "0")}`;
      runs.set(id, {
        id, adminUserId: adminId, templateId, recipientSnapshot: snapshot, expectedCount: snapshot.length,
        expiresAt, status: "confirmed",
      });
      return id;
    },
    async withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      try {
        return await run(`http://127.0.0.1:${address.port}`);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    },
  };
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  if (path.endsWith("/preview") && body && typeof body === "object")
    body = { recipientLimit: 500, ...body };
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("never-emailed preview excludes prior invitations or other emails and rejects recovery/retry scope", async () => {
  const harness = campaignTestServer({
    candidates: [
      { id: "fresh", email: "fresh@example.com", displayName: "Fresh Member" },
      { id: "invited", email: "invited@example.com", displayName: "Already Invited" },
    ],
    previouslyEmailed: ["invited@example.com"],
  });
  await harness.withServer(async baseUrl => {
    const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", {
      templateId: "launch-week", audience: "never_emailed",
    });
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(preview.audience, "never_emailed");
    assert.deepEqual(preview.recipients.map((row: any) => row.email), ["fresh@example.com"]);
    for (const body of [
      { templateId: "link-recovery", audience: "never_emailed" },
      { templateId: "launch-week", audience: "never_emailed", retryHeld: true },
    ]) {
      assert.equal((await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", body)).status, 400);
    }
    assert.equal(harness.sendCalls, 0);
  });
});

test("never-emailed scope is frozen and rechecked at confirmation and before batch delivery", async () => {
  const harness = campaignTestServer({
    published: true, candidates: [{ id: "fresh", email: "fresh@example.com", displayName: "Fresh Member" }],
  });
  await harness.withServer(async baseUrl => {
    const firstPreview = await (await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", {
      templateId: "launch-week", audience: "never_emailed",
    })).json();
    const confirmed = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: firstPreview.previewId, expectedCount: 1, confirmed: true,
    });
    assert.equal(confirmed.status, 200);
    const run = await confirmed.json();
    const secondPreview = await (await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", {
      templateId: "launch-week", audience: "never_emailed",
    })).json();
    harness.markPreviouslyEmailed("fresh@example.com");
    assert.equal((await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: secondPreview.previewId, expectedCount: 1, confirmed: true,
    })).status, 409);
    const sent = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: run.runId });
    assert.equal(sent.status, 200);
    assert.equal((await sent.json()).sent, 0);
    assert.equal(harness.sendCalls, 0);
  });
});

test("full-list previews exceed the old 500 cap but honor daily capacity and do not send", async () => {
  const candidates = Array.from({ length: 1100 }, (_, index) => ({
    id: `full-${index}`, email: `full-${index}@example.invalid`, displayName: null,
  }));
  const harness = campaignTestServer({ candidates });
  await harness.withServer(async baseUrl => {
    const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", {
      templateId: "launch-week", recipientLimit: 10000,
    });
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(preview.eligibleCount, 1000, "Saved remaining daily capacity still caps the snapshot");
    assert.equal(preview.recipients.length, 1000);
    assert.equal(harness.sendCalls, 0);
    const invalid = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", {
      templateId: "launch-week", recipientLimit: 10001,
    });
    assert.equal(invalid.status, 400);
  });
});

test("send-batch route rejects development delivery without calling the provider", async () => {
  const harness = campaignTestServer({
    candidates: [{ id: "dev", email: "dev@example.com", displayName: "Dev" }],
    published: false,
  });
  const runId = harness.seedRun("launch-week", [{ id: "dev", email: "dev@example.com" }]);
  await harness.withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/orsa/email-campaign/send-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    assert.equal(response.status, 403);
    assert.equal(harness.sendCalls, 0);
  });
});

test("preview route embeds its inline logo for the sandbox HTML preview", async () => {
  const harness = campaignTestServer({
    candidates: [
      { id: "preview", email: "preview@example.com", displayName: "Preview Member" },
      { id: "opted-out", email: "excluded@example.com", displayName: "Excluded Member" },
    ],
    optedOut: ["excluded@example.com"],
  });
  await harness.withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/orsa/email-campaign/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: "launch-week" }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      html: string; previewId: string; eligibleCount: number;
      recipients: { email: string; displayName: string | null }[];
    };
    assert.match(payload.html, /src="data:image\/png;base64,[A-Za-z0-9+/]+=*"/);
    assert.doesNotMatch(payload.html, /cid:orsa-logo/);
    assert.ok(payload.previewId);
    assert.equal(payload.eligibleCount, 1);
    assert.deepEqual(payload.recipients, [{ email: "preview@example.com", displayName: "Preview Member" }]);
    assert.equal(harness.sendCalls, 0);
  });
});

test("confirmation rejects changed recipient identities and previews from another admin", async () => {
  const harness = campaignTestServer({
    published: true,
    candidates: [{ id: "snapshot-one", email: "one@example.com", displayName: null }],
  });
  await harness.withServer(async (baseUrl) => {
    const firstPreviewResponse = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", { templateId: "launch-week" });
    const firstPreview = await firstPreviewResponse.json() as { previewId: string; eligibleCount: number };
    assert.equal(firstPreview.eligibleCount, 1);
    harness.setCandidates([
      { id: "snapshot-one", email: "changed@example.com", displayName: null },
      { id: "added-after-preview", email: "new@example.com", displayName: null },
    ]);
    const changedRoster = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: firstPreview.previewId,
      expectedCount: firstPreview.eligibleCount,
      confirmed: true,
    });
    assert.equal(changedRoster.status, 409);

    const secondPreviewResponse = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", { templateId: "launch-week" });
    const secondPreview = await secondPreviewResponse.json() as { previewId: string; eligibleCount: number };
    harness.setAdmin("different-admin");
    const wrongAdmin = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: secondPreview.previewId,
      expectedCount: secondPreview.eligibleCount,
      confirmed: true,
    });
    assert.equal(wrongAdmin.status, 404);
  });
});

test("manual suppression is persisted and confirmation waits for opt-out review", async () => {
  const harness = campaignTestServer({
    published: true,
    reviewed: false,
    candidates: [{ id: "suppressed", email: "stop@example.com", displayName: null }],
  });
  await harness.withServer(async (baseUrl) => {
    const previewResponse = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", { templateId: "launch-week" });
    const preview = await previewResponse.json() as { previewId: string; eligibleCount: number };
    assert.equal(preview.eligibleCount, 1);
    const blockedConfirm = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: preview.previewId,
      expectedCount: 1,
      confirmed: true,
    });
    assert.equal(blockedConfirm.status, 409);

    const suppression = await postJson(baseUrl, "/api/admin/orsa/email-campaign/suppress", {
      emails: [" STOP@Example.com ", "stop@example.com"],
    });
    assert.equal(suppression.status, 200);
    assert.deepEqual(await suppression.json(), { suppressedCount: 1 });
    const reviewed = await postJson(baseUrl, "/api/admin/orsa/email-campaign/optouts-reviewed", { confirmed: true });
    assert.equal(reviewed.status, 200);

    const freshPreviewResponse = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", { templateId: "launch-week" });
    const freshPreview = await freshPreviewResponse.json() as { previewId: string; eligibleCount: number };
    assert.equal(freshPreview.eligibleCount, 0);
    const confirmedEmptyRun = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: freshPreview.previewId,
      expectedCount: 0,
      confirmed: true,
    });
    assert.equal(confirmedEmptyRun.status, 200);
    assert.equal(harness.sendCalls, 0);
  });
});

test("confirmed run sends only its immutable snapshot, never later roster additions", async () => {
  const harness = campaignTestServer({
    published: true,
    candidates: [{ id: "snapshot-one", email: "one@example.com", displayName: null }],
  });
  await harness.withServer(async (baseUrl) => {
    const previewResponse = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", { templateId: "launch-week" });
    const preview = await previewResponse.json() as { previewId: string; eligibleCount: number };
    const confirmResponse = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: preview.previewId,
      expectedCount: preview.eligibleCount,
      confirmed: true,
    });
    const confirmed = await confirmResponse.json() as { runId: string };
    assert.equal(confirmResponse.status, 200);
    harness.setCandidates([
      { id: "snapshot-one", email: "one@example.com", displayName: null },
      { id: "later-added", email: "later@example.com", displayName: null },
    ]);
    const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: confirmed.runId });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: 1, remaining: 0, needsReview: 0, skipped: 0, paused: false });
    assert.deepEqual(harness.deliveries.filter(({ status }) => status === "sent").map(({ email }) => email), ["one@example.com"]);
  });
});

test("live campaign links count unique opens and CTA clicks without counting preview traffic", async () => {
  let sentHtml = "";
  let sentText = "";
  const harness = campaignTestServer({
    published: true,
    candidates: [{ id: "tracked", email: "tracked@example.com", displayName: "Tracked Member" }],
    onMessage: ({ html, text }) => { sentHtml = html; sentText = text || ""; },
  });
  await harness.withServer(async (baseUrl) => {
    const preview = await (await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", { templateId: "launch-week" })).json() as {
      previewId: string; eligibleCount: number; html: string;
    };
    assert.doesNotMatch(preview.html, /\/api\/orsa\/email-campaign\/(?:open|click)\//);
    const confirm = await (await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: preview.previewId, expectedCount: preview.eligibleCount, confirmed: true,
    })).json() as { runId: string };
    const result = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: confirm.runId });
    assert.equal(result.status, 200);
    assert.equal(harness.sendCalls, 1);
    const token = sentHtml.match(/\/api\/orsa\/email-campaign\/open\/([a-f0-9]{48})/)?.[1];
    assert.ok(token);
    assert.match(sentHtml, new RegExp(`/api/orsa/email-campaign/click/${token}`));
    assert.match(sentText, new RegExp(`/api/orsa/email-campaign/click/${token}`));
    const overviewBefore = await (await fetch(`${baseUrl}/api/admin/orsa/email-campaign`)).json() as any;
    assert.deepEqual(overviewBefore.engagement["launch-week"], { submitted: 1, uniqueOpens: 0, uniqueClicks: 0 });

    for (let i = 0; i < 2; i++) {
      const open = await fetch(`${baseUrl}/api/orsa/email-campaign/open/${token}`);
      assert.equal(open.status, 200);
      assert.equal(open.headers.get("content-type"), "image/gif");
      const click = await fetch(`${baseUrl}/api/orsa/email-campaign/click/${token}`, { redirect: "manual" });
      assert.equal(click.status, 302);
      assert.match(click.headers.get("location") || "", /\/heartplan-register\?orsa_offer=1$/);
    }
    const unknown = await fetch(`${baseUrl}/api/orsa/email-campaign/click/${"f".repeat(48)}`, { redirect: "manual" });
    assert.equal(unknown.status, 302); // A well-formed but unknown token cannot affect counts.
    const malformed = await fetch(`${baseUrl}/api/orsa/email-campaign/click/not-a-token`, { redirect: "manual" });
    assert.equal(malformed.status, 404);
    const overviewAfter = await (await fetch(`${baseUrl}/api/admin/orsa/email-campaign`)).json() as any;
    assert.deepEqual(overviewAfter.engagement["launch-week"], { submitted: 1, uniqueOpens: 1, uniqueClicks: 1 });
  });
});

test("send-batch rejects expired or wrong-administrator run IDs", async () => {
  const harness = campaignTestServer({
    published: true,
    candidates: [{ id: "locked", email: "locked@example.com", displayName: null }],
  });
  const expiredRunId = harness.seedRun(
    "launch-week",
    [{ id: "locked", email: "locked@example.com" }],
    new Date("2026-10-04T16:00:00.000Z"),
  );
  const wrongAdminRunId = harness.seedRun("launch-week", [{ id: "locked", email: "locked@example.com" }]);
  await harness.withServer(async (baseUrl) => {
    const expired = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: expiredRunId });
    assert.equal(expired.status, 409);
    harness.setAdmin("other-admin");
    const wrongAdmin = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: wrongAdminRunId });
    assert.equal(wrongAdmin.status, 404);
    assert.equal(harness.sendCalls, 0);
  });
});

test("date-sensitive batch stops at Eastern date rollover", async () => {
  let now = new Date("2026-11-01T16:00:00.000Z");
  const submitted: string[] = [];
  const harness = campaignTestServer({
    published: true,
    candidates: [
      { id: "november-one", email: "one@example.com", displayName: null },
      { id: "november-two", email: "two@example.com", displayName: null },
    ],
    now: () => now,
    send: async (to) => {
      submitted.push(to);
      now = new Date("2026-11-02T05:01:00.000Z");
      return true;
    },
  });
  const runId = harness.seedRun("thirty-days-left", [
    { id: "november-one", email: "one@example.com" },
    { id: "november-two", email: "two@example.com" },
  ], new Date("2026-11-08T16:00:00.000Z"));
  await harness.withServer(async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: 1, remaining: 1, needsReview: 0, skipped: 0, paused: false });
    assert.deepEqual(submitted, ["one@example.com"]);
  });
});

test("send-batch skips opt-outs and email-level duplicates after roster ID replacement", async () => {
  const formerId = "member-before-import";
  const existingAddress = "already-sent@example.com";
  const harness = campaignTestServer({
    published: true,
    candidates: [
      { id: "opted-out", email: "stop@example.com", displayName: null },
      { id: "replacement-id", email: existingAddress, displayName: null },
      { id: "eligible", email: "eligible@example.com", displayName: "Eligible" },
    ],
    optedOut: ["stop@example.com"],
    prior: [{ id: "old-delivery", memberId: formerId, email: existingAddress, status: "sent" }],
  });
  await harness.withServer(async (baseUrl) => {
    const previewResponse = await fetch(`${baseUrl}/api/admin/orsa/email-campaign/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: "launch-week" }),
    });
    const preview = await previewResponse.json() as { previewId: string; eligibleCount: number };
    assert.equal(preview.eligibleCount, 1);
    const confirmResponse = await fetch(`${baseUrl}/api/admin/orsa/email-campaign/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ previewId: preview.previewId, expectedCount: 1, confirmed: true }),
    });
    const confirmed = await confirmResponse.json() as { runId: string };
    assert.equal(confirmResponse.status, 200);
    const response = await fetch(`${baseUrl}/api/admin/orsa/email-campaign/send-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: confirmed.runId }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: 1, remaining: 0, needsReview: 0, skipped: 0, paused: false });
    assert.equal(harness.sendCalls, 1);
    assert.equal(harness.deliveries.find((delivery) => delivery.email === existingAddress)?.status, "sent");

    harness.setCandidates([{ id: "post-import-id", email: "eligible@example.com", displayName: "Eligible" }]);
    const retry = await fetch(`${baseUrl}/api/admin/orsa/email-campaign/send-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: confirmed.runId }),
    });
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { sent: 0, remaining: 0, needsReview: 0, skipped: 0, paused: false });
    assert.equal(harness.sendCalls, 1);
  });
});

test("uncertain provider failure is retained for review and not retried", async () => {
  const harness = campaignTestServer({
    published: true,
    candidates: [{ id: "review", email: "review@example.com", displayName: null }],
    send: async () => false,
  });
  const runId = harness.seedRun("launch-week", [{ id: "review", email: "review@example.com" }]);
  await harness.withServer(async (baseUrl) => {
    const request = () => fetch(`${baseUrl}/api/admin/orsa/email-campaign/send-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const first = await request();
    assert.deepEqual(await first.json(), { sent: 0, remaining: 0, needsReview: 1, skipped: 0, paused: true,
      reason: "The provider did not confirm submission. Review delivery before resuming." });
    assert.equal(harness.deliveries[0]?.status, "needs_review");
    const retry = await request();
    assert.equal(retry.status, 409);
    assert.equal(harness.sendCalls, 1);
  });
});

async function retryPreview(baseUrl: string) {
  const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/preview", { templateId: "launch-week", retryHeld: true });
  assert.equal(response.status, 200);
  return response.json();
}

async function confirmRetry(baseUrl: string, preview: any) {
  const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
    previewId: preview.previewId, expectedCount: preview.eligibleCount, confirmed: true, acceptDuplicateRisk: true,
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("controlled retry preview excludes submissions, active sends, new members, and opt-outs; risk acceptance is required", async () => {
  const members = ["held", "sent", "sending", "opted-out", "new"].map((id) => ({ id, email: `${id}@example.com`, displayName: id }));
  const harness = campaignTestServer({
    published: true, candidates: members, optedOut: ["opted-out@example.com"],
    prior: members.filter(({ id }) => id !== "new").map(({ id, email }) => ({
      memberId: id, email, id: `delivery-${id}`, status: id === "held" || id === "opted-out" ? "needs_review" : id,
    })),
  });
  await harness.withServer(async (baseUrl) => {
    const preview = await retryPreview(baseUrl);
    assert.equal(preview.retryHeld, true);
    assert.equal(preview.eligibleCount, 1);
    assert.deepEqual(preview.recipients, [{ email: "held@example.com", displayName: "held" }]);
    assert.equal(JSON.stringify(preview).includes("priorTrackingTokenHash"), false);
    const noRisk = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: preview.previewId, expectedCount: 1, confirmed: true,
    });
    assert.equal(noRisk.status, 400);
    const run = await confirmRetry(baseUrl, preview);
    const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: run.runId });
    assert.deepEqual(await response.json(), { sent: 1, remaining: 0, needsReview: 0, skipped: 0, paused: false });
    const again = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: run.runId });
    assert.equal((await again.json()).sent, 0);
    assert.equal(harness.sendCalls, 1);
    assert.equal(harness.deliveries.find((row) => row.memberId === "sent")?.status, "sent");
  });
});

test("retry confirmation rejects changed claims, changed opt-outs, and another administrator", async () => {
  const harness = campaignTestServer({
    published: true, candidates: [{ id: "held", email: "held@example.com", displayName: null }],
    prior: [{ id: "delivery-held", memberId: "held", email: "held@example.com", status: "needs_review" }],
  });
  await harness.withServer(async (baseUrl) => {
    const preview = await retryPreview(baseUrl);
    const payload = { previewId: preview.previewId, expectedCount: 1, confirmed: true, acceptDuplicateRisk: true };
    harness.setAdmin("other-admin");
    assert.equal((await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", payload)).status, 404);
    harness.setAdmin("test-admin");
    harness.deliveries[0].trackingTokenHash = "another-attempt";
    assert.equal((await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", payload)).status, 409);
    const fresh = await retryPreview(baseUrl);
    harness.addOptout("held@example.com");
    assert.equal((await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", { ...payload, previewId: fresh.previewId })).status, 409);
    assert.equal(harness.sendCalls, 0);
  });
});

test("new retry failure pauses persistently after one attempt and overlapping confirmed runs cannot resend that attempt", async () => {
  const candidates = ["a", "b", "c"].map((id) => ({ id, email: `${id}@example.com`, displayName: id }));
  const harness = campaignTestServer({
    published: true, candidates, send: async () => false,
    prior: candidates.map(({ id, email }) => ({ id: `delivery-${id}`, memberId: id, email, status: "needs_review" })),
  });
  await harness.withServer(async (baseUrl) => {
    const one = await confirmRetry(baseUrl, await retryPreview(baseUrl));
    const two = await confirmRetry(baseUrl, await retryPreview(baseUrl));
    const first = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: one.runId });
    assert.deepEqual(await first.json(), { sent: 0, remaining: 2, needsReview: 1, skipped: 0, paused: true,
      reason: "The provider did not confirm submission. Review delivery before resuming." });
    assert.equal(harness.sendCalls, 1);
    const paused = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: one.runId });
    assert.equal(paused.status, 409);
    const overlap = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: two.runId });
    assert.equal(overlap.status, 409);
    assert.equal(harness.sendCalls, 1);
    assert.equal(harness.deliveries[0].trackingTokenHash, "retry-hash-1");
  });
});

test("a new opt-out after retry confirmation prevents submission and development cannot confirm retries", async () => {
  const options = {
    candidates: [{ id: "held", email: "held@example.com", displayName: null }],
    prior: [{ id: "delivery-held", memberId: "held", email: "held@example.com", status: "needs_review" }],
  };
  const harness = campaignTestServer({ ...options, published: true });
  await harness.withServer(async (baseUrl) => {
    const run = await confirmRetry(baseUrl, await retryPreview(baseUrl));
    harness.addOptout("held@example.com");
    const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: run.runId });
    assert.equal((await response.json()).sent, 0);
    assert.equal(harness.sendCalls, 0);
  });
  const development = campaignTestServer(options);
  await development.withServer(async (baseUrl) => {
    const preview = await retryPreview(baseUrl);
    const response = await postJson(baseUrl, "/api/admin/orsa/email-campaign/confirm", {
      previewId: preview.previewId, expectedCount: 1, confirmed: true, acceptDuplicateRisk: true,
    });
    assert.equal(response.status, 403);
    assert.equal(development.sendCalls, 0);
  });
});

test("concurrent retry batches claim each held delivery only once", async () => {
  const candidates = Array.from({ length: 30 }, (_, i) => ({ id: `held-${i}`, email: `held-${i}@example.com`, displayName: null }));
  const harness = campaignTestServer({
    published: true, candidates,
    prior: candidates.map(({ id, email }) => ({ id: `delivery-${id}`, memberId: id, email, status: "needs_review" })),
  });
  await harness.withServer(async (baseUrl) => {
    const run = await confirmRetry(baseUrl, await retryPreview(baseUrl));
    const responses = await Promise.all([1, 2].map(() =>
      postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: run.runId })));
    assert.ok(responses.every((response) => response.status === 200));
    const sentByConcurrentBatches = harness.sendCalls;
    assert.ok(sentByConcurrentBatches >= 25 && sentByConcurrentBatches <= 30);
    const last = await postJson(baseUrl, "/api/admin/orsa/email-campaign/send-batch", { runId: run.runId });
    assert.equal((await last.json()).sent, 30 - sentByConcurrentBatches);
    assert.equal(harness.sendCalls, 30);
  });
});