import { ORSA_LEGACY_LIFETIME_PRICE_CENTS, ORSA_LEGACY_PROMO_LIFETIME_PRICE_CENTS, complimentaryOrsaLegacyIsActive } from "@shared/orsaLegacyOffer";

export type UpgradeMembership = { orsaVerified: boolean };

export type PaidUpgradeResult<T> =
  | { blocked: true }
  | { blocked: false; value: T };

/**
 * Keeps the ORSA decision in front of the supplied Stripe path. Tests can
 * therefore prove a covered account cannot execute any provider operation.
 */
export async function runPaidUpgradeIfEligible<T>(
  membership: UpgradeMembership,
  stripePath: () => Promise<T>,
): Promise<PaidUpgradeResult<T>> {
  if (membership.orsaVerified) return { blocked: true };
  return { blocked: false, value: await stripePath() };
}

export function heartPlanLifetimePriceCents(orsaVerified: boolean, now = new Date()): number {
  if (!orsaVerified) return 14900;
  return complimentaryOrsaLegacyIsActive(now) ? ORSA_LEGACY_PROMO_LIFETIME_PRICE_CENTS : ORSA_LEGACY_LIFETIME_PRICE_CENTS;
}

export function matchesOrsaLifetimeCheckoutPrice(expected: unknown, quoted: number, now = new Date()): boolean {
  const current = heartPlanLifetimePriceCents(true, now);
  return typeof expected === "number" && expected === current && quoted === current;
}

export function isValidHeartPlanLegacyPayment(input: {
  mode: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  subscription: unknown;
  offer: string | undefined;
}): boolean {
  // Existing $150 sessions retain their original meaning; new promotions use
  // distinct metadata so a delayed payment is never reinterpreted at $50/$149.
  const expectedAmount = input.offer === "orsa_lifetime" ? 15000
    : input.offer === "orsa_lifetime_promo" ? ORSA_LEGACY_PROMO_LIFETIME_PRICE_CENTS
    : input.offer === "orsa_lifetime_standard" || input.offer === undefined ? 14900 : -1;
  return input.mode === "payment" && input.paymentStatus === "paid" &&
    input.currency === "usd" && input.amountTotal === expectedAmount && !input.subscription;
}