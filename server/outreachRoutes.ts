import type { Express, Request, RequestHandler, Response } from "express";
import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { isEmailDeliveryConfigured, sendEmail } from "./email";
import { outreachContacts, outreachDeliveries, outreachTemplates } from "@shared/schema";
import { OUTREACH_SENDER, OUTREACH_TEMPLATES, PARTNER_OVERVIEW_FILENAME, outreachTemplateInput, parseOutreachCsvForImport, renderOutreachEmail } from "@shared/outreach";
import { loadPartnerOverview } from "./partnerOverview";
import { outreachLogoAttachment, outreachPreviewHtml } from "./outreachLogo";
import { validateOutreachPdf } from "./outreachAttachment";
import { OUTREACH_CONTACT_STATUSES } from "@shared/outreachTracking";
import { getOutreachContactHistory, listTrackedOutreachContacts } from "./outreachTracking";

// The public URL was retrieved from the deployment service. Preview may use
// development links, but delivery is production-only so opt-outs always work.
const OUTREACH_PUBLIC_BASE_URL = "https://SALUDC.replit.app";
export function getOutreachPublishedBaseUrl(): string {
  return OUTREACH_PUBLIC_BASE_URL;
}
const sendInput = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(25),
  templateId: z.string().min(1).max(100),
  // Older intentional per-template sends remain compatible. The simplified
  // unsent-contact UI explicitly opts into the cross-template duplicate guard.
  onlyUnsent: z.boolean().optional(),
  ccEmail: z.string().trim().email().max(320).optional(),
  attachment: z.object({
    filename: z.string().min(1).max(124),
    content: z.string().min(1).max(7_000_000),
  }).strict().optional(),
}).strict();
const previewInput = sendInput.omit({ contactIds: true }).extend({ contactId: z.string().uuid() });
const testInput = sendInput.omit({ contactIds: true, attachment: true }).extend({
  testEmail: z.string().trim().email().max(320),
});

function publicUnsubscribeUrl(token: string) {
  return `${OUTREACH_PUBLIC_BASE_URL}/outreach/unsubscribe/${encodeURIComponent(token)}`;
}

async function unsubscribeServiceAvailable() {
  // If this alias was removed or an older deployment is answering there,
  // do not send email whose opt-out action will fail.
  try {
    const response = await fetch(`${OUTREACH_PUBLIC_BASE_URL}/api/outreach/unsubscribe/invalid`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    return response.status === 404 && body?.error === "Link not found";
  } catch {
    return false;
  }
}

async function loadTemplate(templateId: string) {
  if (templateId === "credit_union_intro") return undefined;
  if (!z.string().uuid().safeParse(templateId).success) return null;
  const [template] = await db.select().from(outreachTemplates)
    .where(and(eq(outreachTemplates.id, templateId), isNull(outreachTemplates.archivedAt))).limit(1);
  return template || null;
}

async function isOutreachContact(email: string) {
  const [contact] = await db.select({ id: outreachContacts.id }).from(outreachContacts)
    .where(eq(outreachContacts.email, email.toLowerCase())).limit(1);
  return Boolean(contact);
}

type OutreachDependencies = {
  send: typeof sendEmail;
  unsubscribeAvailable: typeof unsubscribeServiceAvailable;
  deliveryConfigured: typeof isEmailDeliveryConfigured;
  isPublished: () => boolean;
};

export function registerOutreachRoutes(
  app: Express, isAuthenticated: RequestHandler, isAdmin: RequestHandler,
  overrides: Partial<OutreachDependencies> = {},
) {
  const testSendAttempts = new Map<string, number[]>();
  const deliver = overrides.send || sendEmail;
  const publicOptOutAvailable = overrides.unsubscribeAvailable || unsubscribeServiceAvailable;
  const deliveryConfigured = overrides.deliveryConfigured || isEmailDeliveryConfigured;
  const isPublished = overrides.isPublished || (() => process.env.REPLIT_DEPLOYMENT === "1");
  // GET never changes state: mail scanners can follow links without opting out.
  app.get("/api/outreach/unsubscribe/:token", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ error: "Link not found" });
    const [contact] = await db.select({ id: outreachContacts.id, unsubscribedAt: outreachContacts.unsubscribedAt })
      .from(outreachContacts).where(eq(outreachContacts.unsubscribeToken, token)).limit(1);
    if (!contact) return res.status(404).json({ error: "Link not found" });
    return res.json({ unsubscribed: !!contact.unsubscribedAt });
  });

  app.post("/api/outreach/unsubscribe/:token", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ error: "Link not found" });
    const updated = await db.update(outreachContacts).set({ unsubscribedAt: new Date() })
      .where(eq(outreachContacts.unsubscribeToken, token)).returning({ id: outreachContacts.id });
    if (!updated.length) return res.status(404).json({ error: "Link not found" });
    return res.json({ unsubscribed: true });
  });

  app.get("/api/admin/outreach", isAuthenticated, isAdmin, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const page = Number(req.query.page || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return res.status(400).json({ error: "Invalid page" });
      const filters = z.object({
        status: z.enum(["all", ...OUTREACH_CONTACT_STATUSES]).default("all"),
        search: z.string().trim().max(200).default(""),
      }).safeParse(req.query);
      if (!filters.success) return res.status(400).json({ error: "Invalid status filter or search (maximum 200 characters)" });
      const tracked = await listTrackedOutreachContacts(page, filters.data.status, filters.data.search);
      const savedTemplates = await db.select().from(outreachTemplates)
        .where(isNull(outreachTemplates.archivedAt)).orderBy(desc(outreachTemplates.createdAt));
      res.json({
        ...tracked,
        templates: [...OUTREACH_TEMPLATES, ...savedTemplates], senderEmail: OUTREACH_SENDER,
        configured: deliveryConfigured() && isPublished(),
        testConfigured: deliveryConfigured(),
      });
    } catch (error) {
      console.error("[Outreach] List failed", error);
      res.status(500).json({ error: "Could not load outreach contacts" });
    }
  });

  app.get("/api/admin/outreach/contacts/:id/history", isAuthenticated, isAdmin, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const id = String(req.params.id);
    const page = Number(req.query.page || 1);
    if (!z.string().uuid().safeParse(id).success) return res.status(404).json({ error: "Contact not found" });
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return res.status(400).json({ error: "Invalid page" });
    try {
      const history = await getOutreachContactHistory(id, page);
      if (!history) return res.status(404).json({ error: "Contact not found" });
      res.json(history);
    } catch {
      res.status(500).json({ error: "Could not load this contact's sending history" });
    }
  });

  app.get("/api/admin/outreach/partner-overview", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const overview = await loadPartnerOverview();
      res.set("Cache-Control", "no-store");
      res.set("Content-Disposition", `inline; filename="${PARTNER_OVERVIEW_FILENAME}"`);
      res.type("application/pdf").send(Buffer.from(overview.attachment.content, "base64"));
    } catch (error) {
      console.error("[Outreach] Approved PDF unavailable", error);
      res.status(503).json({ error: "The approved one-page PDF is unavailable" });
    }
  });

  app.post("/api/admin/outreach/templates", isAuthenticated, isAdmin, async (req, res) => {
    const input = outreachTemplateInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message || "Invalid email template" });
    try {
      const { attachPartnerOverview, ...fields } = input.data;
      const overview = attachPartnerOverview ? await loadPartnerOverview() : null;
      const [created] = await db.insert(outreachTemplates).values({
        ...fields, attachmentSha256: overview?.sha256 || null,
      }).returning();
      res.status(201).json(created);
    } catch (error) {
      console.error("[Outreach] Template save failed", error);
      res.status(500).json({ error: "Could not save email template" });
    }
  });

  // An edit creates a new ID so previous sends always refer to the exact
  // approved copy. The old version is hidden but kept for the delivery ledger.
  app.patch("/api/admin/outreach/templates/:id", isAuthenticated, isAdmin, async (req, res) => {
    const id = String(req.params.id || "");
    if (!z.string().uuid().safeParse(id).success) return res.status(404).json({ error: "Saved template not found" });
    const input = outreachTemplateInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: input.error.issues[0]?.message || "Invalid email template" });
    try {
      const { attachPartnerOverview, ...fields } = input.data;
      const overview = attachPartnerOverview ? await loadPartnerOverview() : null;
      const revised = await db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
        const [old] = await tx.select({ id: outreachTemplates.id }).from(outreachTemplates)
          .where(and(eq(outreachTemplates.id, id), isNull(outreachTemplates.archivedAt))).limit(1);
        if (!old) return null;
        const [created] = await tx.insert(outreachTemplates).values({
          ...fields, attachmentSha256: overview?.sha256 || null,
        }).returning();
        await tx.update(outreachTemplates).set({ archivedAt: new Date() }).where(eq(outreachTemplates.id, id));
        return created;
      });
      if (!revised) return res.status(404).json({ error: "Saved template not found" });
      res.json(revised);
    } catch (error) {
      console.error("[Outreach] Template edit failed", error);
      res.status(503).json({ error: "Could not save the revision or approved PDF. The original template is unchanged." });
    }
  });

  app.delete("/api/admin/outreach/templates/:id", isAuthenticated, isAdmin, async (req, res) => {
    const id = String(req.params.id || "");
    if (!z.string().uuid().safeParse(id).success) return res.status(404).json({ error: "Saved template not found" });
    try {
      const [archived] = await db.update(outreachTemplates).set({ archivedAt: new Date() })
        .where(and(eq(outreachTemplates.id, id), isNull(outreachTemplates.archivedAt)))
        .returning({ id: outreachTemplates.id });
      if (!archived) return res.status(404).json({ error: "Saved template not found" });
      res.json({ deleted: true });
    } catch (error) {
      console.error("[Outreach] Template delete failed", error);
      res.status(500).json({ error: "Could not remove email template" });
    }
  });

  app.post("/api/admin/outreach/import", isAuthenticated, isAdmin, async (req, res) => {
    const input = z.object({ csv: z.string().min(1).max(1_000_000) }).safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Upload a CSV smaller than 1 MB" });
    let rows;
    let skippedRows;
    try {
      ({ contacts: rows, skippedRows } = parseOutreachCsvForImport(input.data.csv));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid CSV" });
    }
    if (rows.length === 0) return res.status(400).json({ error: `No valid contacts to import (${skippedRows.length} invalid row${skippedRows.length === 1 ? "" : "s"} skipped). Check the name and email columns.` });
    try {
      await db.transaction(async tx => {
        for (let i = 0; i < rows.length; i += 200) {
          await tx.insert(outreachContacts).values(rows.slice(i, i + 200).map(row => ({
            ...row, unsubscribeToken: crypto.randomBytes(24).toString("hex"),
          }))).onConflictDoUpdate({
            target: outreachContacts.email,
            set: {
              firstName: sql`coalesce(excluded.first_name, ${outreachContacts.firstName})`,
              fullName: sql`coalesce(excluded.full_name, ${outreachContacts.fullName})`,
              companyName: sql`coalesce(excluded.company_name, ${outreachContacts.companyName})`,
            },
          });
        }
      });
      res.json({ imported: rows.length, skipped: skippedRows.length, skippedRows: skippedRows.slice(0, 20) });
    } catch (error) {
      console.error("[Outreach] Import failed", error);
      res.status(500).json({ error: "Could not import contacts" });
    }
  });

  app.post("/api/admin/outreach/preview", isAuthenticated, isAdmin, async (req, res) => {
    const input = previewInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Choose a contact and template, and provide a valid CC email if needed" });
    if (input.data.ccEmail && await isOutreachContact(input.data.ccEmail)) {
      return res.status(400).json({ error: "The CC address is on the outreach contact list. Choose an internal address instead." });
    }
    const [contact] = await db.select().from(outreachContacts)
      .where(eq(outreachContacts.id, input.data.contactId)).limit(1);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    const template = await loadTemplate(input.data.templateId);
    if (template === null) return res.status(404).json({ error: "Email template not found" });
    if (template?.attachmentSha256 && input.data.attachment) {
      return res.status(400).json({ error: "This saved template already has a pinned PDF. Remove the selected PDF or choose another template." });
    }
    try {
      const uploaded = validateOutreachPdf(input.data.attachment);
      if (template?.body && /\battach(?:ed|ment|ments|ing)?\b/i.test(template.body) && !template.attachmentSha256 && !uploaded) {
        return res.status(400).json({ error: "This template promises an attachment but has none. Select an approved PDF before previewing." });
      }
      const overview = template?.attachmentSha256 ? await loadPartnerOverview(template.attachmentSha256) : null;
      const { subject, text, html } = renderOutreachEmail(contact, input.data.templateId, publicUnsubscribeUrl(contact.unsubscribeToken), template, { attachment: !!(uploaded || overview) });
      const info = uploaded ? {
        filename: uploaded.filename, size: Buffer.from(uploaded.content, "base64").length,
        sha256: crypto.createHash("sha256").update(Buffer.from(uploaded.content, "base64")).digest("hex"),
      } : overview?.info || null;
      res.json({ to: contact.email, subject, text, html: await outreachPreviewHtml(html), attachment: info });
    } catch (error) {
      console.error("[Outreach] Preview failed", error);
      res.status(400).json({ error: "Could not prepare this email or its attachment. Check the template and approved PDF." });
    }
  });

  async function handleTest(req: Request, res: Response, sendTest: boolean) {
    const input = testInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Enter a valid test email, template, and optional CC email." });
    const { testEmail, ccEmail, templateId } = input.data;
    if (ccEmail?.toLowerCase() === testEmail.toLowerCase()) {
      return res.status(400).json({ error: "The test recipient and CC must be different addresses." });
    }
    if (await isOutreachContact(testEmail) || (ccEmail && await isOutreachContact(ccEmail))) {
      return res.status(400).json({ error: "Test addresses cannot be on the outreach contact list, including unsubscribed contacts." });
    }
    if (sendTest && !deliveryConfigured()) {
      return res.status(503).json({ error: "Test sending requires a configured email provider." });
    }
    const template = await loadTemplate(templateId);
    if (template === null) return res.status(404).json({ error: "Email template not found." });
    if (template?.body && /\battach(?:ed|ment|ments|ing)?\b/i.test(template.body) && !template.attachmentSha256) {
      return res.status(400).json({ error: "This template promises an attachment but has none. Save a revised copy with the one-page PDF." });
    }
    if (template?.body && /\[\s*first[\s_-]*name\s*\]/i.test(`${template.subject}\n${template.body}`)) {
      return res.status(400).json({ error: "This template contains [First Name]. Save a revised copy using {{first_name}}." });
    }

    let prepared: ReturnType<typeof renderOutreachEmail>;
    let overview: Awaited<ReturnType<typeof loadPartnerOverview>> | null;
    let logo: Awaited<ReturnType<typeof outreachLogoAttachment>>;
    try {
      prepared = renderOutreachEmail(
        { email: testEmail, firstName: "Taylor", companyName: "Example Credit Union" },
        templateId, "", template, { test: true },
      );
      overview = template?.attachmentSha256 ? await loadPartnerOverview(template.attachmentSha256) : null;
      logo = await outreachLogoAttachment();
    } catch (error) {
      console.error("[Outreach] Test preparation failed", error);
      return res.status(503).json({ error: "Could not prepare the sample or its approved PDF. No test email was sent." });
    }
    if (!sendTest) {
      return res.json({ to: testEmail, subject: prepared.subject, text: prepared.text, html: await outreachPreviewHtml(prepared.html), attachment: overview?.info || null });
    }
    // Test sends bypass the campaign ledger; keep an accidental or abused
    // admin account from using this endpoint as an unlimited mail relay.
    const identity = req as unknown as { session?: { userId?: string }; user?: { claims?: { sub?: string } } };
    const actor = identity.session?.userId || identity.user?.claims?.sub || req.ip || "unknown";
    const now = Date.now();
    const recent = (testSendAttempts.get(actor) || []).filter(time => now - time < 60 * 60 * 1000);
    if (recent.length >= 10) return res.status(429).json({ error: "Test send limit reached (10 per hour). Try again later." });
    testSendAttempts.set(actor, [...recent, now]);
    try {
      const sent = await deliver({
        to: testEmail, ...(ccEmail ? { cc: ccEmail } : {}),
        ...prepared, fromEmail: OUTREACH_SENDER, fromName: "Steps After Life",
        replyTo: OUTREACH_SENDER, throwOnFailure: true,
        attachments: [logo, ...(overview ? [overview.attachment] : [])],
        customArgs: { sal_email_type: "partner_outreach_test" },
      });
      if (!sent) return res.status(502).json({ error: "Email provider did not accept the test. Check its delivery status before retrying." });
      return res.json({ sent: true, to: testEmail, cc: ccEmail || null, subject: prepared.subject });
    } catch (error) {
      console.error("[Outreach] Test delivery failed", error);
      const provider = error as {
        response?: { statusCode?: number; body?: { errors?: Array<{ field?: string }> } };
        code?: number;
      };
      if (provider.response?.body?.errors?.some(issue => issue.field === "from")) {
        return res.status(502).json({ error: `The email provider rejected the test: ${OUTREACH_SENDER} is not a verified sender. Verify this SAL address with the provider before retrying.` });
      }
      const status = provider.response?.statusCode || provider.code;
      if (typeof status === "number" && status >= 400 && status < 500 && status !== 408) {
        return res.status(502).json({ error: "The email provider rejected the test. Check its sender and message settings before retrying." });
      }
      return res.status(502).json({ error: "Test delivery status is uncertain. Check the test inbox before retrying." });
    }
  }

  app.post("/api/admin/outreach/test-preview", isAuthenticated, isAdmin, (req, res) => handleTest(req, res, false));
  app.post("/api/admin/outreach/test-send", isAuthenticated, isAdmin, (req, res) => handleTest(req, res, true));

  app.post("/api/admin/outreach/send", isAuthenticated, isAdmin, async (req, res) => {
    const input = sendInput.safeParse(req.body);
    if (!input.success || new Set(input.data?.contactIds).size !== input.data?.contactIds.length) {
      return res.status(400).json({ error: "Select 1–25 distinct contacts, a template, and a valid CC email if provided" });
    }
    let uploaded;
    try {
      uploaded = validateOutreachPdf(input.data.attachment);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message + ". No emails were sent." });
    }
    if (!deliveryConfigured() || !isPublished()) {
      return res.status(503).json({ error: "Sending requires the published app and a configured email provider. Preview and import work here." });
    }
    if (!(await publicOptOutAvailable())) {
      return res.status(503).json({ error: "The public unsubscribe page is not reachable. No emails were sent." });
    }
    const { contactIds, templateId, ccEmail, onlyUnsent } = input.data;
    const template = await loadTemplate(templateId);
    if (template === null) return res.status(404).json({ error: "Email template not found" });
    if (template?.attachmentSha256 && uploaded) {
      return res.status(400).json({ error: "This saved template already has a pinned PDF. No emails were sent." });
    }
    if (template?.body && /\battach(?:ed|ment|ments|ing)?\b/i.test(template.body) && !template.attachmentSha256 && !uploaded) {
      return res.status(400).json({ error: "This template promises an attachment but has none. Save a revised copy with the one-page PDF." });
    }
    if (template?.body && /\[\s*first[\s_-]*name\s*\]/i.test(`${template.subject}\n${template.body}`)) {
      return res.status(400).json({ error: "This template contains [First Name]. Save a revised copy using {{first_name}}." });
    }
    let overview: Awaited<ReturnType<typeof loadPartnerOverview>> | null = null;
    let logo: Awaited<ReturnType<typeof outreachLogoAttachment>>;
    try {
      if (template?.attachmentSha256) overview = await loadPartnerOverview(template.attachmentSha256);
      logo = await outreachLogoAttachment();
    } catch (error) {
      console.error("[Outreach] Email asset unavailable", error);
      return res.status(503).json({ error: "The approved PDF or brand logo is unavailable or changed. No emails were sent." });
    }
    const contacts = await db.select().from(outreachContacts).where(inArray(outreachContacts.id, contactIds));
    if (contacts.length !== contactIds.length) return res.status(400).json({ error: "One or more contacts no longer exist" });
    if (ccEmail && await isOutreachContact(ccEmail)) {
      // A contact, including an unsubscribed one, must never receive other
      // contacts' personalized messages as a copied recipient.
      return res.status(400).json({ error: "The CC address is on the outreach contact list. Choose an internal address instead." });
    }
    const results: { email: string; status: "sent" | "skipped" | "failed"; error?: string }[] = [];
    for (const contact of contacts) {
      if (contact.unsubscribedAt) {
        results.push({ email: contact.email, status: "skipped", error: "Unsubscribed" });
        continue;
      }
      let deliveryId: string | null = null;
      try {
        const { subject, text, html } = renderOutreachEmail(contact, templateId, publicUnsubscribeUrl(contact.unsubscribeToken), template, { attachment: !!(uploaded || overview) });
        // Serialize competing requests for the same contact/template. A pending
        // attempt also blocks repeats if the server loses its reply. This
        // introduction is sent once per contact, not every time a list is run.
        deliveryId = await db.transaction(async tx => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${contact.id}))`);
          const [recent] = await tx.select({ id: outreachDeliveries.id }).from(outreachDeliveries)
            .where(and(eq(outreachDeliveries.contactId, contact.id),
              onlyUnsent ? sql`${outreachDeliveries.status} not in ('failed', 'skipped')` :
                and(eq(outreachDeliveries.templateId, templateId), inArray(outreachDeliveries.status, ["sending", "sent"]))))
            .limit(1);
          if (recent) return null;
          // Recheck suppression after acquiring the lock, so a concurrent opt-out wins.
          const [current] = await tx.select({ unsubscribedAt: outreachContacts.unsubscribedAt, lastSentAt: outreachContacts.lastSentAt })
            .from(outreachContacts).where(eq(outreachContacts.id, contact.id)).limit(1);
          if (!current || current.unsubscribedAt || (onlyUnsent && current.lastSentAt)) return null;
          const [created] = await tx.insert(outreachDeliveries).values({
            contactId: contact.id, templateId, senderEmail: OUTREACH_SENDER, subject, status: "sending",
          }).returning({ id: outreachDeliveries.id });
          return created.id;
        });
        if (!deliveryId) {
          results.push({ email: contact.email, status: "skipped", error: "Already sent, pending review, or unsubscribed" });
          continue;
        }
        const [latest] = await db.select({ unsubscribedAt: outreachContacts.unsubscribedAt })
          .from(outreachContacts).where(eq(outreachContacts.id, contact.id)).limit(1);
        if (latest?.unsubscribedAt) {
          await db.update(outreachDeliveries).set({ status: "skipped" }).where(eq(outreachDeliveries.id, deliveryId));
          results.push({ email: contact.email, status: "skipped", error: "Unsubscribed before sending" });
          continue;
        }
        const sent = await deliver({
          to: contact.email, ...(ccEmail ? { cc: ccEmail } : {}), subject, text, html, fromEmail: OUTREACH_SENDER,
          fromName: "Steps After Life", replyTo: OUTREACH_SENDER, throwOnFailure: true,
          attachments: [logo, ...(overview ? [overview.attachment] : []), ...(uploaded ? [uploaded] : [])],
          customArgs: { sal_email_type: "partner_outreach", sal_outreach_delivery_id: deliveryId },
        });
        await db.update(outreachDeliveries).set({ status: sent ? "sent" : "failed", sentAt: sent ? new Date() : null })
          .where(eq(outreachDeliveries.id, deliveryId));
        if (sent) {
          await db.update(outreachContacts).set({ lastSentAt: new Date() }).where(eq(outreachContacts.id, contact.id));
        }
        results.push({ email: contact.email, status: sent ? "sent" : "failed", ...(!sent ? { error: "Email provider rejected this message. Check that the sender is verified." } : {}) });
      } catch (error) {
        console.error("[Outreach] Delivery failed", error);
        const providerStatus = (error as any)?.response?.statusCode;
        const definitelyRejected = typeof providerStatus === "number" && providerStatus >= 400 && providerStatus < 500 && providerStatus !== 408;
        if (deliveryId && definitelyRejected) {
          await db.update(outreachDeliveries).set({ status: "failed" }).where(eq(outreachDeliveries.id, deliveryId))
            .catch(() => {});
        }
        // Once an attempt was claimed, the provider may have accepted it even
        // if our DB acknowledgement failed. Keep "sending" to block retries
        // except for an explicit 4xx rejection from the provider.
        results.push({
          email: contact.email, status: "failed",
          error: definitelyRejected ? "The email provider rejected this message. Check sender verification before retrying." :
            deliveryId ? "Delivery status uncertain. Do not retry until the attempt is reviewed." : "Could not prepare the send. Please try again.",
        });
      }
    }
    return res.json({
      sent: results.filter(result => result.status === "sent").length,
      skipped: results.filter(result => result.status === "skipped").length,
      failed: results.filter(result => result.status === "failed").length,
      results,
    });
  });
}