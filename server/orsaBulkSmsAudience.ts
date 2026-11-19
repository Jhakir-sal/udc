import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { orsaRosterMembers, orsaSmsCampaign, smsMessages, users } from "@shared/schema";
import { campaignPhone, isSmsStop } from "./orsaSmsCampaign";
import { bulkSmsExclusion } from "./orsaBulkSmsPolicy";
import type { BulkSmsCandidate } from "@shared/orsaBulkSms";

export async function stoppedSmsPhones() {
  const rows = await db.select({ phone: smsMessages.phoneNumber, body: smsMessages.body }).from(smsMessages).where(and(
    eq(smsMessages.direction, "inbound"),
    sql`lower(trim(${smsMessages.body})) ~ '^(stop|stopall|unsubscribe|cancel|end|quit)[[:space:]]*[.!]?[[:space:]]*$'`,
  ));
  return new Set(rows.filter(row => isSmsStop(row.body)).map(row => campaignPhone(row.phone)));
}

export async function bulkSmsAudience(): Promise<BulkSmsCandidate[]> {
  const [members, states, stops, accounts] = await Promise.all([
    db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.active, true)),
    db.select().from(orsaSmsCampaign), stoppedSmsPhones(),
    db.select({ email: users.email }).from(users).where(eq(users.emailVerified, true)),
  ]);
  const existingAccounts = new Set(accounts.map(account => account.email?.trim().toLowerCase()).filter(Boolean));
  const byPhone = new Map(states.map(state => [state.phone, state]));
  const counts = new Map<string, number>();
  members.forEach(member => {
    const phone = campaignPhone(member.normalizedPhone);
    if (phone) counts.set(phone, (counts.get(phone) || 0) + 1);
  });
  return members.map(member => {
    const phone = campaignPhone(member.normalizedPhone);
    const state = phone ? byPhone.get(phone) : undefined;
    const reason = bulkSmsExclusion({
      active: member.active, name: member.displayName, phone, shared: !!phone && (counts.get(phone) || 0) > 1,
      stopped: !!state?.optedOutAt || stops.has(phone),
      attempted: !!state && state.status !== "not_sent",
      signedUp: !!member.invitationAcceptedAt || !!member.invitationAcceptedUserId ||
        !!member.normalizedEmail && existingAccounts.has(member.normalizedEmail),
    });
    return {
      id: member.id, displayName: member.displayName, phone, eligible: !reason, reason,
      consentRecorded: !!state?.consentRecordedAt && !!state.consentEvidence && state.memberId === member.id,
    };
  });
}

export async function freshBulkSmsMember(memberId: string, reviewedPhone: string) {
  const [member] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
  if (!member || campaignPhone(member.normalizedPhone) !== reviewedPhone) return { reason: "Roster phone changed or member removed", member };
  const digits = reviewedPhone.slice(1);
  const variants = [digits, digits.slice(1), reviewedPhone];
  const [matching, accounts, stops] = await Promise.all([
    db.select({ id: orsaRosterMembers.id }).from(orsaRosterMembers).where(and(
      eq(orsaRosterMembers.active, true), inArray(orsaRosterMembers.normalizedPhone, variants),
    )),
    member.normalizedEmail ? db.select({ id: users.id }).from(users).where(and(
      sql`lower(${users.email}) = ${member.normalizedEmail}`, eq(users.emailVerified, true),
    )).limit(1) : [],
    stoppedSmsPhones(),
  ]);
  const reason = bulkSmsExclusion({
    active: member.active, name: member.displayName, phone: reviewedPhone, shared: matching.length !== 1,
    stopped: stops.has(reviewedPhone), attempted: false,
    signedUp: !!member.invitationAcceptedAt || !!member.invitationAcceptedUserId || accounts.length > 0,
  });
  return { reason, member };
}
