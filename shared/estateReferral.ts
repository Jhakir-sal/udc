import { z } from "zod";

export function estateReferralLocalDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function estateReferralIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export const estateReferralStatuses = ["needed", "referred", "awaiting_update", "in_progress", "closed"] as const;
export const estateReferralReasons = ["family_reported_no_plan", "search_no_match", "staff_follow_up"] as const;
export const ESTATE_REFERRAL_FIRMS = [
  { value: "kustra_bloom", label: "Kustra & Bloom" },
] as const;

export function estateReferralFirmChoice(firm: string): "kustra_bloom" | "manual" {
  const normalize = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  return normalize(firm) === normalize(ESTATE_REFERRAL_FIRMS[0].label) ? "kustra_bloom" : "manual";
}
const date = z.string().datetime();
const optionalEmail = z.union([z.literal(""), z.string().trim().email().max(320)]);
const phone = z.string().trim().max(60).refine(v => !v || (/^[+\d()\s.x-]+$/i.test(v) && v.replace(/\D/g, "").length >= 7), "Enter a usable phone number.");

export const estateReferralSaveSchema = z.object({
  expectedVersion: z.number().int().min(0),
  reason: z.enum(estateReferralReasons),
  status: z.enum(estateReferralStatuses),
  attorneyName: z.string().trim().max(160),
  attorneyFirm: z.string().trim().max(200),
  attorneyEmail: optionalEmail,
  attorneyPhone: phone,
  referredAt: date.nullable(),
  nextFollowUpAt: date.nullable(),
  familyPermissionConfirmed: z.boolean(),
  resolutionSummary: z.string().trim().max(2000),
}).strict().superRefine((v, ctx) => {
  if (v.status !== "needed") {
    if (!v.attorneyName || (!v.attorneyEmail && !v.attorneyPhone) || !v.referredAt || !v.familyPermissionConfirmed) {
      ctx.addIssue({ code: "custom", message: "Record the attorney, a contact method, actual referral date, and family permission before marking a referral placed." });
    }
    if (v.referredAt && new Date(v.referredAt).getTime() > Date.now()) {
      ctx.addIssue({ code: "custom", message: "The actual referral date cannot be in the future." });
    }
  }
  if (v.status !== "closed" && !v.nextFollowUpAt) {
    ctx.addIssue({ code: "custom", message: "Set a next follow-up date for an open referral." });
  }
  if (v.status === "closed" && !v.resolutionSummary) {
    ctx.addIssue({ code: "custom", message: "Record a resolution before closing the follow-up." });
  }
});

export const estateReferralUpdateSchema = z.object({
  expectedVersion: z.number().int().min(1),
  source: z.enum(["attorney", "family", "staff"]),
  summary: z.string().trim().min(3).max(3000),
  reportedAt: date,
}).strict();

export type EstateReferralSave = z.infer<typeof estateReferralSaveSchema>;
export type EstateReferralRecord = {
  id: string; certificateId: string; reference: string; version: number;
  reason: typeof estateReferralReasons[number]; status: typeof estateReferralStatuses[number];
  attorneyName: string; attorneyFirm: string; attorneyEmail: string; attorneyPhone: string;
  referredAt: string | null; nextFollowUpAt: string | null;
  permissionConfirmedAt: string | null; resolutionSummary: string; updatedAt: string;
};
export type EstateReferralOverview = {
  referral: EstateReferralRecord | null;
  referralNeeded: boolean;
  updates: { id: string; source: string; summary: string; reportedAt: string; recordedAt: string }[];
  requests: { id: string; recipientKind: string; recipientEmail: string; status: string; createdAt: string; submittedAt: string | null }[];
  deliveryConfigured: boolean;
};
export type EstateReferralEmailPreview = {
  id: string; to: string; subject: string; text: string; recipientKind: "attorney" | "family";
};
