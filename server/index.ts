import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase, ensureAdminUsers } from "./seed";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const logPath = path
    .replace(
      /^\/api\/admin\/orsa\/roster\/[^/]+(?=\/|$)/,
      "/api/admin/orsa/roster/:member",
    )
    .replace(
      /^\/api\/(family-invite|funeral-home-upload)\/[^/]+(?=\/|$)/,
      "/api/$1/:token",
    )
    .replace(
      /^\/api\/company-portal\/releases\/[^/]+(?=\/|$)/,
      "/api/company-portal/releases/:token",
    )
    .replace(
      /^\/api\/orsa\/email-campaign\/(open|click)\/[^/]+(?=\/|$)/,
      "/api/orsa/email-campaign/$1/:token",
    );
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${logPath} ${res.statusCode} in ${duration}ms`;
      // Never log HeartPlan response bodies (planner or admin routes): they
      // carry sealed letters, contact/profile PII, asset details, and private
      // document paths. Log method/status/duration only for those.
      const isPrivateBody = path.includes("/heartplan") ||
        path.startsWith("/api/admin/concierge-inquiries") ||
        // These staff responses contain private account notes. Keep them out
        // of application logs as well as family/company-facing payloads.
        /^\/api\/admin\/accounts\/[^/]+\/company-notification\/?$/.test(path) ||
        /^\/api\/admin\/case\/[^/]+(?:\/accounts\/[^/]+)?\/?$/.test(path) ||
        path.includes("/next-of-kin-private-identity") ||
        path.includes("/legacy-messages") ||
        path.startsWith("/api/orsa") ||
        path.startsWith("/api/admin/orsa") ||
        path.startsWith("/api/uploads/");
      if (capturedJsonResponse && !isPrivateBody) {
        const body = JSON.stringify(capturedJsonResponse)
          .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "***-**-****")
          .replace(/\b\d{9}\b/g, "*********");
        logLine += ` :: ${body}`;
      }

      log(logLine);
    }
  });

  next();
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception during runtime:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
  process.exit(1);
});

(async () => {
  await seedDatabase();
  await ensureAdminUsers();

  try {
    const { db } = await import("./db");
    const { certificates, notifications, lifeInsurancePolicies, nearestRelatives, connectedAccounts, beneficiaries, governmentNotifications, caseMessages, familyInvitations } = await import("@shared/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const cleanupIds = ["ddfd435b-1018-47ce-89f6-99273bfdbde7", "2930a23c-7786-4556-ad9c-551a3c00c2ed"];
    for (const cleanupId of cleanupIds) {
      const existing = await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, cleanupId));
      if (existing.length > 0) {
        await db.delete(notifications).where(eq(notifications.certificateId, cleanupId));
        await db.delete(lifeInsurancePolicies).where(eq(lifeInsurancePolicies.certificateId, cleanupId));
        await db.delete(nearestRelatives).where(eq(nearestRelatives.certificateId, cleanupId));
        await db.delete(connectedAccounts).where(eq(connectedAccounts.certificateId, cleanupId));
        await db.delete(beneficiaries).where(eq(beneficiaries.certificateId, cleanupId));
        await db.delete(governmentNotifications).where(eq(governmentNotifications.certificateId, cleanupId));
        await db.delete(caseMessages).where(eq(caseMessages.certificateId, cleanupId));
        await db.delete(familyInvitations).where(eq(familyInvitations.certificateId, cleanupId));
        await db.delete(certificates).where(eq(certificates.id, cleanupId));
        console.log(`[Cleanup] Removed test case ${cleanupId} from database`);
      }
    }
  } catch (e) {
    console.error("[Cleanup] Error:", e);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const sensitiveRequest = /^\/api\/admin\/orsa\/roster(?:\/|$)/.test(req.path) ||
      req.path.startsWith("/api/auth/") ||
      /^\/api\/(?:family-invite|funeral-home-upload)\/[^/]+/.test(req.path) ||
      /^\/api\/company-portal\/releases\/[^/]+/.test(req.path) ||
      /^\/api\/orsa\/email-campaign\/(?:open|click)\/[^/]+/.test(req.path);
    const message = sensitiveRequest
      ? "Internal Server Error"
      : err.message || "Internal Server Error";
    console.error(
      sensitiveRequest ? "Internal Server Error on sensitive route" : "Internal Server Error:",
      sensitiveRequest ? { name: err.name, code: err.code, status } : err,
    );

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})().catch((err) => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
