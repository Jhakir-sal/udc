import type { Express, RequestHandler, Response } from "express";
import type { HeartPlan } from "@shared/schema";

/** Operational identity/lifecycle only; never spread a private planner record into an admin response. */
export function adminHeartPlanSummary(plan: Pick<HeartPlan,
  "id" | "status" | "tier" | "fullName" | "createdAt" | "updatedAt" | "upgradedAt"
  | "certificateId" | "activatedAt" | "activatedByName">) {
  return {
    id: plan.id,
    status: plan.status,
    tier: plan.tier,
    fullName: plan.fullName,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    upgradedAt: plan.upgradedAt,
    certificateId: plan.certificateId,
    activatedAt: plan.activatedAt,
    activatedByName: plan.activatedByName,
  };
}

export function heartPlanCompletion(
  plan: Pick<HeartPlan, "fullName" | "dateOfBirth">,
  items: {
    wishes: { restingPreference: string | null } | null | undefined;
    documents: readonly unknown[];
    assets: readonly unknown[];
    contacts: readonly unknown[];
    letters: readonly unknown[];
  },
) {
  return heartPlanCompletionFromCounts({
    profileComplete: Boolean(plan.fullName && plan.dateOfBirth),
    wishesComplete: Boolean(items.wishes?.restingPreference),
    documents: items.documents.length,
    assets: items.assets.length,
    contacts: items.contacts.length,
    letters: items.letters.length,
  });
}

export function heartPlanCompletionFromCounts(items: {
  profileComplete: boolean;
  wishesComplete: boolean;
  documents: number;
  assets: number;
  contacts: number;
  letters: number;
}) {
  const sections = {
    profile: items.profileComplete,
    wishes: items.wishesComplete,
    documents: items.documents > 0,
    assets: items.assets > 0,
    contacts: items.contacts > 0,
    letters: items.letters > 0,
  };
  const completed = Object.values(sections).filter(Boolean).length;
  const total = Object.keys(sections).length;
  return {
    sections,
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    counts: {
      documents: items.documents,
      assets: items.assets,
      contacts: items.contacts,
      letters: items.letters,
    },
  };
}

export interface HeartPlanAdminRecord {
  id: string;
  status: string;
  tier: string;
  fullName: string | null;
  createdAt: Date | string;
  activatedAt: Date | string | null;
  upgradedAt: Date | string | null;
  updatedAt: Date | string;
  ownerEmail: string | null;
  ownerName: string | null;
  emailVerified: boolean;
  progress: { completed: number; total: number; percent: number };
  pendingActivationRequests: number;
  lastActivityAt: Date | string;
  primaryContactStatus: "ready" | "missing" | "no_email" | "delivery_failed";
  failedContactDeliveries: number;
  annualReview: {
    lastReviewedAt: Date | string | null;
    nextReviewAt: Date | string;
    due: boolean;
  };
}

export interface HeartPlanFilters {
  q?: string;
  signupFrom?: string;
  signupTo?: string;
  progress?: string;
  stage?: string;
  payment?: string;
  activation?: string;
  warnings?: string;
  annualReview?: string;
}

export type LivingHeartPlanProgressBand = "started" | "thirtyPlus" | "fiftyPlus" | "seventyFivePlus" | "complete";

export function getLivingHeartPlanProgressBand(record: HeartPlanAdminRecord): LivingHeartPlanProgressBand | null {
  if (record.status !== "active") return null;
  if (record.progress.completed >= record.progress.total) return "complete";
  if (record.progress.completed >= 5) return "seventyFivePlus";
  if (record.progress.completed >= 3) return "fiftyPlus";
  if (record.progress.completed >= 2) return "thirtyPlus";
  return "started";
}

export function summarizeLivingHeartPlanProgress(records: HeartPlanAdminRecord[]) {
  const summary = {
    started: 0,
    thirtyPlus: 0,
    fiftyPlus: 0,
    seventyFivePlus: 0,
    complete: 0,
  };
  for (const record of records) {
    const band = getLivingHeartPlanProgressBand(record);
    if (band) summary[band]++;
  }
  return summary;
}

export function registerHeartPlanProgressSummaryRoute(
  app: Pick<Express, "get">,
  isAuthenticated: RequestHandler,
  isAdmin: RequestHandler,
  buildRecords: () => Promise<HeartPlanAdminRecord[]>,
) {
  app.get("/api/admin/heartplans/progress-summary", isAuthenticated, isAdmin, async (_req, res: Response) => {
    try {
      const records = await buildRecords();
      res.json(summarizeLivingHeartPlanProgress(records));
    } catch (error) {
      console.error("Admin HeartPlans progress summary error:", error);
      res.status(500).json({ error: "Failed to load HeartPlan progress summary" });
    }
  });
}

export function summarizeHeartPlanFunnel(records: HeartPlanAdminRecord[]) {
  return {
    registered: records.length,
    emailVerified: records.filter((record) => record.emailVerified).length,
    startedProgress: records.filter((record) => record.progress.completed > 0).length,
    paidLegacy: records.filter((record) => record.tier === "legacy" && Boolean(record.upgradedAt)).length,
    activated: records.filter((record) => record.status === "activated").length,
    contactDeliveryWarnings: records.filter((record) => record.failedContactDeliveries > 0).length,
  };
}

export function filterHeartPlans(records: HeartPlanAdminRecord[], filters: HeartPlanFilters) {
  const query = filters.q?.trim().toLowerCase();
  const from = filters.signupFrom ? new Date(`${filters.signupFrom}T00:00:00`) : null;
  const to = filters.signupTo ? new Date(`${filters.signupTo}T23:59:59.999`) : null;

  return records.filter((record) => {
    const createdAt = new Date(record.createdAt);
    if (query && !`${record.fullName || ""} ${record.ownerName || ""} ${record.ownerEmail || ""}`.toLowerCase().includes(query)) return false;
    if (from && createdAt < from) return false;
    if (to && createdAt > to) return false;
    if (filters.progress === "not_started" && record.progress.completed !== 0) return false;
    if (filters.progress === "started" && (record.progress.completed === 0 || record.progress.percent >= 100)) return false;
    if (filters.progress === "complete" && record.progress.percent < 100) return false;
    if (filters.stage && getLivingHeartPlanProgressBand(record) !== filters.stage) return false;
    if (filters.payment === "free" && record.tier !== "free") return false;
    if (filters.payment === "paid" && (record.tier === "free" || !record.upgradedAt)) return false;
    if (filters.activation === "active" && record.status !== "active") return false;
    if (filters.activation === "activated" && record.status !== "activated") return false;
    if (filters.warnings === "yes" && record.failedContactDeliveries === 0) return false;
    if (filters.warnings === "no" && record.failedContactDeliveries > 0) return false;
    if (filters.annualReview === "due" && (record.status !== "active" || !record.annualReview.due)) return false;
    if (filters.annualReview === "upcoming" && (record.status !== "active" || record.annualReview.due)) return false;
    return true;
  });
}