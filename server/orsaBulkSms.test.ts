import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { orsaBulkSmsRecipients as recipients, orsaBulkSmsRuns as runs, orsaRosterMembers, orsaRosterAudits, orsaSmsCampaign, users } from "@shared/schema";
import { bulkSmsClock, bulkSmsExclusion, bulkSmsInput } from "./orsaBulkSmsPolicy";
import { registerBulkSmsRoutes } from "./orsaBulkSmsRoutes";
import { dispatchBulkSmsTick, recoverStaleBulkSmsAttempts } from "./orsaBulkSmsWorker";

test("bulk policy requires explicit SMS/timezone attestation, limits rates, and handles local quiet hours", () => {
  const input = { memberIds: [randomUUID()], attestation: "Administrator attests selected members authorized promotional SMS.", smsPermissionConfirmed: true, timezoneConfirmed: true, timezone: "America/New_York", intervalSeconds: 2, dailyLimit: 6000, scheduledAt: "2030-01-02T15:00:00.000Z" };
  assert.equal(bulkSmsInput.safeParse(input).success, true);
  for (const patch of [{ smsPermissionConfirmed: false }, { timezoneConfirmed: false }, { intervalSeconds: 0 }, { dailyLimit: 10001 }, { timezone: "not/a/timezone" }]) {
    assert.equal(bulkSmsInput.safeParse({ ...input, ...patch }).success, false);
  }
  assert.equal(bulkSmsClock("America/New_York", new Date("2030-01-02T13:59:00Z")).withinHours, false);
  assert.equal(bulkSmsClock("America/New_York", new Date("2030-01-02T14:00:00Z")).withinHours, true);
  assert.equal(bulkSmsClock("America/New_York", new Date("2030-01-03T00:00:00Z")).withinHours, false);
  assert.equal(bulkSmsClock("America/Los_Angeles", new Date("2030-01-02T15:00:00Z")).withinHours, false);
  const good = { active: true, name: "Synthetic Member", phone: "+15555550000", shared: false, stopped: false, attempted: false, signedUp: false };
  assert.equal(bulkSmsExclusion(good), null);
  for (const patch of [{ active: false }, { name: "" }, { phone: null }, { phone: "+441234567890" }, { shared: true }, { stopped: true }, { attempted: true }, { signedUp: true }]) {
    assert.ok(bulkSmsExclusion({ ...good, ...patch }));
  }
});

test("6001-recipient draft and durable worker preserve consent provenance, rate caps, pause, STOP, and uncertain results without real sends", async () => {
  const actor = `bulk-sms-test-${randomUUID()}`;
  const memberIds = Array.from({ length: 6001 }, () => randomUUID());
  const phones = memberIds.map((_id, index) => `+1${5555550000 + index}`);
  const now = new Date("2030-01-02T15:00:00Z");
  let runId = "";
  let accept = true;
  const outbound: string[] = [];
  const fakeDelivery = {
    enabled: () => true,
    send: async (phone: string) => { outbound.push(phone); return accept ? { id: `fake-${randomUUID()}`, status: "Queued" } : null; },
  };
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  registerBulkSmsRoutes(app, (req: any, res, next) => {
    if (req.header("x-test-admin") !== actor) return res.sendStatus(403);
    req.session = { userId: actor }; next();
  }, (_req, _res, next) => next());
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/admin/orsa/bulk-sms`;
  const request = async (path = "", body?: unknown, authorized = true) => {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(authorized ? { "x-test-admin": actor } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, text: await response.text() };
  };
  try {
    await db.insert(users).values({ id: actor, role: "admin", email: `${actor}@example.invalid` });
    for (let offset = 0; offset < memberIds.length; offset += 300) {
      await db.insert(orsaRosterMembers).values(memberIds.slice(offset, offset + 300).map((id, index) => ({
        id, displayName: `Synthetic Bulk ${offset + index}`, normalizedPhone: phones[offset + index].slice(2), active: true,
      })));
    }
    assert.equal((await request("", undefined, false)).status, 403);
    const input = {
      memberIds, attestation: "Administrator attests that selected ORSA members authorized promotional SMS from ORSA and SAL during the contract process.",
      smsPermissionConfirmed: true, timezoneConfirmed: true, timezone: "America/New_York",
      intervalSeconds: 2, dailyLimit: 2, scheduledAt: now.toISOString(),
    };
    assert.equal((await request("", { ...input, smsPermissionConfirmed: false })).status, 400);
    const created = await request("", input);
    assert.equal(created.status, 201, created.text);
    const data = JSON.parse(created.text);
    runId = data.runId;
    assert.equal(data.queued, 6001);
    assert.equal(outbound.length, 0);
    assert.equal((await db.select().from(orsaSmsCampaign).where(inArray(orsaSmsCampaign.phone, phones))).length, 0, "A draft does not invent 6001 per-phone opt-ins");
    const details = JSON.parse((await request(`/${runId}?limit=100&offset=100`)).text);
    assert.equal(details.total, 6001);
    assert.equal(details.recipients.length, 100);
    assert.equal(details.run.counts.pending, 6001);
    assert.equal((await request(`/${runId}/start`, { confirmed: true })).status, 400);
    assert.equal((await request(`/${runId}/start`, { confirmed: true, providerLimitsConfirmed: true })).status, 403, "Development never enables actual delivery");
    await db.update(runs).set({ status: "running", approvedBy: actor }).where(eq(runs.id, runId));
    await dispatchBulkSmsTick(new Date("2030-01-02T13:00:00Z"), fakeDelivery, runId);
    assert.equal(outbound.length, 0);
    await Promise.all([dispatchBulkSmsTick(now, fakeDelivery, runId), dispatchBulkSmsTick(now, fakeDelivery, runId)]);
    assert.equal(outbound.length, 1);
    await dispatchBulkSmsTick(new Date(now.getTime() + 1000), fakeDelivery, runId);
    assert.equal(outbound.length, 1);
    await dispatchBulkSmsTick(new Date(now.getTime() + 2000), fakeDelivery, runId);
    assert.equal(outbound.length, 2);
    await dispatchBulkSmsTick(new Date(now.getTime() + 4000), fakeDelivery, runId);
    assert.equal(outbound.length, 2, "Daily cap applies");
    const [consent] = await db.select().from(orsaSmsCampaign).where(eq(orsaSmsCampaign.phone, outbound[0]));
    assert.ok(consent.consentEvidence?.includes("Administrator attestation"));
    assert.equal(consent.consentRecordedBy, actor);
    assert.equal(consent.status, "submitted");
    assert.equal((await request(`/${runId}/pause`, { confirmed: true })).status, 200);
    const tomorrow = new Date("2030-01-03T15:00:00Z");
    await dispatchBulkSmsTick(tomorrow, fakeDelivery, runId);
    assert.equal(outbound.length, 2, "Pause survives another worker tick");
    await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId));
    const [next] = await db.select().from(recipients).where(and(eq(recipients.runId, runId), eq(recipients.status, "pending"))).orderBy(recipients.createdAt, recipients.id).limit(1);
    await db.insert(orsaSmsCampaign).values({ phone: next.phone, status: "opted_out", optedOutAt: new Date() });
    await dispatchBulkSmsTick(tomorrow, fakeDelivery, runId);
    const [skipped] = await db.select().from(recipients).where(eq(recipients.id, next.id));
    assert.equal(skipped.status, "skipped");
    assert.equal(outbound.length, 2);
    accept = false;
    await dispatchBulkSmsTick(tomorrow, fakeDelivery, runId);
    assert.equal(outbound.length, 3);
    const [paused] = await db.select().from(runs).where(eq(runs.id, runId));
    assert.equal(paused.status, "paused");
    await dispatchBulkSmsTick(new Date(tomorrow.getTime() + 10000), fakeDelivery, runId);
    assert.equal(outbound.length, 3, "Uncertain submissions never automatically retry");
    const [stale] = await db.select().from(recipients).where(and(eq(recipients.runId, runId), eq(recipients.status, "pending"))).limit(1);
    await db.update(recipients).set({ status: "sending", attemptedAt: new Date(tomorrow.getTime() - 180000) }).where(eq(recipients.id, stale.id));
    await recoverStaleBulkSmsAttempts(tomorrow, runId);
    const [recovered] = await db.select().from(recipients).where(eq(recipients.id, stale.id));
    assert.equal(recovered.status, "needs_review");
    assert.equal((await request(`/${runId}/cancel`, { confirmed: true })).status, 200);
    const [cancelled] = await db.select().from(runs).where(eq(runs.id, runId));
    assert.equal(cancelled.status, "cancelled");
    assert.equal(new Set(outbound).size, outbound.length);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (runId) await db.delete(runs).where(eq(runs.id, runId));
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actor));
    await db.delete(orsaSmsCampaign).where(inArray(orsaSmsCampaign.phone, phones));
    await db.delete(orsaRosterMembers).where(inArray(orsaRosterMembers.id, memberIds));
    await db.delete(users).where(eq(users.id, actor));
    await pool.end();
  }
});
