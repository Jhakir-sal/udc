// The complimentary ORSA HeartPlan Legacy benefit runs through the end of
// December 1, 2026 in New York (EST). Treat the following instant as exclusive.
export const ORSA_LEGACY_COMPLIMENTARY_END = "2026-12-02T05:00:00.000Z";
// Keep the historical 12-month price for validating already-created Checkouts.
export const ORSA_LEGACY_OFFER_PRICE_CENTS = 2700;
export const ORSA_LEGACY_PROMO_LIFETIME_PRICE_CENTS = 5000;
export const ORSA_LEGACY_LIFETIME_PRICE_CENTS = 14900;

export function complimentaryOrsaLegacyIsActive(now: Date = new Date()): boolean {
  return now.getTime() < Date.parse(ORSA_LEGACY_COMPLIMENTARY_END);
}