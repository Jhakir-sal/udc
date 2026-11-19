import bcrypt from "bcrypt";
import type { RequestHandler } from "express";
import type { User } from "@shared/models/auth";
import {
  canonicalDestination,
  permissionsFor,
  requiresMfa,
} from "../../authPolicy";
import { issueMfaChallenge, mfaDeliveryDetails } from "../../mfa";
import { establishPasswordSession } from "./replitAuth";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();

type PasswordLoginDependencies = {
  getUserByEmail(email: string): Promise<User | undefined>;
  comparePassword?(password: string, passwordHash: string): Promise<boolean>;
  sendMfaChallenge?(user: User): Promise<"sms" | "email">;
  onAuthenticated?(user: User): Promise<void>;
};

export function createPasswordLoginHandler({
  getUserByEmail,
  comparePassword = bcrypt.compare,
  sendMfaChallenge = issueMfaChallenge,
  onAuthenticated,
}: PasswordLoginDependencies): RequestHandler {
  return async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const attemptKey = `${req.ip || "unknown"}:${normalizedEmail}`;
      const existingAttempt = loginAttempts.get(attemptKey);
      if (
        existingAttempt &&
        Date.now() - existingAttempt.windowStartedAt < ATTEMPT_WINDOW_MS &&
        existingAttempt.count >= MAX_LOGIN_ATTEMPTS
      ) {
        return res.status(429).json({ error: "Sign-in could not be completed. Please wait and try again." });
      }
      if (
        existingAttempt &&
        Date.now() - existingAttempt.windowStartedAt >= ATTEMPT_WINDOW_MS
      ) {
        loginAttempts.delete(attemptKey);
      }

      const user = await getUserByEmail(normalizedEmail);
      if (!user || !user.passwordHash || !user.email) {
        const attempt = loginAttempts.get(attemptKey);
        loginAttempts.set(attemptKey, {
          count: (attempt?.count || 0) + 1,
          windowStartedAt: attempt?.windowStartedAt || Date.now(),
        });
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const validPassword = await comparePassword(String(password), user.passwordHash);
      if (!validPassword) {
        const attempt = loginAttempts.get(attemptKey);
        loginAttempts.set(attemptKey, {
          count: (attempt?.count || 0) + 1,
          windowStartedAt: attempt?.windowStartedAt || Date.now(),
        });
        return res.status(401).json({ error: "Invalid email or password" });
      }
      loginAttempts.delete(attemptKey);

      if (!user.emailVerified) {
        return res.status(403).json({ error: "Sign-in could not be completed. Verify your email or contact support." });
      }

      if (requiresMfa(user)) {
        (req.session as any).pending2FAUserId = user.id;
        const sentVia = await sendMfaChallenge(user);
        (req.session as any).mfaSentVia = sentVia;
        await new Promise<void>((resolve, reject) =>
          req.session.save((error) => error ? reject(error) : resolve()),
        );
        return res.json({ requires2FA: true, sentVia, expiresInSeconds: 600, ...mfaDeliveryDetails(user, sentVia) });
      }

      await establishPasswordSession(req, user.id);
      await onAuthenticated?.(user);
      return res.json({
        success: true,
        destination: canonicalDestination(user),
        permissions: permissionsFor(user),
      });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ error: error.message || "Login failed" });
    }
  };
}