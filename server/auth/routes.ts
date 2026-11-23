import type { Express } from "express";
import { authStorage, type IAuthStorage } from "./storage";
import { sessionProfile, requiresMfa } from "../authPolicy";

export function registerAuthRoutes(
  app: Express,
  userStorage: Pick<IAuthStorage, "getUser"> = authStorage,
): void {
  app.get("/api/auth/providers", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      emailPassword: true,
      entraId: (process.env.AUTH_ENABLE_ENTRA_ID ?? "false").trim().toLowerCase() === "true",
    });
  });

  // Get current authenticated user - supports Entra ID and email/password auth
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      // Check for Entra ID authentication first (passport)
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
        if (req.user.pending2FAUserId && !req.user.mfaVerified) {
          return res.status(401).json({ message: "Multi-factor verification required", code: "MFA_REQUIRED" });
        }
        const userId = req.user.claims.sub;
        const user = await userStorage.getUser(userId);
        if (user) {
          if (
            requiresMfa(user) &&
            (
              req.user.mfaVerified !== true ||
              req.user.mfaVerifiedForRole !== user.role
            )
          ) {
            req.logout?.(() => {});
            return res.status(401).json({ message: "Multi-factor verification required", code: "MFA_REQUIRED" });
          }
          return res.json(sessionProfile(user));
        }
      }
      
      // Check for email/password session authentication
      const sessionUserId = (req.session as any)?.userId;
      if (sessionUserId) {
        const user = await userStorage.getUser(sessionUserId);
        if (user) {
          if (
            requiresMfa(user) &&
            (
              req.session?.mfaVerified !== true ||
              req.session?.mfaVerifiedForRole !== user.role
            )
          ) {
            req.session.destroy(() => {});
            return res.status(401).json({ message: "Multi-factor verification required", code: "MFA_REQUIRED" });
          }
          return res.json(sessionProfile(user));
        }
      }
      
      // No valid authentication found
      return res.status(401).json({ message: "Unauthorized" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
