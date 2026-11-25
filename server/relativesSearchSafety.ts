import type { Express, RequestHandler } from "express";

export function registerDisabledRelativesSearch(
  app: Pick<Express, "post">,
  isAuthenticated: RequestHandler,
  isAdmin: RequestHandler,
) {
  app.post("/api/admin/case/:certId/relatives/search", isAuthenticated, isAdmin, (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(503).json({
      code: "RELATIVES_SEARCH_NOT_CONNECTED",
      error: "Public records search is disabled until a verified provider is connected. No search was performed.",
    });
  });
}
