import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { householdMembers, households, orsaRosterAudits, orsaRosterMembers } from "@shared/schema";
import { users } from "@shared/models/auth";
import { normalizeOrsaEmail, normalizeOrsaName, type ValidOrsaRosterRow } from "@shared/orsa";
import { complimentaryOrsaLegacyIsActive } from "@shared/orsaLegacyOffer";

export type OrsaInvitationStatus =
  | "pending" | "no_email" | "sending" | "sent" | "failed" | "accepted" | "already_registered"
  | "needs_review" | "needs_attention";
const ORSA_INVITATION_LEASE_MS = 5 * 60 * 1000;

export function accountWasCreatedAfterInvitation(
  accountCreatedAt: Date | null | undefined,
  invitationFirstAttemptAt: Date | null | undefined,
): boolean {
  return Boolean(accountCreatedAt && invitationFirstAttemptAt &&
    accountCreatedAt.getTime() > invitationFirstAttemptAt.getTime());
}

export async function isActiveOrsaMember(email: string | null | undefined): Promise<boolean> {
  const normalizedEmail = normalizeOrsaEmail(email);
  if (!normalizedEmail) return false;
  const [member] = await db.select({ id: orsaRosterMembers.id })
    .from(orsaRosterMembers)
    .where(and(eq(orsaRosterMembers.normalizedEmail, normalizedEmail), eq(orsaRosterMembers.active, true)))
    .limit(1);
  return Boolean(member);
}

export type OrsaAccountMembership = {
  orsaVerified: boolean;
  membershipType: "primary" | "shared" | "sponsored" | null;
  canManageBilling: boolean;
};

/** Sponsored entitlement requires Stripe active/trialing and no unresolved failure. */
export function householdBillingIsCurrent(household: {
  stripeSubscriptionStatus: string | null;
  lastPaymentFailureAt: Date | null;
}): boolean {
  return (household.stripeSubscriptionStatus === "active" || household.stripeSubscriptionStatus === "trialing")
    && !household.lastPaymentFailureAt;
}

/** Email ownership is required before a sponsored seat can bind to an account. */
export async function accountOrsaMembership(user: { id: string; email: string | null; emailVerified: boolean | null }): Promise<OrsaAccountMembership> {
  const email = normalizeOrsaEmail(user.email);
  if (!email || user.emailVerified !== true) return { orsaVerified: false, membershipType: null, canManageBilling: false };
  const [primary] = await db.select({ id: orsaRosterMembers.id }).from(orsaRosterMembers)
    .where(and(eq(orsaRosterMembers.normalizedEmail, email), eq(orsaRosterMembers.active, true))).limit(1);
  if (primary) return { orsaVerified: true, membershipType: "primary", canManageBilling: true };
  const [shared] = await db.select({ id: orsaRosterMembers.id }).from(orsaRosterMembers)
    .where(and(eq(orsaRosterMembers.sharedEligibilityEmail, email), eq(orsaRosterMembers.active, true))).limit(1);
  if (shared) return { orsaVerified: true, membershipType: "shared", canManageBilling: false };
  const [seat] = await db.select({
    id: householdMembers.id,
    stripeSubscriptionStatus: households.stripeSubscriptionStatus,
    lastPaymentFailureAt: households.lastPaymentFailureAt,
  }).from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(and(eq(householdMembers.normalizedEmail, email), eq(householdMembers.status, "active"))).limit(1);
  if (!seat) return { orsaVerified: false, membershipType: null, canManageBilling: false };
  if (!householdBillingIsCurrent(seat)) return { orsaVerified: false, membershipType: null, canManageBilling: false };
  // Binding is deliberately lazy and only records an already email-verified account.
  await db.update(householdMembers).set({ userId: user.id }).where(eq(householdMembers.id, seat.id));
  return { orsaVerified: true, membershipType: "sponsored", canManageBilling: false };
}

export type OrsaInvitationClaim =
  | { disposition: "claimed"; id: string; email: string; displayName: string | null; leaseId: string }
  | { disposition: "not_found" | "inactive" | "no_email" | "offer_ended" | "sending" | "sent" | "accepted" | "already_registered" | "needs_review" | "needs_attention" | "awaiting_verification" };

/** Persist a send lease before making the provider call; duplicate admin clicks cannot send twice. */
export async function claimOrsaInvitation(memberId: string, now = new Date(), snapshot?: {
  email: string; retryHeld: boolean; priorAttemptedAt?: string;
}): Promise<OrsaInvitationClaim> {
  const leaseId = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + ORSA_INVITATION_LEASE_MS);
  return db.transaction(async (tx) => {
    const [member] = await tx.select().from(orsaRosterMembers)
      .where(eq(orsaRosterMembers.id, memberId)).for("update");
    if (!member) return { disposition: "not_found" as const };
    if (!member.active) return { disposition: "inactive" as const };
    if (!complimentaryOrsaLegacyIsActive(now)) return { disposition: "offer_ended" as const };
    // No-email records are stored for later contact management only. Never
    // create a lease, resolve an account, or pass an empty address to email.
    if (!member.normalizedEmail) return { disposition: "no_email" as const };
    if (snapshot) {
      if (member.normalizedEmail !== snapshot.email) return { disposition: "needs_review" as const };
      if (snapshot.retryHeld) {
        if (!["needs_review", "failed"].includes(member.invitationStatus) ||
          member.invitationAttemptedAt?.toISOString() !== snapshot.priorAttemptedAt ||
          !snapshot.priorAttemptedAt || member.invitationSentAt || member.invitationAcceptedAt) {
          return { disposition: "needs_review" as const };
        }
      } else if (!["pending", "no_email"].includes(member.invitationStatus) ||
        member.invitationAttemptedAt || member.invitationFirstAttemptAt || member.invitationSentAt) {
        return { disposition: "needs_review" as const };
      }
    }
    const matchingAccounts = await tx.select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    }).from(users).where(sql`lower(trim(${users.email})) = ${member.normalizedEmail}`);
    const existingAccount = matchingAccounts
      .filter((account) => account.emailVerified === true)
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))[0]
      ?? matchingAccounts[0];
    if (member.invitationStatus === "accepted" || member.invitationAcceptedAt) {
      return { disposition: "accepted" as const };
    }
    if (existingAccount?.emailVerified === true) {
      if (accountWasCreatedAfterInvitation(existingAccount.createdAt, member.invitationFirstAttemptAt)) {
        await tx.update(orsaRosterMembers).set({
          invitationStatus: "accepted",
          invitationAcceptedAt: member.invitationAcceptedAt ?? now,
          invitationAcceptedUserId: existingAccount.id,
          ...((member.invitationLeaseExpiresAt && member.invitationLeaseExpiresAt > now)
            ? {}
            : { invitationLeaseId: null, invitationLeaseExpiresAt: null }),
          updatedAt: now,
        }).where(eq(orsaRosterMembers.id, member.id));
        await tx.insert(orsaRosterAudits).values({
          actorUserId: existingAccount.id,
          action: "invitation_accepted",
          affectedCount: 1,
        });
        return { disposition: "accepted" as const };
      }
      await tx.update(orsaRosterMembers).set({
        invitationStatus: "already_registered",
        invitationLeaseId: null,
        invitationLeaseExpiresAt: null,
        updatedAt: now,
      }).where(eq(orsaRosterMembers.id, member.id));
      return { disposition: "already_registered" as const };
    }
    if (existingAccount) {
      if (accountWasCreatedAfterInvitation(existingAccount.createdAt, member.invitationFirstAttemptAt)) {
        if (member.invitationStatus === "sending") {
          if (member.invitationLeaseExpiresAt && member.invitationLeaseExpiresAt > now) {
            return { disposition: "sending" as const };
          }
          await tx.update(orsaRosterMembers).set({
            invitationStatus: "needs_review",
            invitationLeaseId: null,
            invitationLeaseExpiresAt: null,
            updatedAt: now,
          }).where(eq(orsaRosterMembers.id, member.id));
          return { disposition: "needs_review" as const };
        }
        if (member.invitationStatus === "sent") return { disposition: "sent" as const };
        return { disposition: "awaiting_verification" as const };
      }
      await tx.update(orsaRosterMembers).set({
        invitationStatus: "needs_attention",
        invitationLeaseId: null,
        invitationLeaseExpiresAt: null,
        updatedAt: now,
      }).where(eq(orsaRosterMembers.id, member.id));
      return { disposition: "needs_attention" as const };
    }
    if (member.invitationStatus === "sending") {
      if (member.invitationLeaseExpiresAt && member.invitationLeaseExpiresAt > now) {
        return { disposition: "sending" as const };
      }
      await tx.update(orsaRosterMembers).set({
        invitationStatus: "needs_review",
        invitationLeaseId: null,
        invitationLeaseExpiresAt: null,
        updatedAt: now,
      }).where(eq(orsaRosterMembers.id, member.id));
      return { disposition: "needs_review" as const };
    }
    if (member.invitationStatus === "sent" || member.invitationSentAt) {
      return { disposition: "sent" as const };
    }
    await tx.update(orsaRosterMembers).set({
      invitationStatus: "sending",
      invitationFirstAttemptAt: member.invitationFirstAttemptAt ?? now,
      invitationAttemptedAt: new Date(Math.max(now.getTime(), (member.invitationAttemptedAt?.getTime() ?? 0) + 1)),
      invitationLeaseId: leaseId,
      invitationLeaseExpiresAt: leaseExpiresAt,
      updatedAt: now,
    }).where(eq(orsaRosterMembers.id, member.id));
    return {
      disposition: "claimed" as const,
      id: member.id,
      email: member.normalizedEmail,
      displayName: member.displayName,
      leaseId,
    };
  });
}

export async function finishOrsaInvitation(
  id: string,
  leaseId: string,
  sent: boolean,
  actorUserId: string,
  now = new Date(),
): Promise<{ recorded: boolean; invitationStatus?: OrsaInvitationStatus; invitationSentAt?: Date | null }> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(orsaRosterMembers)
      .where(and(
        eq(orsaRosterMembers.id, id),
        eq(orsaRosterMembers.invitationLeaseId, leaseId),
      )).for("update");
    if (!current || !["sending", "accepted"].includes(current.invitationStatus)) {
      return { recorded: false as const };
    }
    const invitationStatus = current.invitationAcceptedAt || current.invitationStatus === "accepted"
      ? "accepted"
      : sent ? "sent" : "needs_review";
    const invitationSentAt = sent ? current.invitationSentAt ?? now : current.invitationSentAt;
    const [updated] = await tx.update(orsaRosterMembers).set({
      invitationStatus,
      invitationSentAt,
      invitationLeaseId: null,
      invitationLeaseExpiresAt: null,
      updatedAt: now,
    }).where(and(
      eq(orsaRosterMembers.id, id),
      eq(orsaRosterMembers.invitationLeaseId, leaseId),
      inArray(orsaRosterMembers.invitationStatus, ["sending", "accepted"]),
    )).returning({ id: orsaRosterMembers.id });
    if (!updated) return { recorded: false as const };
    await tx.insert(orsaRosterAudits).values({
      actorUserId,
      action: sent ? "invitation_sent" : "invitation_needs_review",
      affectedCount: 1,
    });
    return { recorded: true as const, invitationStatus, invitationSentAt };
  });
}

/** Verify the account email and record invitation acceptance atomically. */
export async function verifyEmailAndAcceptOrsaInvitation(
  userId: string,
  email: string,
  now = new Date(),
): Promise<void> {
  const normalizedEmail = normalizeOrsaEmail(email);
  await db.transaction(async (tx) => {
    await tx.update(users).set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
      updatedAt: now,
    }).where(eq(users.id, userId));
    if (!normalizedEmail) return;
    const [updatedUser] = await tx.select({
      email: users.email,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, userId));
    if (!updatedUser || normalizeOrsaEmail(updatedUser.email) !== normalizedEmail) return;
    const [member] = await tx.select().from(orsaRosterMembers)
      .where(eq(orsaRosterMembers.normalizedEmail, normalizedEmail)).for("update");
    if (!member || !accountWasCreatedAfterInvitation(updatedUser.createdAt, member.invitationFirstAttemptAt)) return;
    if (!["pending", "sending", "sent", "needs_review", "needs_attention"].includes(member.invitationStatus)) return;
    const [updated] = await tx.update(orsaRosterMembers).set({
      invitationStatus: "accepted",
      invitationAcceptedAt: now,
      invitationAcceptedUserId: userId,
      updatedAt: now,
    }).where(and(
      eq(orsaRosterMembers.id, member.id),
      inArray(orsaRosterMembers.invitationStatus, ["pending", "sending", "sent", "needs_review", "needs_attention"]),
    )).returning({ id: orsaRosterMembers.id });
    if (updated) await tx.insert(orsaRosterAudits).values({
      actorUserId: userId,
      action: "invitation_accepted",
      affectedCount: 1,
    });
  });
}

/** Reconcile admin-visible states against verified/unverified account records. */
export async function reconcileOrsaRosterInvitationStates(now = new Date()): Promise<Array<{
  member: typeof orsaRosterMembers.$inferSelect;
  invitationStatus: OrsaInvitationStatus;
  existingVerifiedAccount: boolean;
}>> {
  const roster = await db.select().from(orsaRosterMembers).orderBy(orsaRosterMembers.normalizedEmail);
  const accounts = new Map<string, { id: string; emailVerified: boolean | null; createdAt: Date | null }>();
  const chunkSize = 400;
  const emailedRoster = roster.filter((member) => member.normalizedEmail !== null);
  for (let offset = 0; offset < emailedRoster.length; offset += chunkSize) {
    const emails = emailedRoster.slice(offset, offset + chunkSize)
      .map((member) => member.normalizedEmail)
      .filter((email): email is string => email !== null);
    const chunk = await db.select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    }).from(users).where(inArray(sql<string>`lower(trim(${users.email}))`, emails));
    for (const account of chunk) {
      if (!account.email) continue;
      const normalizedEmail = account.email.trim().toLowerCase();
      const current = accounts.get(normalizedEmail);
      const accountShouldWin = !current ||
        (account.emailVerified === true && current.emailVerified !== true) ||
        (account.emailVerified === current.emailVerified &&
          (account.createdAt?.getTime() ?? 0) < (current.createdAt?.getTime() ?? 0));
      if (accountShouldWin) accounts.set(normalizedEmail, account);
    }
  }

  const result: Array<{
    member: typeof orsaRosterMembers.$inferSelect;
    invitationStatus: OrsaInvitationStatus;
    existingVerifiedAccount: boolean;
  }> = [];
  for (const original of roster) {
    if (!original.normalizedEmail) {
      result.push({ member: original, invitationStatus: "no_email", existingVerifiedAccount: false });
      continue;
    }
    const account = accounts.get(original.normalizedEmail);
    const existingVerifiedAccount = account?.emailVerified === true;
    const staleSending = original.invitationStatus === "sending" &&
      (!original.invitationLeaseExpiresAt || original.invitationLeaseExpiresAt <= now);
    const shouldReconcile = !original.invitationAcceptedAt &&
      original.invitationStatus !== "accepted" &&
      (existingVerifiedAccount
        ? original.invitationStatus !== "already_registered" || Boolean(original.invitationLeaseId)
        : account
          ? original.invitationStatus !== "needs_attention" || Boolean(original.invitationLeaseId)
          : staleSending || original.invitationStatus === "failed");
    if (!shouldReconcile) {
      const invitationStatus = ["already_registered", "needs_attention"].includes(original.invitationStatus) && !account
        ? "pending"
        : original.invitationStatus === "failed"
          ? "needs_review"
          : original.invitationStatus as OrsaInvitationStatus;
      result.push({ member: original, invitationStatus, existingVerifiedAccount });
      continue;
    }
    const reconciled = await db.transaction(async (tx) => {
      const [member] = await tx.select().from(orsaRosterMembers)
        .where(eq(orsaRosterMembers.id, original.id)).for("update");
      if (!member) return null;
      const existingVerifiedAccount = account?.emailVerified === true;
      if (member.invitationAcceptedAt || member.invitationStatus === "accepted") {
        return { member, invitationStatus: "accepted" as const, existingVerifiedAccount };
      }
      if (existingVerifiedAccount) {
        if (accountWasCreatedAfterInvitation(account.createdAt, member.invitationFirstAttemptAt) &&
            ["pending", "sending", "sent", "needs_review", "needs_attention", "failed"].includes(member.invitationStatus)) {
          const activeLease = member.invitationStatus === "sending" &&
            member.invitationLeaseExpiresAt && member.invitationLeaseExpiresAt > now;
          const [updated] = await tx.update(orsaRosterMembers).set({
            invitationStatus: "accepted",
            invitationAcceptedAt: now,
            invitationAcceptedUserId: account.id,
            ...(!activeLease ? { invitationLeaseId: null, invitationLeaseExpiresAt: null } : {}),
            updatedAt: now,
          }).where(and(
            eq(orsaRosterMembers.id, member.id),
            eq(orsaRosterMembers.invitationStatus, member.invitationStatus),
          )).returning();
          return updated
            ? { member: updated, invitationStatus: "accepted" as const, existingVerifiedAccount }
            : { member, invitationStatus: member.invitationStatus as OrsaInvitationStatus, existingVerifiedAccount };
        }
        const [updated] = await tx.update(orsaRosterMembers).set({
          invitationStatus: "already_registered",
          invitationLeaseId: null,
          invitationLeaseExpiresAt: null,
          updatedAt: now,
        }).where(and(
          eq(orsaRosterMembers.id, member.id),
          eq(orsaRosterMembers.invitationStatus, member.invitationStatus),
        )).returning();
        return {
          member: updated ?? member,
          invitationStatus: "already_registered" as const,
          existingVerifiedAccount,
        };
      }
      if (account) {
        if (accountWasCreatedAfterInvitation(account.createdAt, member.invitationFirstAttemptAt) &&
            ["pending", "sending", "sent", "needs_review"].includes(member.invitationStatus)) {
          if (member.invitationStatus === "sending" &&
              (!member.invitationLeaseExpiresAt || member.invitationLeaseExpiresAt <= now)) {
            const [updated] = await tx.update(orsaRosterMembers).set({
              invitationStatus: "needs_review",
              invitationLeaseId: null,
              invitationLeaseExpiresAt: null,
              updatedAt: now,
            }).where(and(
              eq(orsaRosterMembers.id, member.id),
              eq(orsaRosterMembers.invitationStatus, "sending"),
              member.invitationLeaseId
                ? eq(orsaRosterMembers.invitationLeaseId, member.invitationLeaseId)
                : sql`${orsaRosterMembers.invitationLeaseId} is null`,
            )).returning();
            return {
              member: updated ?? member,
              invitationStatus: updated ? "needs_review" as const : member.invitationStatus as OrsaInvitationStatus,
              existingVerifiedAccount,
            };
          }
          return { member, invitationStatus: member.invitationStatus as OrsaInvitationStatus, existingVerifiedAccount };
        }
        const [updated] = await tx.update(orsaRosterMembers).set({
          invitationStatus: "needs_attention",
          invitationLeaseId: null,
          invitationLeaseExpiresAt: null,
          updatedAt: now,
        }).where(and(
          eq(orsaRosterMembers.id, member.id),
          eq(orsaRosterMembers.invitationStatus, member.invitationStatus),
        )).returning();
        return {
          member: updated ?? member,
          invitationStatus: "needs_attention" as const,
          existingVerifiedAccount,
        };
      }
      if (member.invitationStatus === "sending" &&
          (!member.invitationLeaseExpiresAt || member.invitationLeaseExpiresAt <= now)) {
        const [updated] = await tx.update(orsaRosterMembers).set({
          invitationStatus: "needs_review",
          invitationLeaseId: null,
          invitationLeaseExpiresAt: null,
          updatedAt: now,
        }).where(and(
          eq(orsaRosterMembers.id, member.id),
          eq(orsaRosterMembers.invitationStatus, "sending"),
          member.invitationLeaseId
            ? eq(orsaRosterMembers.invitationLeaseId, member.invitationLeaseId)
            : sql`${orsaRosterMembers.invitationLeaseId} is null`,
        )).returning();
        return {
          member: updated ?? member,
          invitationStatus: updated ? "needs_review" as const : member.invitationStatus as OrsaInvitationStatus,
          existingVerifiedAccount,
        };
      }
      if (member.invitationStatus === "failed") {
        const [updated] = await tx.update(orsaRosterMembers).set({
          invitationStatus: "needs_review",
          updatedAt: now,
        }).where(and(
          eq(orsaRosterMembers.id, member.id),
          eq(orsaRosterMembers.invitationStatus, "failed"),
        )).returning();
        return {
          member: updated ?? member,
          invitationStatus: updated ? "needs_review" as const : "failed" as const,
          existingVerifiedAccount,
        };
      }
      const allowed = ["pending", "sending", "sent", "needs_review", "needs_attention", "already_registered"];
      return {
        member,
        invitationStatus: allowed.includes(member.invitationStatus)
          ? member.invitationStatus as OrsaInvitationStatus
          : "pending" as const,
        existingVerifiedAccount,
      };
    });
    if (reconciled) result.push(reconciled);
  }
  return result;
}

export async function activeOrsaEmails(): Promise<Set<string>> {
  const rows = await db.select({ email: orsaRosterMembers.normalizedEmail })
    .from(orsaRosterMembers).where(and(eq(orsaRosterMembers.active, true), sql`${orsaRosterMembers.normalizedEmail} is not null`));
  return new Set(rows.map((row) => row.email).filter((email): email is string => email !== null));
}

function rosterIdentityMatches(member: typeof orsaRosterMembers.$inferSelect, row: ValidOrsaRosterRow): boolean {
  return Boolean(
    (row.externalMemberId && member.externalMemberId === row.externalMemberId) ||
    (row.normalizedEmail && member.normalizedEmail === row.normalizedEmail) ||
    (row.contactKey && member.contactKey === row.contactKey)
  );
}

function matchingRosterMember(members: Array<typeof orsaRosterMembers.$inferSelect>, row: ValidOrsaRosterRow) {
  const matches = members.filter((member) => rosterIdentityMatches(member, row));
  if (matches.length > 1) {
    throw new Error("Roster row identifiers match multiple existing records; resolve the conflicting member IDs before importing.");
  }
  const match = matches[0];
  if (match && row.normalizedEmail !== match.normalizedEmail && match.normalizedEmail) {
    throw new Error("A member's existing email differs from this import; review the identity change before updating the roster.");
  }
  if (match && row.externalMemberId && match.externalMemberId && row.externalMemberId !== match.externalMemberId) {
    throw new Error("A member's external ID conflicts with this import; resolve the member identity before updating the roster.");
  }
  if (match && !match.normalizedEmail && row.normalizedEmail &&
    (match.invitationStatus !== "pending" || match.invitationFirstAttemptAt ||
      match.invitationAttemptedAt || match.invitationSentAt || match.invitationAcceptedAt ||
      match.invitationLeaseId)) {
    throw new Error("This member has earlier invitation history; review it before adding an email address.");
  }
  // A number without a name can be imported for SMS, but must not silently
  // merge with or coexist ambiguously beside another member using that number.
  // Even a named phone-only row cannot acquire email/ID ownership by matching
  // the same phone; changing identity still requires explicit review.
  if (row.normalizedPhone &&
    members.some((member) => member.id !== match?.id &&
      member.normalizedPhone === row.normalizedPhone &&
      ((!row.normalizedEmail && !row.externalMemberId && !row.displayName) ||
        (!member.normalizedEmail && !member.externalMemberId && !member.displayName) ||
        (Boolean(member.contactKey) || Boolean(row.contactKey)) &&
          row.displayName && normalizeOrsaName(member.displayName) === normalizeOrsaName(row.displayName)))) {
    throw new Error("Phone number matches another roster record; review the member identity before importing.");
  }
  return match;
}

async function assertSharedEmailsUnclaimed(
  existing: Array<typeof orsaRosterMembers.$inferSelect>,
  sharedEmails: readonly string[],
  allowUnclaimedConversion: boolean,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  const shared = new Set(sharedEmails);
  for (const claimed of existing.filter((member) => member.active && member.normalizedEmail && shared.has(member.normalizedEmail))) {
    // A fresh, anonymous contact-only roster row may be replaced with an
    // explicitly reviewed shared-eligibility group. Never detach an identified
    // owner, an invitation, or a registered account without separate review.
    if (allowUnclaimedConversion && !claimed.displayName && !claimed.invitationFirstAttemptAt &&
      !claimed.invitationAttemptedAt && !claimed.invitationSentAt && !claimed.invitationAcceptedAt &&
      claimed.invitationStatus === "pending" && !claimed.invitationLeaseId) {
      const [account] = await tx.select({ id: users.id }).from(users)
        .where(sql`lower(trim(${users.email})) = ${claimed.normalizedEmail}`).limit(1);
      if (!account) continue;
    }
    throw new Error(`A shared contact email is already assigned to an active roster member: ${claimed.normalizedEmail} (${claimed.displayName || "name unavailable"}). Review existing ownership or invitation history before changing how this address is used.`);
  }
}

type OrsaRosterTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const ROSTER_BATCH_SIZE = 250;

async function saveRosterBatch(
  tx: OrsaRosterTransaction,
  values: Array<typeof orsaRosterMembers.$inferInsert>,
  historicalKeysOnly = false,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += ROSTER_BATCH_SIZE) {
    await tx.insert(orsaRosterMembers).values(values.slice(offset, offset + ROSTER_BATCH_SIZE))
      .onConflictDoUpdate({
        target: orsaRosterMembers.id,
        set: historicalKeysOnly ? {
          normalizedEmail: sql`excluded.normalized_email`,
          externalMemberId: sql`excluded.external_member_id`,
          contactKey: sql`excluded.contact_key`,
        } : {
          normalizedEmail: sql`excluded.normalized_email`,
          sharedEligibilityEmail: sql`excluded.shared_eligibility_email`,
          normalizedPhone: sql`excluded.normalized_phone`,
          externalMemberId: sql`excluded.external_member_id`,
          contactKey: sql`excluded.contact_key`,
          displayName: sql`excluded.display_name`,
          active: sql`excluded.active`,
          updatedAt: sql`excluded.updated_at`,
          deactivatedAt: sql`excluded.deactivated_at`,
        },
      });
  }
}

/** Validation must happen before this call.  The transaction prevents a partial replacement. */
export async function replaceOrsaRoster(rows: ValidOrsaRosterRow[], actorUserId: string, sharedEmails: readonly string[] = []): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(orsaRosterMembers).for("update");
    const eligibilityEmails = new Set(rows.flatMap((row) => row.sharedEligibilityEmail ? [row.sharedEligibilityEmail] : []));
    await assertSharedEmailsUnclaimed(existing, sharedEmails, sharedEmails.every((email) => eligibilityEmails.has(email)), tx);
    // Resolve the incoming identities against the pre-import snapshot before
    // temporarily clearing unique values to allow safe identifier reassignment.
    const assignments = rows.map((row) => matchingRosterMember(existing, row));
    const assignedIds = assignments.filter((member) => member !== undefined).map((member) => member!.id);
    if (new Set(assignedIds).size !== assignedIds.length) {
      throw new Error("Multiple imported rows resolve to the same existing roster member.");
    }
    const claimedEmails = new Set([...sharedEmails, ...rows.flatMap((row) => row.normalizedEmail ? [row.normalizedEmail] : [])]);
    const claimedExternalIds = new Set(rows.flatMap((row) => row.externalMemberId ? [row.externalMemberId] : []));
    const claimedContactKeys = new Set(rows.flatMap((row) => row.contactKey ? [row.contactKey] : []));

    // Keep every historical row and invitation field. Staging nullable unique
    // keys permits imports that reassign identifiers between existing people.
    await tx.update(orsaRosterMembers).set({
      active: false, normalizedEmail: null, sharedEligibilityEmail: null, externalMemberId: null, contactKey: null,
      deactivatedAt: new Date(), updatedAt: new Date(),
    });
    const assignedIdSet = new Set(assignedIds);
    await saveRosterBatch(tx, existing.filter((member) => !assignedIdSet.has(member.id)).map((member) => ({
        id: member.id,
        active: false,
        normalizedEmail: member.normalizedEmail && !claimedEmails.has(member.normalizedEmail) ? member.normalizedEmail : null,
        externalMemberId: member.externalMemberId && !claimedExternalIds.has(member.externalMemberId) ? member.externalMemberId : null,
        contactKey: member.contactKey && !claimedContactKeys.has(member.contactKey) ? member.contactKey : null,
      })), true);
    const writeValues = rows.map((row, index) => {
      const match = assignments[index];
      return {
        id: match?.id ?? randomUUID(),
        normalizedEmail: row.normalizedEmail,
        sharedEligibilityEmail: row.sharedEligibilityEmail ?? null,
        normalizedPhone: row.normalizedPhone,
        externalMemberId: row.externalMemberId ?? match?.externalMemberId ?? null,
        contactKey: row.contactKey,
        displayName: row.displayName,
        active: row.active,
        updatedAt: new Date(),
        deactivatedAt: row.active ? null : new Date(),
      };
    });
    await saveRosterBatch(tx, writeValues);
    await tx.insert(orsaRosterAudits).values({ actorUserId, action: "replace", affectedCount: rows.length });
  });
}

export async function upsertOrsaRoster(rows: ValidOrsaRosterRow[], actorUserId: string, sharedEmails: readonly string[] = []): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(orsaRosterMembers).for("update");
    await assertSharedEmailsUnclaimed(existing, sharedEmails, false, tx);
    if (rows.some((row) => row.active && row.normalizedEmail &&
      existing.some((member) => member.active && member.sharedEligibilityEmail === row.normalizedEmail))) {
      throw new Error("An email is already used for shared eligibility; replace or review the existing group before assigning it to one member.");
    }
    const usedIds = new Set<string>();
    const writeValues = rows.map((row) => {
      const match = matchingRosterMember(existing, row);
      if (match && usedIds.has(match.id)) {
        throw new Error("Multiple imported rows resolve to the same existing roster member.");
      }
      if (match) usedIds.add(match.id);
      return {
        id: match?.id ?? randomUUID(),
        normalizedEmail: row.normalizedEmail,
        sharedEligibilityEmail: row.sharedEligibilityEmail ?? null,
        normalizedPhone: row.normalizedPhone,
        externalMemberId: row.externalMemberId ?? match?.externalMemberId ?? null,
        contactKey: row.contactKey,
        displayName: row.displayName,
        active: row.active,
        updatedAt: new Date(),
        deactivatedAt: row.active ? null : new Date(),
      };
    });
    await saveRosterBatch(tx, writeValues);
    await tx.insert(orsaRosterAudits).values({ actorUserId, action: "upsert", affectedCount: rows.length });
  });
}

export async function setOrsaMemberActive(memberIdOrEmail: string, active: boolean, actorUserId: string): Promise<boolean> {
  const normalizedEmail = normalizeOrsaEmail(memberIdOrEmail);
  const [byId] = await db.select({ id: orsaRosterMembers.id })
    .from(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberIdOrEmail)).limit(1);
  let byEmail: { id: string } | undefined;
  if (!byId && normalizedEmail) {
    [byEmail] = await db.select({ id: orsaRosterMembers.id })
      .from(orsaRosterMembers).where(eq(orsaRosterMembers.normalizedEmail, normalizedEmail)).limit(1);
  }
  const memberId = byId?.id ?? byEmail?.id;
  if (!memberId) return false;
  const [updated] = await db.update(orsaRosterMembers).set({
    active, updatedAt: new Date(), deactivatedAt: active ? null : new Date(),
  }).where(eq(orsaRosterMembers.id, memberId)).returning({ id: orsaRosterMembers.id });
  if (updated) await db.insert(orsaRosterAudits).values({ actorUserId, action: "active_changed", affectedCount: 1 });
  return Boolean(updated);
}