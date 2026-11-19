import type { Express, RequestHandler } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { caseEvents, caseFamilyAuthorizations, caseFamilyMemberships } from "@shared/schema";
import { memberIdVerified, sharingAccess } from "@shared/familySharing";
import { getAppUrl, isEmailDeliveryConfigured, sendEmail } from "./email";
import { buildFamilySafeguardReminderEmail } from "./familySafeguardReminderEmail";

const reminderBody = z.object({ kind: z.enum(["id", "owner_approval"]), confirmed: z.literal(true) }).strict();
const requestType = "family_safeguard_reminder_requested";
export const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { httpStatus: status }); };

export function registerFamilySafeguardReminders(app: Express, authenticated: RequestHandler, delivery = {
  send: sendEmail, configured: isEmailDeliveryConfigured, appUrl: getAppUrl,
}) {
  app.post("/api/admin/case/:certId/family-members/:userId/remind", authenticated, async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    let requestId: string | undefined;
    let certificateId: string | undefined;
    try {
      const actorId = req.session?.userId || req.user?.claims?.sub;
      const actor = actorId ? await storage.getUser(actorId) : undefined;
      if (!actor || actor.role !== "admin") return res.status(403).json({ error: "Concierge access is required." });
      const parsed = reminderBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Choose the reminder and confirm before sending." });
      const { kind } = parsed.data;
      const cert = await storage.getCertificate(String(req.params.certId));
      if (!cert) return res.status(404).json({ error: "Case not found." });
      certificateId = cert.id;
      const targetId = String(req.params.userId);
      const member = await storage.getUser(targetId);
      if (!member || member.role !== "user") return res.status(404).json({ error: "Family account not found." });
      const [membership] = await db.select().from(caseFamilyMemberships).where(and(
        eq(caseFamilyMemberships.certificateId, cert.id), eq(caseFamilyMemberships.userId, member.id),
        eq(caseFamilyMemberships.status, "active"),
      )).limit(1);
      if (member.id !== cert.userId && !membership) return res.status(404).json({ error: "Active family member not found in this case." });
      if (kind === "id" && memberIdVerified(member)) return res.status(409).json({ error: "This person’s ID is already verified. No reminder was sent." });
      if (kind === "owner_approval") {
        if (member.id === cert.userId || !membership) return res.status(409).json({ error: "Choose an additional family member awaiting owner permission." });
        const grants = await db.select().from(caseFamilyAuthorizations).where(eq(caseFamilyAuthorizations.membershipId, membership.id));
        if (grants.some(grant => sharingAccess(member, membership, cert.userId, grant).sharingAuthorized)) {
          return res.status(409).json({ error: "The owner has already signed this person’s sharing permission. No reminder was sent." });
        }
      }
      const recipient = kind === "id" ? member : cert.userId ? await storage.getUser(cert.userId) : undefined;
      if (!recipient || recipient.role !== "user" || !recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) {
        return res.status(409).json({ error: "The intended recipient does not have a usable account email." });
      }
      if (!delivery.configured()) return res.status(503).json({ error: "Email delivery is not configured. No reminder was sent." });
      const description = JSON.stringify({ kind, recipientUserId: recipient.id });
      // A durable reservation prevents another tab/process from sending concurrently.
      // Reserve even uncertain provider failures; never automatically retry an email.
      const reservation = await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`family-reminder-actor:${actor.id}`}))`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`family-reminder:${cert.id}:${recipient.id}:${kind}`}))`);
        const cutoff = new Date(Date.now() - REMINDER_COOLDOWN_MS);
        const [recent] = await tx.select({ id: caseEvents.id }).from(caseEvents).where(and(
          eq(caseEvents.certificateId, cert.id), eq(caseEvents.eventType, requestType),
          eq(caseEvents.description, description), gte(caseEvents.createdAt, cutoff),
        )).orderBy(desc(caseEvents.createdAt)).limit(1);
        if (recent) fail(429, "A reminder was already requested for this recipient within the last hour. Check case history before trying again.");
        const [traffic] = await tx.select({ count: sql<number>`count(*)::int` }).from(caseEvents).where(and(
          eq(caseEvents.actorId, actor.id), eq(caseEvents.eventType, requestType), gte(caseEvents.createdAt, cutoff),
        ));
        if (traffic.count >= 20) fail(429, "You have reached 20 reminder requests this hour. Please try again later.");
        const [created] = await tx.insert(caseEvents).values({
          certificateId: cert.id, actorId: actor.id, actorRole: actor.role,
          eventType: requestType, description,
        }).returning({ id: caseEvents.id, createdAt: caseEvents.createdAt });
        return created;
      });
      requestId = reservation.id;
      const emailSent = await delivery.send(buildFamilySafeguardReminderEmail({ kind, to: recipient.email, appUrl: delivery.appUrl() }));
      await db.insert(caseEvents).values({
        certificateId: cert.id, actorId: actor.id, actorRole: actor.role,
        eventType: emailSent ? "family_safeguard_reminder_sent" : "family_safeguard_reminder_failed",
        description: `${kind === "id" ? "ID needed" : "Owner sharing approval"} reminder ${emailSent ? "accepted by email provider" : "not confirmed by email provider"}; recipient account ${recipient.id}; request ${reservation.id}.`,
      });
      if (!emailSent) return res.status(502).json({ error: "Email delivery was not confirmed. Check case history; do not immediately resend. Reminders are limited to once per hour." });
      return res.json({ emailSent: true, recipientEmail: recipient.email, requestedAt: reservation.createdAt });
    } catch (error: any) {
      if (requestId && certificateId) {
        // The durable requested event remains if provider acceptance or audit writing is uncertain.
        return res.status(503).json({ error: "The reminder request was recorded, but its final status is uncertain. Check case history before retrying; another request is blocked for one hour." });
      }
      return res.status(error.httpStatus || 503).json({ error: error.httpStatus ? error.message : "The reminder could not be prepared. Please try again later." });
    }
  });
}
