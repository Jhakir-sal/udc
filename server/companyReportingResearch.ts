import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { companyDirectory } from "@shared/schema";
import { companyResearchNotes, PRIORITY_COMPANY_REPORTING_RESEARCH } from "@shared/companyReportingResearch";

/** Explicit admin action only. No existing values or routing approvals are replaced. */
export function registerCompanyReportingResearch(
  app: Express,
  isAuthenticated: RequestHandler,
  isAdmin: RequestHandler,
) {
  app.post("/api/admin/company-directory/priority-research", isAuthenticated, isAdmin, async (req, res) => {
    if (req.body?.confirm !== "record-research-only") {
      return res.status(400).json({ error: "Confirm directory-only research recording. This does not send notices or approve routing." });
    }
    await db.transaction(async (tx) => {
      for (const research of PRIORITY_COMPANY_REPORTING_RESEARCH) {
        // Unique official domain makes repeated/concurrent requests idempotent.
        // Fill only empty research fields; preserve names, emails, status and approvals.
        await tx.insert(companyDirectory).values({
          name: research.name,
          officialDomain: research.officialDomain,
          category: research.category,
          isNational: research.isNational,
          website: `https://${research.officialDomain}`,
          source: research.sources.map((source) => source.url).join("\n"),
          notes: companyResearchNotes(research),
        }).onConflictDoUpdate({
          target: companyDirectory.officialDomain,
          set: {
            source: sql`coalesce(nullif(trim(${companyDirectory.source}), ''), excluded.source)`,
            notes: sql`coalesce(nullif(trim(${companyDirectory.notes}), ''), excluded.notes)`,
          },
        });
      }
    });
    res.json({ recorded: PRIORITY_COMPANY_REPORTING_RESEARCH.length, sent: false, routingApproved: false });
  });
}
