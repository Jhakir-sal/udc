import type { Express, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { companyDirectory, createCompanyDirectorySchema } from "@shared/schema";

/** Directory entry only. Creating a company never verifies routing or sends a notice. */
export function registerCompanyDirectoryCreate(app: Express, authenticated: RequestHandler, admin: RequestHandler) {
  app.post("/api/admin/company-directory", authenticated, admin, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const parsed = createCompanyDirectorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Check the company name, official domain, category and optional contact details.", details: parsed.error.flatten() });
    }
    try {
      // The unique domain index handles simultaneous submissions too. A retry
      // must not create a second company or restore a retired company silently.
      const [company] = await db.insert(companyDirectory).values({
        ...parsed.data, verifiedAt: null, verifiedBy: null,
      }).onConflictDoNothing({ target: companyDirectory.officialDomain }).returning();
      if (!company) {
        const [existing] = await db.select({
          id: companyDirectory.id, name: companyDirectory.name, status: companyDirectory.status,
        }).from(companyDirectory).where(eq(companyDirectory.officialDomain, parsed.data.officialDomain)).limit(1);
        return res.status(409).json({
          error: "A company with this official domain already exists. Review its directory entry instead of adding a duplicate.",
          existingCompany: existing ?? null,
        });
      }
      return res.status(201).json({ ...company, routingVerified: false, sent: false });
    } catch (error) {
      console.error("Company directory creation failed", { name: error instanceof Error ? error.name : "Unknown error" });
      return res.status(503).json({ error: "The company could not be saved. Your entered details can be retried." });
    }
  });
}
