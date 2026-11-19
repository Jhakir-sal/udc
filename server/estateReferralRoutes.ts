import type { Express, RequestHandler } from "express";
import crypto from "node:crypto";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { caseEvents, estateReferrals, estateReferralRequests, estateReferralUpdates } from "@shared/schema";
import { estateReferralSaveSchema, estateReferralUpdateSchema } from "@shared/estateReferral";
import { isEmailDeliveryConfigured, sendEmail } from "./email";
import { buildEstateReferralRequestEmail } from "./estateReferralEmail";

const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { httpStatus: status }); };
const previewBody = z.object({ expectedVersion: z.number().int().min(1), recipientKind: z.enum(["attorney", "family"]) }).strict();
const sendBody = z.object({ confirmed: z.literal(true) }).strict();
const at = (date: string | null) => date ? new Date(date) : null;
const base = "/api/admin/case/:certId/estate-referral";
const emailValid = (value: string | null | undefined): value is string => !!value && z.string().email().safeParse(value).success;

export function registerEstateReferralRoutes(app: Express, authenticated: RequestHandler, delivery = {
  configured: isEmailDeliveryConfigured, send: sendEmail,
}) {
  const guard: RequestHandler = async (req: any, res, next) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const actorId = req.session?.userId || req.user?.claims?.sub;
      const actor = actorId ? await storage.getUser(actorId) : undefined;
      if (!actor || actor.role !== "admin") return res.status(403).json({ error: "Concierge access is required." });
      const certificate = await storage.getCertificate(String(req.params.certId));
      if (!certificate) return res.status(404).json({ error: "Case not found." });
      res.locals.referralActor = actor;
      res.locals.referralCertificate = certificate;
      next();
    } catch { res.status(503).json({ error: "Could not check case access. Please try again." }); }
  };
  const handle = (fn: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    try { await fn(req, res); }
    catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors.map(e => e.message).join(" ") });
      res.status(error.httpStatus || 503).json({ error: error.httpStatus ? error.message : "The referral could not be updated. Refresh and check its history before trying again." });
    }
  };
  const find = async (certificateId: string) => (await db.select().from(estateReferrals)
    .where(eq(estateReferrals.certificateId, certificateId)).limit(1))[0];
  const recipient = async (referral: typeof estateReferrals.$inferSelect, certificate: any, kind: "attorney" | "family") => {
    if (referral.status === "needed" || referral.status === "closed" || !referral.referredAt) {
      fail(409, "Record an actual, open referral before requesting an update.");
    }
    if (kind === "attorney") {
      if (!referral.permissionConfirmedAt || !emailValid(referral.attorneyEmail)) fail(409, "Confirm family permission and a usable attorney email before sending.");
      return referral.attorneyEmail;
    }
    const owner = certificate.userId ? await storage.getUser(certificate.userId) : undefined;
    if (!owner || owner.role !== "user" || !emailValid(owner.email)) fail(409, "The case owner does not have a usable family account email.");
    return owner!.email!;
  };

  app.get(base, authenticated, guard, handle(async (_req, res) => {
    const certificate = res.locals.referralCertificate;
    const referral = await find(certificate.id);
    const updates = referral ? await db.select().from(estateReferralUpdates)
      .where(eq(estateReferralUpdates.referralId, referral.id)).orderBy(desc(estateReferralUpdates.recordedAt)).limit(100) : [];
    const requests = referral ? await db.select({
      id: estateReferralRequests.id, recipientKind: estateReferralRequests.recipientKind,
      recipientEmail: estateReferralRequests.recipientEmail, status: estateReferralRequests.status,
      createdAt: estateReferralRequests.createdAt, submittedAt: estateReferralRequests.submittedAt,
      attemptedAt: estateReferralRequests.attemptedAt,
    }).from(estateReferralRequests).where(eq(estateReferralRequests.referralId, referral.id))
      .orderBy(desc(estateReferralRequests.createdAt)).limit(50) : [];
    res.json({
      referral: referral || null, referralNeeded: referral ? referral.status === "needed" : certificate.estateStatus === "no",
      updates, requests: requests.map(r => ({
        ...r, status: r.status === "sending" && r.attemptedAt && Date.now() - r.attemptedAt.getTime() > 120000 ? "needs_review" : r.status,
      })), deliveryConfigured: delivery.configured(),
    });
  }));

  app.put(base, authenticated, guard, handle(async (req, res) => {
    const data = estateReferralSaveSchema.parse(req.body);
    const certificate = res.locals.referralCertificate;
    const actor = res.locals.referralActor;
    const saved = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estate-referral:${certificate.id}`}))`);
      const [current] = await tx.select().from(estateReferrals).where(eq(estateReferrals.certificateId, certificate.id)).for("update");
      if ((current?.version || 0) !== data.expectedVersion) fail(409, "This referral changed in another tab. Refresh and review the latest record.");
      if (current) {
        const [activeSend] = await tx.select({ id: estateReferralRequests.id }).from(estateReferralRequests).where(and(
          eq(estateReferralRequests.referralId, current.id), eq(estateReferralRequests.status, "sending"),
          gte(estateReferralRequests.attemptedAt, new Date(Date.now() - 120000)),
        )).limit(1);
        if (activeSend) fail(409, "An email is being submitted. Wait for its result before changing this referral.");
      }
      const changedRecipient = current && ["attorneyEmail", "attorneyName", "attorneyFirm", "attorneyPhone"]
        .some(field => (current as any)[field] !== (data as any)[field]);
      const values = {
        reason: data.reason, status: data.status, attorneyName: data.attorneyName, attorneyFirm: data.attorneyFirm,
        attorneyEmail: data.attorneyEmail, attorneyPhone: data.attorneyPhone,
        referredAt: at(data.referredAt), nextFollowUpAt: at(data.nextFollowUpAt), resolutionSummary: data.resolutionSummary,
        permissionConfirmedAt: data.familyPermissionConfirmed ? (changedRecipient ? new Date() : current?.permissionConfirmedAt || new Date()) : null,
        permissionConfirmedBy: data.familyPermissionConfirmed ? (changedRecipient ? actor.id : current?.permissionConfirmedBy || actor.id) : null,
        version: (current?.version || 0) + 1, updatedAt: new Date(), updatedBy: actor.id,
      };
      const [result] = current
        ? await tx.update(estateReferrals).set(values).where(eq(estateReferrals.id, current.id)).returning()
        : await tx.insert(estateReferrals).values({
          ...values, certificateId: certificate.id, reference: `SAL-ER-${crypto.randomBytes(9).toString("hex").toUpperCase()}`,
        }).returning();
      await tx.insert(caseEvents).values({
        certificateId: certificate.id, actorId: actor.id, actorRole: "admin",
        eventType: "estate_referral_updated",
        description: `Attorney referral tracking saved as ${data.status.replace(/_/g, " ")}. No email was sent by this save.`,
      });
      return result;
    });
    res.json(saved);
  }));

  app.post(`${base}/updates`, authenticated, guard, handle(async (req, res) => {
    const data = estateReferralUpdateSchema.parse(req.body);
    if (new Date(data.reportedAt).getTime() > Date.now() + 60000) fail(400, "The reported update date cannot be in the future.");
    const certificate = res.locals.referralCertificate;
    const actor = res.locals.referralActor;
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(estateReferrals).where(eq(estateReferrals.certificateId, certificate.id)).for("update");
      if (!current || current.version !== data.expectedVersion) fail(409, "Refresh and review the latest referral before adding this update.");
      const [created] = await tx.insert(estateReferralUpdates).values({
        referralId: current.id, source: data.source, summary: data.summary,
        reportedAt: new Date(data.reportedAt), recordedBy: actor.id,
      }).returning();
      await tx.update(estateReferrals).set({ version: current.version + 1, updatedAt: new Date(), updatedBy: actor.id }).where(eq(estateReferrals.id, current.id));
      await tx.insert(caseEvents).values({
        certificateId: certificate.id, actorId: actor.id, actorRole: "admin",
        eventType: "estate_referral_status_received", description: `A ${data.source} coordination update was recorded in the attorney referral tracker.`,
      });
      return created;
    });
    res.status(201).json(result);
  }));

  app.post(`${base}/requests/preview`, authenticated, guard, handle(async (req, res) => {
    const data = previewBody.parse(req.body);
    const certificate = res.locals.referralCertificate;
    const referral = await find(certificate.id);
    if (!referral || referral.version !== data.expectedVersion) fail(409, "Refresh and save the current referral before preparing an email.");
    const to = await recipient(referral!, certificate, data.recipientKind);
    const email = buildEstateReferralRequestEmail({ to, recipientKind: data.recipientKind, reference: referral!.reference });
    const [draft] = await db.insert(estateReferralRequests).values({
      referralId: referral!.id, referralVersion: referral!.version, recipientKind: data.recipientKind,
      recipientEmail: to, subject: email.subject, text: email.text, createdBy: res.locals.referralActor.id,
    }).returning();
    res.status(201).json({ id: draft.id, to, subject: draft.subject, text: draft.text, recipientKind: draft.recipientKind });
  }));

  app.post(`${base}/requests/:requestId/send`, authenticated, guard, handle(async (req, res) => {
    sendBody.parse(req.body);
    if (!delivery.configured()) fail(503, "Email delivery is not configured. Nothing was sent.");
    const certificate = res.locals.referralCertificate;
    const actor = res.locals.referralActor;
    const draft = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estate-mail-actor:${actor.id}`}))`);
      const [referral] = await tx.select().from(estateReferrals).where(eq(estateReferrals.certificateId, certificate.id)).for("update");
      if (!referral) fail(404, "Referral not found.");
      const [request] = await tx.select().from(estateReferralRequests).where(and(
        eq(estateReferralRequests.id, req.params.requestId), eq(estateReferralRequests.referralId, referral!.id),
      )).for("update");
      if (!request) fail(404, "Email preview not found for this case.");
      if (request!.createdBy !== actor.id) fail(403, "Prepare and review your own email preview before sending.");
      if (request!.status !== "draft") fail(409, "This request has already been attempted. Check its history; it will not be resent.");
      if (Date.now() - request!.createdAt.getTime() > 15 * 60000 || request!.referralVersion !== referral!.version) fail(409, "This preview is stale. Prepare and review a new email.");
      const to = await recipient(referral!, certificate, request!.recipientKind as "attorney" | "family");
      if (to.toLowerCase() !== request!.recipientEmail.toLowerCase()) fail(409, "The recipient changed. Prepare a new preview.");
      const cutoff = new Date(Date.now() - 3600000);
      const [recent] = await tx.select({ id: estateReferralRequests.id }).from(estateReferralRequests).where(and(
        eq(estateReferralRequests.referralId, referral!.id), eq(estateReferralRequests.recipientEmail, request!.recipientEmail),
        gte(estateReferralRequests.attemptedAt, cutoff),
      )).limit(1);
      if (recent) fail(429, "An update request was already attempted for this recipient within the last hour. Check its status first.");
      const [traffic] = await tx.select({ count: sql<number>`count(*)::int` }).from(estateReferralRequests).where(and(
        eq(estateReferralRequests.createdBy, actor.id), isNotNull(estateReferralRequests.attemptedAt), gte(estateReferralRequests.attemptedAt, cutoff),
      ));
      if (traffic.count >= 20) fail(429, "You have reached 20 update-request attempts this hour.");
      const [claimed] = await tx.update(estateReferralRequests).set({ status: "sending", attemptedAt: new Date() })
        .where(eq(estateReferralRequests.id, request!.id)).returning();
      await tx.insert(caseEvents).values({
        certificateId: certificate.id, actorId: actor.id, actorRole: "admin",
        eventType: "estate_referral_email_requested", description: `A ${claimed.recipientKind} status-request email was reserved for delivery. Request ${claimed.id}.`,
      });
      return claimed;
    });
    let submitted = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const email = buildEstateReferralRequestEmail({
        to: draft.recipientEmail, recipientKind: draft.recipientKind as "attorney" | "family",
        reference: (await find(certificate.id))!.reference,
      });
      // Send only the exact persisted preview; do not regenerate mutable content.
      submitted = await Promise.race([
        delivery.send({ ...email, subject: draft.subject, text: draft.text }),
        new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 30000); }),
      ]);
    } catch { submitted = false; }
    finally { if (timeout) clearTimeout(timeout); }
    await db.transaction(async tx => {
      await tx.update(estateReferralRequests).set({
        status: submitted ? "submitted" : "needs_review", submittedAt: submitted ? new Date() : null,
      }).where(eq(estateReferralRequests.id, draft.id));
      if (submitted) await tx.update(estateReferrals).set({
        status: "awaiting_update", version: draft.referralVersion + 1, updatedAt: new Date(), updatedBy: actor.id,
      }).where(and(eq(estateReferrals.id, draft.referralId), eq(estateReferrals.version, draft.referralVersion)));
      await tx.insert(caseEvents).values({
        certificateId: certificate.id, actorId: actor.id, actorRole: "admin",
        eventType: submitted ? "estate_referral_email_submitted" : "estate_referral_email_needs_review",
        description: submitted ? "Status-request email submitted to the provider; delivery and a reply are not yet confirmed." : "Status-request result is uncertain or failed. Review before any new attempt; no automatic retry.",
      });
    });
    res.status(submitted ? 200 : 502).json({
      status: submitted ? "submitted" : "needs_review",
      message: submitted ? "Submitted to the email provider, not confirmed delivered. Replies must be reviewed and recorded by SAL staff." : "The send result needs review. Do not resend without checking the provider.",
    });
  }));
}
