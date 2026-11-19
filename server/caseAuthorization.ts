import crypto from "node:crypto";
import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "./db";
import { caseFamilyMemberships, caseFamilyAuthorizations, certificates, users, familyInvitations, familyInvitationChallenges } from "@shared/schema";
import { FAMILY_SHARING_TEXT, FAMILY_SHARING_VERSION, sharingAccess } from "@shared/familySharing";

export function hashFamilyInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Finds hashed invitations and temporarily supports already-sent plaintext
 * invitations. A valid legacy lookup immediately upgrades the row and clears
 * the usable secret; expired links are never migrated or accepted.
 */
export async function findFamilyInvitationByToken(token: string) {
  if (!token) return undefined;
  const tokenHash = hashFamilyInvitationToken(token);
  const [invitation] = await db.select().from(familyInvitations)
    .where(or(eq(familyInvitations.tokenHash, tokenHash), eq(familyInvitations.token, token)))
    .limit(1);
  if (!invitation) return undefined;
  if (!invitation.tokenHash && invitation.token === token && invitation.status === "pending" && invitation.expiresAt > new Date()) {
    const [upgraded] = await db.update(familyInvitations)
      .set({ tokenHash, token: null })
      .where(and(eq(familyInvitations.id, invitation.id), eq(familyInvitations.token, token), isNull(familyInvitations.tokenHash)))
      .returning();
    return upgraded || { ...invitation, token: null, tokenHash };
  }
  return invitation;
}

/**
 * Family case access is deliberately separate from staff access.  Callers
 * should continue to perform their admin/funeral-home checks before using
 * this helper; this only answers the family-user question.
 */
export async function canFamilyAccessCase(
  certificate: { id: string; userId: string | null } | undefined,
  userId: string | undefined | null,
  scope: "helper" | "representative" = "helper",
): Promise<boolean> {
  if (!certificate || !userId) return false;
  const [user] = await db.select()
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "user" || !user.emailVerified) return false;
  if (certificate.userId === userId) return true;
  const [membership] = await db.select()
    .from(caseFamilyMemberships)
    .where(and(
      eq(caseFamilyMemberships.certificateId, certificate.id),
      eq(caseFamilyMemberships.userId, userId),
      eq(caseFamilyMemberships.status, "active"),
    ))
    .limit(1);
  if (!membership) return false;
  const [grant] = await db.select().from(caseFamilyAuthorizations).where(and(
    eq(caseFamilyAuthorizations.membershipId, membership.id), isNull(caseFamilyAuthorizations.revokedAt),
  )).limit(1);
  const access = sharingAccess(user, membership, certificate.userId, grant);
  return scope === "representative" ? access.representativeAccess : access.helperAccess;
}

/** Membership discovery is private to onboarding; never use this for case data. */
export async function getFamilyLinkedCertificates(userId: string) {
  const [user] = await db.select({ role: users.role, emailVerified: users.emailVerified })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "user" || !user.emailVerified) return [];
  return db.select({ certificate: certificates }).from(certificates)
    .leftJoin(caseFamilyMemberships, and(
      eq(caseFamilyMemberships.certificateId, certificates.id),
      eq(caseFamilyMemberships.userId, userId),
      eq(caseFamilyMemberships.status, "active"),
    ))
    .where(or(
      eq(certificates.userId, userId),
      eq(caseFamilyMemberships.userId, userId),
    )).then(rows => Array.from(new Map(rows.map(row => [row.certificate.id, row.certificate])).values()));
}

/** All case-data listings exclude members whose new safeguards are incomplete. */
export async function getFamilyAccessibleCertificates(userId: string) {
  const linked = await getFamilyLinkedCertificates(userId);
  const allowed = await Promise.all(linked.map(async certificate =>
    await canFamilyAccessCase(certificate, userId) ? certificate : null));
  return allowed.filter((certificate): certificate is typeof linked[number] => !!certificate);
}
export async function ensureOwnerMembership(certificateId: string, userId: string, invitationId?: string) {
  const [existing] = await db.select({ id: caseFamilyMemberships.id })
    .from(caseFamilyMemberships)
    .where(and(eq(caseFamilyMemberships.certificateId, certificateId), eq(caseFamilyMemberships.userId, userId)))
    .limit(1);
  if (existing) {
    await db.update(caseFamilyMemberships).set({ status: "active", role: "owner", updatedAt: new Date() })
      .where(eq(caseFamilyMemberships.id, existing.id));
    return existing.id;
  }
  const [membership] = await db.insert(caseFamilyMemberships).values({
    certificateId, userId, role: "owner", status: "active", invitationId,
  }).returning({ id: caseFamilyMemberships.id });
  return membership?.id;
}

export async function ensureMemberMembership(
  certificateId: string,
  userId: string,
  invitedBy?: string | null,
  invitationId?: string,
) {
  const [existing] = await db.select({ id: caseFamilyMemberships.id })
    .from(caseFamilyMemberships)
    .where(and(eq(caseFamilyMemberships.certificateId, certificateId), eq(caseFamilyMemberships.userId, userId)))
    .limit(1);
  if (existing) {
    await db.update(caseFamilyMemberships).set({
      status: "active", role: "member", invitedBy: invitedBy || undefined,
      invitationId, updatedAt: new Date(),
    }).where(eq(caseFamilyMemberships.id, existing.id));
    return existing.id;
  }
  const [membership] = await db.insert(caseFamilyMemberships).values({
    certificateId, userId, role: "member", status: "active", invitedBy: invitedBy || null, invitationId,
  }).returning({ id: caseFamilyMemberships.id });
  return membership?.id;
}

/** Atomically consumes invitation proof and grants exactly one case membership. */
export async function acceptFamilyInvitation(input: {
  invitationId: string; challengeId: string; userId: string;
}) {
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(familyInvitations)
      .where(and(eq(familyInvitations.id, input.invitationId), eq(familyInvitations.status, "pending"))).for("update");
    if (!invite || invite.expiresAt < new Date()) throw new Error("INVITATION_INVALID");
    const [user] = await tx.select({ id: users.id, email: users.email, role: users.role }).from(users)
      .where(eq(users.id, input.userId)).limit(1);
    if (!user || !user.email || user.email.toLowerCase() !== invite.email.toLowerCase()) throw new Error("INVITATION_IDENTITY_MISMATCH");
    if (user.role !== "user") throw new Error("FAMILY_ACCOUNT_REQUIRED");
    const [challenge] = await tx.update(familyInvitationChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(familyInvitationChallenges.id, input.challengeId), eq(familyInvitationChallenges.invitationId, input.invitationId), eq(familyInvitationChallenges.userId, input.userId), isNull(familyInvitationChallenges.consumedAt)))
      .returning();
    if (!challenge) throw new Error("CHALLENGE_CONSUMED");
    await tx.update(users).set({ emailVerified: true, emailVerificationCode: null, emailVerificationExpiry: null })
      .where(eq(users.id, input.userId));
    const [cert] = await tx.select().from(certificates).where(eq(certificates.id, invite.certificateId)).for("update");
    if (!cert) throw new Error("CASE_NOT_FOUND");
    const role = cert.userId ? "member" : "owner";
    if (!cert.userId) await tx.update(certificates).set({ userId: input.userId }).where(and(eq(certificates.id, cert.id), isNull(certificates.userId)));
    const [membership] = await tx.insert(caseFamilyMemberships).values({
      certificateId: cert.id, userId: input.userId, role, status: "active",
      invitedBy: invite.sentBy, invitationId: invite.id,
    }).onConflictDoUpdate({ target: [caseFamilyMemberships.certificateId, caseFamilyMemberships.userId], set: {
      status: "active", invitationId: invite.id, invitedBy: invite.sentBy, updatedAt: new Date(),
    } }).returning();
    // Re-invitation never revives old consent or representative authority.
    if (membership) await tx.update(caseFamilyAuthorizations).set({ revokedAt: new Date() })
      .where(and(eq(caseFamilyAuthorizations.membershipId, membership.id), isNull(caseFamilyAuthorizations.revokedAt)));
    // Carry this invitation's freshly signed consent into the member's
    // checklist, never a grant from a previous invitation or previous owner.
    if (membership && role === "member" && cert.userId === invite.sharingAuthorizedBy &&
      invite.sharingOwnerSignature && invite.sharingSignedAt &&
      invite.sharingAgreementVersion === FAMILY_SHARING_VERSION &&
      invite.sharingAgreementText === FAMILY_SHARING_TEXT &&
      (invite.sharingScope === "helper" || invite.sharingScope === "representative")) {
      await tx.insert(caseFamilyAuthorizations).values({
        membershipId: membership.id, authorizedBy: invite.sharingAuthorizedBy,
        ownerSignature: invite.sharingOwnerSignature, signedAt: invite.sharingSignedAt,
        agreementVersion: invite.sharingAgreementVersion, agreementText: invite.sharingAgreementText,
        scope: invite.sharingScope, reviewStatus: invite.sharingScope === "representative" ? "pending" : "not_requested",
      });
    }
    await tx.update(familyInvitations).set({ status: "accepted", acceptedAt: new Date() })
      .where(and(eq(familyInvitations.id, invite.id), eq(familyInvitations.status, "pending")));
    return { invitation: invite, membership };
  });
}