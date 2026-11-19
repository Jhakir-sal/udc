import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { orsaRosterMembers, orsaSmsCampaign, orsaRosterAudits, smsMessages } from "@shared/schema";
import { normalizeOrsaPhone } from "@shared/orsa";

export const campaignPhone = (phone: string | null | undefined) => {
  const digits = normalizeOrsaPhone(phone);
  if (!digits) return null;
  // Domestic roster numbers without a country code use +1, as elsewhere in SMS.
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
};

export const isSmsStop = (body: string) => /^(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]?\s*$/i.test(body.trim());

export function orsaHeartPlanText(landingUrl: string): string {
  return `ORSA + Steps After Life: Help protect your family's future. Start your HeartPlan: ${landingUrl} Reply STOP to opt out.`;
}

async function historicOptOutPhones() {
  const messages = await db.select({ phone: smsMessages.phoneNumber, body: smsMessages.body }).from(smsMessages)
    .where(and(eq(smsMessages.direction, "inbound"), sql`lower(trim(${smsMessages.body})) ~ '^(stop|stopall|unsubscribe|cancel|end|quit)[[:space:]]*[.!]?[[:space:]]*$'`));
  return new Set(messages.filter(m => isSmsStop(m.body)).map(m => campaignPhone(m.phone)).filter((p): p is string => !!p));
}

export async function recordOrsaSmsOptOut(phone: string, body: string) {
  if (!isSmsStop(body)) return;
  const normalized = campaignPhone(phone);
  if (!normalized) return;
  await db.insert(orsaSmsCampaign).values({ phone: normalized, optedOutAt: new Date(), status: "opted_out" })
    .onConflictDoUpdate({
      target: orsaSmsCampaign.phone,
      set: { optedOutAt: new Date(), status: "opted_out", consentEvidence: null, consentRecordedAt: null },
    });
}

export async function optOutOrsaMember(memberId: string, actor: string) {
  const [member] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
  const phone = campaignPhone(member?.normalizedPhone);
  if (!member || member.normalizedEmail || !phone) throw new Error("No valid phone-only roster member found.");
  await recordOrsaSmsOptOut(phone, "STOP");
  await db.insert(orsaRosterAudits).values({ actorUserId: actor, action: "sms_opted_out", affectedCount: 1 });
}

export async function recordOrsaSmsDelivery(providerMessageId: string, status: string) {
  const normalized = status.toLowerCase();
  if (!["delivered", "sendingfailed", "deliveryfailed", "failed", "undeliverable"].includes(normalized)) return;
  await db.update(orsaSmsCampaign).set({ deliveryStatus: normalized === "delivered" ? "delivered" : "failed" })
    .where(eq(orsaSmsCampaign.providerMessageId, providerMessageId));
}

export async function orsaSmsClaimStillAllowed(phone: string) {
  const [state] = await db.select({ optedOutAt: orsaSmsCampaign.optedOutAt, status: orsaSmsCampaign.status })
    .from(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, phone));
  return Boolean(state && state.status === "sending" && !state.optedOutAt);
}

export async function orsaSmsCandidates() {
  const [members, states, historicStops] = await Promise.all([
    db.select().from(orsaRosterMembers),
    db.select().from(orsaSmsCampaign),
    historicOptOutPhones(),
  ]);
  const byPhone = new Map(states.map(s => [s.phone, s]));
  const phoneCounts = new Map<string, number>();
  for (const m of members.filter(m => m.active)) {
    const phone = campaignPhone(m.normalizedPhone);
    if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
  }
  return members.filter(m => !m.normalizedEmail).map(m => {
    const phone = campaignPhone(m.normalizedPhone);
    const state = phone ? byPhone.get(phone) : undefined;
    return {
      id: m.id, displayName: m.displayName, phone, active: m.active,
      sharedPhone: Boolean(phone && (phoneCounts.get(phone) ?? 0) > 1),
      consentRecordedAt: state?.memberId === m.id ? state.consentRecordedAt : null,
      consentEvidence: state?.memberId === m.id ? state.consentEvidence : null,
      optedOutAt: state?.optedOutAt ?? (phone && historicStops.has(phone) ? new Date(0) : null),
      status: state?.status ?? "not_sent",
      deliveryStatus: state?.deliveryStatus ?? null,
      attemptedAt: state?.attemptedAt ?? null,
      submittedAt: state?.submittedAt ?? null,
    };
  });
}

export async function recordOrsaSmsConsent(memberId: string, evidence: string, actor: string) {
  const historicStops = await historicOptOutPhones();
  return db.transaction(async tx => {
    const [member] = await tx.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId)).for("update");
    const phone = campaignPhone(member?.normalizedPhone);
    if (!member?.active || member.normalizedEmail || !phone) throw new Error("Only active no-email members with valid phones can be contacted.");
    if (historicStops.has(phone)) throw new Error("This phone has previously opted out. Do not send.");
    const matching = await tx.select({ normalizedPhone: orsaRosterMembers.normalizedPhone }).from(orsaRosterMembers)
      .where(eq(orsaRosterMembers.active, true));
    if (matching.filter(m => campaignPhone(m.normalizedPhone) === phone).length !== 1) throw new Error("This phone belongs to multiple active roster records.");
    const [existing] = await tx.select().from(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, phone)).for("update");
    if (existing?.optedOutAt) throw new Error("This phone has opted out. Do not send.");
    if (existing && existing.status !== "not_sent") throw new Error("This phone has already been attempted. Do not send again.");
    if (!member.displayName?.trim()) throw new Error("This roster member needs a name before text permission can be recorded.");
    const now = new Date();
    await tx.insert(orsaSmsCampaign).values({
      phone, memberId, consentEvidence: evidence, consentRecordedBy: actor, consentRecordedAt: now,
    }).onConflictDoUpdate({
      target: orsaSmsCampaign.phone,
      set: { memberId, consentEvidence: evidence, consentRecordedBy: actor, consentRecordedAt: now },
    });
    await tx.insert(orsaRosterAudits).values({ actorUserId: actor, action: "sms_consent_recorded", affectedCount: 1 });
  });
}

// Claim before contacting the provider. An uncertain outcome is not retried:
// the administrator must resolve it outside this campaign first.
export async function claimOrsaSms(memberId: string, reviewedPhone: string, actor: string) {
  const historicStops = await historicOptOutPhones();
  return db.transaction(async tx => {
    const [member] = await tx.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId)).for("update");
    const phone = campaignPhone(member?.normalizedPhone);
    if (!member?.active || member.normalizedEmail || !phone || phone !== reviewedPhone) throw new Error("The reviewed recipient has changed. Refresh the list.");
    if (historicStops.has(phone)) throw new Error("This phone has opted out. Do not send.");
    const activePhones = await tx.select({ normalizedPhone: orsaRosterMembers.normalizedPhone }).from(orsaRosterMembers)
      .where(eq(orsaRosterMembers.active, true));
    if (activePhones.filter(m => campaignPhone(m.normalizedPhone) === phone).length !== 1) throw new Error("This phone belongs to multiple active roster records. Resolve it before sending.");
    const [state] = await tx.select().from(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, phone)).for("update");
    if (!state || state.memberId !== memberId || !state.consentRecordedAt || !state.consentEvidence || state.optedOutAt || state.status !== "not_sent") {
      throw new Error("Consent is missing, this phone opted out, or a text has already been attempted.");
    }
    if (!member.displayName?.trim()) throw new Error("This roster member needs a name before texting.");
    const prior = await tx.select({ phone: orsaSmsCampaign.phone }).from(orsaSmsCampaign)
      .where(and(eq(orsaSmsCampaign.memberId, memberId), inArray(orsaSmsCampaign.status, ["sending", "submitted", "needs_review"]))).limit(1);
    if (prior.length) throw new Error("This member has already had a text attempt.");
    await tx.update(orsaSmsCampaign).set({ status: "sending", attemptedAt: new Date(), sentBy: actor })
      .where(eq(orsaSmsCampaign.phone, phone));
    await tx.insert(orsaRosterAudits).values({ actorUserId: actor, action: "sms_attempted", affectedCount: 1 });
    return { phone, name: member.displayName };
  });
}

export async function finishOrsaSms(phone: string, receipt: { id: string | null; status: string } | null, actor: string) {
  await db.transaction(async tx => {
    const [state] = await tx.select().from(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, phone)).for("update");
    if (state?.status !== "sending" && state?.status !== "opted_out") return;
    // STOP can arrive while the provider request is in flight; never erase it.
    await tx.update(orsaSmsCampaign).set({
      ...(state.status === "opted_out" ? {} : { status: receipt ? "submitted" : "needs_review" }),
      submittedAt: receipt ? new Date() : null,
      providerMessageId: receipt?.id ?? null,
      deliveryStatus: receipt ? (receipt.status.toLowerCase() === "delivered" ? "delivered" : receipt.status.toLowerCase()) : "unknown",
    }).where(eq(orsaSmsCampaign.phone, phone));
    await tx.insert(orsaRosterAudits).values({ actorUserId: actor, action: receipt ? "sms_submitted" : "sms_needs_review", affectedCount: 1 });
  });
}