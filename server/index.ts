import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";

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
  // reusePort lets multiple processes share one port (useful in some
  // container/hosting setups); not every platform supports it (e.g. it
  // can report ENOTSUP after already binding successfully on some
  // macOS/Node combinations used for local dev), so track whether we've
  // actually started serving and only fall back to a plain listen() if we
  // haven't.
  let listening = false;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      listening = true;
      log(`serving on port ${port}`);
    },
  ).on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOTSUP" && !listening) {
      httpServer.listen(port, "0.0.0.0", () => {
        listening = true;
        log(`serving on port ${port} (reusePort unsupported on this platform)`);
      });
    } else if (err.code !== "ENOTSUP") {
      throw err;
    }
  });
})().catch((err) => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
