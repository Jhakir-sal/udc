import type { RequestHandler } from "express";

export function registrationAvailability(emailConfigured: () => boolean): RequestHandler {
  return (_req, res, next) => {
    if (process.env.NODE_ENV === "production" && !emailConfigured()) {
      return res.status(503).json({ error: "Registration is temporarily unavailable because verification email is not configured." });
    }
    next();
  };
}
