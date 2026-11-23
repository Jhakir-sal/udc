import type { Express, RequestHandler } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { orsaBulkSmsRecipients as recipients, orsaBulkSmsRuns as runs, orsaRosterAudits, orsaSmsCampaign } from "@shared/schema";
import { bulkSmsAudience } from "./orsaBulkSmsAudience";
import { bulkSmsInput } from "./orsaBulkSmsPolicy";
import { bulkSmsDeliveryEnabled, startBulkSmsWorker } from "./orsaBulkSmsWorker";
import { isCurrentOrsaHeartPlanText, orsaHeartPlanText } from "./orsaSmsCampaign";
import { getOutreachPublishedBaseUrl } from "./outreachRoutes";

export function registerBulkSmsRoutes(app: Express, authenticated: RequestHandler, admin: RequestHandler) {
  const handle = (fn: (req: any, res: any) => Promise<any>): RequestHandler => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try { await fn(req, res); }
    catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message || "Review the campaign fields." });
      res.status(error.httpStatus || 503).json({ error: error.httpStatus ? error.message : "Bulk texting is unavailable. Publish the database changes and refresh; no new send was confirmed." });
    }
  };
  const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { httpStatus: status }); };
  const runSummary = async (run: typeof runs.$inferSelect) => {
    const counts = await db.select({ status: recipients.status, count: sql<number>`count(*)::int` }).from(recipients)
      .where(eq(recipients.runId, run.id)).groupBy(recipients.status);
    return { ...run, counts: Object.fromEntries(counts.map(row => [row.status, row.count])) };
  };
  const root = "/api/admin/orsa/bulk-sms";
  app.get(root, authenticated, admin, handle(async (_req, res) => {
    const landingUrl = `${getOutreachPublishedBaseUrl()}/orsa/heartplan`;
    const [candidates, history] = await Promise.all([
      bulkSmsAudience(), db.select().from(runs).orderBy(desc(runs.createdAt)).limit(20),
    ]);
    res.json({
      candidates, runs: await Promise.all(history.map(runSummary)), landingUrl,
      message: orsaHeartPlanText(landingUrl), deliveryEnabled: bulkSmsDeliveryEnabled(),
      workerNotice: "The queue is saved in the database and resumes when the server runs. Autoscale can sleep: use always-on Reserved VM publishing for dependable unattended timing. Sending is limited to 9 AM–7 PM in the audience time zone you confirm. An already submitted text cannot be recalled.",
    });
  }));
  app.get(`${root}/:id`, authenticated, admin, handle(async (req, res) => {
    const [run] = await db.select().from(runs).where(eq(runs.id, String(req.params.id)));
    if (!run) return res.status(404).json({ error: "Campaign not found." });
    const status = z.enum(["all", "pending", "submitted", "needs_review", "skipped", "sending"]).parse(req.query.status || "all");
    const limit = z.coerce.number().int().min(1).max(100).parse(req.query.limit || 100);
    const offset = z.coerce.number().int().min(0).parse(req.query.offset || 0);
    const where = and(eq(recipients.runId, run.id), ...(status === "all" ? [] : [eq(recipients.status, status)]));
    const [rows, totals] = await Promise.all([
      db.select({ recipient: recipients, deliveryStatus: orsaSmsCampaign.deliveryStatus }).from(recipients)
        .leftJoin(orsaSmsCampaign, eq(recipients.phone, orsaSmsCampaign.phone)).where(where)
        .orderBy(recipients.createdAt, recipients.id).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(recipients).where(where),
    ]);
    res.json({ run: await runSummary(run), recipients: rows.map(row => ({ ...row.recipient, deliveryStatus: row.deliveryStatus })), total: totals[0].count });
  }));
  app.post(root, authenticated, admin, handle(async (req, res) => {
    const input = bulkSmsInput.parse(req.body);
    if (new Set(input.memberIds).size !== input.memberIds.length) return res.status(400).json({ error: "Duplicate member selections." });
    if (new Date(input.scheduledAt).getTime() < Date.now() - 60000) return res.status(400).json({ error: "Choose a current or future start time; past schedules will not be silently reused." });
    const requested = new Set(input.memberIds);
    const reviewed = (await bulkSmsAudience()).filter(candidate => requested.has(candidate.id));
    // Fail the whole review if the audience changed, instead of silently
    // treating a smaller or different recipient list as approved.
    if (reviewed.length !== requested.size || reviewed.some(candidate => !candidate.eligible || !candidate.phone)) {
      return res.status(409).json({ error: "Some selected members are no longer eligible. Refresh and review the audience again." });
    }
    const actor = req.session?.userId || req.user?.claims?.sub;
    const created = await db.transaction(async tx => {
      const [run] = await tx.insert(runs).values({
        status: "draft", message: orsaHeartPlanText(`${getOutreachPublishedBaseUrl()}/orsa/heartplan`),
        attestation: input.attestation, createdBy: actor, timezone: input.timezone,
        intervalSeconds: input.intervalSeconds, dailyLimit: input.dailyLimit, scheduledAt: new Date(input.scheduledAt),
      }).returning();
      for (let offset = 0; offset < reviewed.length; offset += 300) {
        await tx.insert(recipients).values(reviewed.slice(offset, offset + 300).map(candidate => ({
          runId: run.id, memberId: candidate.id, displayName: candidate.displayName, phone: candidate.phone!,
        })));
      }
      await tx.insert(orsaRosterAudits).values({ actorUserId: actor, action: "bulk_sms_draft_admin_attestation", affectedCount: reviewed.length });
      return run;
    });
    res.status(201).json({ runId: created.id, queued: reviewed.length, excluded: 0 });
  }));
  app.post(`${root}/:id/start`, authenticated, admin, handle(async (req, res) => {
    z.object({ confirmed: z.literal(true), providerLimitsConfirmed: z.literal(true) }).strict().parse(req.body);
    if (!bulkSmsDeliveryEnabled()) return res.status(403).json({ error: "Live start requires the published app and a configured SMS provider." });
    const actor = req.session?.userId || req.user?.claims?.sub;
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('orsa-bulk-sms-start'))`);
      const [active] = await tx.select().from(runs).where(eq(runs.status, "running"));
      if (active) fail(409, "Another campaign is active. Pause or finish it before starting another.");
      const [run] = await tx.select().from(runs).where(eq(runs.id, String(req.params.id))).for("update");
      if (!run) fail(404, "Campaign not found.");
      if (!["draft", "paused"].includes(run.status)) fail(409, "Only draft or paused campaigns can start.");
      if (!isCurrentOrsaHeartPlanText(run.message, `${getOutreachPublishedBaseUrl()}/orsa/heartplan`)) {
        fail(409, "Campaign message does not match the current landing page. Create and review a new draft.");
      }
      await tx.update(runs).set({ status: "running", approvedBy: actor, pauseReason: null, updatedAt: new Date() }).where(eq(runs.id, run.id));
      await tx.insert(orsaRosterAudits).values({ actorUserId: actor, action: "bulk_sms_started_provider_limits_attested", affectedCount: 1 });
    });
    res.json({ ok: true });
  }));
  for (const action of ["pause", "cancel"] as const) {
    app.post(`${root}/:id/${action}`, authenticated, admin, handle(async (req, res) => {
      z.object({ confirmed: z.literal(true) }).strict().parse(req.body);
      await db.transaction(async tx => {
        const [run] = await tx.select().from(runs).where(eq(runs.id, String(req.params.id))).for("update");
        if (!run) fail(404, "Campaign not found.");
        if (["cancelled", "completed"].includes(run.status)) fail(409, "This campaign has already ended.");
        await tx.update(runs).set({ status: action === "pause" ? "paused" : "cancelled", updatedAt: new Date() }).where(eq(runs.id, run.id));
        if (action === "cancel") await tx.update(recipients).set({ status: "skipped", reason: "Campaign cancelled before submission" }).where(and(eq(recipients.runId, run.id), eq(recipients.status, "pending")));
        await tx.insert(orsaRosterAudits).values({ actorUserId: req.session?.userId || req.user?.claims?.sub, action: `bulk_sms_${action}`, affectedCount: 1 });
      });
      res.json({ ok: true });
    }));
  }
  startBulkSmsWorker();
}
