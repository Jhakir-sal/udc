import type { User } from "@shared/models/auth";

export const AUTH_DESTINATIONS = ["/", "/admin", "/heartplan", "/funeral-home"] as const;
export type AuthDestination = (typeof AUTH_DESTINATIONS)[number];

export function requiresMfa(user: Pick<User, "role" | "twoFactorEnabled">): boolean {
  return user.role === "admin" || user.role === "funeral_home" || !!user.twoFactorEnabled;
}

export function canonicalDestination(user: Pick<User, "role">): AuthDestination {
  if (user.role === "admin") return "/admin";
  if (user.role === "funeral_home") return "/funeral-home";
  if (user.role === "planner") return "/heartplan";
  return "/";
}

export function permissionsFor(user: Pick<User, "role">): string[] {
  switch (user.role) {
    case "admin":
      return ["family:read", "heartplan:admin", "admin:access", "funeral-home:access"];
    case "funeral_home":
      return ["funeral-home:access"];
    case "planner":
      return ["heartplan:access"];
    default:
      return ["family:access", "heartplan:start"];
  }
}

export function isAllowedAuthRedirect(value: unknown): value is AuthDestination {
  return typeof value === "string" && (AUTH_DESTINATIONS as readonly string[]).includes(value);
}

export function sessionProfile(user: User) {
  const {
    passwordHash,
    phoneVerificationCode,
    phoneVerificationExpiry,
    phoneEnrollmentAttempts,
    phoneEnrollmentWindowStartedAt,
    emailVerificationCode,
    emailVerificationExpiry,
    ...safeUser
  } = user;
  return {
    ...safeUser,
    permissions: permissionsFor(user),
    destination: canonicalDestination(user),
    mfaRequired: requiresMfa(user),
  };
}