import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { orsaEmailWarmupAttempts as attempts, orsaEmailWarmupSettings as settings } from "@shared/schema";
import { ORSA_WARMUP_DEFAULTS } from "@shared/orsaWarmupDefaults";

export type WarmupSettings = typeof settings.$inferSelect;
export type WarmupUsage = { hourly: number; daily: number; otherHourly: number; otherDaily: number };
export type WarmupDecision =
  | { allowed: true; reservationId: string }
  | { allowed: false; paused: boolean; waitingForReview: boolean; retryAfterSeconds: number; reason: string };
export const DEFAULT_WARMUP = ORSA_WARMUP_DEFAULTS;
const ID = "orsa";

type UsageEntry = { kind: string; createdAt: Date };
export function warmupUsage(entries: UsageEntry[], now: Date): WarmupUsage {
  const usage = { hourly: 0, daily: 0, otherHourly: 0, otherDaily: 0 };
  for (const entry of entries) {
    const age = now.getTime() - entry.createdAt.getTime();
    // Future timestamps can reflect clock skew or concurrent inserts; count
    // them until their full window expires rather than undercounting traffic.
    if (age >= 86_400_000) continue;
    const other = entry.kind === "other";
    if (other) usage.otherDaily++; else usage.daily++;
    if (age < 3_600_000) {
      if (other) usage.otherHourly++; else usage.hourly++;
    }
  }
  return usage;
}

export function evaluateWarmup(config: Pick<WarmupSettings,
  "enabled" | "paused" | "hourlyLimit" | "dailyLimit" | "providerHourlyLimit" |
  "minIntervalSeconds" | "nextSendAt" | "pauseReason"> & { dailyReviewRequired?: boolean }, entries: UsageEntry[], now: Date): Exclude<WarmupDecision, { allowed: true }> | null {
  if (!config.enabled || config.paused) return {
    allowed: false, paused: true, waitingForReview: true, retryAfterSeconds: 0,
    reason: config.pauseReason || "ORSA warming is off or paused. Review the provider limits and delivery results before enabling it.",
  };
  const usage = warmupUsage(entries, now);
  if (config.dailyReviewRequired) return { allowed: false, paused: true, waitingForReview: true, retryAfterSeconds: 0,
    reason: "The daily warming budget requires delivery review. Save reviewed controls before continuing; it will not resume automatically tomorrow." };
  if (usage.daily >= config.dailyLimit) return {
    allowed: false, paused: true, waitingForReview: true, retryAfterSeconds: 0,
    reason: "The rolling 24-hour ORSA limit has been reached. Review delivery results and confirm a new group after capacity returns.",
  };
  if (usage.hourly >= config.hourlyLimit || usage.hourly + usage.otherHourly >= config.providerHourlyLimit) {
    const hourlyEntries = entries.filter(entry => {
      const age = now.getTime() - entry.createdAt.getTime();
      return age < 3_600_000;
    }).filter(entry => usage.hourly >= config.hourlyLimit ? entry.kind === "outreach" : true);
    const oldest = Math.min(...hourlyEntries.map(entry => entry.createdAt.getTime()));
    return { allowed: false, paused: false, waitingForReview: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + 3_600_000 - now.getTime()) / 1000)),
      reason: "Waiting for rolling hourly sending capacity." };
  }
  if (config.nextSendAt && config.nextSendAt > now) return {
    allowed: false, paused: false, waitingForReview: false,
    retryAfterSeconds: Math.max(1, Math.ceil((config.nextSendAt.getTime() - now.getTime()) / 1000)),
    reason: "Waiting for the configured spacing between ORSA emails.",
  };
  return null;
}

async function ensureSettings(scope = ID) {
  await db.insert(settings).values({ id: scope, ...DEFAULT_WARMUP }).onConflictDoNothing();
}
async function recentEntries(tx: typeof db, now: Date, scope = ID) {
  return tx.select({ kind: attempts.kind, createdAt: attempts.createdAt }).from(attempts)
    .where(and(eq(attempts.scope, scope), gte(attempts.createdAt, new Date(now.getTime() - 86_400_000))));
}
export async function getWarmupOverview(scope = ID) {
  await ensureSettings(scope);
  const [config] = await db.select().from(settings).where(eq(settings.id, scope));
  const now = new Date();
  const entries = await recentEntries(db, now, scope);
  const usage = warmupUsage(entries, now);
  const decision = evaluateWarmup(config, entries, now);
  return {
    settings: config, usage,
    remaining: { hourly: Math.max(0, Math.min(config.hourlyLimit - usage.hourly,
      config.providerHourlyLimit - usage.hourly - usage.otherHourly)), daily: Math.max(0, config.dailyLimit - usage.daily) },
    nextAllowedAt: decision && !decision.paused ? new Date(now.getTime() + decision.retryAfterSeconds * 1000).toISOString() : null,
  };
}
export async function warmupConfirmationReason(): Promise<string | null> {
  const overview = await getWarmupOverview();
  if (!overview.settings.enabled || overview.settings.paused)
    return overview.settings.pauseReason || "Review and enable ORSA warming before confirming a live recipient group.";
  if (overview.settings.dailyReviewRequired) return "The daily warming budget requires a fresh delivery review. Save reviewed controls before confirming another group.";
  return null;
}
export async function saveWarmupSettings(input: typeof DEFAULT_WARMUP, actor: string, scope = ID) {
  await ensureSettings(scope);
  // Preserve nextSendAt and existing reservations when settings change.
  await db.update(settings).set({ ...input, dailyReviewRequired: false, reviewedBy: actor, updatedAt: new Date(),
    pauseReason: input.paused || !input.enabled ? "Paused by an administrator." : null }).where(eq(settings.id, scope));
  return getWarmupOverview(scope);
}
export async function pauseWarmup(reason = "Paused by an administrator.", scope = ID) {
  await ensureSettings(scope);
  await db.update(settings).set({ paused: true, pauseReason: reason, updatedAt: new Date() }).where(eq(settings.id, scope));
}
export async function reserveWarmup(templateId: string, actorUserId?: string, scope = ID): Promise<WarmupDecision> {
  await ensureSettings(scope);
  return db.transaction(async tx => {
    const [config] = await tx.select().from(settings).where(eq(settings.id, scope)).for("update");
    const now = new Date();
    const entries = await recentEntries(tx as unknown as typeof db, now, scope);
    const blocked = evaluateWarmup(config, entries, now);
    if (blocked) {
      if (blocked.waitingForReview && config.enabled && !config.paused && warmupUsage(entries, now).daily >= config.dailyLimit)
        await tx.update(settings).set({ dailyReviewRequired: true }).where(eq(settings.id, scope));
      return blocked;
    }
    const [reservation] = await tx.insert(attempts).values({ kind: "outreach", scope, templateId, actorUserId, createdAt: now })
      .returning({ id: attempts.id });
    await tx.update(settings).set({ nextSendAt: new Date(now.getTime() + config.minIntervalSeconds * 1000),
      dailyReviewRequired: warmupUsage(entries, now).daily + 1 >= config.dailyLimit }).where(eq(settings.id, scope));
    return { allowed: true, reservationId: reservation.id };
  });
}
export async function finishWarmupReservation(id: string, accepted: boolean) {
  await db.update(attempts).set({ status: accepted ? "submitted" : "needs_review" }).where(eq(attempts.id, id));
}
export async function authorizeWarmupReservation(id: string | undefined, scope = ID) {
  if (!id) throw new Error("ORSA sending requires a confirmed group and a warming reservation.");
  await db.transaction(async tx => {
    const [config] = await tx.select().from(settings).where(eq(settings.id, scope)).for("update");
    if (!config?.enabled || config.paused) throw new Error("ORSA warming is paused.");
    const [claimed] = await tx.update(attempts).set({ status: "dispatching" }).where(and(
      eq(attempts.id, id), eq(attempts.scope, scope), eq(attempts.kind, "outreach"), eq(attempts.status, "reserved"),
      gte(attempts.createdAt, new Date(Date.now() - 300_000)),
    )).returning({ id: attempts.id });
    if (!claimed) throw new Error("ORSA warming reservation is expired or already used.");
  });
}
export async function recordOtherEmailTraffic(scope = ID, recipientCount = 1) {
  await ensureSettings(scope);
  await db.transaction(async tx => {
    await tx.select({ id: settings.id }).from(settings).where(eq(settings.id, scope)).for("update");
    await tx.insert(attempts).values(Array.from({ length: Math.max(1, Math.min(1000, recipientCount)) },
      () => ({ kind: "other", scope, status: "attempted" })));
  });
}
