import type { Express, RequestHandler } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { accountCompanyPhones, companyDirectory, connectedAccounts } from "@shared/schema";
import type { AccountCompanyPhoneResult } from "@shared/accountCompanyPhone";
import { discoverCompanyPhone, normalizeCompanyName, normalizeCompanyPhone, sourceUrl } from "./companyPhoneLookup";

const bodySchema = z.object({
  officialWebsite: z.string().url().max(500).optional(),
  confirmedOfficialWebsite: z.literal(true).optional(),
}).strict().refine((body) => !body.officialWebsite || body.confirmedOfficialWebsite === true, "Confirm the official company website first.");
const ageLimit = 30 * 86400000;
type DirectoryCompany = typeof companyDirectory.$inferSelect;
export function matchPhoneCompany(
  account: { companyId?: string | null; accountName: string }, companies: DirectoryCompany[],
): DirectoryCompany | undefined {
  const approved = companies.filter((company) => company.status === "active" && company.verifiedAt);
  if (account.companyId) return approved.find((company) => company.id === account.companyId);
  const key = (name: string) => normalizeCompanyName(name.replace(/\s+(?:checking|savings|credit card)(?: account)?$/i, ""));
  const matches = approved.filter((company) =>
    [company.name, ...company.aliases].some((name) => key(name) === key(account.accountName)));
  // Never use fuzzy or substring matching to verify the identity of a business.
  return matches.length === 1 ? matches[0] : undefined;
}
export function registerAccountCompanyPhoneRoutes(
  app: Express, isAuthenticated: RequestHandler,
  discover = discoverCompanyPhone,
) {
  const refreshes = new Map<string, { count: number; until: number }>();
  const handler = (force: boolean): RequestHandler => async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const userId = req.session?.userId || req.user?.claims?.sub;
      const [actor, account] = await Promise.all([
        userId ? storage.getUser(userId) : undefined,
        storage.getConnectedAccount(req.params.accountId),
      ]);
      const certificate = account ? await storage.getCertificate(account.certificateId) : undefined;
      // Match the existing account-read boundary; case membership alone must not
      // become a new way to discover somebody else's account/provider details.
      if (!actor || !account || !certificate ||
        (actor.role !== "admin" && certificate.userId !== actor.id)) {
        res.status(404).json({ message: "Account not found." }); return;
      }
      const canManage = actor.role === "admin";
      if (force && !canManage) { res.status(403).json({ message: "Only staff can change company phone sources." }); return; }
      const body = force ? bodySchema.parse(req.body) : {};
      if (force) {
        let limit = refreshes.get(actor.id);
        if (!limit || limit.until <= Date.now()) {
          limit = { count: 0, until: Date.now() + 60000 };
          if (refreshes.size >= 1000) refreshes.clear();
          refreshes.set(actor.id, limit);
        }
        if (++limit.count > 12) { res.setHeader("Retry-After", "60"); res.status(429).json({ message: "Please wait a minute before checking more company websites." }); return; }
      }
      const [saved] = await db.select().from(accountCompanyPhones).where(eq(accountCompanyPhones.accountId, account.id)).limit(1);
      const sameAccount = saved && saved.accountNameSnapshot === normalizeCompanyName(account.accountName) &&
        saved.accountTypeSnapshot === account.accountType &&
        saved.companyIdSnapshot === account.companyId;
      const companies = await db.select().from(companyDirectory)
        .where(and(eq(companyDirectory.status, "active"), isNotNull(companyDirectory.verifiedAt)));
      const company = matchPhoneCompany(account, companies);
      let domain: string | undefined;
      let website: string | undefined;
      let sourceKind: "directory" | "staff_confirmed" | undefined;
      if (body.officialWebsite) {
        const url = sourceUrl(body.officialWebsite);
        domain = url.hostname.replace(/^www\./i, "");
        website = url.href;
        sourceKind = "staff_confirmed";
      } else if (sameAccount && saved.sourceKind === "staff_confirmed") {
        domain = saved.officialDomain; website = saved.sourceUrl; sourceKind = "staff_confirmed";
      } else if (company) {
        domain = new URL(`https://${company.officialDomain}`).hostname.replace(/^www\./i, "");
        sourceKind = "directory";
        try { website = sourceUrl(company.website || `https://${domain}`, domain).href; }
        catch { website = sourceUrl(`https://${domain}`, domain).href; }
      }
      const result: AccountCompanyPhoneResult = {
        status: "needs_website", phone: null, sourceUrl: website || null, verifiedAt: null,
        sourceKind: sourceKind || null, companyName: account.accountName, canManage,
      };
      if (!website || !domain || !sourceKind) {
        result.message = "No unambiguous verified company match. Staff can confirm the official website.";
        res.json(result); return;
      }
      if (!force && sameAccount && saved.officialDomain === domain && saved.sourceKind === sourceKind &&
        (!saved.lastCheckFailedAt || saved.lastCheckFailedAt < saved.verifiedAt) &&
        saved.verifiedAt.getTime() > Date.now() - ageLimit) {
        res.json({ ...result, status: "verified", phone: saved.phone, sourceUrl: saved.sourceUrl, verifiedAt: saved.verifiedAt.toISOString() }); return;
      }
      const found = await discover(website, domain, force, undefined, `${account.accountName} ${account.accountType}`);
      if (!found.evidence) {
        if (force && sameAccount && (!body.officialWebsite || website === saved.sourceUrl)) {
          await db.update(accountCompanyPhones).set({ lastCheckFailedAt: new Date() }).where(and(
            eq(accountCompanyPhones.accountId, account.id), eq(accountCompanyPhones.verifiedAt, saved.verifiedAt),
            eq(accountCompanyPhones.sourceUrl, saved.sourceUrl),
          ));
        }
        res.json({ ...result, status: found.status === "verified" ? "unavailable" : found.status, message: found.status === "not_found" ?
          "No suitable published phone number was found on the company pages checked." :
          "The company website could not be checked. No verified phone number was saved." }); return;
      }
      const evidence = found.evidence;
      sourceUrl(evidence.sourceUrl, domain);
      if (normalizeCompanyPhone(evidence.phone) !== evidence.phone) throw new Error("Invalid phone evidence.");
      // An account renamed/deleted/relinked during a slow website fetch must not inherit old evidence.
      const savedNow = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(connectedAccounts).where(eq(connectedAccounts.id, account.id)).for("update").limit(1);
        if (!current || current.accountName !== account.accountName || current.accountType !== account.accountType || current.companyId !== account.companyId) return false;
        const values = {
          accountId: account.id, accountNameSnapshot: normalizeCompanyName(account.accountName),
          accountTypeSnapshot: account.accountType,
          companyIdSnapshot: account.companyId, officialDomain: domain!, phone: evidence.phone,
          sourceUrl: evidence.sourceUrl, sourceKind: sourceKind!,
          verifiedAt: evidence.checkedAt, lastCheckFailedAt: null,
          verifiedBy: sourceKind === "staff_confirmed" ? (body.officialWebsite ? actor.id : saved?.verifiedBy) : null,
        };
        await tx.insert(accountCompanyPhones).values(values).onConflictDoUpdate({
          target: accountCompanyPhones.accountId, set: values,
        });
        return true;
      });
      if (!savedNow) { res.status(409).json({ message: "The account changed during lookup. Reload before checking again." }); return; }
      res.json({ ...result, status: "verified", phone: evidence.phone, sourceUrl: evidence.sourceUrl, verifiedAt: evidence.checkedAt.toISOString() });
    } catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ message: "Confirm a valid official website before checking." }); return; }
      if (error instanceof TypeError || (error instanceof Error && /HTTPS|confirmed company domain/.test(error.message))) {
        res.status(400).json({ message: "Use a public HTTPS company page without credentials or a query string." }); return;
      }
      console.error("Company phone lookup failed:", error instanceof Error ? error.name : "Unknown error");
      res.status(503).json({ message: "Company phone lookup is temporarily unavailable. No unverified number was saved." });
    }
  };
  app.get("/api/accounts/:accountId/company-phone", isAuthenticated, handler(false));
  app.post("/api/accounts/:accountId/company-phone", isAuthenticated, handler(true));
}
