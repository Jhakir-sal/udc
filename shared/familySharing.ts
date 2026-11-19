import { legalNamesMatch } from "./legalName";

export const FAMILY_SHARING_VERSION = "case-sharing-v1";
export const FAMILY_SHARING_TEXT = "I authorize the named member to access this specific Steps After Life case and its private documents and to help by uploading information. This permission is revocable, does not transfer case ownership, is not a power of attorney, and does not establish legal authority over the deceased person's estate. Representative actions require separate staff review of supporting authority. The member agrees to use case information only to help with this case and not disclose it without permission.";

export function memberIdVerified(user: {
  idVerificationStatus?: string | null; idVerifiedName?: string | null; idOverrideAt?: unknown;
}): boolean {
  // Explicit staff ID review is distinguishable in the UI; an attestation or
  // provider result without a legal name is not an ID check.
  return user.idVerificationStatus === "verified" &&
    (!!user.idVerifiedName?.trim() || !!user.idOverrideAt);
}

export function sharingAccess(
  user: Parameters<typeof memberIdVerified>[0],
  membership: { status: string },
  ownerId: string | null,
  grant?: {
    authorizedBy: string | null; revokedAt: unknown; agreementVersion: string;
    memberAcceptedAt: unknown; scope: string; reviewStatus: string;
    reviewedBy?: string | null; reviewedAt?: unknown; evidenceDocumentId?: string | null;
    authorityExpiresAt?: Date | string | null;
  } | null,
  now: Date = new Date(),
) {
  const idVerified = memberIdVerified(user);
  const sharingAuthorized = membership.status === "active" && !!ownerId && !!grant &&
    grant.authorizedBy === ownerId && !grant.revokedAt && grant.agreementVersion === FAMILY_SHARING_VERSION;
  const memberAccepted = sharingAuthorized && !!grant?.memberAcceptedAt;
  const helperAccess = idVerified && memberAccepted;
  const expiresAt = grant?.authorityExpiresAt ? new Date(grant.authorityExpiresAt).getTime() : NaN;
  const authorityStatus = grant?.scope !== "representative" ? "not_requested" :
    grant.reviewStatus !== "approved" ? grant.reviewStatus :
    !Number.isFinite(expiresAt) ? "needs_review" :
    expiresAt <= now.getTime() ? "expired" :
    expiresAt - now.getTime() <= 30 * 24 * 60 * 60 * 1000 ? "expiring" : "current";
  const representativeAccess = helperAccess && grant?.scope === "representative" &&
    (authorityStatus === "current" || authorityStatus === "expiring") &&
    !!grant.reviewedBy && !!grant.reviewedAt && !!grant.evidenceDocumentId;
  return { idVerified, sharingAuthorized, memberAccepted, helperAccess, representativeAccess,
    authorityStatus, authorityExpiresAt: grant?.authorityExpiresAt || null };
}

export function sharingSignatureMatches(
  typedName: string, user: { firstName?: string | null; lastName?: string | null; idVerifiedName?: string | null; idOverrideAt?: unknown },
) {
  const legalName = user.idVerifiedName?.trim() ||
    (user.idOverrideAt ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "");
  return !!legalName && legalNamesMatch(typedName, legalName);
}
