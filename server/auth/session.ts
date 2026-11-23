import * as client from "openid-client";
import passport from "passport";
import session, { type Store } from "express-session";
import type { Express, Request, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { requiresMfa } from "../authPolicy";
import { issueMfaChallenge } from "../mfa";
import { setupOidcStrategy, type EntraOidcSession } from "./strategies/oidc";

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
let entraSessionConfig: client.Configuration | undefined;

export function getSession(store?: Store) {
  const sessionStore = store ?? (() => {
    const pgStore = connectPg(session);
    return new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      ttl: SESSION_TTL,
      tableName: "sessions",
    });
  })();

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    proxy: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
      maxAge: SESSION_TTL,
    },
  });
}

export async function establishPasswordSession(req: Request, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((error) => error ? reject(error) : resolve()),
  );
  (req.session as any).userId = userId;
  (req.session as any).mfaVerified = false;
  await new Promise<void>((resolve, reject) =>
    req.session.save((error) => error ? reject(error) : resolve()),
  );
}

function updateUserSession(
  user: Record<string, any>,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
) {
  const userId = user.claims?.sub;
  user.claims = { ...user.claims, ...(tokens.claims() ?? {}), ...(userId ? { sub: userId } : {}) };
  if (tokens.access_token) user.access_token = tokens.access_token;
  if (tokens.refresh_token) user.refresh_token = tokens.refresh_token;
  if (tokens.id_token) user.id_token = tokens.id_token;
  user.expires_at = Math.floor(Date.now() / 1000) + (tokens.expiresIn() ?? 3600);
}

export async function setupAuth(app: Express, store?: Store): Promise<void> {
  app.set("trust proxy", 1);
  app.use(getSession(store));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, done) => done(null, user));
  passport.deserializeUser((user: Express.User, done) => done(null, user));

  let entraSession: EntraOidcSession | undefined;
  if ((process.env.AUTH_ENABLE_ENTRA_ID ?? "false").trim().toLowerCase() === "true") {
    entraSession = await setupOidcStrategy(app, passport);
    entraSessionConfig = entraSession.config;
  } else {
    entraSessionConfig = undefined;
    app.get("/api/login", (_req, res) => res.redirect("/login"));
    app.get("/api/callback", (_req, res) => res.redirect("/login?sso=disabled"));
  }

  app.get("/api/logout", (req, res, next) => {
    const ssoUser = req.user as Record<string, any> | undefined;
    const endSession = (error?: Error) => {
      if (error) return next(error);
      req.session.destroy((destroyError) => {
        if (destroyError) return next(destroyError);
        res.clearCookie("connect.sid", { path: "/" });
        if (!entraSession || !ssoUser?.claims) return res.redirect("/login");

        try {
          const parameters: Record<string, string> = {
            client_id: entraSession.clientId,
            post_logout_redirect_uri: entraSession.logoutRedirectUri,
          };
          if (typeof ssoUser.id_token === "string") parameters.id_token_hint = ssoUser.id_token;
          return res.redirect(client.buildEndSessionUrl(entraSession.config, parameters).href);
        } catch (logoutError) {
          console.error("[Auth] Entra ID logout redirect could not be created:", logoutError);
          return res.redirect("/login");
        }
      });
    };

    if (typeof req.logout === "function") req.logout(endSession);
    else endSession();
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const sessionUserId = (req.session as any)?.userId;
  if (sessionUserId) {
    const existingUser = await authStorage.getUser(sessionUserId);
    if (!existingUser) {
      req.session?.destroy(() => {});
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (
      requiresMfa(existingUser) &&
      (
        (req.session as any)?.mfaVerified !== true ||
        (req.session as any)?.mfaVerifiedForRole !== existingUser.role
      )
    ) {
      req.session?.destroy(() => {});
      return res.status(401).json({ message: "Multi-factor verification required", code: "MFA_REQUIRED" });
    }
    (req as any).userId = sessionUserId;
    return next();
  }

  const user = req.user as Record<string, any> | undefined;
  if (!req.isAuthenticated?.() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (user.pending2FAUserId && !user.mfaVerified) {
    return res.status(401).json({ message: "Multi-factor verification required", code: "MFA_REQUIRED" });
  }

  const authorizeSsoUser = async () => {
    const userId = user.claims?.sub;
    const existingUser = userId ? await authStorage.getUser(userId) : undefined;
    if (!existingUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (
      requiresMfa(existingUser) &&
      (user.mfaVerified !== true || user.mfaVerifiedForRole !== existingUser.role)
    ) {
      req.logout?.(() => {});
      return res.status(401).json({ message: "Multi-factor verification required", code: "MFA_REQUIRED" });
    }
    (req as any).userId = userId;
    return next();
  };

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) return authorizeSsoUser();

  if (typeof user.refresh_token !== "string" || !entraSessionConfig) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const tokenResponse = await client.refreshTokenGrant(entraSessionConfig, user.refresh_token);
    updateUserSession(user, tokenResponse);
    await new Promise<void>((resolve, reject) =>
      req.login(user as Express.User, (error) => error ? reject(error) : resolve()),
    );
    return authorizeSsoUser();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

