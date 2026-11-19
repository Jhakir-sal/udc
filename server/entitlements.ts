import { normalizeOrsaEmail } from "@shared/orsa";
import { complimentaryOrsaLegacyIsActive } from "@shared/orsaLegacyOffer";

export type OrsaEntitlements = {
  orsaVerified: boolean;
  heartPlanTier: "free" | "legacy";
  caseServiceExempt: boolean;
};

/**
 * Central policy for ORSA benefits.  `activeRosterEmails` must come from the
 * administrator-managed roster; certificate referral fields are intentionally
 * absent from this API.
 */
export function entitlementsForAccount(
  accountEmail: string | null | undefined,
  activeRosterEmails: ReadonlySet<string>,
  emailVerified: boolean,
  now: Date = new Date(),
): OrsaEntitlements {
  const orsaVerified = emailVerified === true && activeRosterEmails.has(normalizeOrsaEmail(accountEmail));
  return {
    orsaVerified,
    heartPlanTier: orsaVerified && complimentaryOrsaLegacyIsActive(now) ? "legacy" : "free",
    caseServiceExempt: orsaVerified,
  };
}

export function activeFamilySeatQuantity(statuses: readonly ("invited" | "active" | "removed")[]): number {
  return statuses.filter((status) => status === "active").length;
}

export const HOUSEHOLD_SEAT_MONTHLY_CENTS = 300;