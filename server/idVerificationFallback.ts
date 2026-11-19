export const IDENTITY_FALLBACK_GRANT_TTL_MS = 30 * 60 * 1000;

export type IdentityFallbackReason =
  | "stripe_not_configured"
  | "stripe_connection_error"
  | "stripe_rate_limited"
  | "stripe_server_error"
  | "stripe_key_expired"
  | "stripe_identity_unavailable"
  | "stripe_verification_failed"
  | "stripe_verified_name_missing";

export type IdentityFallbackGrant = {
  userId: string;
  issuedAt: number;
  reason: IdentityFallbackReason;
};

export function isIdentityFallbackReason(value: unknown): value is IdentityFallbackReason {
  return [
    "stripe_not_configured",
    "stripe_connection_error",
    "stripe_rate_limited",
    "stripe_server_error",
    "stripe_key_expired",
    "stripe_identity_unavailable",
    "stripe_verification_failed",
    "stripe_verified_name_missing",
  ].includes(String(value));
}

export function classifyIdProviderUnavailability(
  error: unknown,
  options: { noClient?: boolean; production?: boolean } = {},
): IdentityFallbackReason | null {
  if (options.noClient) {
    return options.production === false ? null : "stripe_not_configured";
  }

  const candidate = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const type = String(candidate.type || "").toLowerCase();
  const code = String(candidate.code || "").toLowerCase();
  const message = String(candidate.message || candidate.rawMessage || "").toLowerCase();
  const status = Number(candidate.statusCode || candidate.status || 0);
  const stripeTagged =
    type.startsWith("stripe") ||
    [
      "api_connection_error",
      "rate_limit_error",
      "api_error",
    ].includes(type) ||
    code === "api_key_expired";

  if (code === "api_key_expired") return "stripe_key_expired";
  if (
    type === "stripepermissionerror" ||
    code === "permission_error" ||
    code === "identity_verification_not_enabled" ||
    code === "feature_not_enabled" ||
    (
      type === "stripeinvalidrequesterror" &&
      /\b(identity|verification session)\b/.test(message) &&
      /\b(enable|enabled|activate|available|access|permission|restricted)\b/.test(message)
    )
  ) {
    return "stripe_identity_unavailable";
  }
  if (type === "stripeconnectionerror" || type === "api_connection_error") {
    return "stripe_connection_error";
  }
  if (
    type === "striperatelimiterror" ||
    type === "rate_limit_error" ||
    (stripeTagged && status === 429)
  ) {
    return "stripe_rate_limited";
  }
  if (
    type === "stripeapierror" ||
    type === "api_error" ||
    (
      stripeTagged &&
      [500, 502, 503, 504].includes(status)
    )
  ) {
    return "stripe_server_error";
  }
  return null;
}

export function issueIdentityFallbackGrant(
  session: Record<string, any>,
  userId: string,
  reason: IdentityFallbackReason,
  now = Date.now(),
): IdentityFallbackGrant {
  const grant = { userId, issuedAt: now, reason };
  session.identityFallbackGrant = grant;
  return grant;
}

export function clearIdentityFallbackGrant(session: Record<string, any> | undefined): void {
  if (session) delete session.identityFallbackGrant;
}

export function validIdentityFallbackGrant(
  session: Record<string, any> | undefined,
  userId: string,
  now = Date.now(),
): IdentityFallbackGrant | null {
  const grant = session?.identityFallbackGrant as IdentityFallbackGrant | undefined;
  if (
    !grant ||
    grant.userId !== userId ||
    !Number.isFinite(grant.issuedAt) ||
    now - grant.issuedAt < 0 ||
    now - grant.issuedAt > IDENTITY_FALLBACK_GRANT_TTL_MS ||
    !isIdentityFallbackReason(grant.reason)
  ) {
    return null;
  }
  return grant;
}

export function usableIdentityFallbackGrant(
  session: Record<string, any> | undefined,
  userId: string,
  idVerificationStatus: string | null | undefined,
  now = Date.now(),
): IdentityFallbackGrant | null {
  const grant = validIdentityFallbackGrant(session, userId, now);
  if (idVerificationStatus === "failed" && grant?.reason !== "stripe_verification_failed") {
    return null;
  }
  return grant;
}