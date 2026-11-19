import test from "node:test";
import assert from "node:assert/strict";
import {
  ORSA_LEGACY_COMPLIMENTARY_END,
  ORSA_LEGACY_OFFER_PRICE_CENTS,
  complimentaryOrsaLegacyIsActive,
  isValidOrsaLegacyPurchase,
  orsaLegacyExtensionDates,
  orsaLegacyPaidExtensionIsActive,
} from "./orsaLegacyExtension";
import { heartPlanLifetimePriceCents, isValidHeartPlanLegacyPayment, matchesOrsaLifetimeCheckoutPrice, runPaidUpgradeIfEligible } from "./heartPlanUpgradePolicy";

test("complimentary Legacy cutoff is exclusive at December 1, 2026 11:59pm ET", () => {
  const cutoff = new Date(ORSA_LEGACY_COMPLIMENTARY_END);
  assert.equal(cutoff.toISOString(), "2026-12-02T05:00:00.000Z");
  assert.equal(complimentaryOrsaLegacyIsActive(new Date(cutoff.getTime() - 1)), true);
  assert.equal(complimentaryOrsaLegacyIsActive(cutoff), false);
});

test("ORSA members see $50 lifetime before the cutoff and $149 afterward; nonmembers stay $149", async () => {
  let checkoutCalls = 0;
  const cutoff = new Date(ORSA_LEGACY_COMPLIMENTARY_END);
  const before = heartPlanLifetimePriceCents(true, new Date(cutoff.getTime() - 1));
  assert.equal(before, 5000);
  const beforeCutoff = await runPaidUpgradeIfEligible({ orsaVerified: before === null }, async () => ++checkoutCalls);
  assert.equal(beforeCutoff.blocked, false);
  assert.equal(checkoutCalls, 1);
  const after = heartPlanLifetimePriceCents(true, cutoff);
  assert.equal(after, 14900);
  const afterCutoff = await runPaidUpgradeIfEligible({ orsaVerified: after === null }, async () => ++checkoutCalls);
  assert.equal(afterCutoff.blocked, false);
  assert.equal(checkoutCalls, 2);
  assert.equal(heartPlanLifetimePriceCents(false, new Date(cutoff.getTime() - 1)), 14900);
  assert.equal(heartPlanLifetimePriceCents(false, cutoff), 14900);
});

test("a stale $50 quote is rejected at the cutoff instead of silently charging $149", () => {
  const cutoff = new Date(ORSA_LEGACY_COMPLIMENTARY_END);
  assert.equal(matchesOrsaLifetimeCheckoutPrice(5000, 5000, new Date(cutoff.getTime() - 1)), true);
  assert.equal(matchesOrsaLifetimeCheckoutPrice(5000, 5000, cutoff), false);
  assert.equal(matchesOrsaLifetimeCheckoutPrice(14900, 5000, cutoff), false);
  assert.equal(matchesOrsaLifetimeCheckoutPrice(14900, 14900, cutoff), true);
  assert.equal(matchesOrsaLifetimeCheckoutPrice(undefined, 5000, new Date(cutoff.getTime() - 1)), false);
});

test("a pre-cutoff $27 purchase starts the 12-month term on December 2", () => {
  const dates = orsaLegacyExtensionDates(new Date("2026-11-30T18:00:00.000Z"), null);
  assert.equal(dates.startsAt.toISOString(), "2026-12-02T05:00:00.000Z");
  assert.equal(dates.expiresAt.toISOString(), "2027-12-02T05:00:00.000Z");
});

test("a $27 Checkout opened before the cutoff can still settle later without losing its paid term", () => {
  const purchasedAt = new Date("2026-12-02T05:00:00.000Z");
  const first = orsaLegacyExtensionDates(purchasedAt, null);
  assert.equal(first.startsAt.toISOString(), purchasedAt.toISOString());
  assert.equal(first.expiresAt.toISOString(), "2027-12-02T05:00:00.000Z");
  const stacked = orsaLegacyExtensionDates(new Date("2027-01-01T00:00:00.000Z"), first.expiresAt);
  assert.equal(stacked.startsAt.toISOString(), first.expiresAt.toISOString());
  assert.equal(stacked.expiresAt.toISOString(), "2028-12-02T05:00:00.000Z");
  assert.equal(orsaLegacyPaidExtensionIsActive(first.expiresAt, first.expiresAt), false);
});

test("purchase fulfillment only accepts paid $27 USD one-time sessions", () => {
  const valid = {
    offer: "true",
    userId: "planner-1",
    mode: "payment",
    paymentStatus: "paid",
    amountTotal: ORSA_LEGACY_OFFER_PRICE_CENTS,
    currency: "usd",
    subscription: null,
  };
  assert.equal(isValidOrsaLegacyPurchase(valid), true);
  assert.equal(isValidOrsaLegacyPurchase({ ...valid, paymentStatus: "unpaid" }), false);
  assert.equal(isValidOrsaLegacyPurchase({ ...valid, amountTotal: 14900 }), false);
  assert.equal(isValidOrsaLegacyPurchase({ ...valid, mode: "subscription" }), false);
  assert.equal(isValidOrsaLegacyPurchase({ ...valid, subscription: "sub_123" }), false);
});

test("$50 promo, $149 standard, and historical $150 ORSA lifetime require their own exact paid amounts", () => {
  const valid = {
    mode: "payment",
    paymentStatus: "paid",
    amountTotal: 15000,
    currency: "usd",
    subscription: null,
    offer: "orsa_lifetime",
  };
  assert.equal(isValidHeartPlanLegacyPayment(valid), true); // already-created $150 Checkout
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, offer: "orsa_lifetime_promo", amountTotal: 5000 }), true);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, offer: "orsa_lifetime_standard", amountTotal: 14900 }), true);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, offer: "orsa_lifetime_promo", amountTotal: 14900 }), false);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, offer: "orsa_lifetime_standard" }), false);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, amountTotal: 14900 }), false);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, offer: undefined }), false);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, paymentStatus: "unpaid" }), false);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, subscription: "sub_123" }), false);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, currency: "eur" }), false);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, offer: undefined, amountTotal: 14900 }), true);
  assert.equal(isValidHeartPlanLegacyPayment({ ...valid, offer: "unknown", amountTotal: 5000 }), false);
});