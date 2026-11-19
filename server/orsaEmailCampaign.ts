import type { Express, RequestHandler } from "express";
import crypto from "node:crypto";
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  orsaEmailCampaignContacts,
  orsaEmailCampaignCompliance,
  orsaEmailCampaignDeliveries,
  orsaEmailCampaignPreviews,
  orsaEmailCampaignRuns,
  orsaRosterMembers,
} from "@shared/schema";
import { db } from "./db";
import { getAppUrl, isEmailDeliveryConfigured, sendEmail } from "./email";
import { getOutreachPublishedBaseUrl } from "./outreachRoutes";
import { buildOrsaHeartPlanEmailSequenceDrafts, getOrsaHeartPlanEmailSchedule } from "./orsaEmailSequenceDrafts";
import { eligibleRetryRecipients, isRetrySnapshot, pendingSnapshotRecipients } from "./orsaEmailCampaignRetry";
import type { CampaignSnapshotRecipient, RetryEvidence } from "./orsaEmailCampaignRetry";
import { users } from "@shared/models/auth";
import { finishWarmupReservation, getWarmupOverview, pauseWarmup, reserveWarmup, warmupConfirmationReason } from "./orsaWarmup";
import { neverEmailedCandidates } from "./orsaOutreach";

const CAMPAIGN_TEMPLATES = getOrsaHeartPlanEmailSchedule();
const templateInput = z.object({ templateId: z.string().min(1).max(100) }).strict();
const previewInput = templateInput.extend({
  retryHeld: z.boolean().optional(), recipientLimit: z.number().int().min(1).max(10000).optional(),
  audience: z.enum(["never_emailed", "selected_message"]).default("selected_message"),
});
const confirmInput = z.object({
  previewId: z.string().uuid(),
  expectedCount: z.number().int().min(0),
  confirmed: z.literal(true),
  acceptDuplicateRisk: z.literal(true).optional(),
}).strict();
const sendBatchInput = z.object({ runId: z.string().uuid() }).strict();
const suppressionInput = z.object({
  emails: z.array(z.string().trim().email().max(320)).min(1).max(1000),
}).strict();
const optoutsReviewedInput = z.object({ confirmed: z.literal(true) }).strict();
const DATE_LOCKED_TEMPLATES = new Set(["thirty-days-left", "one-week-left", "ends-tomorrow"]);
const MAX_BATCH_SIZE = 25;

type RosterEmailRow = {
  id: string;
  normalizedEmail: string | null;
  sharedEligibilityEmail: string | null;
  active: boolean;
  displayName: string | null;
};

export type OrsaEmailCampaignCandidate = {
  id: string;
  email: string;
  displayName: string | null;
  firstContactOnly?: true;
};

type OrsaCampaignDeliveryStatus = "sending" | "sent" | "needs_review" | "skipped";
type OrsaCampaignPriorDelivery = { memberId: string; email: string; status: string };
type OrsaCampaignClaim =
  | { disposition: "skipped" }
  | { disposition: "claimed"; deliveryId: string; unsubscribeToken: string; trackingToken: string };
type OrsaCampaignEngagement = Record<string, { submitted: number; uniqueOpens: number; uniqueClicks: number }>;
type RecipientSnapshot = CampaignSnapshotRecipient[];
type OrsaCampaignPreview = {
  id: string;
  adminUserId: string;
  templateId: string;
  recipientSnapshot: RecipientSnapshot;
  expectedCount: number;
  expiresAt: Date;
};
type OrsaCampaignRun = OrsaCampaignPreview & { status: string };
type OrsaCampaignRouteDependencies = {
  loadCandidates: () => Promise<OrsaEmailCampaignCandidate[]>;
  loadNeverEmailed: (candidates: OrsaEmailCampaignCandidate[]) => Promise<OrsaEmailCampaignCandidate[]>;
  loadOptedOutEmails: (emails: string[]) => Promise<Set<string>>;
  loadAvailableCandidates: (templateId: string, candidates: OrsaEmailCampaignCandidate[]) => Promise<OrsaEmailCampaignCandidate[]>;
  loadRetryCandidates: (templateId: string, candidates: OrsaEmailCampaignCandidate[]) => Promise<Array<OrsaEmailCampaignCandidate & RetryEvidence>>;
  loadSentCounts: () => Promise<Record<string, number>>;
  loadEngagement: () => Promise<OrsaCampaignEngagement>;
  countAvailable: (templateId: string, candidates: OrsaEmailCampaignCandidate[]) => Promise<{ eligibleCount: number; alreadySentCount: number }>;
  loadPriorDeliveries: (templateId: string) => Promise<OrsaCampaignPriorDelivery[]>;
  loadNeedsReviewCounts: () => Promise<Record<string, number>>;
  loadReviewRecords: (templateId: string) => Promise<Array<{ id: string; memberId: string; email: string; templateId: string; status: string; attemptedAt: Date; sentAt: Date | null }>>;
  loadOptoutsReviewed: () => Promise<boolean>;
  savePreview: (input: Omit<OrsaCampaignPreview, "id">) => Promise<OrsaCampaignPreview>;
  loadPreview: (previewId: string) => Promise<OrsaCampaignPreview | null>;
  createRun: (preview: OrsaCampaignPreview, expiresAt: Date) => Promise<OrsaCampaignRun | null>;
  loadRun: (runId: string) => Promise<OrsaCampaignRun | null>;
  pauseRun: (runId: string) => Promise<void>;
  saveSuppressions: (emails: string[], actorId: string) => Promise<void>;
  markOptoutsReviewed: (actorId: string, reviewedAt: Date) => Promise<void>;
  claimDelivery: (candidate: OrsaEmailCampaignCandidate, templateId: string, actorId: string | undefined, retry?: CampaignSnapshotRecipient) => Promise<OrsaCampaignClaim>;
  setDeliveryStatus: (id: string, status: OrsaCampaignDeliveryStatus, sentAt?: Date) => Promise<void>;
  recordEngagement: (token: string, kind: "open" | "click") => Promise<void>;
  send: typeof sendEmail;
  deliveryConfigured: () => boolean;
  isPublishedProduction: () => boolean;
  now: () => Date;
  reserveWarmup: typeof reserveWarmup;
  finishWarmup: typeof finishWarmupReservation;
  pauseWarmup: typeof pauseWarmup;
  warmingReason: typeof warmupConfirmationReason;
  warmingOverview: typeof getWarmupOverview;
  recoveryEligible: (candidate: OrsaEmailCampaignCandidate) => Promise<boolean>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUsableEmail(email: string | null): email is string {
  return !!email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function eligibleOrsaCampaignRecipients(rows: RosterEmailRow[]): OrsaEmailCampaignCandidate[] {
  const emailCounts = new Map<string, number>();
  const sharedAddresses = new Set<string>();
  for (const row of rows) {
    if (isUsableEmail(row.normalizedEmail)) {
      const email = normalizeEmail(row.normalizedEmail);
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    }
    if (isUsableEmail(row.sharedEligibilityEmail)) sharedAddresses.add(normalizeEmail(row.sharedEligibilityEmail));
  }
  return rows.flatMap((row) => {
    if (!row.active || !isUsableEmail(row.normalizedEmail)) return [];
    const email = normalizeEmail(row.normalizedEmail);
    if (emailCounts.get(email) !== 1 || sharedAddresses.has(email)) return [];
    return [{ id: row.id, email, displayName: row.displayName }];
  });
}

function easternDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function templateSendability(templateId: string, now = new Date()): { sendable: boolean; reason?: string } {
  const template = CAMPAIGN_TEMPLATES.find(({ id }) => id === templateId);
  if (!template) return { sendable: false, reason: "Unknown template." };
  const date = easternDate(now);
  if (date < template.suggestedSendDate) {
    return { sendable: false, reason: `Sending opens on ${template.suggestedSendDate} (Eastern time). You can preview this email now.` };
  }
  if (date > "2026-12-01") return { sendable: false, reason: "The ORSA HeartPlan offer has ended." };
  if (DATE_LOCKED_TEMPLATES.has(templateId) && date !== template.suggestedSendDate) {
    return { sendable: false, reason: `This date-sensitive draft may only be sent on ${template.suggestedSendDate} (Eastern time).` };
  }
  return { sendable: true };
}

export function isProductionCampaignEnvironment(nodeEnv = process.env.NODE_ENV, deployment = process.env.REPLIT_DEPLOYMENT): boolean {
  return nodeEnv === "production" && deployment === "1";
}

export function priorDeliveryDisposition(status: string | null | undefined): "skip" | "claim" {
  // Any durable claim, including sending or uncertain provider outcomes, blocks
  // retry. A missing row is the sole claimable state.
  return status ? "skip" : "claim";
}

export function isSupportedOrsaEmailCampaignTemplate(templateId: string): boolean {
  return CAMPAIGN_TEMPLATES.some(({ id }) => id === templateId);
}

export function isCampaignRecipientExcluded(email: string, optedOutEmails: Set<string>, hasPriorDelivery: boolean): boolean {
  return optedOutEmails.has(normalizeEmail(email)) || hasPriorDelivery;
}

export function deliveryStatusForProviderResult(accepted: boolean): "sent" | "needs_review" {
  return accepted ? "sent" : "needs_review";
}

function actorIdFromRequest(req: any): string | null {
  const actorId = req.session?.userId || req.user?.claims?.sub;
  return typeof actorId === "string" && actorId.length ? actorId : null;
}

function unsubscribeUrl(token: string): string {
  return `${getOutreachPublishedBaseUrl()}/api/orsa/email-unsubscribe/${encodeURIComponent(token)}`;
}

async function rosterCandidates(): Promise<OrsaEmailCampaignCandidate[]> {
  const rows = await db.select({
    id: orsaRosterMembers.id,
    normalizedEmail: orsaRosterMembers.normalizedEmail,
    sharedEligibilityEmail: orsaRosterMembers.sharedEligibilityEmail,
    active: orsaRosterMembers.active,
    displayName: orsaRosterMembers.displayName,
  }).from(orsaRosterMembers);
  return eligibleOrsaCampaignRecipients(rows);
}

async function getOptedOutEmails(emails: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const records = await db.select({ email: orsaEmailCampaignContacts.normalizedEmail })
    .from(orsaEmailCampaignContacts)
    .where(and(inArray(orsaEmailCampaignContacts.normalizedEmail, emails), sql`${orsaEmailCampaignContacts.optedOutAt} IS NOT NULL`));
  return new Set(records.map(({ email }) => email));
}

async function getSentCounts(): Promise<Record<string, number>> {
  const result: Record<string, number> = Object.fromEntries(CAMPAIGN_TEMPLATES.map(({ id }) => [id, 0]));
  const rows = await db.select({ templateId: orsaEmailCampaignDeliveries.templateId })
    .from(orsaEmailCampaignDeliveries).where(eq(orsaEmailCampaignDeliveries.status, "sent"));
  for (const { templateId } of rows) result[templateId] = (result[templateId] || 0) + 1;
  return result;
}

async function getEngagement(): Promise<OrsaCampaignEngagement> {
  const result: OrsaCampaignEngagement = Object.fromEntries(CAMPAIGN_TEMPLATES.map(({ id }) =>
    [id, { submitted: 0, uniqueOpens: 0, uniqueClicks: 0 }]));
  const rows = await db.select({
    templateId: orsaEmailCampaignDeliveries.templateId,
    openedAt: orsaEmailCampaignDeliveries.firstOpenedAt,
    clickedAt: orsaEmailCampaignDeliveries.firstClickedAt,
  }).from(orsaEmailCampaignDeliveries).where(and(
    eq(orsaEmailCampaignDeliveries.status, "sent"),
    sql`${orsaEmailCampaignDeliveries.trackingTokenHash} IS NOT NULL`,
  ));
  for (const row of rows) {
    const stats = result[row.templateId];
    if (!stats) continue;
    stats.submitted++;
    if (row.openedAt) stats.uniqueOpens++;
    if (row.clickedAt) stats.uniqueClicks++;
  }
  return result;
}

async function recordEngagement(token: string, kind: "open" | "click"): Promise<void> {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const column = kind === "open" ? orsaEmailCampaignDeliveries.firstOpenedAt : orsaEmailCampaignDeliveries.firstClickedAt;
  await db.update(orsaEmailCampaignDeliveries)
    .set(kind === "open" ? { firstOpenedAt: new Date() } : { firstClickedAt: new Date() })
    .where(and(
      eq(orsaEmailCampaignDeliveries.trackingTokenHash, hash),
      inArray(orsaEmailCampaignDeliveries.status, ["sending", "sent"]),
      sql`${column} IS NULL`,
    ));
}

async function getPriorDeliveries(templateId: string): Promise<OrsaCampaignPriorDelivery[]> {
  return db.select({
    memberId: orsaEmailCampaignDeliveries.memberId,
    email: orsaEmailCampaignDeliveries.normalizedEmail,
    status: orsaEmailCampaignDeliveries.status,
  }).from(orsaEmailCampaignDeliveries).where(eq(orsaEmailCampaignDeliveries.templateId, templateId));
}

async function getNeedsReviewCounts(): Promise<Record<string, number>> {
  const result: Record<string, number> = Object.fromEntries(CAMPAIGN_TEMPLATES.map(({ id }) => [id, 0]));
  const rows = await db.select({
    templateId: orsaEmailCampaignDeliveries.templateId,
    value: count(),
  }).from(orsaEmailCampaignDeliveries)
    .where(inArray(orsaEmailCampaignDeliveries.status, ["needs_review", "sending"]))
    .groupBy(orsaEmailCampaignDeliveries.templateId);
  for (const row of rows) result[row.templateId] = Number(row.value);
  return result;
}

async function getReviewRecords(templateId: string) {
  return db.select({
    id: orsaEmailCampaignDeliveries.id,
    memberId: orsaEmailCampaignDeliveries.memberId,
    email: orsaEmailCampaignDeliveries.normalizedEmail,
    templateId: orsaEmailCampaignDeliveries.templateId,
    status: orsaEmailCampaignDeliveries.status,
    attemptedAt: orsaEmailCampaignDeliveries.attemptedAt,
    sentAt: orsaEmailCampaignDeliveries.sentAt,
  }).from(orsaEmailCampaignDeliveries)
    .where(and(
      eq(orsaEmailCampaignDeliveries.templateId, templateId),
      inArray(orsaEmailCampaignDeliveries.status, ["needs_review", "sending"]),
    ));
}

export async function getOptoutsReviewed(): Promise<boolean> {
  const [record] = await db.select({ reviewedAt: orsaEmailCampaignCompliance.optoutsReviewedAt })
    .from(orsaEmailCampaignCompliance)
    .where(eq(orsaEmailCampaignCompliance.id, "orsa-email-campaign"))
    .limit(1);
  return Boolean(record?.reviewedAt);
}

export async function savePreview(input: Omit<OrsaCampaignPreview, "id">): Promise<OrsaCampaignPreview> {
  const [created] = await db.insert(orsaEmailCampaignPreviews).values(input).returning({
    id: orsaEmailCampaignPreviews.id,
    adminUserId: orsaEmailCampaignPreviews.adminUserId,
    templateId: orsaEmailCampaignPreviews.templateId,
    recipientSnapshot: orsaEmailCampaignPreviews.recipientSnapshot,
    expectedCount: orsaEmailCampaignPreviews.expectedCount,
    expiresAt: orsaEmailCampaignPreviews.expiresAt,
  });
  if (!created) throw new Error("Could not persist the ORSA campaign preview.");
  return created;
}

export async function getPreview(previewId: string): Promise<OrsaCampaignPreview | null> {
  const [preview] = await db.select({
    id: orsaEmailCampaignPreviews.id,
    adminUserId: orsaEmailCampaignPreviews.adminUserId,
    templateId: orsaEmailCampaignPreviews.templateId,
    recipientSnapshot: orsaEmailCampaignPreviews.recipientSnapshot,
    expectedCount: orsaEmailCampaignPreviews.expectedCount,
    expiresAt: orsaEmailCampaignPreviews.expiresAt,
  }).from(orsaEmailCampaignPreviews).where(eq(orsaEmailCampaignPreviews.id, previewId)).limit(1);
  return preview || null;
}

export async function createRun(preview: OrsaCampaignPreview, expiresAt: Date): Promise<OrsaCampaignRun | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${preview.id}))`);
    const [existing] = await tx.select({
      id: orsaEmailCampaignRuns.id,
      adminUserId: orsaEmailCampaignRuns.adminUserId,
      templateId: orsaEmailCampaignRuns.templateId,
      recipientSnapshot: orsaEmailCampaignRuns.recipientSnapshot,
      expectedCount: orsaEmailCampaignRuns.expectedCount,
      expiresAt: orsaEmailCampaignRuns.expiresAt,
      status: orsaEmailCampaignRuns.status,
    }).from(orsaEmailCampaignRuns).where(eq(orsaEmailCampaignRuns.previewId, preview.id)).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(orsaEmailCampaignRuns).values({
      previewId: preview.id,
      adminUserId: preview.adminUserId,
      templateId: preview.templateId,
      recipientSnapshot: preview.recipientSnapshot,
      expectedCount: preview.expectedCount,
      status: isRetrySnapshot(preview.recipientSnapshot) ? "retry_confirmed" : "confirmed",
      expiresAt,
    }).returning({
      id: orsaEmailCampaignRuns.id,
      adminUserId: orsaEmailCampaignRuns.adminUserId,
      templateId: orsaEmailCampaignRuns.templateId,
      recipientSnapshot: orsaEmailCampaignRuns.recipientSnapshot,
      expectedCount: orsaEmailCampaignRuns.expectedCount,
      expiresAt: orsaEmailCampaignRuns.expiresAt,
      status: orsaEmailCampaignRuns.status,
    });
    return created || null;
  });
}

export async function getRun(runId: string): Promise<OrsaCampaignRun | null> {
  const [run] = await db.select({
    id: orsaEmailCampaignRuns.id,
    adminUserId: orsaEmailCampaignRuns.adminUserId,
    templateId: orsaEmailCampaignRuns.templateId,
    recipientSnapshot: orsaEmailCampaignRuns.recipientSnapshot,
    expectedCount: orsaEmailCampaignRuns.expectedCount,
    expiresAt: orsaEmailCampaignRuns.expiresAt,
    status: orsaEmailCampaignRuns.status,
  }).from(orsaEmailCampaignRuns).where(eq(orsaEmailCampaignRuns.id, runId)).limit(1);
  return run || null;
}

async function saveSuppressions(emails: string[], actorId: string): Promise<void> {
  const optedOutAt = new Date();
  await db.transaction(async (tx) => {
    for (const normalizedEmail of emails) {
      await tx.insert(orsaEmailCampaignContacts).values({
        normalizedEmail,
        unsubscribeToken: crypto.randomBytes(24).toString("hex"),
        optedOutAt,
        optedOutBy: actorId,
      }).onConflictDoUpdate({
        target: orsaEmailCampaignContacts.normalizedEmail,
        set: { optedOutAt, optedOutBy: actorId },
      });
    }
  });
}

async function markOptoutsReviewed(actorId: string, reviewedAt: Date): Promise<void> {
  await db.insert(orsaEmailCampaignCompliance).values({
    id: "orsa-email-campaign",
    optoutsReviewedAt: reviewedAt,
    optoutsReviewedBy: actorId,
  }).onConflictDoUpdate({
    target: orsaEmailCampaignCompliance.id,
    set: { optoutsReviewedAt: reviewedAt, optoutsReviewedBy: actorId },
  });
}

async function setDeliveryStatus(id: string, status: OrsaCampaignDeliveryStatus, sentAt?: Date): Promise<void> {
  await db.update(orsaEmailCampaignDeliveries).set({ status, ...(sentAt ? { sentAt } : {}) })
    .where(eq(orsaEmailCampaignDeliveries.id, id));
}

async function getAvailableCandidates(templateId: string, candidates: OrsaEmailCampaignCandidate[]): Promise<OrsaEmailCampaignCandidate[]> {
  if (templateId === "link-recovery") candidates = await getRecoveryCandidates(candidates);
  if (!candidates.length) return [];
  const emails = candidates.map(({ email }) => email);
  const optouts = await getOptedOutEmails(emails);
  const prior = await getPriorDeliveries(templateId);
  const priorByMember = new Map(prior.map(({ memberId, status }) => [memberId, status]));
  const priorEmails = new Set(prior.map(({ email }) => normalizeEmail(email)));
  return candidates.filter(({ id, email }) =>
    !isCampaignRecipientExcluded(email, optouts, priorByMember.has(id) || priorEmails.has(email)));
}

async function getRetryCandidates(templateId: string, candidates: OrsaEmailCampaignCandidate[]) {
  if (templateId === "link-recovery") candidates = await getRecoveryCandidates(candidates);
  if (!candidates.length) return [];
  const [optouts, records] = await Promise.all([
    getOptedOutEmails(candidates.map(({ email }) => email)),
    db.select({
      id: orsaEmailCampaignDeliveries.id,
      memberId: orsaEmailCampaignDeliveries.memberId,
      email: orsaEmailCampaignDeliveries.normalizedEmail,
      status: orsaEmailCampaignDeliveries.status,
      trackingTokenHash: orsaEmailCampaignDeliveries.trackingTokenHash,
      attemptedAt: orsaEmailCampaignDeliveries.attemptedAt,
      sentAt: orsaEmailCampaignDeliveries.sentAt,
      firstOpenedAt: orsaEmailCampaignDeliveries.firstOpenedAt,
      firstClickedAt: orsaEmailCampaignDeliveries.firstClickedAt,
    }).from(orsaEmailCampaignDeliveries).where(eq(orsaEmailCampaignDeliveries.templateId, templateId)),
  ]);
  return eligibleRetryRecipients(candidates, records, optouts);
}

export async function pauseRun(runId: string, includeStandardRuns = false): Promise<void> {
  const run = await getRun(runId);
  if (!run) return;
  await db.update(orsaEmailCampaignRuns).set({ status: "paused" })
    .where(and(eq(orsaEmailCampaignRuns.templateId, run.templateId),
      inArray(orsaEmailCampaignRuns.status, includeStandardRuns ? ["retry_confirmed", "confirmed"] : ["retry_confirmed"])));
}

async function countAvailable(templateId: string, candidates: OrsaEmailCampaignCandidate[]): Promise<{ eligibleCount: number; alreadySentCount: number }> {
  if (!candidates.length) return { eligibleCount: 0, alreadySentCount: 0 };
  const prior = await getPriorDeliveries(templateId);
  const alreadySentCount = candidates.filter(({ id, email }) =>
    prior.some((delivery) => delivery.status === "sent" &&
      (delivery.memberId === id || normalizeEmail(delivery.email) === email))).length;
  const available = await getAvailableCandidates(templateId, candidates);
  return { eligibleCount: available.length, alreadySentCount };
}

export async function claimDelivery(candidate: OrsaEmailCampaignCandidate, templateId: string, actorId: string | undefined, retry?: CampaignSnapshotRecipient) {
  return db.transaction(async (tx) => {
    // Serialize email claims across templates, not just within one message.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${candidate.email}))`);
    await tx.select({ id: orsaRosterMembers.id }).from(orsaRosterMembers)
      .where(eq(orsaRosterMembers.id, candidate.id)).for("update");
    if (candidate.firstContactOnly && !(await neverEmailedCandidates([candidate], tx as unknown as typeof db)).length)
      return { disposition: "skipped" as const };
    const rows = await tx.select({
      id: orsaRosterMembers.id,
      normalizedEmail: orsaRosterMembers.normalizedEmail,
      sharedEligibilityEmail: orsaRosterMembers.sharedEligibilityEmail,
      active: orsaRosterMembers.active,
      displayName: orsaRosterMembers.displayName,
    }).from(orsaRosterMembers);
    const freshCandidate = eligibleOrsaCampaignRecipients(rows).find((item) => item.id === candidate.id && item.email === candidate.email);
    if (!freshCandidate) return { disposition: "skipped" as const };
    if (templateId === "link-recovery" && !(await getRecoveryCandidates([freshCandidate], tx as unknown as typeof db)).length)
      return { disposition: "skipped" as const };
    const [contact] = await tx.select({ optedOutAt: orsaEmailCampaignContacts.optedOutAt })
      .from(orsaEmailCampaignContacts).where(eq(orsaEmailCampaignContacts.normalizedEmail, candidate.email)).limit(1);
    if (contact?.optedOutAt) return { disposition: "skipped" as const };
    const [previous] = await tx.select({
      id: orsaEmailCampaignDeliveries.id,
      memberId: orsaEmailCampaignDeliveries.memberId,
      email: orsaEmailCampaignDeliveries.normalizedEmail,
      status: orsaEmailCampaignDeliveries.status,
      trackingTokenHash: orsaEmailCampaignDeliveries.trackingTokenHash,
      sentAt: orsaEmailCampaignDeliveries.sentAt,
      firstOpenedAt: orsaEmailCampaignDeliveries.firstOpenedAt,
      firstClickedAt: orsaEmailCampaignDeliveries.firstClickedAt,
    })
      .from(orsaEmailCampaignDeliveries)
      .where(and(
        eq(orsaEmailCampaignDeliveries.templateId, templateId),
        or(
          eq(orsaEmailCampaignDeliveries.memberId, candidate.id),
          eq(orsaEmailCampaignDeliveries.normalizedEmail, candidate.email),
        ),
      ))
      .limit(1);
    if (retry) {
      if (!previous || previous.status !== "needs_review" || previous.sentAt ||
        previous.firstOpenedAt || previous.firstClickedAt ||
        previous.memberId !== candidate.id || previous.email !== candidate.email ||
        previous.id !== retry.retryDeliveryId ||
        previous.trackingTokenHash !== retry.priorTrackingTokenHash) return { disposition: "skipped" as const };
    } else if (priorDeliveryDisposition(previous?.id) === "skip") return { disposition: "skipped" as const };
    const token = contact?.optedOutAt === null
      ? (await tx.select({ token: orsaEmailCampaignContacts.unsubscribeToken }).from(orsaEmailCampaignContacts)
        .where(eq(orsaEmailCampaignContacts.normalizedEmail, candidate.email)).limit(1))[0]?.token
      : undefined;
    let unsubscribeToken = token;
    if (!unsubscribeToken) {
      unsubscribeToken = crypto.randomBytes(24).toString("hex");
      await tx.insert(orsaEmailCampaignContacts).values({ normalizedEmail: candidate.email, unsubscribeToken })
        .onConflictDoNothing({ target: orsaEmailCampaignContacts.normalizedEmail });
      const [stored] = await tx.select({ token: orsaEmailCampaignContacts.unsubscribeToken })
        .from(orsaEmailCampaignContacts).where(eq(orsaEmailCampaignContacts.normalizedEmail, candidate.email)).limit(1);
      unsubscribeToken = stored?.token;
    }
    if (!unsubscribeToken) throw new Error("Could not establish an ORSA unsubscribe token.");
    const trackingToken = crypto.randomBytes(24).toString("hex");
    if (retry && previous) {
      const [claimed] = await tx.update(orsaEmailCampaignDeliveries).set({
        status: "sending",
        attemptedAt: new Date(),
        sentBy: actorId || null,
        trackingTokenHash: crypto.createHash("sha256").update(trackingToken).digest("hex"),
      }).where(and(
        eq(orsaEmailCampaignDeliveries.id, previous.id),
        eq(orsaEmailCampaignDeliveries.status, "needs_review"),
        sql`${orsaEmailCampaignDeliveries.trackingTokenHash} IS NOT DISTINCT FROM ${retry.priorTrackingTokenHash ?? null}`,
        sql`${orsaEmailCampaignDeliveries.sentAt} IS NULL`,
        sql`${orsaEmailCampaignDeliveries.firstOpenedAt} IS NULL`,
        sql`${orsaEmailCampaignDeliveries.firstClickedAt} IS NULL`,
      )).returning({ id: orsaEmailCampaignDeliveries.id });
      if (!claimed) return { disposition: "skipped" as const };
      return { disposition: "claimed" as const, deliveryId: claimed.id, unsubscribeToken, trackingToken };
    }
    const [created] = await tx.insert(orsaEmailCampaignDeliveries).values({
      memberId: candidate.id,
      normalizedEmail: candidate.email,
      templateId,
      status: "sending",
      sentBy: actorId || null,
      trackingTokenHash: crypto.createHash("sha256").update(trackingToken).digest("hex"),
    }).onConflictDoNothing().returning({ id: orsaEmailCampaignDeliveries.id });
    if (!created) return { disposition: "skipped" as const };
    return { disposition: "claimed" as const, deliveryId: created.id, unsubscribeToken, trackingToken };
  });
}

export function eligibleRecoveryRecipients(candidates: OrsaEmailCampaignCandidate[], submittedIntroEmails: Set<string>, accountEmails: Set<string>,
  engagement = new Map<string, { clicked: Date | null; opened: Date | null }>()) {
  const priority = (email: string) => engagement.get(email)?.clicked ? 2 : engagement.get(email)?.opened ? 1 : 0;
  const activity = (email: string) => (engagement.get(email)?.clicked ?? engagement.get(email)?.opened)?.getTime() ?? 0;
  return candidates.filter(candidate => submittedIntroEmails.has(candidate.email) && !accountEmails.has(candidate.email))
    .sort((a, b) => priority(b.email) - priority(a.email) || activity(b.email) - activity(a.email) || a.email.localeCompare(b.email));
}
async function getRecoveryCandidates(candidates: OrsaEmailCampaignCandidate[], connection = db) {
  const [submitted, accounts] = await Promise.all([
    connection.select({ email: orsaEmailCampaignDeliveries.normalizedEmail,
      clicked: orsaEmailCampaignDeliveries.firstClickedAt, opened: orsaEmailCampaignDeliveries.firstOpenedAt }).from(orsaEmailCampaignDeliveries)
      .where(and(eq(orsaEmailCampaignDeliveries.templateId, "launch-week"), eq(orsaEmailCampaignDeliveries.status, "sent"),
        sql`${orsaEmailCampaignDeliveries.sentAt} IS NOT NULL`)),
    connection.select({ email: users.email }).from(users),
  ]);
  return eligibleRecoveryRecipients(candidates, new Set(submitted.map(row => normalizeEmail(row.email))),
    new Set(accounts.flatMap(row => row.email ? [normalizeEmail(row.email)] : [])),
    new Map(submitted.map(row => [normalizeEmail(row.email), { clicked: row.clicked, opened: row.opened }])));
}

export function registerOrsaEmailCampaignRoutes(
  app: Express,
  isAuthenticated: RequestHandler,
  isAdmin: RequestHandler,
  overrides: Partial<OrsaCampaignRouteDependencies> = {},
) {
  const deps: OrsaCampaignRouteDependencies = {
    loadCandidates: rosterCandidates,
    loadNeverEmailed: neverEmailedCandidates,
    loadOptedOutEmails: getOptedOutEmails,
    loadAvailableCandidates: getAvailableCandidates,
    loadRetryCandidates: getRetryCandidates,
    loadSentCounts: getSentCounts,
    loadEngagement: getEngagement,
    countAvailable,
    loadPriorDeliveries: getPriorDeliveries,
    loadNeedsReviewCounts: getNeedsReviewCounts,
    loadReviewRecords: getReviewRecords,
    loadOptoutsReviewed: getOptoutsReviewed,
    savePreview,
    loadPreview: getPreview,
    createRun,
    loadRun: getRun,
    pauseRun: id => pauseRun(id, true),
    saveSuppressions,
    markOptoutsReviewed,
    claimDelivery,
    setDeliveryStatus,
    recordEngagement,
    send: sendEmail,
    deliveryConfigured: isEmailDeliveryConfigured,
    isPublishedProduction: () => isProductionCampaignEnvironment(),
    now: () => new Date(),
    reserveWarmup, finishWarmup: finishWarmupReservation, pauseWarmup,
    warmingReason: warmupConfirmationReason, warmingOverview: getWarmupOverview,
    recoveryEligible: async candidate => (await getRecoveryCandidates([candidate])).length > 0,
    ...overrides,
  };
  const configured = () => deps.deliveryConfigured() && deps.isPublishedProduction();

  app.get("/api/admin/orsa/email-campaign", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [optoutsReviewed, needsReviewCount] = await Promise.all([
        deps.loadOptoutsReviewed(),
        deps.loadNeedsReviewCounts(),
      ]);
      const candidates = await deps.loadCandidates();
      const optedOut = await deps.loadOptedOutEmails(candidates.map(({ email }) => email));
      const eligible = candidates.filter(({ email }) => !optedOut.has(email));
      const warmingReason = await deps.warmingReason();
      const templates = buildOrsaHeartPlanEmailSequenceDrafts().map((draft) => {
        const sendability = warmingReason ? { sendable: false, reason: warmingReason } : templateSendability(draft.id, deps.now());
        const ready = configured() && optoutsReviewed;
        return {
          id: draft.id,
          subject: draft.subject,
          preheader: draft.preheader,
          suggestedSendDate: draft.suggestedSendDate,
          sendable: sendability.sendable && ready,
          ...(!sendability.sendable
            ? { reason: sendability.reason }
            : !optoutsReviewed
              ? { reason: "Review and reconcile the support inbox opt-outs before confirming a campaign." }
              : !configured()
                ? { reason: "Live delivery is only available from the published production app with email configured." }
                : {}),
        };
      });
      const [sentCounts, engagement] = await Promise.all([deps.loadSentCounts(), deps.loadEngagement()]);
      return res.json({
        templates,
        eligibleCount: eligible.length,
        suppressedCount: candidates.length - eligible.length,
        sentCounts,
        engagement,
        optoutsReviewed,
        needsReviewCount,
        configured: configured(),
      });
    } catch (error) {
      console.error("[ORSA email campaign] Failed to load campaign status", error);
      return res.status(500).json({ error: "Could not load ORSA email campaign." });
    }
  });

  app.post("/api/admin/orsa/email-campaign/preview", isAuthenticated, isAdmin, async (req, res) => {
    const input = previewInput.safeParse(req.body);
    if (!input.success || !isSupportedOrsaEmailCampaignTemplate(input.data?.templateId || "")) {
      return res.status(400).json({ error: "Choose one of the five supported ORSA email templates." });
    }
    if (input.data.audience === "never_emailed" && (input.data.retryHeld || input.data.templateId === "link-recovery")) {
      return res.status(400).json({ error: "Use the introductory activation email for never-emailed members. Recovery and retries require the separate follow-up audience." });
    }
    const template = buildOrsaHeartPlanEmailSequenceDrafts({
      recipientName: "Sample Member",
      unsubscribeUrl: `${getOutreachPublishedBaseUrl()}/api/orsa/email-unsubscribe/preview-only`,
    }).find(({ id }) => id === input.data.templateId)!;
    try {
      const adminUserId = actorIdFromRequest(req);
      if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
      const allCandidates = await deps.loadCandidates();
      const candidates = input.data.audience === "never_emailed" ? await deps.loadNeverEmailed(allCandidates) : allCandidates;
      const counts = await deps.countAvailable(template.id, candidates);
       const fullAvailable: Array<OrsaEmailCampaignCandidate & Partial<RetryEvidence>> = input.data.retryHeld
         ? await deps.loadRetryCandidates(template.id, candidates)
         : await deps.loadAvailableCandidates(template.id, candidates);
      const warming = await deps.warmingOverview();
      const groupLimit = Math.min(input.data.recipientLimit ?? 10, warming.settings.dailyLimit, Math.max(0, warming.remaining.daily));
      const available = fullAvailable.slice(0, groupLimit);
      const now = deps.now();
      const preview = await deps.savePreview({
        adminUserId,
        templateId: template.id,
        recipientSnapshot: available.map((candidate) => {
          const { id, email } = candidate;
          if (candidate.retryDeliveryId) {
            const { retryDeliveryId, priorTrackingTokenHash, priorAttemptedAt } = candidate;
            return { id, email, retryDeliveryId, priorTrackingTokenHash, priorAttemptedAt };
          }
          return { id, email, ...(input.data.audience === "never_emailed" ? { firstContactOnly: true as const } : {}) };
        }),
        expectedCount: available.length,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      });
      const logo = template.attachments.find(({ content_id }) => content_id === "orsa-logo");
      if (!logo?.content) throw new Error("The approved ORSA logo is unavailable for preview.");
      const previewHtml = template.html.replaceAll("cid:orsa-logo", `data:${logo.type};base64,${logo.content}`);
      return res.json({
        previewId: preview.id,
        retryHeld: Boolean(input.data.retryHeld),
        audience: input.data.audience,
        expiresAt: preview.expiresAt,
        subject: template.subject,
        html: previewHtml,
        text: template.text,
        eligibleCount: available.length,
        availableCount: fullAvailable.length,
        groupLimit,
        alreadySentCount: counts.alreadySentCount,
        recipients: available.map(({ email, displayName }) => ({ email, displayName })),
      });
    } catch (error) {
      console.error("[ORSA email campaign] Preview failed", error);
      return res.status(500).json({ error: "Could not build ORSA email campaign preview." });
    }
  });

  app.post("/api/admin/orsa/email-campaign/confirm", isAuthenticated, isAdmin, async (req, res) => {
    const input = confirmInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "A preview ID, matching recipient count, and explicit confirmation are required." });
    const adminUserId = actorIdFromRequest(req);
    if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
    try {
      if (!await deps.loadOptoutsReviewed()) {
        return res.status(409).json({ error: "Review and reconcile the support inbox opt-outs before confirming a campaign." });
      }
      if (!deps.isPublishedProduction()) return res.status(403).json({ error: "Campaign confirmation is disabled outside published production." });
      const warmingReason = await deps.warmingReason();
      if (warmingReason) return res.status(409).json({ error: warmingReason });
      if (!deps.deliveryConfigured()) return res.status(503).json({ error: "Email delivery is not configured." });
      const now = deps.now();
      const preview = await deps.loadPreview(input.data.previewId);
      if (!preview || preview.adminUserId !== adminUserId) {
        return res.status(404).json({ error: "This preview does not belong to the current administrator." });
      }
      if (preview.expiresAt.getTime() <= now.getTime()) return res.status(409).json({ error: "This preview expired. Build a fresh preview." });
      if (input.data.expectedCount !== preview.expectedCount ||
        preview.recipientSnapshot.length !== preview.expectedCount) {
        return res.status(409).json({ error: "The confirmed recipient count does not match the preview snapshot." });
      }
      const sendability = templateSendability(preview.templateId, now);
      if (!sendability.sendable) return res.status(409).json({ error: sendability.reason });
      const retryHeld = isRetrySnapshot(preview.recipientSnapshot);
      if (retryHeld && input.data.acceptDuplicateRisk !== true) {
        return res.status(400).json({ error: "Explicit acceptance of possible duplicate delivery is required to retry held emails." });
      }
      const firstContactOnly = preview.recipientSnapshot.some(row => row.firstContactOnly);
      const allCandidates = await deps.loadCandidates();
      const currentCandidates = firstContactOnly ? await deps.loadNeverEmailed(allCandidates) : allCandidates;
      const currentAvailable = retryHeld
        ? await deps.loadRetryCandidates(preview.templateId, currentCandidates)
        : await deps.loadAvailableCandidates(preview.templateId, currentCandidates);
      const snapshotKeys = new Set(preview.recipientSnapshot.map(({ id, email }) => `${id}\0${normalizeEmail(email)}`));
      const currentKeys = new Set(currentAvailable.map(({ id, email }) => `${id}\0${normalizeEmail(email)}`));
      let snapshotChanged = false;
      snapshotKeys.forEach((key) => { if (!currentKeys.has(key)) snapshotChanged = true; });
      if (snapshotKeys.size !== preview.expectedCount || snapshotChanged ||
        pendingSnapshotRecipients(preview.recipientSnapshot, currentAvailable).length !== preview.expectedCount) {
        return res.status(409).json({ error: "The eligible roster or suppression state changed since preview. Build a fresh preview." });
      }
      if ((await deps.warmingOverview()).remaining.daily < preview.expectedCount)
        return res.status(409).json({ error: "Daily warming capacity changed. Review a fresh recipient-group preview." });
      const run = await deps.createRun(preview, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
      if (!run || run.adminUserId !== adminUserId ||
        run.status !== (retryHeld ? "retry_confirmed" : "confirmed") || run.expiresAt.getTime() <= now.getTime()) {
        return res.status(409).json({ error: "This preview has already been confirmed or its campaign run is no longer valid." });
      }
      return res.json({ runId: run.id, expectedCount: run.expectedCount, expiresAt: run.expiresAt });
    } catch (error) {
      console.error("[ORSA email campaign] Confirmation failed", error);
      return res.status(500).json({ error: "Could not confirm the ORSA email campaign." });
    }
  });

  app.post("/api/admin/orsa/email-campaign/suppress", isAuthenticated, isAdmin, async (req, res) => {
    const input = suppressionInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Provide 1–1000 valid email addresses to suppress." });
    const adminUserId = actorIdFromRequest(req);
    if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
    const emails: string[] = [];
    const seenEmails = new Set<string>();
    input.data.emails.forEach((email) => {
      const normalized = normalizeEmail(email);
      if (!seenEmails.has(normalized)) {
        emails.push(normalized);
        seenEmails.add(normalized);
      }
    });
    try {
      await deps.saveSuppressions(emails, adminUserId);
      return res.json({ suppressedCount: emails.length });
    } catch (error) {
      console.error("[ORSA email campaign] Manual suppression failed", error);
      return res.status(500).json({ error: "Could not save the manual ORSA email suppressions." });
    }
  });

  app.post("/api/admin/orsa/email-campaign/optouts-reviewed", isAuthenticated, isAdmin, async (req, res) => {
    if (!optoutsReviewedInput.safeParse(req.body).success) {
      return res.status(400).json({ error: "Explicitly confirm that the support inbox opt-outs were reviewed." });
    }
    const adminUserId = actorIdFromRequest(req);
    if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
    try {
      const reviewedAt = deps.now();
      await deps.markOptoutsReviewed(adminUserId, reviewedAt);
      return res.json({ optoutsReviewed: true, reviewedAt });
    } catch (error) {
      console.error("[ORSA email campaign] Opt-out review record failed", error);
      return res.status(500).json({ error: "Could not record the opt-out review." });
    }
  });

  app.get("/api/admin/orsa/email-campaign/review", isAuthenticated, isAdmin, async (req, res) => {
    const templateId = typeof req.query.templateId === "string" ? req.query.templateId : "";
    if (!isSupportedOrsaEmailCampaignTemplate(templateId)) {
      return res.status(400).json({ error: "Choose one of the five supported ORSA email templates." });
    }
    try {
      return res.json({ records: await deps.loadReviewRecords(templateId) });
    } catch (error) {
      console.error("[ORSA email campaign] Review records could not be loaded", error);
      return res.status(500).json({ error: "Could not load ORSA email delivery records for review." });
    }
  });

  app.post("/api/admin/orsa/email-campaign/send-batch", isAuthenticated, isAdmin, async (req: any, res) => {
    const input = sendBatchInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "A confirmed campaign run ID is required." });
    const adminUserId = actorIdFromRequest(req);
    if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
    try {
      const run = await deps.loadRun(input.data.runId);
      if (!run || run.adminUserId !== adminUserId) return res.status(404).json({ error: "Confirmed campaign run not found for this administrator." });
      const now = deps.now();
      const retryHeld = isRetrySnapshot(run.recipientSnapshot);
      const requiredStatus = retryHeld ? "retry_confirmed" : "confirmed";
      if (run.status !== requiredStatus || run.expiresAt.getTime() <= now.getTime()) {
        return res.status(409).json({ error: "This campaign run is unconfirmed or expired. Create a fresh preview and confirm again." });
      }
      if (!await deps.loadOptoutsReviewed()) {
        return res.status(409).json({ error: "Review and reconcile the support inbox opt-outs before sending." });
      }
      if (!deps.isPublishedProduction()) return res.status(403).json({ error: "Campaign delivery is disabled outside published production." });
      if (!deps.deliveryConfigured()) return res.status(503).json({ error: "Email delivery is not configured." });
      const initialSendability = templateSendability(run.templateId, now);
      if (!initialSendability.sendable) return res.status(409).json({ error: initialSendability.reason });

      const firstContactOnly = run.recipientSnapshot.some(row => row.firstContactOnly);
      const allCandidates = await deps.loadCandidates();
      const currentCandidates = firstContactOnly ? await deps.loadNeverEmailed(allCandidates) : allCandidates;
      const available = retryHeld
        ? await deps.loadRetryCandidates(run.templateId, currentCandidates)
        : await deps.loadAvailableCandidates(run.templateId, currentCandidates);
      const pendingSnapshot = pendingSnapshotRecipients(run.recipientSnapshot, available);
      const batch = pendingSnapshot.slice(0, MAX_BATCH_SIZE);
      let sent = 0;
      let needsReview = 0;
      let skipped = 0;
      let paused = false;
      let throttle: Record<string, unknown> = {};
      const retryRunActive = async () => (await deps.loadRun(run.id))?.status === requiredStatus;

      for (const snapshotRecipient of batch) {
        const beforeSendability = templateSendability(run.templateId, deps.now());
        if (!beforeSendability.sendable || !deps.isPublishedProduction() || !deps.deliveryConfigured() ||
          !await deps.loadOptoutsReviewed() || !await retryRunActive()) break;
        const current = await deps.loadCandidates();
        const candidate = current.find(({ id, email }) =>
          id === snapshotRecipient.id && email === normalizeEmail(snapshotRecipient.email));
        const optedOut = await deps.loadOptedOutEmails([normalizeEmail(snapshotRecipient.email)]);
        if (!candidate || optedOut.has(normalizeEmail(snapshotRecipient.email))) {
          skipped++;
          continue;
        }
        const warming = await deps.reserveWarmup(run.templateId, adminUserId);
        if (!warming.allowed) {
          const { allowed: _allowed, ...blocked } = warming;
          throttle = { throttled: true, ...blocked };
          paused = warming.paused;
          break;
        }
        const firstContactCandidate = snapshotRecipient.firstContactOnly ? { ...candidate, firstContactOnly: true as const } : candidate;
        if (snapshotRecipient.firstContactOnly && !(await deps.loadNeverEmailed([candidate])).length) {
          skipped++;
          continue;
        }
        const claim = await deps.claimDelivery(firstContactCandidate, run.templateId, adminUserId, retryHeld ? snapshotRecipient : undefined);
        if (claim.disposition !== "claimed") {
          skipped++;
          continue;
        }
        try {
          const finalCandidates = await deps.loadCandidates();
          const stillEligible = finalCandidates.find(({ id, email }) =>
            id === snapshotRecipient.id && email === normalizeEmail(snapshotRecipient.email));
          const latestOptouts = await deps.loadOptedOutEmails([normalizeEmail(snapshotRecipient.email)]);
          const finalSendability = templateSendability(run.templateId, deps.now());
          if (!finalSendability.sendable || !deps.isPublishedProduction() || !deps.deliveryConfigured() ||
            !await deps.loadOptoutsReviewed() || !await retryRunActive()) {
            await deps.setDeliveryStatus(claim.deliveryId, "needs_review");
            needsReview++;
            if (retryHeld) { await deps.pauseRun(run.id); paused = true; }
            break;
          }
          if (!stillEligible || latestOptouts.has(normalizeEmail(snapshotRecipient.email)) ||
            (run.templateId === "link-recovery" && !await deps.recoveryEligible(stillEligible))) {
            await deps.setDeliveryStatus(claim.deliveryId, "skipped");
            skipped++;
            continue;
          }
          const draft = buildOrsaHeartPlanEmailSequenceDrafts({
            recipientName: stillEligible.displayName,
            unsubscribeUrl: unsubscribeUrl(claim.unsubscribeToken),
            trackingToken: claim.trackingToken,
          }).find(({ id }) => id === run.templateId)!;
          const submissionSendability = templateSendability(run.templateId, deps.now());
          if (!submissionSendability.sendable || !deps.isPublishedProduction() || !deps.deliveryConfigured() ||
            !await deps.loadOptoutsReviewed() || !await retryRunActive()) {
            await deps.setDeliveryStatus(claim.deliveryId, "needs_review");
            needsReview++;
            if (retryHeld) { await deps.pauseRun(run.id); paused = true; }
            break;
          }
          const accepted = await deps.send({
            to: normalizeEmail(snapshotRecipient.email),
            subject: draft.subject,
            html: draft.html,
            text: draft.text,
            attachments: draft.attachments,
            fromName: draft.fromName,
            throwOnFailure: true,
            suppressRecipientLogging: true,
            customArgs: { sal_email_type: "orsa_email_campaign", sal_orsa_campaign_delivery_id: claim.deliveryId, template_id: run.templateId },
            warmupReservationId: warming.reservationId,
            disableProviderClickTracking: true,
          });
          if (!accepted) throw new Error("Email provider did not confirm acceptance.");
          await deps.finishWarmup(warming.reservationId, true);
          const status = deliveryStatusForProviderResult(accepted);
          await deps.setDeliveryStatus(claim.deliveryId, status, new Date());
          sent++;
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
          throttle.reason = code === 401 ? "SendGrid authentication failed (401). Review the live email connection before resuming."
            : code === 429 ? "SendGrid rate-limited the request (429). Review the provider limits before resuming."
              : "The provider did not confirm submission. Review delivery before resuming.";
          await deps.pauseWarmup("An ORSA email failed or submission was uncertain. Review the provider result before resuming.");
          await deps.finishWarmup(warming.reservationId, false);
          console.error("[ORSA email campaign] Provider outcome requires review", error instanceof Error ? error.name : "Unknown error");
          await deps.setDeliveryStatus(claim.deliveryId, "needs_review");
          needsReview++;
          await deps.pauseRun(run.id);
          paused = true;
          break;
        }
      }
      const allFresh = await deps.loadCandidates();
      const fresh = firstContactOnly ? await deps.loadNeverEmailed(allFresh) : allFresh;
      const remaining = retryHeld
        ? await deps.loadRetryCandidates(run.templateId, fresh)
        : await deps.loadAvailableCandidates(run.templateId, fresh);
      const remainingCount = pendingSnapshotRecipients(run.recipientSnapshot, remaining).length;
      return res.json({ sent, remaining: remainingCount, needsReview, skipped, paused, ...throttle });
    } catch (error) {
      // Persistence failures must not leave other admin tabs sending.
      try { await deps.pauseWarmup("Campaign processing failed. Review delivery status before resuming."); } catch { /* Budget reservations fail closed if storage is unavailable. */ }
      console.error("[ORSA email campaign] Batch failed", error instanceof Error ? error.name : "Unknown error");
      return res.status(500).json({ error: "Could not complete ORSA email batch. Review delivery status before retrying." });
    }
  });

  const TRACKING_PIXEL = Buffer.from("R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=", "base64");
  app.get("/api/orsa/email-campaign/open/:token", async (req, res) => {
    res.set({ "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" });
    const token = String(req.params.token || "");
    if (/^[a-f0-9]{48}$/.test(token)) {
      try {
        await deps.recordEngagement(token, "open");
      } catch (error) {
        console.error("[ORSA email campaign] Could not record open", error);
      }
    }
    return res.type("gif").send(TRACKING_PIXEL);
  });

  app.get("/api/orsa/email-campaign/click/:token", async (req, res) => {
    res.set({ "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" });
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).send("Link not found.");
    try {
      await deps.recordEngagement(token, "click");
    } catch (error) {
      console.error("[ORSA email campaign] Could not record click", error);
    }
    return res.redirect(302, `${getAppUrl()}/heartplan-register?orsa_offer=1`);
  });

  app.get("/api/orsa/email-unsubscribe/:token", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ error: "Link not found" });
    const [contact] = await db.select({ optedOutAt: orsaEmailCampaignContacts.optedOutAt })
      .from(orsaEmailCampaignContacts).where(eq(orsaEmailCampaignContacts.unsubscribeToken, token)).limit(1);
    if (!contact) return res.status(404).json({ error: "Link not found" });
    const content = contact.optedOutAt
      ? "<p>This email address is already unsubscribed from ORSA member emails.</p>"
      : `<p>Confirm that you want to stop ORSA member emails.</p><form method="post"><button type="submit">Unsubscribe</button></form>`;
    return res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>ORSA email preferences</title><body><main><h1>ORSA email preferences</h1>${content}</main></body></html>`);
  });

  app.post("/api/orsa/email-unsubscribe/:token", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ error: "Link not found" });
    const [updated] = await db.update(orsaEmailCampaignContacts).set({ optedOutAt: new Date() })
      .where(eq(orsaEmailCampaignContacts.unsubscribeToken, token))
      .returning({ email: orsaEmailCampaignContacts.normalizedEmail });
    if (!updated) return res.status(404).json({ error: "Link not found" });
    return res.type("html").send("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Unsubscribed</title><body><main><h1>You are unsubscribed</h1><p>ORSA member emails have been stopped for this email address.</p></main></body></html>");
  });
}