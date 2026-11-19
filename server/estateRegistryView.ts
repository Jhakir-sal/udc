import type { EstateRegistry } from "@shared/schema";
import type { RequestHandler } from "express";

// Listing and name search are discovery tools for staff, not record exports.
// Detailed private fields are only returned by the admin-only detail route.
export function estateRegistrySummary(estate: EstateRegistry) {
  return {
    id: estate.id,
    documentType: estate.documentType,
    principalName: estate.principalName,
    filingDate: estate.filingDate,
    jurisdiction: estate.jurisdiction,
    status: estate.status,
  };
}

// No estate_registry row is linked to a certificate or family account, so
// knowing an ID or a principal's name is not evidence of authorization.
export function estateRegistryAdminGuard(
  getUser: (id: string) => Promise<{ role: string } | undefined>,
): RequestHandler {
  return async (req: any, res, next) => {
    const userId = req.session?.userId || req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const user = await getUser(userId);
      if (user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      next();
    } catch (error) {
      next(error);
    }
  };
}