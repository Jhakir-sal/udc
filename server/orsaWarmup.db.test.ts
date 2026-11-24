import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ORSA_WARMUP_EXPANDED_PRESET } from "@shared/orsaWarmupDefaults";
import { orsaEmailWarmupSettings as settings, orsaEmailWarmupAttempts as attempts } from "@shared/schema";
import { authorizeWarmupReservation, DEFAULT_WARMUP, getWarmupOverview, pauseWarmup, recordOtherEmailTraffic, reserveWarmup, saveWarmupSettings } from "./orsaWarmup";

const dbOptions = {
  skip: process.env.ORSA_WARMUP_DB_TEST !== "1" || process.env.REPLIT_DEPLOYMENT === "1" || process.env.WEBSITE_SLOT_NAME !== undefined || process.env.NODE_ENV === "production",
};
after(() => pool.end());

test("persisted warmup serializes concurrent paths, preserves budgets, and rejects reservation replay", dbOptions, async () => {
  const scope = `test-${randomUUID().slice(0, 24)}`;
  try {
    const initial = (await getWarmupOverview(scope)).settings;
    assert.equal(initial.enabled, false);
    assert.equal(initial.paused, true);
    assert.equal(initial.dailyLimit, 250);
    await saveWarmupSettings({ ...DEFAULT_WARMUP, dailyLimit: 25 }, "synthetic-admin", scope);
    assert.equal((await getWarmupOverview(scope)).settings.dailyLimit, 25, "New defaults do not replace saved operator limits");
    assert.equal((await reserveWarmup("link-recovery", "synthetic-admin", scope)).allowed, false);
    await saveWarmupSettings({ ...DEFAULT_WARMUP, enabled: true, paused: false }, "synthetic-admin", scope);
    const claims = await Promise.all([
      reserveWarmup("link-recovery", "synthetic-admin", scope),
      reserveWarmup("account-activation", "synthetic-admin", scope),
      reserveWarmup("launch-week", "synthetic-admin", scope),
    ]);
    assert.equal(claims.filter(claim => claim.allowed).length, 1);
    const claim = claims.find(claim => claim.allowed)!;
    if (!claim.allowed) throw new Error("Missing reservation");
    await authorizeWarmupReservation(claim.reservationId, scope);
    await assert.rejects(authorizeWarmupReservation(claim.reservationId, scope), /already used/);
    await recordOtherEmailTraffic(scope);
    const before = await getWarmupOverview(scope);
    assert.equal(before.usage.daily, 1);
    assert.equal(before.usage.otherHourly, 1);
    await saveWarmupSettings({ ...DEFAULT_WARMUP, enabled: true, paused: false, dailyLimit: 1 }, "synthetic-admin", scope);
    const blocked = await reserveWarmup("link-recovery", "synthetic-admin", scope);
    assert.equal(blocked.allowed, false);
    if (!blocked.allowed) assert.equal(blocked.waitingForReview, true);
    assert.equal((await getWarmupOverview(scope)).settings.dailyReviewRequired, true);
    // Expiring the rolling window alone must not authorize tomorrow's sends.
    await db.update(attempts).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(attempts.scope, scope));
    assert.equal((await reserveWarmup("link-recovery", "synthetic-admin", scope)).allowed, false);
    assert.equal((await getWarmupOverview(scope)).settings.nextSendAt?.getTime(), before.settings.nextSendAt?.getTime());
    await pauseWarmup("Synthetic test pause", scope);
    assert.equal((await getWarmupOverview(scope)).settings.paused, true);
  } finally {
    await db.delete(attempts).where(eq(attempts.scope, scope));
    await db.delete(settings).where(eq(settings.id, scope));
  }
});

const expanded = { ...DEFAULT_WARMUP, ...ORSA_WARMUP_EXPANDED_PRESET, enabled: true, paused: false };
async function syntheticScope(run: (scope: string) => Promise<void>) {
  const scope = `test-${randomUUID().slice(0, 24)}`;
  try {
    await saveWarmupSettings(expanded, "synthetic-admin", scope);
    await run(scope);
  } finally {
    await db.delete(attempts).where(eq(attempts.scope, scope));
    await db.delete(settings).where(eq(settings.id, scope));
  }
}
async function anotherInstance(scope: string) {
  const { stdout } = await promisify(execFile)(process.execPath,
    ["--import", "tsx", "server/test-fixtures/orsa-warmup-reserve.ts", scope], { timeout: 20_000 });
  return JSON.parse(stdout.trim()) as Awaited<ReturnType<typeof reserveWarmup>>;
}
async function race(scope: string) {
  return Promise.all([
    reserveWarmup("link-recovery", "synthetic-tab-one", scope),
    reserveWarmup("account-activation", "synthetic-tab-two", scope),
    reserveWarmup("launch-week", "synthetic-tab-three", scope),
    anotherInstance(scope),
  ]);
}
async function seed(scope: string, count: number, minutesAgo: number) {
  // Synthetic reservations, never recipients. Include failed/unused claims:
  // these must continue to consume capacity.
  await db.insert(attempts).values(Array.from({ length: count }, (_, index) => ({
    scope, kind: "outreach", templateId: "synthetic",
    status: index % 2 ? "needs_review" : "reserved",
    createdAt: new Date(Date.now() - minutesAgo * 60_000),
  })));
}

test("future-dated traffic remains counted and blocks sends until its window expires", dbOptions, async () => {
  await syntheticScope(async scope => {
    const future = new Date(Date.now() + 60_000);
    await db.insert(attempts).values(Array.from({ length: expanded.providerHourlyLimit }, () => ({
      scope, kind: "other", status: "attempted", createdAt: future,
    })));
    const overview = await getWarmupOverview(scope);
    assert.equal(overview.usage.otherHourly, expanded.providerHourlyLimit);
    assert.equal(overview.remaining.hourly, 0);
    assert.ok(overview.nextAllowedAt);
    const claim = await reserveWarmup("synthetic", "synthetic-admin", scope);
    assert.equal(claim.allowed, false);
    if (!claim.allowed) {
      assert.match(claim.reason, /hourly/);
      assert.ok(Number.isFinite(claim.retryAfterSeconds));
      assert.ok(claim.retryAfterSeconds >= 3600);
    }
  });
});

test("expanded preset serializes tabs and a separate instance at the 30-second boundary; edits preserve reservations", dbOptions, async () => {
  await syntheticScope(async scope => {
    const claims = await race(scope);
    assert.equal(claims.filter(claim => claim.allowed).length, 1);
    const before = await getWarmupOverview(scope);
    const rows = await db.select().from(attempts).where(eq(attempts.scope, scope));
    assert.equal(rows.length, 1);
    assert.equal(before.settings.nextSendAt!.getTime() - rows[0].createdAt.getTime(), 30_000);
    // Keep the deadline safely in the future while the other process starts;
    // exact 30-second spacing is asserted from the persisted timestamps above.
    await db.update(settings).set({ nextSendAt: new Date(Date.now() + 29_000) }).where(eq(settings.id, scope));
    assert.equal((await reserveWarmup("synthetic", "synthetic-admin", scope)).allowed, false);
    const held = await getWarmupOverview(scope);
    const edited = await saveWarmupSettings({ ...expanded, dailyLimit: 1100 }, "synthetic-admin", scope);
    assert.deepEqual(edited.usage, before.usage);
    assert.equal(edited.settings.nextSendAt!.getTime(), held.settings.nextSendAt!.getTime());
    assert.deepEqual(await db.select().from(attempts).where(eq(attempts.scope, scope)), rows);
    assert.equal((await anotherInstance(scope)).allowed, false);
    await db.update(settings).set({ nextSendAt: new Date(Date.now() - 1) }).where(eq(settings.id, scope));
    assert.equal((await race(scope)).filter(claim => claim.allowed).length, 1);
    assert.equal((await getWarmupOverview(scope)).usage.daily, 2);
  });
});

test("expanded rolling hour cannot exceed 120 across instances, including unused and uncertain reservations", dbOptions, async () => {
  await syntheticScope(async scope => {
    await seed(scope, 119, 30);
    assert.equal((await race(scope)).filter(claim => claim.allowed).length, 1);
    assert.equal((await getWarmupOverview(scope)).usage.hourly, 120);
    await db.update(settings).set({ nextSendAt: null }).where(eq(settings.id, scope));
    for (const claim of await race(scope)) {
      assert.equal(claim.allowed, false);
      if (!claim.allowed) {
        assert.match(claim.reason, /hourly/);
        assert.equal(claim.waitingForReview, false);
      }
    }
    // Earlier reservations expire from the hour, not the rolling day.
    await db.update(attempts).set({ createdAt: new Date(Date.now() - 61 * 60_000) }).where(eq(attempts.scope, scope));
    assert.equal((await race(scope)).filter(claim => claim.allowed).length, 1);
    assert.equal((await getWarmupOverview(scope)).usage.daily, 121);
  });
});

test("expanded rolling day reaches exactly 1000 then stays review-blocked after expiry until an explicit settings review", dbOptions, async () => {
  await syntheticScope(async scope => {
    await seed(scope, 999, 120);
    assert.equal((await race(scope)).filter(claim => claim.allowed).length, 1);
    const exhausted = await getWarmupOverview(scope);
    assert.equal(exhausted.usage.daily, 1000);
    assert.equal(exhausted.settings.dailyReviewRequired, true);
    assert.equal(exhausted.remaining.daily, 0);
    await db.update(attempts).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(attempts.scope, scope));
    await db.update(settings).set({ nextSendAt: null }).where(eq(settings.id, scope));
    for (const claim of await race(scope)) {
      assert.equal(claim.allowed, false);
      if (!claim.allowed) assert.equal(claim.waitingForReview, true);
    }
    assert.equal((await getWarmupOverview(scope)).usage.daily, 0);
    await saveWarmupSettings(expanded, "synthetic-reviewer", scope);
    assert.equal((await race(scope)).filter(claim => claim.allowed).length, 1);
    assert.equal((await db.select().from(attempts).where(eq(attempts.scope, scope))).length, 1001);
  });
});

test("essential email is counted without being delayed and exhausts the expanded provider ceiling", dbOptions, async () => {
  await syntheticScope(async scope => {
    await recordOtherEmailTraffic(scope, 130);
    for (const claim of await race(scope)) {
      assert.equal(claim.allowed, false);
      if (!claim.allowed) assert.match(claim.reason, /hourly/);
    }
    await recordOtherEmailTraffic(scope, 1);
    const before = await getWarmupOverview(scope);
    assert.deepEqual(before.usage, { hourly: 0, daily: 0, otherHourly: 131, otherDaily: 131 });
    // Raising the provider limit is not a usage reset.
    const edited = await saveWarmupSettings({ ...expanded, providerHourlyLimit: 140 }, "synthetic-admin", scope);
    assert.deepEqual(edited.usage, before.usage);
    assert.equal((await race(scope)).filter(claim => claim.allowed).length, 1);
    await pauseWarmup("Synthetic global pause", scope);
    assert.equal((await anotherInstance(scope)).allowed, false);
    await recordOtherEmailTraffic(scope);
    assert.equal((await getWarmupOverview(scope)).usage.otherHourly, 132);
  });
});
