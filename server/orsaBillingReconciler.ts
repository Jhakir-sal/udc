import Stripe from "stripe";
import { and, asc, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "./db";
import {
  householdBillingOperations,
  nerEnrollments,
  nerSubscriptionBindings,
  salNotifications,
} from "@shared/schema";
import {
  bindNerCheckoutSubscription,
  runHouseholdBillingOperation,
  syncHouseholdStripeEvent,
} from "./orsaBillingService";
import { attemptNerRegistration, NER_REGISTRATION_MAX_ATTEMPTS } from "./nerRegistrationService";

export const ORSA_RECONCILIATION_BATCH_SIZE = 20;
export const ORSA_RECONCILIATION_STALE_MS = 15 * 60 * 1000;
export const ORSA_RECONCILIATION_MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 15 * 60 * 1000;

type Outcome = "completed" | "failed_permanent";
export type OrsaReconciliationSummary = {
  scanned: number;
  completed: number;
  retrying: number;
  failedPermanent: number;
};

function retryAt(now: Date, attempts: number) {
  return new Date(now.getTime() + RETRY_BASE_MS * Math.min(16, 2 ** Math.max(0, attempts - 1)));
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Reconciliation failed";
}

function terminalProviderError(error: unknown) {
  const value = error as { code?: string; statusCode?: number };
  return value?.code === "resource_missing" || value?.statusCode === 404;
}

async function notifyOnce(kind: "household" | "ner_binding" | "ner_registration", outcome: Outcome, id: string) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const claimed = kind === "household"
      ? await tx.update(householdBillingOperations).set({ conciergeNotifiedAt: now })
        .where(and(eq(householdBillingOperations.id, id), isNull(householdBillingOperations.conciergeNotifiedAt))).returning({ id: householdBillingOperations.id })
      : kind === "ner_binding"
        ? await tx.update(nerSubscriptionBindings).set({ conciergeNotifiedAt: now })
          .where(and(eq(nerSubscriptionBindings.id, id), isNull(nerSubscriptionBindings.conciergeNotifiedAt))).returning({ id: nerSubscriptionBindings.id })
        : await tx.update(nerEnrollments).set({ externalConciergeNotifiedAt: now })
          .where(and(eq(nerEnrollments.id, id), isNull(nerEnrollments.externalConciergeNotifiedAt))).returning({ id: nerEnrollments.id });
    if (!claimed.length) return;
    await tx.insert(salNotifications).values({
      type: `orsa_reconciliation_${outcome}`,
      payload: JSON.stringify({ kind, outcome }),
    });
  });
}

async function reportOutcome(kind: "household" | "ner_binding" | "ner_registration", outcome: Outcome, id: string) {
  try {
    await notifyOnce(kind, outcome, id);
  } catch {
    console.error("[ORSA Billing Reconciler] Concierge reporting failed");
  }
}

async function recoverHousehold(stripe: Stripe, operation: typeof householdBillingOperations.$inferSelect, now: Date) {
  const attempt = operation.reconciliationAttemptCount + 1;
  await db.update(householdBillingOperations).set({
    reconciliationAttemptCount: attempt,
    reconciliationLastAttemptAt: now,
    reconciliationNextAttemptAt: retryAt(now, attempt),
    updatedAt: now,
  }).where(and(eq(householdBillingOperations.id, operation.id), eq(householdBillingOperations.status, "pending")));
  try {
    if (operation.checkoutSessionId) {
      const checkout = await stripe.checkout.sessions.retrieve(operation.checkoutSessionId);
      const subscriptionId = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription?.id;
      if (checkout.status === "complete" && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
        await syncHouseholdStripeEvent(stripe, {
          subscriptionId,
          kind: "checkout",
          checkoutSessionId: checkout.id,
          authoritativeSubscription: subscription,
        });
        const invoice = typeof subscription.latest_invoice === "object"
          ? subscription.latest_invoice as Stripe.Invoice | null
          : null;
        if (invoice?.status === "paid") {
          await syncHouseholdStripeEvent(stripe, {
            subscriptionId,
            kind: "paid",
            authoritativeSubscription: subscription,
          });
        }
      }
    } else {
      await runHouseholdBillingOperation({
        householdId: operation.householdId,
        memberId: operation.memberId,
        targetStatus: operation.targetStatus === "removed" ? "removed" : "active",
        stripe,
        successUrl: operation.checkoutSuccessUrl ?? undefined,
        cancelUrl: operation.checkoutCancelUrl ?? undefined,
      });
    }
    const [current] = await db.select().from(householdBillingOperations).where(eq(householdBillingOperations.id, operation.id));
    if (current?.status === "completed") {
      await reportOutcome("household", "completed", operation.id);
      return "completed" as const;
    }
    return "retrying" as const;
  } catch (error) {
    const permanent = terminalProviderError(error) || attempt >= ORSA_RECONCILIATION_MAX_ATTEMPTS;
    await db.update(householdBillingOperations).set({
      status: permanent ? "failed_permanent" : "pending",
      lastError: safeError(error),
      reconciliationNextAttemptAt: permanent ? null : retryAt(now, attempt),
      updatedAt: now,
    }).where(eq(householdBillingOperations.id, operation.id));
    if (permanent) await reportOutcome("household", "failed_permanent", operation.id);
    return permanent ? "failed_permanent" as const : "retrying" as const;
  }
}

async function recoverBinding(stripe: Stripe, binding: typeof nerSubscriptionBindings.$inferSelect, now: Date) {
  const attempt = binding.reconciliationAttemptCount + 1;
  await db.update(nerSubscriptionBindings).set({
    reconciliationAttemptCount: attempt,
    reconciliationLastAttemptAt: now,
    reconciliationNextAttemptAt: retryAt(now, attempt),
  }).where(and(eq(nerSubscriptionBindings.id, binding.id), eq(nerSubscriptionBindings.state, "pending")));
  try {
    const subscription = await stripe.subscriptions.retrieve(binding.stripeSubscriptionId);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
    await bindNerCheckoutSubscription(stripe, {
      enrollmentId: binding.enrollmentId,
      subscriptionId: binding.stripeSubscriptionId,
      customerId,
      checkoutSessionId: binding.checkoutSessionId,
    });
    const [current] = await db.select().from(nerSubscriptionBindings).where(eq(nerSubscriptionBindings.id, binding.id));
    if (current?.state === "active" || current?.state === "retired") {
      await reportOutcome("ner_binding", "completed", binding.id);
      return "completed" as const;
    }
    return "retrying" as const;
  } catch (error) {
    const permanent = terminalProviderError(error) || attempt >= ORSA_RECONCILIATION_MAX_ATTEMPTS;
    await db.update(nerSubscriptionBindings).set({
      state: permanent ? "failed_permanent" : "pending",
      reconciliationLastError: safeError(error),
      reconciliationNextAttemptAt: permanent ? null : retryAt(now, attempt),
    }).where(eq(nerSubscriptionBindings.id, binding.id));
    if (permanent) await reportOutcome("ner_binding", "failed_permanent", binding.id);
    return permanent ? "failed_permanent" as const : "retrying" as const;
  }
}

async function recoverRegistration(enrollment: typeof nerEnrollments.$inferSelect, now: Date) {
  const result = await attemptNerRegistration(enrollment.id, { now });
  if (result === "registered" || result === "already_registered") {
    await reportOutcome("ner_registration", "completed", enrollment.id);
    return "completed" as const;
  }
  if (result === "failed") {
    const [current] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollment.id));
    const permanent = (current?.externalAttemptCount ?? 0) >= NER_REGISTRATION_MAX_ATTEMPTS;
    if (permanent) await reportOutcome("ner_registration", "failed_permanent", enrollment.id);
    return permanent ? "failed_permanent" as const : "retrying" as const;
  }
  return "retrying" as const;
}

export async function reconcileOrsaBilling(stripe: Stripe, options: {
  now?: Date;
  batchSize?: number;
} = {}): Promise<OrsaReconciliationSummary> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - ORSA_RECONCILIATION_STALE_MS);
  const limit = Math.max(1, Math.min(options.batchSize ?? ORSA_RECONCILIATION_BATCH_SIZE, ORSA_RECONCILIATION_BATCH_SIZE));
  const operations = await db.select().from(householdBillingOperations).where(and(
    eq(householdBillingOperations.status, "pending"),
    lt(householdBillingOperations.updatedAt, staleBefore),
    or(isNull(householdBillingOperations.reconciliationNextAttemptAt), lte(householdBillingOperations.reconciliationNextAttemptAt, now)),
  )).orderBy(asc(householdBillingOperations.updatedAt)).limit(limit);
  const remaining = limit - operations.length;
  const bindings = remaining > 0 ? await db.select().from(nerSubscriptionBindings).where(and(
    eq(nerSubscriptionBindings.state, "pending"),
    lt(nerSubscriptionBindings.createdAt, staleBefore),
    or(isNull(nerSubscriptionBindings.reconciliationNextAttemptAt), lte(nerSubscriptionBindings.reconciliationNextAttemptAt, now)),
  )).orderBy(asc(nerSubscriptionBindings.createdAt)).limit(remaining) : [];
  const registrationSlots = remaining - bindings.length;
  const registrations = registrationSlots > 0 ? await db.select().from(nerEnrollments).where(and(
    inArray(nerEnrollments.externalStatus, ["not_requested", "pending", "failed"]),
    gt(nerEnrollments.paidInstallmentCount, 0),
    lt(nerEnrollments.externalAttemptCount, NER_REGISTRATION_MAX_ATTEMPTS),
    lt(nerEnrollments.updatedAt, staleBefore),
    or(isNull(nerEnrollments.externalNextAttemptAt), lte(nerEnrollments.externalNextAttemptAt, now)),
    or(isNull(nerEnrollments.externalLeaseExpiresAt), lte(nerEnrollments.externalLeaseExpiresAt, now)),
  )).orderBy(asc(nerEnrollments.updatedAt)).limit(registrationSlots) : [];
  const results = [
    ...(await Promise.all(operations.map((operation) => recoverHousehold(stripe, operation, now)))),
    ...(await Promise.all(bindings.map((binding) => recoverBinding(stripe, binding, now)))),
    ...(await Promise.all(registrations.map((enrollment) => recoverRegistration(enrollment, now)))),
  ];
  const summary = {
    scanned: results.length,
    completed: results.filter((value) => value === "completed").length,
    retrying: results.filter((value) => value === "retrying").length,
    failedPermanent: results.filter((value) => value === "failed_permanent").length,
  };
  console.info("[ORSA Billing Reconciler]", summary);
  return summary;
}

export function startOrsaBillingReconciler(getStripe: () => Promise<Stripe | null>) {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const stripe = await getStripe();
      if (stripe) await reconcileOrsaBilling(stripe);
    } catch {
      console.error("[ORSA Billing Reconciler] Sweep failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(sweep, 15 * 60 * 1000);
  timer.unref?.();
  const initial = setTimeout(sweep, 60 * 1000);
  initial.unref?.();
  return { sweep, stop: () => { clearInterval(timer); clearTimeout(initial); } };
}