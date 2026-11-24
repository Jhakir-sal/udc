import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WARMUP, evaluateWarmup, warmupUsage } from "./orsaWarmup";
import { warmupSettingsInput } from "./orsaWarmupRoutes";
import { eligibleRecoveryRecipients } from "./orsaEmailCampaign";
import { ORSA_WARMUP_WEEK_ONE_PRESET, ORSA_WARMUP_WEEK_TWO_PRESET, ORSA_WARMUP_EXPANDED_PRESET, ORSA_FULL_LIST_PRESET, ORSA_FAST_OUTREACH_PRESET } from "@shared/orsaWarmupDefaults";

const now = new Date("2026-10-06T16:00:00Z");
const config = { ...DEFAULT_WARMUP, enabled: true, paused: false, nextSendAt: null, pauseReason: null };
const entry = (minutes: number, kind = "outreach") => ({ kind, createdAt: new Date(now.getTime() - minutes * 60_000) });
test("warming defaults off and paused; no approval can be inferred from a preview", () => {
  const blocked = evaluateWarmup({ ...config, ...DEFAULT_WARMUP }, [], now);
  assert.equal(blocked?.paused, true);
  assert.equal(blocked?.waitingForReview, true);
  assert.equal(DEFAULT_WARMUP.dailyLimit, 250);
  assert.equal(DEFAULT_WARMUP.hourlyLimit, 25);
  assert.equal(DEFAULT_WARMUP.minIntervalSeconds, 144);
});
test("rolling windows do not reset at midnight; exact expiry is excluded", () => {
  assert.deepEqual(warmupUsage([entry(59), entry(60), entry(1439), entry(1440), entry(5, "other")], now),
    { hourly: 1, daily: 3, otherHourly: 1, otherDaily: 1 });
});
test("future-dated traffic counts against budgets and provides a finite retry time", () => {
  const futureOutreach = entry(-1);
  const futureOther = entry(-2, "other");
  assert.deepEqual(warmupUsage([futureOutreach, futureOther], now),
    { hourly: 1, daily: 1, otherHourly: 1, otherDaily: 1 });
  assert.equal(evaluateWarmup({ ...config, hourlyLimit: 1 }, [futureOutreach], now)?.retryAfterSeconds, 3660);
  assert.equal(evaluateWarmup({ ...config, providerHourlyLimit: 1 }, [futureOther], now)?.retryAfterSeconds, 3720);
  assert.equal(evaluateWarmup({ ...config, dailyLimit: 1 }, [futureOutreach], now)?.waitingForReview, true);
});
test("hourly and overall provider capacity, spacing, and daily review are distinct", () => {
  const hourly = evaluateWarmup({ ...config, hourlyLimit: 1 }, [entry(30)], now)!;
  assert.equal(hourly.retryAfterSeconds, 1800);
  assert.equal(hourly.paused, false);
  const provider = evaluateWarmup({ ...config, providerHourlyLimit: 2 }, [entry(10, "other"), entry(20, "other")], now)!;
  assert.equal(provider.retryAfterSeconds, 2400);
  const spacing = evaluateWarmup({ ...config, nextSendAt: new Date(now.getTime() + 360_000) }, [], now)!;
  assert.equal(spacing.retryAfterSeconds, 360);
  const daily = evaluateWarmup({ ...config, dailyLimit: 1 }, [entry(120)], now)!;
  assert.equal(daily.waitingForReview, true);
  assert.equal(daily.retryAfterSeconds, 0);
  assert.equal(evaluateWarmup({ ...config, dailyReviewRequired: true }, [], now)?.waitingForReview, true);
  assert.equal(evaluateWarmup(config, [], now), null);
});
test("configuration requires fresh provider/delivery acknowledgments and preserves essential-email reserve", () => {
  const input = { ...DEFAULT_WARMUP, acknowledgeProviderLimits: true, reviewedDeliveryStats: true };
  assert.equal(warmupSettingsInput.safeParse(input).success, true);
  for (const patch of [{ acknowledgeProviderLimits: false }, { reviewedDeliveryStats: false },
    { hourlyLimit: 26 }, { minIntervalSeconds: 0 }, { dailyLimit: 0 }, { reservedHourly: -1 }, { unknown: true }]) {
    assert.equal(warmupSettingsInput.safeParse({ ...input, ...patch }).success, false);
  }
});
test("both reviewed weekly presets enforce their own pacing, hourly headroom, and daily ceiling", () => {
  for (const preset of [ORSA_WARMUP_WEEK_ONE_PRESET, ORSA_WARMUP_WEEK_TWO_PRESET]) {
    const stage = { ...config, ...preset };
    const previousSends = Array.from({ length: preset.dailyLimit - 1 }, (_, index) => entry(61 + index));
    assert.equal(warmupSettingsInput.safeParse({
      ...DEFAULT_WARMUP, ...preset, acknowledgeProviderLimits: true, reviewedDeliveryStats: true,
    }).success, true);
    assert.equal(evaluateWarmup(stage, previousSends, now), null);
    assert.equal(evaluateWarmup(stage, [...previousSends, entry(1000)], now)?.waitingForReview, true);
    const hourly = Array.from({ length: preset.hourlyLimit }, (_, index) => entry(index + 1));
    assert.equal(evaluateWarmup(stage, hourly, now)?.paused, false);
    const provider = Array.from({ length: preset.providerHourlyLimit }, () => entry(1, "other"));
    assert.equal(evaluateWarmup(stage, provider, now)?.allowed, false);
    assert.equal(evaluateWarmup({ ...stage, nextSendAt: new Date(now.getTime() + preset.minIntervalSeconds * 1000) }, [], now)?.retryAfterSeconds, preset.minIntervalSeconds);
    assert.equal(evaluateWarmup({ ...stage, dailyReviewRequired: true }, [], now)?.waitingForReview, true);
    assert.equal(preset.hourlyLimit * preset.minIntervalSeconds, 3600);
    assert.equal(preset.dailyLimit / preset.hourlyLimit, 10);
  }
});
test("recovery audience is previously submitted intro emails, never all-roster or existing accounts", () => {
  const candidates = ["sent", "held", "new", "account"].map(name => ({ id: name, email: `${name}@example.invalid`, displayName: null }));
  const eligible = eligibleRecoveryRecipients(candidates, new Set(["sent@example.invalid", "account@example.invalid"]),
    new Set(["account@example.invalid"]));
  assert.deepEqual(eligible.map(row => row.id), ["sent"]);
});

test("expanded outreach accepts 30-second pacing only with reviewed limits and sufficient provider headroom", () => {
  const input = { ...DEFAULT_WARMUP, ...ORSA_WARMUP_EXPANDED_PRESET,
    acknowledgeProviderLimits: true, reviewedDeliveryStats: true };
  assert.equal(warmupSettingsInput.safeParse(input).success, true);
  assert.equal(input.dailyLimit, 1000);
  assert.equal(input.hourlyLimit * input.minIntervalSeconds, 3600);
  for (const patch of [
    { minIntervalSeconds: 3 }, { minIntervalSeconds: 30.5 },
    { acknowledgeProviderLimits: false }, { reviewedDeliveryStats: false },
    { providerHourlyLimit: 129 }, { reservedHourly: 11 },
  ]) {
    assert.equal(warmupSettingsInput.safeParse({ ...input, ...patch }).success, false);
  }
});

test("full-list preset permits five-second pacing only with review and preserves shared budgets", () => {
  const stage = { ...config, ...ORSA_FULL_LIST_PRESET };
  const input = { ...stage, acknowledgeProviderLimits: true, reviewedDeliveryStats: true };
  const { nextSendAt, pauseReason, ...settings } = input;
  assert.equal(warmupSettingsInput.safeParse(settings).success, true);
  assert.equal(stage.hourlyLimit, 720);
  assert.equal(stage.dailyLimit, 10000);
  assert.equal(stage.hourlyLimit * stage.minIntervalSeconds, 3600);
  for (const patch of [{ minIntervalSeconds: 3 }, { reviewedDeliveryStats: false },
    { acknowledgeProviderLimits: false }, { providerHourlyLimit: 729 }]) {
    assert.equal(warmupSettingsInput.safeParse({ ...settings, ...patch }).success, false);
  }
  assert.equal(evaluateWarmup({ ...stage, nextSendAt: new Date(now.getTime() + 5000) }, [], now)?.retryAfterSeconds, 5);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 720 }, () => entry(1)), now)?.allowed, false);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 730 }, () => entry(1, "other")), now)?.allowed, false);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 10000 }, () => entry(61)), now)?.waitingForReview, true);
  assert.equal(evaluateWarmup({ ...stage, paused: true }, [], now)?.paused, true);
  assert.equal(evaluateWarmup({ ...stage, dailyReviewRequired: true }, [], now)?.waitingForReview, true);
});

test("faster outreach permits four-second pacing while retaining budgets, pause and review", () => {
  const stage = { ...config, ...ORSA_FAST_OUTREACH_PRESET };
  const { nextSendAt, pauseReason, ...settings } = stage;
  const input = { ...settings, acknowledgeProviderLimits: true, reviewedDeliveryStats: true };
  assert.equal(warmupSettingsInput.safeParse(input).success, true);
  assert.equal(stage.hourlyLimit * stage.minIntervalSeconds, 3600);
  assert.equal(evaluateWarmup({ ...stage, nextSendAt: new Date(now.getTime() + 4000) }, [], now)?.retryAfterSeconds, 4);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 900 }, () => entry(1)), now)?.allowed, false);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 910 }, () => entry(1, "other")), now)?.allowed, false);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 10000 }, () => entry(61)), now)?.waitingForReview, true);
  assert.equal(evaluateWarmup({ ...stage, paused: true }, [], now)?.paused, true);
  for (const patch of [{ minIntervalSeconds: 3 }, { providerHourlyLimit: 909 }, { reviewedDeliveryStats: false }])
    assert.equal(warmupSettingsInput.safeParse({ ...input, ...patch }).success, false);
});

test("expanded outreach still enforces shared spacing, hourly limits, other traffic, pause, and daily review", () => {
  const stage = { ...config, ...ORSA_WARMUP_EXPANDED_PRESET };
  assert.equal(evaluateWarmup({ ...stage, nextSendAt: new Date(now.getTime() + 30_000) }, [], now)?.retryAfterSeconds, 30);
  assert.equal(evaluateWarmup({ ...stage, nextSendAt: now }, [], now), null);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 119 }, () => entry(1)), now), null);
  assert.equal(evaluateWarmup(stage, Array.from({ length: 120 }, () => entry(1)), now)?.allowed, false);
  const otherTraffic = Array.from({ length: 130 }, () => entry(1, "other"));
  assert.equal(evaluateWarmup(stage, otherTraffic, now)?.allowed, false);
  const earlierToday = Array.from({ length: 999 }, (_, index) => entry(61 + index));
  assert.equal(evaluateWarmup(stage, earlierToday, now), null);
  assert.equal(evaluateWarmup(stage, [...earlierToday, entry(61)], now)?.waitingForReview, true);
  assert.equal(evaluateWarmup({ ...stage, dailyReviewRequired: true }, [], now)?.waitingForReview, true);
  assert.equal(evaluateWarmup({ ...stage, paused: true }, [], now)?.paused, true);
});
