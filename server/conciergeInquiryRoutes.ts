import type { Express, RequestHandler } from "express";
import { createHmac } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { conciergeInquiries } from "@shared/schema";
import { conciergeInquirySchema, conciergeInquiryStatuses, type ConciergeInquiryInput } from "@shared/conciergeInquiry";
import { sendEmail } from "./email";

type Row = typeof conciergeInquiries.$inferSelect;
type AlertStatus = "accepted" | "failed";
type Status = typeof conciergeInquiryStatuses[number];
interface InquiryStore {
  save(input: ConciergeInquiryInput, sourceHash: string): Promise<{ row: Row; created: boolean }>;
  alertResult(id: string, status: AlertStatus): Promise<void>;
  list(page: number): Promise<Row[]>;
  setStatus(id: string, status: Status): Promise<Row | undefined>;
}

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

const store: InquiryStore = {
  async save(input, sourceHash) {
    return db.transaction(async tx => {
      // Serialize abuse checks across instances without storing raw IP addresses.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`concierge:${sourceHash}`}))`);
      const [existing] = await tx.select().from(conciergeInquiries).where(eq(conciergeInquiries.id, input.requestId));
      if (existing) {
        if (["name", "email", "phone", "careLocation", "bestTime"].some(key =>
          existing[key as keyof Row] !== input[key as keyof ConciergeInquiryInput])) {
          fail(409, "This request was already recorded with different details. Please call us to update it.");
        }
        return { row: existing, created: false };
      }
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(conciergeInquiries).where(and(
        eq(conciergeInquiries.sourceHash, sourceHash),
        gte(conciergeInquiries.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ));
      if (count >= 5) fail(429, "Too many requests. Please call 888-557-2083 or try again later.");
      const [row] = await tx.insert(conciergeInquiries).values({
        id: input.requestId, name: input.name, email: input.email, phone: input.phone,
        careLocation: input.careLocation, bestTime: input.bestTime, sourceHash,
      }).onConflictDoNothing().returning();
      if (row) return { row, created: true };
      // Same idempotency key reached another instance from a different source.
      const [raced] = await tx.select().from(conciergeInquiries).where(eq(conciergeInquiries.id, input.requestId));
      if (!raced) fail(503, "Your request could not be confirmed. Please retry or call us.");
      return { row: raced, created: false };
    });
  },
  async alertResult(id, notificationStatus) {
    await db.update(conciergeInquiries).set({ notificationStatus, updatedAt: new Date() })
      .where(eq(conciergeInquiries.id, id));
  },
  async list(page) {
    return db.select().from(conciergeInquiries).orderBy(desc(conciergeInquiries.createdAt), desc(conciergeInquiries.id))
      .limit(51).offset(page * 50);
  },
  async setStatus(id, status) {
    const [row] = await db.update(conciergeInquiries).set({ status, updatedAt: new Date() })
      .where(eq(conciergeInquiries.id, id)).returning();
    return row;
  },
};

export function escapeInquiryHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]!));
}

export function buildConciergeInquiryEmail(row: Pick<Row, "id" | "name" | "email" | "phone" | "careLocation" | "bestTime">) {
  const details = [
    ["Name", row.name], ["Email", row.email], ["Phone", row.phone],
    ["Care location", row.careLocation || "Not provided"], ["Best time to call", row.bestTime || "Not provided"],
    ["Request reference", row.id],
  ];
  return {
    to: "hello@stepsafterlife.com",
    subject: "New End-of-Life Concierge callback request",
    replyTo: row.email,
    text: `A visitor requested contact about End-of-Life Concierge. This is not marketing consent.\n\n${details.map(([key, value]) => `${key}: ${value}`).join("\n")}\n\nReview the request in SAL Admin > Concierge requests. This inbox is not an emergency service.`,
    html: `<h1>End-of-Life Concierge request</h1><p>A visitor requested a conversation with SAL. This is not marketing consent.</p><dl>${details.map(([key, value]) =>
      `<dt><strong>${key}</strong></dt><dd>${escapeInquiryHtml(value)}</dd>`).join("")}</dl><p>Review the request in SAL Admin &gt; Concierge requests. This inbox is not an emergency service.</p>`,
    disableProviderClickTracking: true,
  };
}

export function buildConciergeConfirmationEmail(row: Pick<Row, "email" | "name">) {
  const greeting = `Hi ${row.name.trim().split(/\s+/)[0] || "there"},`;
  const introduction = "Thank you for reaching out. We know that if you’re contacting us, you may be carrying a lot right now. You don’t have to carry it alone.";
  const next = "A member of our End-of-Life Concierge team will personally call you within one business day to learn about your situation and how we can help. There’s no cost or obligation for this first conversation.";
  const urgent = "Call us at 888-557-2083. If your loved one’s time is short, tell us when we answer and we’ll make your call a priority.";
  const preparation = [
    "Where your loved one is being cared for (hospital, hospice, home or facility)",
    "Who else in the family should be part of the conversation",
    "The most pressing thing on your mind right now",
  ];
  const update = "To change your contact details, just reply to this email.";
  const signature = "Diana Milian, CEO, and the Steps After Life Team";
  const disclaimer = "Steps After Life coordinates practical and logistical support. We do not provide medical care or legal advice. This inbox is not monitored for emergencies. For a medical emergency, call 911.";
  return {
    to: row.email,
    fromEmail: "hello@stepsafterlife.com",
    fromName: "Steps After Life",
    replyTo: "help@stepsafterlife.com",
    subject: "We received your End-of-Life Concierge request",
    text: `${greeting}\n\n${introduction}\n\nWhat happens next\n${next}\n\nNeed help sooner?\n${urgent}\n\nGetting ready for our call (optional)\nIf it’s easy, have these nearby:\n${preparation.map(item => `- ${item}`).join("\n")}\n\n${update}\n\nWith care,\n${signature}\n888-557-2083 | help@stepsafterlife.com\n\n${disclaimer}`,
    html: `<div style="background:#f7f5ef;padding:24px 12px;font-family:Arial,sans-serif;color:#253c34"><table role="presentation" style="width:100%;max-width:600px;margin:0 auto;background:#fff;border-collapse:collapse"><tr><td style="padding:28px;background:#214c40;color:#fff"><p style="margin:0 0 8px;font-size:13px;letter-spacing:2px">STEPS AFTER LIFE</p><h1 style="margin:0;font-size:25px">We received your request</h1><p style="margin:10px 0 0">End-of-Life Concierge</p></td></tr><tr><td style="padding:28px;font-size:16px;line-height:1.65"><p>${escapeInquiryHtml(greeting)}</p><p>${introduction}</p><h2 style="font-size:20px">What happens next</h2><p>${next}</p><h2 style="font-size:20px">Need help sooner?</h2><p>${urgent.replace("888-557-2083", '<a style="color:#214c40" href="tel:8885572083">888-557-2083</a>')}</p><h2 style="font-size:20px">Getting ready for our call (optional)</h2><p>If it’s easy, have these nearby:</p><ul>${preparation.map(item => `<li>${item}</li>`).join("")}</ul><p>${update}</p><p>With care,<br>${signature}<br><a style="color:#214c40" href="tel:8885572083">888-557-2083</a> | <a style="color:#214c40" href="mailto:help@stepsafterlife.com">help@stepsafterlife.com</a></p><p style="font-size:12px;color:#58665f">${disclaimer}</p></td></tr></table></div>`,
    disableProviderClickTracking: true,
  };
}

function staffRecord(row: Row) {
  const { sourceHash: _sourceHash, contactPermissionAt: _permissionAt, ...record } = row;
  return record;
}

export function registerConciergeInquiryRoutes(
  app: Express, authenticated: RequestHandler, admin: RequestHandler,
  dependencies: { store?: InquiryStore; send?: typeof sendEmail; sourceHash?: (ip: string) => string } = {},
) {
  const repository = dependencies.store || store;
  const send = dependencies.send || sendEmail;
  const sourceHash = dependencies.sourceHash || ((ip: string) => {
    if (!process.env.SESSION_SECRET) fail(503, "Requests are temporarily unavailable. Please call 888-557-2083.");
    return createHmac("sha256", process.env.SESSION_SECRET!).update(`concierge:${ip}`).digest("hex");
  });
  const handle = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try { await fn(req, res, next); }
    catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Please check your contact details and permission to respond." });
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error("[Concierge Inquiry] Operation failed");
      res.status(503).json({ error: "We couldn't confirm your request. Retry with the same details or call 888-557-2083." });
    }
  };
  app.post("/api/concierge-inquiries", handle(async (req, res) => {
    const input = conciergeInquirySchema.parse(req.body);
    const result = await repository.save(input, sourceHash(req.ip || req.socket.remoteAddress || "unknown"));
    let notificationAccepted = result.row.notificationStatus === "accepted";
    if (result.created) {
      // The CRM record is durable before attempting delivery. Never automatically
      // repeat uncertain sends, even if the browser retries the same submission.
      try { notificationAccepted = await send(buildConciergeInquiryEmail(result.row)); }
      catch { notificationAccepted = false; }
      try { await repository.alertResult(result.row.id, notificationAccepted ? "accepted" : "failed"); }
      catch { console.error("[Concierge Inquiry] Could not record email-alert outcome; request remains saved"); }
      // Separate from the staff alert: either email can fail without losing the
      // saved request or preventing the other attempt. Same-ID retries send neither.
      try {
        if (!await send(buildConciergeConfirmationEmail(result.row))) {
          console.error("[Concierge Inquiry] Family confirmation was not accepted; request remains saved");
        }
      } catch {
        console.error("[Concierge Inquiry] Family confirmation failed; request remains saved");
      }
    }
    res.status(result.created ? 201 : 200).json({ saved: true, notificationAccepted });
  }));
  app.get("/api/admin/concierge-inquiries", authenticated, admin, handle(async (req, res) => {
    const page = z.coerce.number().int().min(0).max(100000).parse(req.query.page ?? 0);
    const rows = await repository.list(page);
    res.json({ items: rows.slice(0, 50).map(staffRecord), hasMore: rows.length > 50 });
  }));
  app.patch("/api/admin/concierge-inquiries/:id", authenticated, admin, handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = z.object({ status: z.enum(conciergeInquiryStatuses) }).strict().parse(req.body);
    const updated = await repository.setStatus(id, status);
    if (!updated) return res.status(404).json({ error: "Request not found." });
    res.json(staffRecord(updated));
  }));
}
