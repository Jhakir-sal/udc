import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { orsaBulkSmsRecipients as recipients, orsaBulkSmsRuns as runs, orsaSmsCampaign as phones } from "@shared/schema";
import { bulkSmsClock } from "./orsaBulkSmsPolicy";
import { freshBulkSmsMember } from "./orsaBulkSmsAudience";
import { finishOrsaSms, isCurrentOrsaHeartPlanText, orsaSmsClaimStillAllowed } from "./orsaSmsCampaign";
import { isRingCentralConfigured, submitSmsViaRingCentral } from "./ringcentral";
import { isProductionDeployment } from "./deploymentEnv";
import { getAppUrl } from "./email";

const liveDelivery = isProductionDeployment;
export const bulkSmsDeliveryEnabled = () => liveDelivery() && isRingCentralConfigured();

// No retry of an attempt whose provider outcome is unknown. A crash can delay
// pending recipients but cannot turn sending recipients back into pending.
export async function recoverStaleBulkSmsAttempts(now = new Date(), onlyRunId?: string) {
  await db.transaction(async tx => {
    const stale = await tx.select().from(recipients).where(and(
      eq(recipients.status, "sending"), lt(recipients.attemptedAt, new Date(now.getTime() - 120000)),
      ...(onlyRunId ? [eq(recipients.runId, onlyRunId)] : []),
    )).for("update", { skipLocked: true });
    for (const recipient of stale) {
      await tx.update(recipients).set({ status: "needs_review", reason: "Worker interrupted or provider outcome uncertain. Never automatically retry." }).where(eq(recipients.id, recipient.id));
      await tx.update(phones).set({ status: "needs_review", deliveryStatus: "unknown" }).where(and(
        eq(phones.phone, recipient.phone), eq(phones.status, "sending"), isNull(phones.optedOutAt),
      ));
      await tx.update(runs).set({ status: "paused", pauseReason: "An interrupted attempt needs review before continuing.", updatedAt: now }).where(and(
        eq(runs.id, recipient.runId), eq(runs.status, "running"),
      ));
    }
  });
}

export async function dispatchBulkSmsTick(now = new Date(), delivery = {
  enabled: bulkSmsDeliveryEnabled,
  send: submitSmsViaRingCentral,
}, onlyRunId?: string) {
  if (!delivery.enabled()) return;
  await recoverStaleBulkSmsAttempts(now, onlyRunId);
  const claim = await db.transaction(async tx => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('orsa-bulk-sms-dispatch')) as locked`);
    if (!lock.rows[0]?.locked) return null;
    const [run] = await tx.select().from(runs).where(and(eq(runs.status, "running"), ...(onlyRunId ? [eq(runs.id, onlyRunId)] : []))).for("update").limit(1);
    if (!run) return null;
    if (!isCurrentOrsaHeartPlanText(run.message, `${getAppUrl()}/orsa/heartplan`)) {
      await tx.update(runs).set({
        status: "paused",
        pauseReason: "Campaign message does not match the current landing page. Create and review a new draft.",
        updatedAt: now,
      }).where(eq(runs.id, run.id));
      console.error("[ORSA bulk SMS] Paused a run with an outdated campaign message.");
      return null;
    }
    if (run.scheduledAt > now || (run.nextAttemptAt && run.nextAttemptAt > now)) return null;
    const clock = bulkSmsClock(run.timezone, now);
    if (!clock.withinHours) return null;
    const attempts = run.dayKey === clock.dayKey ? run.dayAttempts : 0;
    if (attempts >= run.dailyLimit) return null;
    const [inFlight] = await tx.select({ id: recipients.id }).from(recipients).where(and(
      eq(recipients.runId, run.id), eq(recipients.status, "sending"),
    )).limit(1);
    if (inFlight) return null;
    const [recipient] = await tx.select().from(recipients).where(and(
      eq(recipients.runId, run.id), eq(recipients.status, "pending"),
    )).orderBy(recipients.createdAt, recipients.id).for("update", { skipLocked: true }).limit(1);
    if (!recipient) {
      await tx.update(runs).set({ status: "completed", updatedAt: now }).where(eq(runs.id, run.id));
      return null;
    }
    const fresh = await freshBulkSmsMember(recipient.memberId, recipient.phone);
    if (fresh.reason) {
      await tx.update(recipients).set({ status: "skipped", reason: fresh.reason }).where(eq(recipients.id, recipient.id));
      return null;
    }
    // Same phone state is used by the older one-time SMS tool.
    await tx.insert(phones).values({ phone: recipient.phone, memberId: recipient.memberId }).onConflictDoNothing();
    const [state] = await tx.select().from(phones).where(eq(phones.phone, recipient.phone)).for("update");
    if (state.optedOutAt || state.status !== "not_sent") {
      await tx.update(recipients).set({ status: "skipped", reason: state.optedOutAt ? "SMS opt-out" : "Phone already attempted in another campaign" }).where(eq(recipients.id, recipient.id));
      return null;
    }
    // Truthful provenance: recorded now by an admin, not a manufactured
    // historic member opt-in date or an independently verified document.
    await tx.update(phones).set({
      memberId: recipient.memberId, consentEvidence: `Administrator attestation; bulk run ${run.id}. ${run.attestation}`,
      consentRecordedBy: run.approvedBy || run.createdBy, consentRecordedAt: now,
      status: "sending", attemptedAt: now, sentBy: run.approvedBy || run.createdBy,
    }).where(eq(phones.phone, recipient.phone));
    await tx.update(recipients).set({ status: "sending", attemptedAt: now }).where(eq(recipients.id, recipient.id));
    await tx.update(runs).set({
      dayKey: clock.dayKey, dayAttempts: attempts + 1,
      nextAttemptAt: new Date(now.getTime() + run.intervalSeconds * 1000), updatedAt: now,
    }).where(eq(runs.id, run.id));
    return { run, recipient };
  });
  if (!claim) return;
  const { run, recipient } = claim;
  // Pause/cancel and STOP can arrive between reservation and submission.
  const [freshRun] = await db.select().from(runs).where(eq(runs.id, run.id));
  if (freshRun?.status !== "running" || !await orsaSmsClaimStillAllowed(recipient.phone)) {
    // No provider call happened, so a pause can safely release this reservation.
    await db.transaction(async tx => {
      const [phone] = await tx.select().from(phones).where(eq(phones.phone, recipient.phone)).for("update");
      const stopped = !!phone?.optedOutAt;
      await tx.update(recipients).set({
        status: freshRun?.status === "paused" && !stopped ? "pending" : "skipped",
        attemptedAt: null, reason: stopped ? "SMS opt-out before submission" : freshRun?.status === "paused" ? null : "Campaign cancelled before submission",
      }).where(eq(recipients.id, recipient.id));
      await tx.update(phones).set({ status: "not_sent", attemptedAt: null, sentBy: null }).where(and(eq(phones.phone, recipient.phone), eq(phones.status, "sending"), isNull(phones.optedOutAt)));
      await tx.update(runs).set({ dayAttempts: sql`greatest(${runs.dayAttempts} - 1, 0)` }).where(eq(runs.id, run.id));
    });
    return;
  }
  let receipt: { id: string | null; status: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    receipt = await Promise.race([
      delivery.send(recipient.phone, run.message),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 30000); }),
    ]);
  } catch { /* Uncertain provider failures are recorded, never retried. */ }
  finally { if (timer) clearTimeout(timer); }
  try {
    await finishOrsaSms(recipient.phone, receipt, run.approvedBy || run.createdBy);
    await db.update(recipients).set({
      status: receipt ? "submitted" : "needs_review",
      submittedAt: receipt ? new Date() : null,
      reason: receipt ? null : "Provider submission not confirmed; do not automatically retry.",
    }).where(eq(recipients.id, recipient.id));
  } catch {
    receipt = null;
    // Original 'sending' state remains durable if persistence failed.
  }
  if (!receipt) {
    await db.update(runs).set({
      status: "paused", pauseReason: "Provider outcome needs review. Pending recipients are preserved; uncertain attempts will not be resent.", updatedAt: new Date(),
    }).where(and(eq(runs.id, run.id), eq(runs.status, "running")));
  }
}

let started = false;
let busy = false;
export function startBulkSmsWorker() {
  if (started) return;
  if (!liveDelivery()) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[ORSA bulk SMS] Worker disabled: this is not an explicitly identified production slot.");
    }
    return;
  }
  started = true;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await dispatchBulkSmsTick(); }
    catch { console.error("[ORSA bulk SMS] Worker unavailable; queued records remain persisted."); }
    finally { busy = false; }
  }, 2000);
  timer.unref();
}
