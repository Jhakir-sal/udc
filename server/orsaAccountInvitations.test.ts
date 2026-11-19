import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { invitationAudience, pendingInvitations, registerOrsaAccountInvitationRoutes } from "./orsaAccountInvitations";
import type { InvitationAudienceRow, InvitationDependencies } from "./orsaAccountInvitations";
import { isRetrySnapshot } from "./orsaEmailCampaignRetry";

const BASE = "/api/admin/orsa/account-invitations";
const date = new Date("2026-10-02T14:00:00Z");
function member(status = "pending"): InvitationAudienceRow {
  const id = crypto.randomUUID();
  return { id, normalizedEmail: `${id}@example.invalid`, sharedEligibilityEmail: null,
    displayName: "Synthetic Member", active: true, invitationStatus: status,
    invitationSentAt: null, invitationAcceptedAt: null, invitationAttemptedAt: null,
    invitationFirstAttemptAt: null };
}

function harness(rows: InvitationAudienceRow[]) {
  const accounts = new Set<string>(), optouts = new Set<string>();
  const previews = new Map<string, Awaited<ReturnType<InvitationDependencies["savePreview"]>>>();
  const runs = new Map<string, NonNullable<Awaited<ReturnType<InvitationDependencies["getRun"]>>>>();
  let sent = 0, fail = false, production = true, configured = true, reviewed = true, allowed = true;
  let beforeClaim: (() => void) | undefined;
  const deps: Partial<InvitationDependencies> = {
    audience: async () => ({ rows, ...invitationAudience(rows, accounts, optouts) }),
    savePreview: async (input) => { const preview = { id: crypto.randomUUID(), ...input }; previews.set(preview.id, preview); return preview; },
    getPreview: async (id) => previews.get(id) ?? null,
    createRun: async (preview, expiresAt) => {
      const existing = [...runs.values()].find(run => run.id === preview.id);
      if (existing) return existing;
      const run = { ...preview, status: isRetrySnapshot(preview.recipientSnapshot) ? "retry_confirmed" : "confirmed", expiresAt };
      runs.set(run.id, run); return run;
    },
    getRun: async (id) => runs.get(id) ?? null,
    pauseRun: async (id) => {
      const current = runs.get(id);
      if (current) for (const run of runs.values()) if (run.templateId === current.templateId) run.status = "paused";
    },
    claim: async (id, now, snapshot) => {
      beforeClaim?.();
      const row = rows.find(row => row.id === id)!;
      const live = invitationAudience(rows, accounts, optouts);
      const ready = snapshot?.retryHeld ? live.held : live.firstTime;
      if (!snapshot || !pendingInvitations([{ id, email: snapshot.email,
        retryDeliveryId: snapshot.retryHeld ? id : undefined, priorAttemptedAt: snapshot.priorAttemptedAt }], ready, snapshot.retryHeld).length)
        return { disposition: "needs_review" };
      row.invitationStatus = "sending";
      row.invitationFirstAttemptAt ??= now;
      row.invitationAttemptedAt = new Date(Math.max(now.getTime(), (row.invitationAttemptedAt?.getTime() ?? 0) + 1));
      return { disposition: "claimed", id, email: row.normalizedEmail!, displayName: row.displayName, leaseId: crypto.randomUUID() };
    },
    finish: async (id, _lease, accepted) => {
      const row = rows.find(row => row.id === id)!;
      row.invitationStatus = accepted ? "sent" : "needs_review";
      if (accepted) row.invitationSentAt = date;
      return { recorded: true, invitationStatus: accepted ? "sent" : "needs_review" };
    },
    stillAllowed: async () => allowed,
    send: async () => { sent++; if (fail) throw Object.assign(new Error("Unauthorized"), { code: 401 }); return true; },
    build: () => ({ to: "sample@example.invalid", subject: "Account activation", html: "<p>Sample invitation</p>", text: "Sample invitation" }),
    production: () => production, configured: () => configured, reviewed: async () => reviewed, now: () => date,
    reserveWarmup: async () => ({ allowed: true, reservationId: crypto.randomUUID() }),
    finishWarmup: async () => {},
    pauseWarmup: async () => {},
    warmingReason: async () => null,
    warmingOverview: async () => ({
      settings: { id: "test", enabled: true, paused: false, dailyReviewRequired: false, hourlyLimit: 1000, dailyLimit: 1000,
        minIntervalSeconds: 60, providerHourlyLimit: 1000, reservedHourly: 0, pauseReason: null,
        nextSendAt: null, reviewedBy: "admin", updatedAt: date },
      usage: { hourly: 0, daily: 0, otherHourly: 0, otherDaily: 0 },
      remaining: { hourly: 1000, daily: 1000 }, nextAllowedAt: null,
    }),
  };
  return {
    rows, accounts, optouts, previews, runs, deps, get sent() { return sent; },
    fail: () => { fail = true; }, dev: () => { production = false; },
    unconfigured: () => { configured = false; }, unreviewed: () => { reviewed = false; },
    disallow: () => { allowed = false; }, beforeClaim: (fn: () => void) => { beforeClaim = fn; },
  };
}
async function withServer(h: ReturnType<typeof harness>, body: (post: (path: string, data: unknown, actor?: string) => Promise<Response>, get: () => Promise<Response>) => Promise<void>) {
  const app = express(); app.use(express.json());
  registerOrsaAccountInvitationRoutes(app, (req: any, res, next) => {
    if (req.headers["x-actor"] === "anonymous") return res.sendStatus(401);
    req.session = { userId: req.headers["x-actor"] || "admin" }; next();
  }, (req, res, next) => req.headers["x-actor"] === "nonadmin" ? res.sendStatus(403) : next(), h.deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await body((path, data, actor = "admin") => fetch(url + BASE + path, {
      method: "POST", headers: { "Content-Type": "application/json", "x-actor": actor }, body: JSON.stringify(data),
    }), () => fetch(url + BASE));
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
async function confirmed(post: Parameters<Parameters<typeof withServer>[1]>[0], retryHeld = false) {
    const preview = await (await post("/preview", { retryHeld, recipientLimit: 500 })).json();
  const response = await post("/confirm", { previewId: preview.previewId, expectedCount: preview.eligibleCount,
    confirmed: true, ...(retryHeld ? { acceptDuplicateRisk: true } : {}) });
  assert.equal(response.status, 200);
  return (await response.json()).runId as string;
}

test("audience excludes submitted, accounts, opt-outs, shared/duplicate emails, stale sends, and changed retry generations", () => {
  const ready = member(), held = { ...member("needs_review"), invitationAttemptedAt: date },
    submitted = { ...member("sent"), invitationSentAt: date }, accepted = member("accepted"),
    sending = member("sending"), account = member(), suppressed = member(), inactive = { ...member(), active: false },
    duplicate = member(), duplicate2 = { ...member(), normalizedEmail: duplicate.normalizedEmail },
    shared = member(), sharedOwner = { ...member(), normalizedEmail: null, sharedEligibilityEmail: shared.normalizedEmail };
  const result = invitationAudience([ready, held, submitted, accepted, sending, account, suppressed, inactive, duplicate, duplicate2, shared, sharedOwner],
    new Set([account.normalizedEmail!]), new Set([suppressed.normalizedEmail!]));
  assert.deepEqual(result.firstTime.map(row => row.id), [ready.id]);
  assert.deepEqual(result.held.map(row => row.id), [held.id]);
  assert.equal(result.counts.submittedCount, 1);
  assert.equal(result.counts.existingAccountCount, 1);
  assert.equal(pendingInvitations(result.held, [{ ...result.held[0], priorAttemptedAt: new Date(date.getTime() + 1).toISOString() }], true).length, 0);
});

test("preview sends nothing; frozen confirmation sends all first-time invitations in chunks of at most 25", async () => {
  const h = harness(Array.from({ length: 31 }, () => member()));
  await withServer(h, async (post, get) => {
    assert.equal((await (await get()).json()).readyCount, 31);
    const runId = await confirmed(post);
    assert.equal(h.sent, 0);
    h.rows.push(member()); // New members are not silently added to the confirmed audience.
    const first = await (await post("/send-batch", { runId })).json();
    assert.equal(first.sent, 25); assert.equal(first.remaining, 6);
    const second = await (await post("/send-batch", { runId })).json();
    assert.equal(second.sent, 6); assert.equal(second.remaining, 0); assert.equal(h.sent, 31);
    await post("/send-batch", { runId }); assert.equal(h.sent, 31);
  });
});

test("held invitation retries need separate duplicate-risk acceptance and a new failure pauses all activation runs", async () => {
  const h = harness(Array.from({ length: 3 }, () => ({ ...member("needs_review"), invitationAttemptedAt: date })));
  await withServer(h, async (post) => {
    const preview = await (await post("/preview", { retryHeld: true })).json();
    assert.equal((await post("/confirm", { previewId: preview.previewId, expectedCount: 3, confirmed: true })).status, 400);
    const runId = await confirmed(post, true);
    const overlap = await confirmed(post, true);
    h.fail();
    const response = await (await post("/send-batch", { runId })).json();
    assert.equal(response.paused, true); assert.equal(response.needsReview, 1);
    assert.equal(response.remaining, 2); assert.match(response.reason, /401 Unauthorized/); assert.equal(h.sent, 1);
    assert.equal((await post("/send-batch", { runId })).status, 409);
    assert.equal((await post("/send-batch", { runId: overlap })).status, 409);
    assert.equal(h.sent, 1);
  });
});

test("first-time failures also pause immediately instead of attempting the entire audience", async () => {
  const h = harness(Array.from({ length: 30 }, () => member()));
  await withServer(h, async (post) => {
    const runId = await confirmed(post); h.fail();
    const response = await (await post("/send-batch", { runId })).json();
    assert.equal(response.sent, 0); assert.equal(response.needsReview, 1); assert.equal(response.remaining, 29);
    assert.equal(response.paused, true); assert.equal(h.sent, 1);
    assert.equal((await post("/send-batch", { runId })).status, 409);
  });
});

test("late opt-outs, accounts, and identity changes cannot receive invitations", async () => {
  const h = harness([member(), member(), member(), member()]);
  await withServer(h, async (post) => {
    const runId = await confirmed(post);
    h.optouts.add(h.rows[0].normalizedEmail!);
    h.accounts.add(h.rows[1].normalizedEmail!);
    h.rows[2].normalizedEmail = "changed@example.invalid";
    const response = await (await post("/send-batch", { runId })).json();
    assert.equal(response.sent, 1); assert.equal(response.remaining, 0); assert.equal(h.sent, 1);
  });
});

test("identity changes at claim or suppression after claim never reach the provider", async () => {
  for (const afterClaim of [false, true]) {
    const h = harness([member()]);
    await withServer(h, async (post) => {
      const runId = await confirmed(post);
      if (afterClaim) h.disallow();
      else h.beforeClaim(() => { h.rows[0].normalizedEmail = "changed@example.invalid"; });
      await post("/send-batch", { runId });
      assert.equal(h.sent, 0);
    });
  }
});

test("admin ownership, template separation, exact count, and preview expiration are enforced", async () => {
  const h = harness([member()]);
  await withServer(h, async (post) => {
    const preview = await (await post("/preview", {})).json();
    const body = { previewId: preview.previewId, expectedCount: 1, confirmed: true };
    assert.equal((await post("/confirm", body, "other-admin")).status, 404);
    assert.equal((await post("/confirm", { ...body, expectedCount: 2 })).status, 409);
    assert.equal((await post("/preview", {}, "anonymous")).status, 401);
    assert.equal((await post("/preview", {}, "nonadmin")).status, 403);
    const saved = h.previews.get(preview.previewId)!;
    saved.templateId = "launch-week";
    assert.equal((await post("/confirm", body)).status, 404);
    saved.templateId = "account-activation"; saved.expiresAt = new Date(date.getTime() - 1);
    assert.equal((await post("/confirm", body)).status, 409);
    assert.equal(h.sent, 0);
  });
});

test("development, missing provider configuration, and unreviewed opt-outs allow previews but block confirmation", async () => {
  for (const block of ["dev", "unconfigured", "unreviewed"] as const) {
    const h = harness([member()]); h[block]();
    await withServer(h, async (post) => {
      const preview = await (await post("/preview", {})).json();
      assert.equal(preview.eligibleCount, 1);
      assert.equal((await post("/confirm", { previewId: preview.previewId, expectedCount: 1, confirmed: true })).status, 409);
      assert.equal(h.sent, 0);
    });
  }
});

test("overlapping batches cannot submit the same confirmed invitation twice", async () => {
  const h = harness(Array.from({ length: 30 }, () => member()));
  await withServer(h, async (post) => {
    const runId = await confirmed(post);
    const results = await Promise.all([post("/send-batch", { runId }), post("/send-batch", { runId })]);
    for (const response of results) assert.ok((await response.json()).sent <= 25);
    await post("/send-batch", { runId });
    assert.equal(h.sent, 30);
  });
});