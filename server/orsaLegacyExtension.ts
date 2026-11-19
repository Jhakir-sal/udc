import { ORSA_LEGACY_COMPLIMENTARY_END, ORSA_LEGACY_OFFER_PRICE_CENTS, complimentaryOrsaLegacyIsActive } from "@shared/orsaLegacyOffer";

export { ORSA_LEGACY_COMPLIMENTARY_END, ORSA_LEGACY_OFFER_PRICE_CENTS, complimentaryOrsaLegacyIsActive };

export function orsaLegacyExtensionDates(purchasedAt: Date, currentPaidThrough: Date | null): {
  startsAt: Date;
  expiresAt: Date;
} {
  const complimentaryEnd = new Date(ORSA_LEGACY_COMPLIMENTARY_END);
  const startsAt = new Date(Math.max(
    purchasedAt.getTime(),
    currentPaidThrough?.getTime() ?? 0,
    purchasedAt < complimentaryEnd ? complimentaryEnd.getTime() : 0,
  ));
  const expiresAt = new Date(startsAt);
  const targetMonth = expiresAt.getUTCMonth();
  const day = expiresAt.getUTCDate();
  expiresAt.setUTCDate(1);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  expiresAt.setUTCMonth(targetMonth);
  const daysInTargetMonth = new Date(Date.UTC(expiresAt.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  expiresAt.setUTCDate(Math.min(day, daysInTargetMonth));
  return { startsAt, expiresAt };
}

export function orsaLegacyPaidExtensionIsActive(paidThrough: Date | null | undefined, now = new Date()): boolean {
  return Boolean(paidThrough && paidThrough.getTime() > now.getTime());
}

export function isValidOrsaLegacyPurchase(input: {
  offer: string | undefined;
  userId: string | undefined;
  mode: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  subscription: unknown;
}): boolean {
  return input.offer === "true" && Boolean(input.userId) &&
    input.mode === "payment" && input.paymentStatus === "paid" &&
    input.amountTotal === ORSA_LEGACY_OFFER_PRICE_CENTS &&
    input.currency === "usd" && !input.subscription;
}