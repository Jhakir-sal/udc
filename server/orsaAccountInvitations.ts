import type { Express, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { orsaRosterMembers, orsaEmailCampaignContacts } from "@shared/schema";
import { users } from "@shared/models/auth";
import { complimentaryOrsaLegacyIsActive } from "@shared/orsaLegacyOffer";
import { buildOrsaRosterInvitationEmail, isEmailDeliveryConfigured, sendEmail } from "./email";
import { claimOrsaInvitation, finishOrsaInvitation } from "./orsaService";
import {
  eligibleOrsaCampaignRecipients,
  savePreview, getPreview, createRun, getRun, pauseRun, getOptoutsReviewed,
} from "./orsaEmailCampaign";
import type { CampaignSnapshotRecipient } from "./orsaEmailCampaignRetry";
import { isRetrySnapshot } from "./orsaEmailCampaignRetry";
import { finishWarmupReservation, getWarmupOverview, pauseWarmup, reserveWarmup, warmupConfirmationReason } from "./orsaWarmup";
import { isProductionDeployment } from "./deploymentEnv";

const TEMPLATE_ID = "account-activation";
const BASE = "/api/admin/orsa/account-invitations";
const previewInput = z.object({ retryHeld: z.boolean().optional(), recipientLimit: z.number().int().min(1).max(500).optional() }).strict();
const confirmInput = z.object({
  previewId: z.string().uuid(), expectedCount: z.number().int().positive(), confirmed: z.literal(true),
  acceptDuplicateRisk: z.literal(true).optional(),
}).strict();
const batchInput = z.object({ runId: z.string().uuid() }).strict();

export type InvitationAudienceRow = {
  id: string; normalizedEmail: string | null; sharedEligibilityEmail: string | null;
  displayName: string | null; active: boolean; invitationStatus: string;
  invitationSentAt: Date | null; invitationAcceptedAt: Date | null;
  invitationAttemptedAt: Date | null; invitationFirstAttemptAt: Date | null;
};
type Recipient = CampaignSnapshotRecipient & { displayName: string | null };

export function invitationAudience(rows: InvitationAudienceRow[], accountEmails: Set<string>, optouts: Set<string>) {
  const eligible = eligibleOrsaCampaignRecipients(rows);
  const byId = new Map(rows.map(row => [row.id, row]));
  const firstTime: Recipient[] = [];
  const held: Recipient[] = [];
  for (const candidate of eligible) {
    const row = byId.get(candidate.id)!;
    if (accountEmails.has(candidate.email) || optouts.has(candidate.email) ||
      row.invitationSentAt || row.invitationAcceptedAt) continue;
    if (["pending", "no_email"].includes(row.invitationStatus) &&
      !row.invitationAttemptedAt && !row.invitationFirstAttemptAt) {
      firstTime.push(candidate);
    } else if (["needs_review", "failed"].includes(row.invitationStatus) && row.invitationAttemptedAt) {
      held.push({ ...candidate, retryDeliveryId: candidate.id, priorAttemptedAt: row.invitationAttemptedAt.toISOString() });
    }
  }
  return {
    firstTime, held,
    counts: {
      readyCount: firstTime.length, heldCount: held.length,
      submittedCount: rows.filter(row => row.invitationSentAt || row.invitationStatus === "sent").length,
      acceptedCount: rows.filter(row => row.invitationAcceptedAt || row.invitationStatus === "accepted").length,
      existingAccountCount: eligible.filter(row => accountEmails.has(row.email)).length,
      noIndividualEmailCount: rows.filter(row => row.active && !row.normalizedEmail).length,
      suppressedCount: eligible.filter(row => optouts.has(row.email)).length,
    },
    eligible,
  };
}

export function pendingInvitations(snapshot: CampaignSnapshotRecipient[], available: Recipient[], retryHeld: boolean) {
  const current = new Map(available.map(row => [row.id, row]));
  return snapshot.filter(row => {
    const candidate = current.get(row.id);
    return candidate?.email === row.email && (!retryHeld ||
      (candidate.retryDeliveryId === row.retryDeliveryId && candidate.priorAttemptedAt === row.priorAttemptedAt));
  });
}

async function loadLiveAudience() {
  const [rows, accounts, suppressed] = await Promise.all([
    db.select().from(orsaRosterMembers),
    db.select({ email: users.email }).from(users),
    db.select({ email: orsaEmailCampaignContacts.normalizedEmail }).from(orsaEmailCampaignContacts)
      .where(sql`${orsaEmailCampaignContacts.optedOutAt} IS NOT NULL`),
  ]);
  return {
    rows,
    ...invitationAudience(rows, new Set(accounts.flatMap(row => row.email ? [row.email.trim().toLowerCase()] : [])),
      new Set(suppressed.map(row => row.email))),
  };
}

async function claimStillAllowed(claim: Extract<Awaited<ReturnType<typeof claimOrsaInvitation>>, { disposition: "claimed" }>) {
  const live = await loadLiveAudience();
  const member = live.rows.find(row => row.id === claim.id);
  if (!member || !member.active || member.normalizedEmail !== claim.email ||
    member.invitationLeaseId !== claim.leaseId || member.invitationStatus !== "sending" ||
    !member.invitationLeaseExpiresAt || member.invitationLeaseExpiresAt.getTime() <= Date.now()) return false;
  if (!live.eligible.some(row => row.id === claim.id && row.email === claim.email)) return false;
  const [account, optedOut] = await Promise.all([
    db.select({ id: users.id }).from(users).where(sql`lower(trim(${users.email})) = ${claim.email}`).limit(1),
    db.select({ email: orsaEmailCampaignContacts.normalizedEmail }).from(orsaEmailCampaignContacts)
      .where(and(eq(orsaEmailCampaignContacts.normalizedEmail, claim.email), sql`${orsaEmailCampaignContacts.optedOutAt} IS NOT NULL`)).limit(1),
  ]);
  return !account.length && !optedOut.length;
}

type Audience = ReturnType<typeof invitationAudience> & { rows: InvitationAudienceRow[] };
export type InvitationDependencies = {
  audience: () => Promise<Audience>;
  savePreview: typeof savePreview; getPreview: typeof getPreview; createRun: typeof createRun;
  getRun: typeof getRun; pauseRun: typeof pauseRun;
  claim: typeof claimOrsaInvitation; finish: typeof finishOrsaInvitation;
  stillAllowed: typeof claimStillAllowed; send: typeof sendEmail; build: typeof buildOrsaRosterInvitationEmail;
  configured: () => boolean; production: () => boolean; reviewed: () => Promise<boolean>; now: () => Date;
  reserveWarmup: typeof reserveWarmup; finishWarmup: typeof finishWarmupReservation;
  pauseWarmup: typeof pauseWarmup; warmingReason: typeof warmupConfirmationReason; warmingOverview: typeof getWarmupOverview;
};

export function registerOrsaAccountInvitationRoutes(
  app: Express, authenticated: RequestHandler, admin: RequestHandler, overrides: Partial<InvitationDependencies> = {},
) {
  const deps: InvitationDependencies = {
    audience: loadLiveAudience, savePreview, getPreview, createRun, getRun, pauseRun: (id) => pauseRun(id, true),
    claim: claimOrsaInvitation, finish: finishOrsaInvitation, stillAllowed: claimStillAllowed,
    send: sendEmail, build: buildOrsaRosterInvitationEmail,
    configured: isEmailDeliveryConfigured, production: isProductionDeployment,
    reviewed: getOptoutsReviewed, now: () => new Date(),
    reserveWarmup, finishWarmup: finishWarmupReservation, pauseWarmup,
    warmingReason: warmupConfirmationReason, warmingOverview: getWarmupOverview, ...overrides,
  };
  const actor = (req: any): string | null => req.session?.userId || req.user?.claims?.sub || null;
  const guard = async () => {
    if (!deps.production()) return "Invitation delivery is only available on the published production app.";
    if (!deps.configured()) return "Email delivery is not configured.";
    if (!complimentaryOrsaLegacyIsActive(deps.now())) return "The complimentary ORSA invitation offer has ended.";
    if (!await deps.reviewed()) return "Review and reconcile past email opt-outs in the campaign section before sending invitations.";
    const warmingReason = await deps.warmingReason();
    if (warmingReason) return warmingReason;
    return null;
  };
  const failure = (res: any, error: unknown) => {
    // Do not expose recipients, tokens, or provider credentials in this log.
    console.error("[ORSA account invitations] Request failed", error instanceof Error ? error.name : "Unknown error");
    return res.status(500).json({ error: "Could not complete invitation request. Review the updated status before trying again." });
  };

  app.get(BASE, authenticated, admin, async (_req, res) => {
    try {
      const [live, reason] = await Promise.all([deps.audience(), guard()]);
      res.json({ ...live.counts, configured: deps.production() && deps.configured(), sendable: !reason, ...(reason ? { reason } : {}) });
    } catch (error) { failure(res, error); }
  });

  app.post(`${BASE}/preview`, authenticated, admin, async (req, res) => {
    const input = previewInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Choose a first-time or held-invitation preview." });
    const adminUserId = actor(req);
    if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
    try {
      const live = await deps.audience();
      const retryHeld = Boolean(input.data.retryHeld);
      const fullRecipients = retryHeld ? live.held : live.firstTime;
      const warming = await deps.warmingOverview();
      const groupLimit = Math.min(input.data.recipientLimit ?? 10, warming.settings.dailyLimit, Math.max(0, warming.remaining.daily));
      const recipients = fullRecipients.slice(0, groupLimit);
      const draft = deps.build({ recipientEmail: "sample@example.invalid", recipientName: "Sample Member" });
      let html = draft.html;
      for (const attachment of draft.attachments ?? []) {
        if (attachment.content_id) html = html.replace(`cid:${attachment.content_id}`, `data:${attachment.type};base64,${attachment.content}`);
      }
      const preview = await deps.savePreview({
        adminUserId, templateId: TEMPLATE_ID, expectedCount: recipients.length,
        recipientSnapshot: recipients.map(({ displayName: _name, ...snapshot }) => snapshot),
        expiresAt: new Date(deps.now().getTime() + 30 * 60 * 1000),
      });
      res.json({ previewId: preview.id, retryHeld, subject: draft.subject, html, text: draft.text,
        eligibleCount: recipients.length, alreadySentCount: live.counts.submittedCount, availableCount: fullRecipients.length, groupLimit,
        recipients: recipients.map(({ email, displayName }) => ({ email, displayName })) });
    } catch (error) { failure(res, error); }
  });

  app.post(`${BASE}/confirm`, authenticated, admin, async (req, res) => {
    const input = confirmInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Confirm the reviewed invitation count." });
    const adminUserId = actor(req);
    if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
    try {
      const reason = await guard();
      if (reason) return res.status(409).json({ error: reason });
      const preview = await deps.getPreview(input.data.previewId);
      if (!preview || preview.adminUserId !== adminUserId || preview.templateId !== TEMPLATE_ID)
        return res.status(404).json({ error: "Invitation preview not found for this administrator." });
      if (preview.expiresAt.getTime() <= deps.now().getTime() || preview.expectedCount !== input.data.expectedCount)
        return res.status(409).json({ error: "Invitation preview expired or the count changed. Preview again." });
      const retryHeld = isRetrySnapshot(preview.recipientSnapshot);
      if (retryHeld && !input.data.acceptDuplicateRisk)
        return res.status(400).json({ error: "Accept the possible duplicate-delivery risk for held invitations." });
      const live = await deps.audience();
      if (pendingInvitations(preview.recipientSnapshot, retryHeld ? live.held : live.firstTime, retryHeld).length !== preview.expectedCount)
        return res.status(409).json({ error: "Invitation eligibility changed. Review a fresh preview before sending." });
      if ((await deps.warmingOverview()).remaining.daily < preview.expectedCount)
        return res.status(409).json({ error: "Daily warming capacity changed. Review a fresh recipient-group preview." });
      const run = await deps.createRun(preview, new Date(deps.now().getTime() + 7 * 24 * 60 * 60 * 1000));
      if (!run || run.status !== (retryHeld ? "retry_confirmed" : "confirmed") || run.expiresAt.getTime() <= deps.now().getTime())
        return res.status(409).json({ error: "This invitation run is paused or expired. Review a fresh preview." });
      res.json({ runId: run.id });
    } catch (error) { failure(res, error); }
  });

  app.post(`${BASE}/send-batch`, authenticated, admin, async (req, res) => {
    const input = batchInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "A confirmed invitation run is required." });
    const adminUserId = actor(req);
    if (!adminUserId) return res.status(403).json({ error: "An authenticated administrator is required." });
    let authorizedRunId: string | undefined;
    try {
      const run = await deps.getRun(input.data.runId);
      if (!run || run.adminUserId !== adminUserId || run.templateId !== TEMPLATE_ID)
        return res.status(404).json({ error: "Invitation run not found for this administrator." });
      authorizedRunId = run.id;
      const retryHeld = isRetrySnapshot(run.recipientSnapshot);
      const status = retryHeld ? "retry_confirmed" : "confirmed";
      const active = async () => {
        const latest = await deps.getRun(run.id);
        return latest?.status === status && latest.expiresAt.getTime() > deps.now().getTime();
      };
      if (!await active()) return res.status(409).json({ error: "Invitation run paused or expired. Review a fresh preview." });
      const reason = await guard();
      if (reason) return res.status(409).json({ error: reason });
      const live = await deps.audience();
      const batch = pendingInvitations(run.recipientSnapshot, retryHeld ? live.held : live.firstTime, retryHeld).slice(0, 25);
      let sent = 0, skipped = 0, needsReview = 0, paused = false;
      let pauseReason: string | undefined;
      let throttle: Record<string, unknown> = {};
      for (const recipient of batch) {
        if (!await active()) { await deps.pauseRun(run.id); paused = true; break; }
        const fresh = await deps.audience();
        if (!pendingInvitations([recipient], retryHeld ? fresh.held : fresh.firstTime, retryHeld).length) { skipped++; continue; }
        const warming = await deps.reserveWarmup(TEMPLATE_ID, adminUserId);
        if (!warming.allowed) {
          const { allowed: _allowed, ...blocked } = warming;
          throttle = { throttled: true, ...blocked };
          paused = warming.paused;
          pauseReason = warming.reason;
          break;
        }
        const claim = await deps.claim(recipient.id, deps.now(), {
          email: recipient.email, retryHeld, priorAttemptedAt: recipient.priorAttemptedAt,
        });
        if (claim.disposition !== "claimed") { skipped++; continue; }
        try {
          if (!await deps.stillAllowed(claim) || !await active() || await guard()) {
            await deps.finish(claim.id, claim.leaseId, false, adminUserId);
            needsReview++; await deps.pauseRun(run.id); paused = true; break;
          }
          const accepted = await deps.send({
            ...deps.build({ recipientEmail: claim.email, recipientName: claim.displayName }),
            throwOnFailure: true, suppressRecipientLogging: true,
            warmupReservationId: warming.reservationId,
          });
          await deps.finishWarmup(warming.reservationId, accepted);
          const result = await deps.finish(claim.id, claim.leaseId, accepted, adminUserId);
          if (!accepted || !result.recorded) {
            await deps.pauseWarmup("An invitation submission could not be confirmed. Review delivery before resuming.");
            needsReview++; await deps.pauseRun(run.id); paused = true; break;
          }
          sent++;
        } catch (error) {
          await deps.pauseWarmup("An account invitation failed. Review the provider result before resuming.");
          await deps.finishWarmup(warming.reservationId, false);
          await deps.finish(claim.id, claim.leaseId, false, adminUserId);
          const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
          pauseReason = code === 401
            ? "SendGrid authentication failed (401 Unauthorized). Fix the live email connection before retrying."
            : code === 403
              ? "The email provider rejected the request (403 Forbidden). Check sending permissions and sender verification."
              : code === 429
                ? "The email provider rate-limited the request (429). Review the provider before retrying."
                : "The email provider did not confirm submission. Review delivery before retrying.";
          needsReview++; await deps.pauseRun(run.id); paused = true; break;
        }
      }
      const fresh = await deps.audience();
      const remaining = pendingInvitations(run.recipientSnapshot, retryHeld ? fresh.held : fresh.firstTime, retryHeld).length;
      res.json({ sent, remaining, skipped, needsReview, paused, ...(pauseReason ? { reason: pauseReason } : {}), ...throttle });
    } catch (error) {
      // A storage or transport exception must not leave other batches running.
      try { if (authorizedRunId) { await deps.pauseWarmup("Invitation processing failed. Review status before resuming."); await deps.pauseRun(authorizedRunId); } } catch { /* Return an explicit failure even if persistence is unavailable. */ }
      failure(res, error);
    }
  });
}