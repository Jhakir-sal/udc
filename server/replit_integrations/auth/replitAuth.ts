import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session, { type Store } from "express-session";
import type { Express, Request, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { requiresMfa } from "../../authPolicy";
import { issueMfaChallenge } from "../../mfa";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession(store?: Store) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const sessionStore = store ?? (() => {
    const pgStore = connectPg(session);
    return new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      ttl: sessionTtl,
      tableName: "sessions",
    });
  })();
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    // Replit terminates HTTPS at its proxy. Honor X-Forwarded-Proto when
    // deciding whether the browser cookie should carry the Secure attribute.
    proxy: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
      maxAge: sessionTtl,
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
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function resolveSsoUser(claims: any) {
  const email = String(claims["email"] || "").trim().toLowerCase();
  if (!email || claims["email_verified"] !== true) {
    throw new Error("A verified SSO email is required");
  }
  const existing = await authStorage.getUserByEmail(email);
  const id = existing?.id || claims["sub"];
  const user = await authStorage.upsertUser({
    id,
    email,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    emailVerified: true,
    ...(existing ? { role: existing.role, funeralHomeId: existing.funeralHomeId } : { role: "user" }),
  });
  return user;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user: any = {};
    updateUserSession(user, tokens);
    const canonicalUser = await resolveSsoUser(tokens.claims());
    user.claims = { ...user.claims, sub: canonicalUser.id, email: canonicalUser.email };
    if (requiresMfa(canonicalUser)) {
      user.pending2FAUserId = canonicalUser.id;
      user.mfaSentVia = await issueMfaChallenge(canonicalUser);
      user.mfaVerified = false;
    } else {
      user.mfaVerified = true;
    }
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      // Replit controls its native account chooser. Its OIDC endpoint rejects
      // the optional standard prompt parameter, so do not send one here.
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/auth/complete",
      failureRedirect: "/login?sso=failed",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const hadSsoSession = !!(req.user as any)?.claims;
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        if (!hadSsoSession) return res.redirect("/login");
        res.redirect(client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}/login`,
        }).href);
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Check for email/password session authentication first
  const sessionUserId = (req.session as any)?.userId;
  if (sessionUserId) {
    // Verify the user still exists (e.g. wasn't deleted by an admin)
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

  // Check for SSO authentication (passport)
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
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
  if (now <= user.expires_at) {
    return authorizeSsoUser();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return authorizeSsoUser();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
