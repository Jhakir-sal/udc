export function normalizeLegalName(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function legalNamesMatch(
  first: string | null | undefined,
  second: string | null | undefined,
): boolean {
  const left = normalizeLegalName(first);
  const right = normalizeLegalName(second);
  return left.length > 0 && left === right;
}

const IDENTITY_FALLBACK_REASONS = new Set([
  "stripe_not_configured",
  "stripe_connection_error",
  "stripe_rate_limited",
  "stripe_server_error",
  "stripe_key_expired",
  "stripe_identity_unavailable",
  "stripe_verification_failed",
  "stripe_verified_name_missing",
]);

export type CaseIdentityEvaluation = {
  verifiedLegalName: string | null;
  identitySource: "stripe_verified" | "self_attested_provider_unavailable" | null;
  accountNameMatchesId: boolean;
  certificateMatch: "next_of_kin" | "informant" | null;
  certificateAuthorized: boolean;
  relationshipOverrideApproved: boolean;
  activeLpoa: {
    id: string;
    principalName: string;
    status: string;
  } | null;
  lpoaMatchesId: boolean;
  lpoaNeedsReplacement: boolean;
  reviewRequired: boolean;
  complete: boolean;
  issues: string[];
};

export function evaluateCaseIdentity(input: {
  idVerificationStatus: string | null | undefined;
  idVerifiedName: string | null | undefined;
  accountName: string | null | undefined;
  nextOfKinName: string | null | undefined;
  informantName: string | null | undefined;
  lpoaDocuments: Array<{
    id: string;
    principalName: string;
    status?: string | null;
    identitySource?: string | null;
    identityFallbackReason?: string | null;
    identityAttestedAt?: Date | string | null;
  }>;
  relationshipOverrideApproved?: boolean;
}): CaseIdentityEvaluation {
  const stripeVerifiedLegalName =
    input.idVerificationStatus === "verified" && normalizeLegalName(input.idVerifiedName)
      ? String(input.idVerifiedName).trim()
      : null;
  const selfAttestedDocument = input.lpoaDocuments.find((document) =>
    ["active", "replacement_required"].includes(document.status || "active") &&
    document.identitySource === "self_attested_provider_unavailable" &&
    IDENTITY_FALLBACK_REASONS.has(String(document.identityFallbackReason || "")) &&
    !!document.identityAttestedAt &&
    legalNamesMatch(document.principalName, input.accountName) &&
    (
      legalNamesMatch(document.principalName, input.nextOfKinName) ||
      legalNamesMatch(document.principalName, input.informantName)
    )
  );
  const verifiedLegalName =
    stripeVerifiedLegalName ||
    (selfAttestedDocument ? String(selfAttestedDocument.principalName).trim() : null);
  const identitySource: CaseIdentityEvaluation["identitySource"] =
    stripeVerifiedLegalName
      ? "stripe_verified"
      : selfAttestedDocument
        ? "self_attested_provider_unavailable"
        : null;
  const relationshipOverrideApproved = !!input.relationshipOverrideApproved;
  const accountNameMatchesId = legalNamesMatch(input.accountName, verifiedLegalName);

  let certificateMatch: CaseIdentityEvaluation["certificateMatch"] = null;
  if (legalNamesMatch(input.nextOfKinName, verifiedLegalName)) {
    certificateMatch = "next_of_kin";
  } else if (legalNamesMatch(input.informantName, verifiedLegalName)) {
    certificateMatch = "informant";
  }

  const activeLpoaRecord =
    input.lpoaDocuments.find((document) => (document.status || "active") === "active") || null;
  const replacementRequiredRecord =
    input.lpoaDocuments.find((document) => document.status === "replacement_required") || null;
  const activeLpoa = activeLpoaRecord
    ? {
        id: activeLpoaRecord.id,
        principalName: activeLpoaRecord.principalName,
        status: activeLpoaRecord.status || "active",
      }
    : null;
  const lpoaMatchesId = !!activeLpoa && legalNamesMatch(activeLpoa.principalName, verifiedLegalName);
  const certificateAuthorized =
    !!certificateMatch ||
    (identitySource === "stripe_verified" && relationshipOverrideApproved);
  const profileAuthorized =
    accountNameMatchesId ||
    (identitySource === "stripe_verified" && relationshipOverrideApproved);
  const reviewRequired =
    !!verifiedLegalName &&
    (!profileAuthorized || !certificateAuthorized);
  const lpoaNeedsReplacement =
    !!replacementRequiredRecord ||
    (!!activeLpoa && !!verifiedLegalName && !lpoaMatchesId);

  const issues: string[] = [];
  if (!identitySource) issues.push("identity_not_verified");
  else if (!verifiedLegalName) issues.push("verified_id_name_missing");
  if (verifiedLegalName && !accountNameMatchesId && !relationshipOverrideApproved) {
    issues.push("account_name_mismatch");
  }
  if (verifiedLegalName && !certificateMatch && !relationshipOverrideApproved) {
    issues.push("certificate_name_mismatch");
  }
  if (!activeLpoa) {
    issues.push(lpoaNeedsReplacement ? "lpoa_replacement_required" : "lpoa_missing");
  } else if (!lpoaMatchesId) {
    issues.push("lpoa_name_mismatch");
  }

  return {
    verifiedLegalName,
    identitySource,
    accountNameMatchesId,
    certificateMatch,
    certificateAuthorized,
    relationshipOverrideApproved,
    activeLpoa,
    lpoaMatchesId,
    lpoaNeedsReplacement,
    reviewRequired,
    complete:
      !!verifiedLegalName &&
      profileAuthorized &&
      certificateAuthorized &&
      !!activeLpoa &&
      lpoaMatchesId,
    issues,
  };
}