import type { RequestHandler } from "express";
import {
  adminHeartPlanSummary, filterHeartPlans, heartPlanCompletionFromCounts,
  type HeartPlanAdminRecord,
} from "./heartplanAdmin";
import { annualReviewStatus } from "./heartPlanAdvisorPolicy";
import type { HeartPlanAdminData } from "./heartPlanProgressStorage";

/** Shared by the live routes and isolated PostgreSQL performance check. */
export function heartPlanAdminRecords(plans: HeartPlanAdminData[]): HeartPlanAdminRecord[] {
  return plans.map((plan) => {
    const latestEvent = plan.lastEventAt ? new Date(plan.lastEventAt) : null;
    return {
      ...adminHeartPlanSummary(plan),
      ownerEmail: plan.ownerEmail || null,
      ownerName: plan.ownerId ? `${plan.ownerFirstName || ""} ${plan.ownerLastName || ""}`.trim() : null,
      emailVerified: plan.emailVerified === true,
      progress: heartPlanCompletionFromCounts(plan),
      pendingActivationRequests: plan.pendingActivationRequests,
      lastActivityAt: latestEvent && latestEvent > new Date(plan.updatedAt) ? latestEvent : plan.updatedAt,
      primaryContactStatus: plan.primaryContactStatus,
      failedContactDeliveries: plan.failedContactDeliveries,
      annualReview: annualReviewStatus(plan),
    };
  });
}

export function heartPlanAdminListHandler(buildRecords: () => Promise<HeartPlanAdminRecord[]>): RequestHandler {
  return async (req, res) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const records = await buildRecords();
      res.json(filterHeartPlans(records, {
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        signupFrom: typeof req.query.signupFrom === "string" ? req.query.signupFrom : undefined,
        signupTo: typeof req.query.signupTo === "string" ? req.query.signupTo : undefined,
        progress: typeof req.query.progress === "string" ? req.query.progress : undefined,
        stage: typeof req.query.stage === "string" ? req.query.stage : undefined,
        payment: typeof req.query.payment === "string" ? req.query.payment : undefined,
        activation: typeof req.query.activation === "string" ? req.query.activation : undefined,
        warnings: typeof req.query.warnings === "string" ? req.query.warnings : undefined,
        annualReview: typeof req.query.annualReview === "string" ? req.query.annualReview : undefined,
      }));
    } catch (error) {
      console.error("Admin HeartPlans list error:", error);
      res.status(500).json({ error: "Failed to load HeartPlans" });
    }
  };
}
