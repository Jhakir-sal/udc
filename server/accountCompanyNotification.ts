import { hasCurrentRoutingApproval } from "../shared/companyEmailRouting";
import type { Express, RequestHandler } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { companyDeathNotices, companyDirectory } from "../shared/schema";
import { getCompanyReference } from "./companyReference";
import { buildCompanyDeathNoticeEmail, getAppUrl } from "./email";
import type { AccountCompanyNotification } from "../shared/accountCompanyNotification";
import { normalizeNotificationCompany, exactNotificationMatches } from "../shared/accountCompanyNotification";

export function registerAccountCompanyNotification(app: Express, options: {
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
  hasVerifiedRouting: (company: typeof companyDirectory.$inferSelect) => boolean;
}) {
  app.get("/api/admin/accounts/:accountId/company-notification", options.isAuthenticated, options.isAdmin, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const accountId = String(req.params.accountId || "");
      const account = await storage.getConnectedAccount(accountId);
      if (!account) return res.status(404).json({ error: "Account not found." });
      const certificate = await storage.getCertificate(account.certificateId);
      if (!certificate) return res.status(404).json({ error: "Case not found." });
      const companies = await db.select().from(companyDirectory).orderBy(companyDirectory.name);
      const active = companies.filter((company) => company.status === "active");
      const exact = exactNotificationMatches(account.accountName, active);
      // A stored link always wins, even when retired. Never silently reassign it.
      const linkedCompany = account.companyId ? companies.find((company) => company.id === account.companyId) : undefined;
      const requestedCompanyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
      const q = typeof req.query.q === "string" ? normalizeNotificationCompany(req.query.q) : "";
      const company = account.companyId ? linkedCompany : requestedCompanyId
        ? active.find((item) => item.id === requestedCompanyId)
        : !q && exact.length === 1 ? exact[0] : undefined;
      const suggestionRows = q
        ? active.filter((item) => [item.name, ...item.aliases].some((name) => normalizeNotificationCompany(name).includes(q))).slice(0, 30)
        : exact;
      const safeCompany = (item: typeof companyDirectory.$inferSelect) => ({
        id: item.id, name: item.name, canEmail: options.hasVerifiedRouting(item),
        notificationEmail: item.notificationEmail,
        officialDomain: item.officialDomain,
        routingExceptionApproved: hasCurrentRoutingApproval(item),
        status: item.status,
        recipient: options.hasVerifiedRouting(item) ? item.notificationEmail : null,
      });
      const references = getCompanyReference().entries;
      const referenceKeys = company ? [company.name, ...company.aliases] : [account.accountName];
      const matchedReferences = references.filter((entry) => referenceKeys.some((name) =>
        normalizeNotificationCompany(name) === normalizeNotificationCompany(entry.company)));
      // Research matching is exact and ambiguity is never auto-resolved.
      const reference = matchedReferences.length === 1 ? matchedReferences[0] : undefined;
      const [notice] = company ? await db.select().from(companyDeathNotices).where(and(
        eq(companyDeathNotices.accountId, account.id), eq(companyDeathNotices.companyId, company.id),
        ne(companyDeathNotices.status, "revoked"),
      )).orderBy(desc(companyDeathNotices.createdAt)).limit(1) : [];
      const email = buildCompanyDeathNoticeEmail({
        companyName: company?.name || reference?.company || account.accountName,
        notificationEmail: company?.notificationEmail || "",
        secureRecordId: notice?.secureRecordId || "[assigned when the draft is saved]",
        portalUrl: `${getAppUrl()}/company-portal`,
      });
      const response: AccountCompanyNotification = {
        accountId: account.id, certificateId: certificate.id, accountName: account.accountName,
        internalNotes: account.notes ?? null,
        deathRecordVerified: certificate.status === "verified",
        company: company ? safeCompany(company) : null,
        suggestions: suggestionRows.map(safeCompany), linked: !!account.companyId,
        routingIssue: account.companyId && (!linkedCompany || linkedCompany.status !== "active")
          ? "The linked company is inactive or unavailable. Ask an administrator to review it; the account has not been reassigned."
          : null,
        reporting: reference ? {
          company: reference.company, portal: reference.portal, phone: reference.phone, notes: reference.notes,
          emailAcceptance: reference.emailAcceptance, sourceUrl: reference.sourceUrl, staffPortal: reference.staffPortal,
        } : null,
        notice: notice ? {
          id: notice.id, status: notice.status, secureRecordId: notice.secureRecordId,
          sentAt: notice.sentAt?.toISOString() || null, acknowledgedAt: notice.acknowledgedAt?.toISOString() || null,
        } : null,
        preview: { subject: email.subject, text: email.text || "" },
      };
      res.json(response);
    } catch (error) {
      console.error("Account notification context failed", { name: (error as Error).name });
      res.status(500).json({ error: "Notification options could not be loaded. Please retry." });
    }
  });
}
