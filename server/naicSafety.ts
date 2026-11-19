import type { Express, RequestHandler } from "express";

// The former NAIC endpoint wrote invented policies using this exact provenance marker.
// Keep them quarantined even after a real integration is introduced.
export const SYNTHETIC_NAIC_MARKER =
  "Discovered via NAIC Life Insurance Policy Locator using UDC Blockchain verification.";

export function isSyntheticNaicPolicy(policy: { notes: string | null }) {
  return policy.notes?.startsWith(SYNTHETIC_NAIC_MARKER) === true;
}

export function registerDisabledNaicSearch(
  app: Pick<Express, "post">,
  isAuthenticated: RequestHandler,
  isAdmin: RequestHandler,
) {
  app.post("/api/admin/case/:certId/naic-search", isAuthenticated, isAdmin, (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(503).json({
      code: "NAIC_NOT_CONNECTED",
      error: "NAIC search is disabled until a verified integration is connected. No policy search was performed.",
    });
  });
}
