import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import type { Express } from "express";
import type { PassportStatic } from "passport";
import { authStorage } from "../storage";
import { canonicalDestination, requiresMfa } from "../../authPolicy";
import { issueMfaChallenge } from "../../mfa";

export type EntraOidcSession = {
  config: client.Configuration;
  clientId: string;
  logoutRedirectUri: string;
};

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when AUTH_ENABLE_ENTRA_ID=true`);
  return value;
}

export function getEntraIssuer(tenantId: string, configuredIssuer?: string): URL {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(tenantId)) {
    throw new Error("OIDC_TENANT_ID must be an Entra tenant GUID");
  }
  const normalizedTenantId = tenantId.toLowerCase();
  const issuer = new URL(configuredIssuer || `https://login.microsoftonline.com/${normalizedTenantId}/v2.0`);
  if (
    issuer.protocol !== "https:" ||
    issuer.hostname !== "login.microsoftonline.com" ||
    issuer.port ||
    issuer.username ||
    issuer.password ||
    issuer.pathname.toLowerCase() !== `/${normalizedTenantId}/v2.0` ||
    issuer.search ||
    issuer.hash
  ) {
    throw new Error("OIDC_ISSUER must be the configured Entra tenant's v2.0 issuer");
  }
  issuer.pathname = issuer.pathname.toLowerCase();
  return issuer;
}

function getCallbackUrl(): URL {
  const callback = new URL(requiredEnvironmentValue("OIDC_CALLBACK_URL"));
  const isLoopback = callback.hostname === "localhost" || callback.hostname === "127.0.0.1";
  if (
    (callback.protocol !== "https:" && !(isLoopback && callback.protocol === "http:")) ||
    callback.pathname !== "/api/callback" ||
    callback.username ||
    callback.password ||
    callback.search ||
    callback.hash
  ) {
    throw new Error("OIDC_CALLBACK_URL must be an HTTPS URL ending in /api/callback (HTTP is allowed only on localhost)");
  }
  return callback;
}

export async function setupOidcStrategy(app: Express, passport: PassportStatic): Promise<EntraOidcSession> {
  const tenantId = requiredEnvironmentValue("OIDC_TENANT_ID");
  const issuer = getEntraIssuer(tenantId, process.env.OIDC_ISSUER?.trim());
  const clientId = requiredEnvironmentValue("OIDC_CLIENT_ID");
  const clientSecret = requiredEnvironmentValue("OIDC_CLIENT_SECRET");
  const callbackUrl = getCallbackUrl();
  const configuredLogoutUri = process.env.OIDC_POST_LOGOUT_REDIRECT_URL?.trim();
  const logoutRedirect = new URL(configuredLogoutUri || "/login", callbackUrl.origin);
  if (
    logoutRedirect.origin !== callbackUrl.origin ||
    logoutRedirect.pathname !== "/login" ||
    logoutRedirect.search ||
    logoutRedirect.hash
  ) {
    throw new Error("OIDC_POST_LOGOUT_REDIRECT_URL must use the callback origin and /login path");
  }

  const config = await client.discovery(issuer, clientId, clientSecret);
  const verify: VerifyFunction = async (tokens, verified) => {
    try {
      const claims = tokens.claims();
      if (!claims || typeof claims.tid !== "string" || claims.tid.toLowerCase() !== tenantId.toLowerCase()) {
        return verified(null, false);
      }

      const rawEmail = typeof claims.email === "string"
        ? claims.email
        : typeof claims.preferred_username === "string"
          ? claims.preferred_username
          : "";
      const email = rawEmail.trim().toLowerCase();
      if (!email) return verified(null, false);

      const user = await authStorage.getUserByEmail(email);
      if (!user || !user.emailVerified || !user.email) {
        return verified(null, false);
      }

      const expiresAt = claims.exp;
      if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
        return verified(null, false);
      }
      const sessionUser: Record<string, any> = {
        claims: {
          ...claims,
          sub: user.id,
          email: user.email,
          first_name: typeof claims.given_name === "string" ? claims.given_name : user.firstName,
          last_name: typeof claims.family_name === "string" ? claims.family_name : user.lastName,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
        expires_at: expiresAt,
      };

      if (requiresMfa(user)) {
        sessionUser.pending2FAUserId = user.id;
        sessionUser.mfaSentVia = await issueMfaChallenge(user);
        sessionUser.mfaVerified = false;
      } else {
        sessionUser.mfaVerified = true;
        sessionUser.mfaVerifiedForRole = user.role;
      }

      return verified(null, sessionUser as Express.User);
    } catch (error) {
      return verified(error as Error);
    }
  };

  passport.use(
    "entra-oidc",
    new Strategy(
      {
        name: "entra-oidc",
        config,
        callbackURL: callbackUrl,
        scope: "openid profile email offline_access",
      },
      verify,
    ),
  );

  app.get("/api/login", passport.authenticate("entra-oidc", { prompt: "select_account" }));
  app.get(
    "/api/callback",
    passport.authenticate("entra-oidc", {
      failureRedirect: "/login?sso=failed",
    }),
    async (req, res, next) => {
      try {
        const sessionUser = req.user as Record<string, any> | undefined;
        if (sessionUser?.pending2FAUserId) return res.redirect("/auth/complete");
        const userId = sessionUser?.claims?.sub;
        const user = userId ? await authStorage.getUser(userId) : undefined;
        if (!user) return res.redirect("/login?sso=failed");
        return res.redirect(canonicalDestination(user));
      } catch (error) {
        return next(error);
      }
    },
  );

  return {
    config,
    clientId,
    logoutRedirectUri: logoutRedirect.href,
  };
}
