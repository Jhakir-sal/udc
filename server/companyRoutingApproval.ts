import type { Express, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { companyDirectory, companyNotificationAuditEvents } from "../shared/schema";
import { emailMatchesCompanyDomain } from "../shared/companyEmailRouting";

export const routingReviewSchema = z.object({
  expectedEmail: z.string().email().max(320).optional(),
  expectedDomain: z.string().min(1).max(253).optional(),
  approveAlternateDomain: z.literal(true).optional(),
  reason: z.string().trim().min(20).max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.approveAlternateDomain && (!value.expectedEmail || !value.expectedDomain || !value.reason)) {
    ctx.addIssue({ code: "custom", message: "Alternate email approval requires the reviewed email, company domain, and an approval reason." });
  }
});

export function registerCompanyRoutingApproval(app: Express, isAuthenticated: RequestHandler, isAdmin: RequestHandler) {
  app.post("/api/admin/company-directory/:id/verify-routing", isAuthenticated, isAdmin, async (req: any, res) => {
    const reviewer = req.session?.userId || req.user?.claims?.sub;
    if (!reviewer) return res.status(401).json({ error: "Sign in before approving routing." });
    const parsed = routingReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Review the recipient and provide an approval reason of 20–1000 characters for an alternate domain." });
    try {
      const result = await db.transaction(async tx => {
        const [company] = await tx.select().from(companyDirectory)
          .where(eq(companyDirectory.id, req.params.id)).for("update");
        if (!company) return { status: 404, error: "Company not found." };
        if (company.status !== "active") return { status: 400, error: "Inactive companies cannot be approved for sending." };
        const review = parsed.data;
        if ((review.expectedEmail !== undefined && review.expectedEmail !== company.notificationEmail) ||
          (review.expectedDomain !== undefined && review.expectedDomain !== company.officialDomain)) {
          return { status: 409, error: "Company routing changed. Refresh and review the saved recipient again." };
        }
        if (!company.notificationEmail || !z.string().email().safeParse(company.notificationEmail).success) {
          return { status: 400, error: "Save a valid recipient email first." };
        }
        const matches = emailMatchesCompanyDomain(company.notificationEmail, company.officialDomain);
        if (!matches && !review.approveAlternateDomain) {
          return { status: 400, error: "This domain requires explicit alternate-email approval and a documented reason." };
        }
        const now = new Date();
        const routingApproval = !matches ? {
          email: company.notificationEmail, officialDomain: company.officialDomain,
          approvedBy: reviewer, approvedAt: now.toISOString(), reason: review.reason!,
        } : null;
        const [verified] = await tx.update(companyDirectory).set({
          routingApproval, verifiedAt: now, verifiedBy: reviewer, updatedAt: now,
        }).where(eq(companyDirectory.id, company.id)).returning();
        await tx.insert(companyNotificationAuditEvents).values({
          companyId: company.id, actorUserId: reviewer, actorRole: "admin",
          eventType: routingApproval ? "alternate_email_routing_approved" : "company_routing_verified",
          metadata: { email: company.notificationEmail, officialDomain: company.officialDomain,
            ...(routingApproval ? { reason: routingApproval.reason } : {}) },
        });
        return { status: 200, company: { id: verified.id, verifiedAt: verified.verifiedAt,
          verifiedBy: verified.verifiedBy, routingExceptionApproved: !!routingApproval } };
      });
      return res.status(result.status).json(result.company || { error: result.error });
    } catch {
      return res.status(503).json({ error: "Routing approval could not be saved. No message was sent." });
    }
  });
}
