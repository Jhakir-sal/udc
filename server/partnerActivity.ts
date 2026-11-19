export const PARTNER_ACTIVITY_WINDOWS = {
  activeDays: 30,
  quietDays: 90,
} as const;

export type PartnerActivityLevel = "Active" | "Quiet" | "Inactive" | "No activity";

export interface PartnerActivityRow {
  id: string;
  type: "funeral_home" | "orsa" | "marketplace_provider" | "referral_company";
  displayName: string;
  sourceType: "linked_organization" | "partner_roster" | "catalog_listing" | "referral_registry";
  enrollmentLabel: string;
  status: string;
  createdAt: string | null;
  linkedCount: number | null;
  activityCount: number;
  lastActivityAt: string | null;
  activityLevel: PartnerActivityLevel;
  managementPath: string | null;
}

export function classifyPartnerActivity(
  lastActivityAt: Date | string | null | undefined,
  now: Date = new Date(),
): PartnerActivityLevel {
  if (!lastActivityAt) return "No activity";
  const activityTime = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(activityTime)) return "No activity";
  const ageDays = Math.max(0, (now.getTime() - activityTime) / 86_400_000);
  if (ageDays <= PARTNER_ACTIVITY_WINDOWS.activeDays) return "Active";
  if (ageDays <= PARTNER_ACTIVITY_WINDOWS.quietDays) return "Quiet";
  return "Inactive";
}

export function normalizePartnerActivityRow(
  row: Omit<PartnerActivityRow, "createdAt" | "lastActivityAt" | "activityLevel" | "activityCount" | "linkedCount"> & {
    createdAt: Date | string | null;
    lastActivityAt: Date | string | null;
    activityCount: number | string | null;
    linkedCount: number | string | null;
  },
  now: Date = new Date(),
): PartnerActivityRow {
  const toIso = (value: Date | string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const lastActivityAt = toIso(row.lastActivityAt);
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    linkedCount: row.linkedCount === null ? null : Math.max(0, Number(row.linkedCount) || 0),
    activityCount: Math.max(0, Number(row.activityCount) || 0),
    lastActivityAt,
    activityLevel: classifyPartnerActivity(lastActivityAt, now),
  };
}