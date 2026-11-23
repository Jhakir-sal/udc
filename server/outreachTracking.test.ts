import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { outreachContacts as contacts, outreachDeliveries as deliveries, outreachTemplates as templates } from "@shared/schema";
import { registerOutreachRoutes } from "./outreachRoutes";

test("B2B tracking classifies all history, searches and pages safely, and protects unsent batches across templates", {
  skip: process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1" || process.env.WEBSITE_SLOT_NAME !== undefined,
}, async () => {
  const suffix = crypto.randomUUID();
  const contactIds: string[] = [];
  const templateId = crypto.randomUUID();
  let providerCalls = 0;
  const app = express();
  registerOutreachRoutes(app, (_req, _res, next) => next(), (_req, _res, next) => next(), {
    send: async () => { providerCalls++; return true; },
    unsubscribeAvailable: async () => true, deliveryConfigured: () => true, isPublished: () => true,
  });
  async function call(method: string, path: string, options: { body?: unknown; query?: Record<string, string>; params?: Record<string, string> } = {}) {
    const route = (app as any).router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method.toLowerCase()]);
    assert.ok(route);
    const result: { status: number; body: any } = { status: 200, body: null };
    const response = {
      set: () => response, status: (status: number) => { result.status = status; return response; },
      json: (body: unknown) => { result.body = body; return response; },
    };
    await route.route.stack.at(-1).handle({ body: options.body, query: options.query || {}, params: options.params || {} }, response);
    return result;
  }
  const list = (status = "all", page = "1", search = suffix) =>
    call("GET", "/api/admin/outreach", { query: { status, page, search } });
  try {
    await db.insert(templates).values({ id: templateId, label: "Archived synthetic introduction", subject: "Test", body: "Hi {{first_name}}", archivedAt: new Date() });
    async function contact(name: string, lastSentAt: Date | null = null, unsubscribedAt: Date | null = null) {
      const id = crypto.randomUUID(); contactIds.push(id);
      await db.insert(contacts).values({
        id, email: `${name}-${suffix}@example.invalid`, firstName: name, fullName: `${name} ${suffix}`,
        companyName: name === "literal" ? "100%_Credit" : `Company ${suffix}`,
        unsubscribeToken: crypto.randomBytes(24).toString("hex"), lastSentAt, unsubscribedAt,
      });
      return id;
    }
    const never = await contact("never");
    const rejected = await contact("rejected");
    const submitted = await contact("submitted");
    const legacy = await contact("legacy", new Date());
    const uncertain = await contact("uncertain");
    const suppressed = await contact("suppressed", new Date(), new Date());
    const unknown = await contact("unknown");
    const literal = await contact("literal");
    for (const [id, status] of [[rejected, "failed"], [submitted, "sent"], [uncertain, "sending"], [unknown, "unrecognized"]]) {
      await db.insert(deliveries).values({
        contactId: id, templateId, senderEmail: "hello@stepsafterlife.com", subject: "Synthetic history",
        status, sentAt: status === "sent" ? new Date() : null,
      });
    }
    const result = await list();
    assert.equal(result.status, 200);
    assert.equal(result.body.total, 8);
    const byId = new Map(result.body.contacts.map((row: any) => [row.id, row]));
    for (const [id, expected] of [
      [never, "not_sent"], [rejected, "not_sent"], [submitted, "sent"], [legacy, "sent"],
      [uncertain, "needs_review"], [unknown, "needs_review"], [suppressed, "unsubscribed"],
    ]) assert.equal((byId.get(id) as any).outreachStatus, expected);
    assert.ok((byId.get(submitted) as any).lastSentAt, "Ledger acceptance survives a missing contact timestamp");
    assert.equal((byId.get(rejected) as any).lastAttemptStatus, "failed");
    assert.equal((await list("sent")).body.total, 2);
    assert.equal((await list("not_sent")).body.total, 3);
    assert.equal((await list("needs_review")).body.total, 2);
    assert.equal((await list("unsubscribed")).body.total, 1);
    assert.equal((await list("all", "1", "100%_Credit")).body.contacts[0].id, literal);
    assert.equal((await list("invalid")).status, 400);
    assert.equal((await list("all", "0")).status, 400);
    assert.equal((await list("all", "1", "x".repeat(201))).status, 400);
    const counts = result.body.summary;
    assert.equal(counts.all, counts.not_sent + counts.sent + counts.needs_review + counts.unsubscribed);

    const timeline = await call("GET", "/api/admin/outreach/contacts/:id/history", { params: { id: submitted } });
    assert.equal(timeline.status, 200);
    assert.equal(timeline.body.deliveries[0].templateLabel, "Archived synthetic introduction");
    assert.equal(timeline.body.deliveries[0].status, "sent");
    assert.equal((await call("GET", "/api/admin/outreach/contacts/:id/history", { params: { id: never } })).body.total, 0);
    assert.equal((await call("GET", "/api/admin/outreach/contacts/:id/history", { params: { id: crypto.randomUUID() } })).status, 404);

    const skipped = await call("POST", "/api/admin/outreach/send", {
      body: { contactIds: [submitted, legacy, uncertain, unknown, suppressed], templateId: "credit_union_intro", onlyUnsent: true },
    });
    assert.equal(skipped.body.skipped, 5);
    assert.equal(providerCalls, 0);
    await db.update(templates).set({ archivedAt: null }).where(eq(templates.id, templateId));
    const concurrent = await Promise.all(["credit_union_intro", templateId].map(id => call("POST", "/api/admin/outreach/send", {
      body: { contactIds: [never], templateId: id, onlyUnsent: true },
    })));
    assert.equal(concurrent.reduce((sum, response) => sum + response.body.sent, 0), 1);
    assert.equal(providerCalls, 1, "Two templates cannot silently email the same unsent contact twice");
    const refreshed = await list("sent");
    assert.ok(refreshed.body.contacts.some((row: any) => row.id === never));
    const beforeSummary = refreshed.body.summary;
    const extra = Array.from({ length: 101 }, (_, index) => ({
      id: crypto.randomUUID(), email: `page-${index}-${suffix}@example.invalid`, fullName: `Page ${suffix}`,
      unsubscribeToken: crypto.randomBytes(24).toString("hex"),
    }));
    contactIds.push(...extra.map(row => row.id));
    await db.insert(contacts).values(extra);
    const page1 = await list("not_sent");
    const page2 = await list("not_sent", "2");
    assert.equal(page1.body.total, 103);
    assert.equal(page1.body.contacts.length, 100);
    assert.equal(page2.body.contacts.length, 3);
    assert.equal(page2.body.summary.not_sent, beforeSummary.not_sent + 101);
    assert.equal(new Set([...page1.body.contacts, ...page2.body.contacts].map((row: any) => row.id)).size, 103);
    const historyRows = Array.from({ length: 26 }, (_, index) => ({
      contactId: rejected, templateId, senderEmail: "hello@stepsafterlife.com", subject: `Rejected attempt ${index}`, status: "failed",
    }));
    await db.insert(deliveries).values(historyRows);
    const secondHistoryPage = await call("GET", "/api/admin/outreach/contacts/:id/history", { params: { id: rejected }, query: { page: "2" } });
    assert.equal(secondHistoryPage.body.total, 27);
    assert.equal(secondHistoryPage.body.deliveries.length, 2);
  } finally {
    if (contactIds.length) {
      await db.delete(deliveries).where(inArray(deliveries.contactId, contactIds));
      await db.delete(contacts).where(inArray(contacts.id, contactIds));
    }
    await db.delete(templates).where(eq(templates.id, templateId));
  }
});
