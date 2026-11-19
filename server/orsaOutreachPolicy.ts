import type { OutreachGroup, OutreachMember, OutreachChannelState } from "@shared/orsaOutreach";
import { normalizeOrsaPhone } from "@shared/orsa";

type Time = Date | string | null;
export type OutreachRosterRecord = {
  id: string; displayName: string | null; normalizedEmail: string | null; normalizedPhone: string | null;
  sharedEligibilityEmail: string | null; active: boolean; invitationStatus: string;
  invitationFirstAttemptAt: Time; invitationAttemptedAt: Time; invitationSentAt: Time;
  invitationAcceptedAt: Time; invitationAcceptedUserId: string | null;
};
export type OutreachEmailRecord = {
  memberId: string; normalizedEmail: string; status: string; attemptedAt: Time; sentAt: Time;
};
export type OutreachSmsRecord = {
  phone: string; status: string; optedOutAt: Time; attemptedAt: Time; submittedAt: Time; deliveryStatus: string | null;
  providerMessageId?: string | null;
};
export const outreachEmail = (value: string | null) => value?.trim().toLowerCase() || null;
export function outreachPhone(value: string | null) {
  const digits = normalizeOrsaPhone(value);
  return digits ? (digits.length === 10 ? `+1${digits}` : `+${digits}`) : null;
}
export function invitationWasAttempted(member: OutreachRosterRecord) {
  return !!(member.invitationFirstAttemptAt || member.invitationAttemptedAt || member.invitationSentAt ||
    ["sending", "sent", "failed", "needs_review", "needs_attention", "awaiting_verification", "accepted"].includes(member.invitationStatus));
}
const latest = (values: Time[]) => values.filter((value): value is Date | string => !!value)
  .map(value => new Date(value).toISOString()).sort().at(-1) || null;

/** Durable claims count as attempts, not as proof of handset or inbox delivery. */
export function buildOutreachMembers(input: {
  roster: OutreachRosterRecord[];
  emailDeliveries: OutreachEmailRecord[];
  emailOptOuts: Set<string>;
  sms: OutreachSmsRecord[];
  smsStops: Set<string | null>;
  accountEmails: Set<string>;
}): OutreachMember[] {
  const emailCounts = new Map<string, number>(), phoneCounts = new Map<string, number>();
  const sharedEmails = new Set(input.roster.map(row => outreachEmail(row.sharedEligibilityEmail)).filter(Boolean));
  const deliveriesByMember = new Map<string, OutreachEmailRecord[]>(), deliveriesByEmail = new Map<string, OutreachEmailRecord[]>();
  const invitationByEmail = new Map<string, OutreachRosterRecord[]>();
  for (const member of input.roster) {
    const email = outreachEmail(member.normalizedEmail), phone = outreachPhone(member.normalizedPhone);
    if (email) {
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
      if (invitationWasAttempted(member)) invitationByEmail.set(email, [...(invitationByEmail.get(email) || []), member]);
    }
    if (member.active && phone) phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
  }
  for (const delivery of input.emailDeliveries) {
    deliveriesByMember.set(delivery.memberId, [...(deliveriesByMember.get(delivery.memberId) || []), delivery]);
    const email = outreachEmail(delivery.normalizedEmail)!;
    deliveriesByEmail.set(email, [...(deliveriesByEmail.get(email) || []), delivery]);
  }
  const smsByPhone = new Map(input.sms.map(record => [outreachPhone(record.phone), record]));
  return input.roster.filter(member => member.active).map(member => {
    const email = outreachEmail(member.normalizedEmail), phone = outreachPhone(member.normalizedPhone);
    const deliveries = Array.from(new Set([...(deliveriesByMember.get(member.id) || []), ...(email ? deliveriesByEmail.get(email) || [] : [])]));
    const invitations = Array.from(new Set([...(invitationWasAttempted(member) ? [member] : []), ...(email ? invitationByEmail.get(email) || [] : [])]));
    const sms = phone ? smsByPhone.get(phone) : undefined;
    const smsAttempted = !!sms && (!!sms.attemptedAt || !!sms.submittedAt || !!sms.providerMessageId ||
      !["not_sent", "opted_out"].includes(sms.status));
    const emailAttempted = deliveries.length > 0 || invitations.length > 0;
    const signedUp = !!member.invitationAcceptedAt || !!member.invitationAcceptedUserId || !!email && input.accountEmails.has(email);
    let emailState: OutreachChannelState = "not_contacted";
    if (emailAttempted) emailState = "needs_review";
    if (deliveries.some(row => row.status === "sent") || invitations.some(row => row.invitationSentAt))
      emailState = "submitted";
    if (deliveries.some(row => ["sending", "needs_review"].includes(row.status)) ||
      invitations.some(row => ["sending", "failed", "needs_review", "needs_attention"].includes(row.invitationStatus)))
      emailState = "needs_review";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emailState = "missing_contact";
    else if ((emailCounts.get(email) || 0) > 1 || sharedEmails.has(email)) emailState = "shared_contact";
    if (email && input.emailOptOuts.has(email)) emailState = "opted_out";
    let smsState: OutreachChannelState = "not_contacted";
    const deliveryStatus = sms?.deliveryStatus?.toLowerCase();
    if (smsAttempted) smsState = deliveryStatus === "delivered" ? "delivered"
      : ["failed", "sendingfailed", "deliveryfailed", "undeliverable"].includes(deliveryStatus || "") ? "failed"
      : sms?.status === "submitted" || sms?.submittedAt ? "submitted" : "needs_review";
    if (!phone) smsState = "missing_contact";
    else if ((phoneCounts.get(phone) || 0) > 1) smsState = "shared_contact";
    if (sms?.optedOutAt || sms?.status === "opted_out" || phone && input.smsStops.has(phone)) smsState = "opted_out";
    return {
      id: member.id, displayName: member.displayName, email: email || member.sharedEligibilityEmail, phone, active: member.active,
      emailState, smsState, emailAttempted, smsAttempted, signedUp,
      emailLastAttemptAt: latest([...deliveries.flatMap(row => [row.attemptedAt, row.sentAt]), ...invitations.flatMap(row => [row.invitationAttemptedAt, row.invitationFirstAttemptAt, row.invitationSentAt])]),
      smsLastAttemptAt: latest([sms?.attemptedAt || null, sms?.submittedAt || null]),
      canEmail: emailState === "not_contacted" && !signedUp,
      canText: smsState === "not_contacted" && !signedUp && !!member.displayName?.trim(),
    };
  });
}

export function inOutreachGroup(member: OutreachMember, group: OutreachGroup) {
  switch (group) {
    case "emailed": return member.emailAttempted;
    case "texted": return member.smsAttempted;
    case "both_contacted": return member.emailAttempted && member.smsAttempted;
    case "email_only": return member.emailAttempted && !member.smsAttempted;
    case "sms_only": return !member.emailAttempted && member.smsAttempted;
    case "not_emailed": return !member.emailAttempted;
    case "not_texted": return !member.smsAttempted;
    case "no_outreach": return !member.emailAttempted && !member.smsAttempted;
    case "email_opted_out": return member.emailState === "opted_out";
    case "sms_opted_out": return member.smsState === "opted_out";
    case "opted_out": return member.emailState === "opted_out" || member.smsState === "opted_out";
    case "needs_review": return member.emailState === "needs_review" || ["submitted", "needs_review", "failed"].includes(member.smsState);
    default: return true;
  }
}
