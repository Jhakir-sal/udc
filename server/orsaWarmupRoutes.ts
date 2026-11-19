import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { getWarmupOverview, pauseWarmup, saveWarmupSettings } from "./orsaWarmup";

export const warmupSettingsInput = z.object({
  enabled: z.boolean(), paused: z.boolean(),
  hourlyLimit: z.number().int().min(1).max(1000),
  dailyLimit: z.number().int().min(1).max(10000),
  minIntervalSeconds: z.number().int().min(4).max(86400),
  providerHourlyLimit: z.number().int().min(1).max(1000),
  reservedHourly: z.number().int().min(0).max(999),
  acknowledgeProviderLimits: z.literal(true), reviewedDeliveryStats: z.literal(true),
}).strict().refine(data => data.hourlyLimit + data.reservedHourly <= data.providerHourlyLimit,
  "Outreach rate plus the essential-email reserve must not exceed the provider hourly ceiling.");

export function registerOrsaWarmupRoutes(app: Express, authenticated: RequestHandler, admin: RequestHandler,
  service = { getWarmupOverview, pauseWarmup, saveWarmupSettings }) {
  const base = "/api/admin/orsa/email-warmup";
  app.get(base, authenticated, admin, async (_req, res) => {
    try { res.json(await service.getWarmupOverview()); }
    catch { res.status(500).json({ error: "Could not load warming status. Sending remains blocked if the budget cannot be checked." }); }
  });
  app.put(base, authenticated, admin, async (req: any, res) => {
    const parsed = warmupSettingsInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Review the provider limits and delivery results." });
    const actor = req.session?.userId || req.user?.claims?.sub;
    if (!actor) return res.status(403).json({ error: "An authenticated administrator is required." });
    const { acknowledgeProviderLimits: _ack, reviewedDeliveryStats: _reviewed, ...input } = parsed.data;
    try { res.json(await service.saveWarmupSettings(input, actor)); }
    catch { res.status(500).json({ error: "Could not save warming settings." }); }
  });
  app.post(`${base}/pause`, authenticated, admin, async (_req, res) => {
    try { await service.pauseWarmup(); res.json(await service.getWarmupOverview()); }
    catch { res.status(500).json({ error: "Could not confirm the global pause. Stop local send loops and review status." }); }
  });
}
