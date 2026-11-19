import Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { households, householdMembers, householdBillingOperations, nerEnrollments, nerInstallments, nerSubscriptionBindings } from "@shared/schema";
import { normalizeOrsaEmail } from "@shared/orsa";
import { HOUSEHOLD_SEAT_MONTHLY_CENTS } from "./entitlements";
import { NER_LIFETIME_INSTALLMENT_COUNT, NER_MONTHLY_INSTALLMENT_CENTS, applyNerInstallmentPaid, applyNerPaymentFailure, applyNerSubscriptionStatus } from "./ner";

export const ORSA_FAMILY_PRODUCT_KEY = "orsa_family_seat_v1";
export const NER_PRODUCT_KEY = "orsa_ner_installment_v1";

/** Checkout creates the current-period invoice; only these future cycles belong in the schedule. */
export function nerFutureScheduleIterations(successfulBeforeCheckout: number): number {
  return Math.max(0, NER_LIFETIME_INSTALLMENT_COUNT - successfulBeforeCheckout - 1);
}

export function checkoutAttemptFor(
  currentAttempt: number,
  hasPreviousSession: boolean,
  previousSessionIsReusable: boolean,
): number {
  return hasPreviousSession && !previousSessionIsReusable ? currentAttempt + 1 : currentAttempt;
}

export function householdTargetQuantity(
  activeCount: number,
  currentStatus: "invited" | "active" | "removed",
  targetStatus: "active" | "removed",
): number {
  return activeCount
    + (currentStatus !== "active" && targetStatus === "active" ? 1 : 0)
    - (currentStatus === "active" && targetStatus === "removed" ? 1 : 0);
}

export function canReplaceNerSubscription(previousStripeStatus: string): boolean {
  return previousStripeStatus === "canceled"
    || previousStripeStatus === "incomplete_expired"
    || previousStripeStatus === "unpaid";
}

export function invoiceMatchesAuthorizedSubscription(
  authorizedSubscriptionId: string | null,
  invoiceSubscriptionId: string,
): boolean {
  return authorizedSubscriptionId === invoiceSubscriptionId;
}

export function classifyNerInvoiceAuthorization(
  currentSubscriptionId: string | null,
  invoiceSubscriptionId: string,
  bindingState: string | null,
): "active" | "retired" | "retryable" {
  if (bindingState === "retired") return "retired";
  if (bindingState === "active" && currentSubscriptionId === invoiceSubscriptionId) return "active";
  if (bindingState === "active" && currentSubscriptionId !== invoiceSubscriptionId) return "retired";
  return "retryable";
}

export function isAuthoritativePendingNerMetadata(
  metadata: Stripe.Metadata | null | undefined,
): metadata is Stripe.Metadata & { nerEnrollmentId: string } {
  return Boolean(metadata?.nerEnrollmentId && metadata.sal_product === NER_PRODUCT_KEY);
}

export async function enforceNerFixedCycles(stripe: Stripe, input: {
  subscriptionId: string; enrollmentId: string; successfulBeforeCheckout: number; existingScheduleId: string | null;
}): Promise<string | null> {
  if (input.successfulBeforeCheckout >= NER_LIFETIME_INSTALLMENT_COUNT) {
    throw new Error("NER lifetime installment limit has already been reached");
  }
  const futureIterations = nerFutureScheduleIterations(input.successfulBeforeCheckout);
  if (futureIterations === 0) {
    // The checkout invoice is the final authorized installment; prevent any
    // renewal even if its invoice.paid webhook has not arrived yet.
    await stripe.subscriptions.update(input.subscriptionId, { cancel_at_period_end: true });
    return null;
  }
  let scheduleId = input.existingScheduleId;
  if (!scheduleId) {
    scheduleId = (await stripe.subscriptionSchedules.create(
      { from_subscription: input.subscriptionId },
      { idempotencyKey: `ner-schedule-create:${input.enrollmentId}:${input.subscriptionId}` },
    )).id;
  }
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const subscription = await stripe.subscriptions.retrieve(input.subscriptionId);
  const item = subscription.items.data[0];
  if (!item || typeof item.price === "string") throw new Error("NER subscription has no usable price item");
  const current = schedule.current_phase;
  if (!current) throw new Error("NER schedule has no current paid phase");
  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "cancel",
    metadata: { nerEnrollmentId: input.enrollmentId, sal_product: NER_PRODUCT_KEY },
    phases: [
      {
        start_date: current.start_date,
        end_date: current.end_date,
        items: [{ price: item.price.id, quantity: item.quantity ?? 1 }],
        metadata: { nerEnrollmentId: input.enrollmentId, sal_product: NER_PRODUCT_KEY },
      },
      {
        items: [{ price: item.price.id, quantity: item.quantity ?? 1 }],
        duration: { interval: "month", interval_count: futureIterations },
        metadata: { nerEnrollmentId: input.enrollmentId, sal_product: NER_PRODUCT_KEY },
      },
    ],
  }, { idempotencyKey: `ner-schedule-configure:${input.enrollmentId}:${input.subscriptionId}:${futureIterations}` });
  return scheduleId;
}

export async function configureNerSubscriptionBinding(stripe: Stripe, input: {
  enrollmentId: string;
  newSubscriptionId: string;
  previousSubscriptionId: string | null;
  previousScheduleId: string | null;
  successfulBeforeCheckout: number;
}) {
  let existingScheduleId = input.previousSubscriptionId === input.newSubscriptionId
    ? input.previousScheduleId
    : null;
  if (input.previousSubscriptionId && input.previousSubscriptionId !== input.newSubscriptionId) {
    const previous = await stripe.subscriptions.retrieve(input.previousSubscriptionId);
    if (!canReplaceNerSubscription(previous.status)) {
      throw new Error(`Existing NER subscription is ${previous.status} and may still bill`);
    }
    if (input.previousScheduleId) {
      const obsoleteSchedule = await stripe.subscriptionSchedules.retrieve(input.previousScheduleId);
      if (obsoleteSchedule.status === "active" || obsoleteSchedule.status === "not_started") {
        await stripe.subscriptionSchedules.release(
          input.previousScheduleId,
          { preserve_cancel_date: false },
          { idempotencyKey: `ner-schedule-release:${input.enrollmentId}:${input.previousScheduleId}` },
        );
      }
    }
  }
  return enforceNerFixedCycles(stripe, {
    subscriptionId: input.newSubscriptionId,
    enrollmentId: input.enrollmentId,
    successfulBeforeCheckout: input.successfulBeforeCheckout,
    existingScheduleId,
  });
}

export async function bindNerCheckoutSubscription(stripe: Stripe, input: {
  enrollmentId: string;
  subscriptionId: string;
  customerId: string | null;
  checkoutSessionId?: string | null;
}) {
  // Reserve the provider identity in its own committed transaction before any
  // schedule mutation. If Stripe succeeds but the activation transaction
  // fails, this pending row remains durable and the webhook retry resumes the
  // same state machine.
  const reservation = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.enrollmentId}, 63004))`);
    const [enrollment] = await tx.select().from(nerEnrollments).where(eq(nerEnrollments.id, input.enrollmentId));
    if (!enrollment) throw new Error("NER checkout references no enrollment");
    if (enrollment.stripeSubscriptionId) {
      await tx.insert(nerSubscriptionBindings).values({
        enrollmentId: enrollment.id,
        stripeSubscriptionId: enrollment.stripeSubscriptionId,
        scheduleId: enrollment.stripeScheduleId,
        state: "active",
        activatedAt: enrollment.updatedAt,
      }).onConflictDoNothing();
    }
    const [existing] = await tx.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.stripeSubscriptionId, input.subscriptionId));
    if (existing && existing.enrollmentId !== enrollment.id) {
      throw new Error("NER subscription is already bound to another enrollment");
    }
    if (existing?.state === "retired") return { retired: true as const, enrollment };
    if (!existing) {
      await tx.insert(nerSubscriptionBindings).values({
        enrollmentId: enrollment.id,
        stripeSubscriptionId: input.subscriptionId,
        checkoutSessionId: input.checkoutSessionId ?? enrollment.pendingCheckoutSessionId,
        state: "pending",
      });
    }
    return { retired: false as const, enrollment };
  });
  // A late duplicate Checkout event for historical authorization is harmless;
  // history must never be reactivated and Stripe should not retry it forever.
  if (reservation.retired) return reservation.enrollment;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.enrollmentId}, 63004))`);
    const [enrollment] = await tx.select().from(nerEnrollments).where(eq(nerEnrollments.id, input.enrollmentId));
    if (!enrollment) throw new Error("NER checkout references no enrollment");

    // Lazy rollout backfill. It runs under the same enrollment lock as every
    // activation and invoice credit, and is idempotent on subscription id.
    if (enrollment.stripeSubscriptionId) {
      await tx.insert(nerSubscriptionBindings).values({
        enrollmentId: enrollment.id,
        stripeSubscriptionId: enrollment.stripeSubscriptionId,
        scheduleId: enrollment.stripeScheduleId,
        state: "active",
        activatedAt: enrollment.updatedAt,
      }).onConflictDoNothing();
    }
    const [incomingBefore] = await tx.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.stripeSubscriptionId, input.subscriptionId));
    if (incomingBefore && incomingBefore.enrollmentId !== enrollment.id) {
      throw new Error("NER subscription is already bound to another enrollment");
    }
    if (incomingBefore?.state === "retired") {
      throw new Error("A retired NER subscription cannot be reactivated");
    }
    if (incomingBefore?.state === "active" && enrollment.stripeSubscriptionId === input.subscriptionId) {
      return enrollment;
    }
    if (!incomingBefore) throw new Error("NER subscription reservation was lost; retry binding");

    const scheduleId = await configureNerSubscriptionBinding(stripe, {
      enrollmentId: enrollment.id,
      newSubscriptionId: input.subscriptionId,
      previousSubscriptionId: enrollment.stripeSubscriptionId,
      previousScheduleId: enrollment.stripeScheduleId,
      successfulBeforeCheckout: enrollment.paidInstallmentCount,
    });
    const now = new Date();
    if (enrollment.stripeSubscriptionId && enrollment.stripeSubscriptionId !== input.subscriptionId) {
      await tx.update(nerSubscriptionBindings).set({
        state: "retired", retiredAt: now,
      }).where(and(
        eq(nerSubscriptionBindings.enrollmentId, enrollment.id),
        eq(nerSubscriptionBindings.stripeSubscriptionId, enrollment.stripeSubscriptionId),
      ));
    }
    await tx.update(nerSubscriptionBindings).set({
      state: "active",
      checkoutSessionId: input.checkoutSessionId ?? enrollment.pendingCheckoutSessionId,
      scheduleId,
      activatedAt: now,
      retiredAt: null,
    }).where(and(
      eq(nerSubscriptionBindings.enrollmentId, enrollment.id),
      eq(nerSubscriptionBindings.stripeSubscriptionId, input.subscriptionId),
    ));
    const [updated] = await tx.update(nerEnrollments).set({
      stripeSubscriptionId: input.subscriptionId,
      stripeCustomerId: input.customerId ?? enrollment.stripeCustomerId,
      stripeScheduleId: scheduleId,
      pendingCheckoutSessionId: null,
      checkoutExpiresAt: null,
      status: enrollment.paidInstallmentCount > 0 ? "provisional" : "pending_checkout",
      lastFailureAt: null,
      lastFailureMessage: null,
      paymentRetryAt: null,
      updatedAt: now,
    }).where(eq(nerEnrollments.id, enrollment.id)).returning();
    return updated;
  });
}

export type PendingNerInvoiceBindingResult =
  | { disposition: "bound"; enrollmentId: string }
  | { disposition: "retired"; enrollmentId: string }
  | { disposition: "foreign" };

/**
 * Recovery path for Stripe's valid invoice-before-checkout ordering. The
 * subscription is fetched from Stripe and only server-created NER metadata is
 * accepted; invoice payload metadata is never consulted.
 */
export async function bindPendingNerInvoiceSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<PendingNerInvoiceBindingResult> {
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error: any) {
    if (error?.code === "resource_missing" || error?.statusCode === 404) {
      return { disposition: "foreign" };
    }
    throw error;
  }
  if (!isAuthoritativePendingNerMetadata(subscription.metadata)) {
    return { disposition: "foreign" };
  }
  const enrollmentId = subscription.metadata.nerEnrollmentId;
  const [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
  if (!enrollment) throw new Error("Stripe NER metadata references no enrollment");
  const [binding] = await db.select().from(nerSubscriptionBindings)
    .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
  if (binding?.state === "retired") return { disposition: "retired", enrollmentId };
  if (!enrollment.pendingCheckoutSessionId && enrollment.stripeSubscriptionId !== subscriptionId) {
    throw new Error("NER subscription metadata is valid but checkout binding is not yet provable");
  }
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
  await bindNerCheckoutSubscription(stripe, {
    enrollmentId,
    subscriptionId,
    customerId,
    checkoutSessionId: enrollment.pendingCheckoutSessionId,
  });
  return { disposition: "bound", enrollmentId };
}

export async function resolveRecurringPrice(stripe: Stripe, key: string, name: string, amount: number): Promise<string> {
  const products = await stripe.products.search({ query: `metadata['sal_key']:'${key}' AND active:'true'` });
  const product = products.data[0] ?? await stripe.products.create(
    { name, metadata: { sal_key: key } },
    { idempotencyKey: `orsa-product:${key}` },
  );
  const prices = await stripe.prices.list({ product: product.id, active: true, type: "recurring", limit: 100 });
  const price = prices.data.find((p) => p.unit_amount === amount && p.currency === "usd" && p.recurring?.interval === "month");
  if (price) return price.id;
  return (await stripe.prices.create({
    product: product.id, currency: "usd", unit_amount: amount,
    recurring: { interval: "month" }, metadata: { sal_key: key },
  }, { idempotencyKey: `orsa-price:${key}:${amount}:usd:month` })).id;
}

export async function prepareNerCheckout(stripe: Stripe, input: {
  userId: string;
  email: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  return db.transaction(async (tx) => {
    // The user-derived lock exists before an enrollment does, so even two
    // first-ever requests share one serialization point.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 63003))`);
    let [enrollment] = await tx.select().from(nerEnrollments).where(eq(nerEnrollments.userId, input.userId));
    if (enrollment?.status === "lifetime" || (enrollment?.paidInstallmentCount ?? 0) >= NER_LIFETIME_INSTALLMENT_COUNT) {
      throw new Error("NER lifetime enrollment is already complete");
    }
    if (!enrollment) {
      [enrollment] = await tx.insert(nerEnrollments).values({ userId: input.userId }).returning();
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${enrollment.id}, 63004))`);

    const now = new Date();
    let attempt = enrollment.checkoutAttempt;
    if (enrollment.pendingCheckoutSessionId && enrollment.checkoutExpiresAt && enrollment.checkoutExpiresAt > now) {
      const open = await stripe.checkout.sessions.retrieve(enrollment.pendingCheckoutSessionId);
      if (open.status === "open" && open.url) {
        return { enrollment, checkout: open, reused: true };
      }
      attempt = checkoutAttemptFor(attempt, true, false);
    } else if (enrollment.pendingCheckoutSessionId) {
      attempt = checkoutAttemptFor(attempt, true, false);
    }
    if (enrollment.stripeSubscriptionId) {
      const previous = await stripe.subscriptions.retrieve(enrollment.stripeSubscriptionId);
      if (previous.status !== "canceled" && previous.status !== "unpaid" && previous.status !== "incomplete_expired") {
        throw new Error(`Existing NER subscription is ${previous.status} and may still bill; manage retries in the billing portal`);
      }
    }

    let customerId = enrollment.stripeCustomerId;
    if (!customerId) {
      customerId = (await stripe.customers.create(
        { email: input.email || undefined, metadata: { userId: input.userId } },
        { idempotencyKey: `ner-customer:${enrollment.id}` },
      )).id;
    }
    const price = await resolveRecurringPrice(stripe, NER_PRODUCT_KEY, "NER Membership Installment", NER_MONTHLY_INSTALLMENT_CENTS);
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: enrollment.id,
      metadata: { nerEnrollmentId: enrollment.id, sal_product: NER_PRODUCT_KEY },
      subscription_data: { metadata: { nerEnrollmentId: enrollment.id, sal_product: NER_PRODUCT_KEY } },
    }, { idempotencyKey: `ner-checkout:${enrollment.id}:${attempt}` });
    const expiresAt = checkout.expires_at
      ? new Date(checkout.expires_at * 1000)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [updated] = await tx.update(nerEnrollments).set({
      stripeCustomerId: customerId,
      status: enrollment.stripeSubscriptionId ? enrollment.status : "pending_checkout",
      pendingCheckoutSessionId: checkout.id,
      checkoutExpiresAt: expiresAt,
      checkoutAttempt: attempt,
      updatedAt: now,
    }).where(eq(nerEnrollments.id, enrollment.id)).returning();
    return { enrollment: updated, checkout, reused: false };
  });
}

export async function getOrCreateHousehold(primaryUserId: string) {
  const [existing] = await db.select().from(households).where(eq(households.primaryUserId, primaryUserId));
  if (existing) return existing;
  const [created] = await db.insert(households).values({ primaryUserId }).onConflictDoNothing().returning();
  if (created) return created;
  const [winner] = await db.select().from(households).where(eq(households.primaryUserId, primaryUserId));
  if (!winner) throw new Error("Unable to create household");
  return winner;
}

export async function householdForOwner(primaryUserId: string) {
  const household = await getOrCreateHousehold(primaryUserId);
  const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, household.id));
  return { household, members };
}

export async function activateSponsoredSeat(input: {
  primaryUserId: string; email: string; name: string; stripe: Stripe; ownerEmail: string | null;
  successUrl: string; cancelUrl: string;
}) {
  const household = await getOrCreateHousehold(input.primaryUserId);
  const normalizedEmail = normalizeOrsaEmail(input.email);
  let [member] = await db.insert(householdMembers).values({
    householdId: household.id, normalizedEmail, displayName: input.name.trim(), status: "invited",
  }).onConflictDoNothing().returning();
  if (!member) [member] = await db.select().from(householdMembers)
    .where(and(eq(householdMembers.householdId, household.id), eq(householdMembers.normalizedEmail, normalizedEmail)));
  if (!member) throw new Error("Unable to create household invitation");
  const result = await runHouseholdBillingOperation({
    householdId: household.id, memberId: member.id, targetStatus: "active",
    stripe: input.stripe, ownerEmail: input.ownerEmail,
    successUrl: input.successUrl, cancelUrl: input.cancelUrl,
  });
  return { memberId: member.id, ...result };
}

export class HouseholdBillingReconciliationError extends Error {
  retryable = true;
}

export async function runHouseholdBillingOperation(input: {
  householdId: string; memberId: string; targetStatus: "active" | "removed";
  stripe: Stripe; ownerEmail?: string | null; successUrl?: string; cancelUrl?: string;
}) {
  let [operation] = await db.select().from(householdBillingOperations).where(and(
    eq(householdBillingOperations.memberId, input.memberId),
    eq(householdBillingOperations.targetStatus, input.targetStatus),
    eq(householdBillingOperations.status, "pending"),
  ));
  if (!operation) {
    [operation] = await db.insert(householdBillingOperations).values({
      householdId: input.householdId, memberId: input.memberId, targetStatus: input.targetStatus,
      checkoutSuccessUrl: input.successUrl,
      checkoutCancelUrl: input.cancelUrl,
    }).onConflictDoNothing().returning();
    if (!operation) [operation] = await db.select().from(householdBillingOperations).where(and(
      eq(householdBillingOperations.memberId, input.memberId),
      eq(householdBillingOperations.targetStatus, input.targetStatus),
      eq(householdBillingOperations.status, "pending"),
    ));
  }
  if (!operation) throw new HouseholdBillingReconciliationError("Billing operation could not be reserved; retry");
  if (input.successUrl && input.cancelUrl
      && (operation.checkoutSuccessUrl !== input.successUrl || operation.checkoutCancelUrl !== input.cancelUrl)) {
    [operation] = await db.update(householdBillingOperations).set({
      checkoutSuccessUrl: input.successUrl,
      checkoutCancelUrl: input.cancelUrl,
      updatedAt: new Date(),
    }).where(eq(householdBillingOperations.id, operation.id)).returning();
  }

  let intendedQuantity: number | undefined;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.householdId}, 63002))`);
      const [op] = await tx.select().from(householdBillingOperations).where(eq(householdBillingOperations.id, operation.id));
      if (op?.status === "completed") return {
        status: input.targetStatus === "active" ? "active" as const : "removed" as const,
        operationId: op.id,
      };
      const [member] = await tx.select().from(householdMembers).where(and(
        eq(householdMembers.id, input.memberId), eq(householdMembers.householdId, input.householdId),
      ));
      const [household] = await tx.select().from(households).where(eq(households.id, input.householdId));
      if (!member || !household) throw new Error("Household member not found");
      const active = await tx.select({ id: householdMembers.id }).from(householdMembers).where(and(
        eq(householdMembers.householdId, input.householdId), eq(householdMembers.status, "active"),
      ));
      const quantity = householdTargetQuantity(active.length, member.status, input.targetStatus);
      intendedQuantity = quantity;
      const billingCurrent = (household.stripeSubscriptionStatus === "active" || household.stripeSubscriptionStatus === "trialing")
        && !household.lastPaymentFailureAt;
      const providerMayStillBill = household.stripeSubscriptionStatus === "active"
        || household.stripeSubscriptionStatus === "trialing"
        || household.stripeSubscriptionStatus === "past_due";
      if (input.targetStatus === "active" && providerMayStillBill && !billingCurrent) {
        throw new Error("Household payment needs attention in the billing portal before another seat can be activated");
      }

      if (input.targetStatus === "active" && (!household.stripeSubscriptionItemId || !billingCurrent)) {
        if (!input.successUrl || !input.cancelUrl) {
          throw new Error("Household payment setup is required before this seat can be activated");
        }
        if (op?.checkoutSessionId && op.checkoutExpiresAt && op.checkoutExpiresAt > new Date()) {
          const existingCheckout = await input.stripe.checkout.sessions.retrieve(op.checkoutSessionId);
          if (existingCheckout.status === "open" && existingCheckout.url) {
            return { status: "pending_checkout" as const, url: existingCheckout.url, operationId: operation.id };
          }
        }
        let customerId = household.stripeCustomerId;
        if (!customerId) customerId = (await input.stripe.customers.create(
          { email: input.ownerEmail || undefined, metadata: { householdId: household.id } },
          { idempotencyKey: `household-customer:${household.id}` },
        )).id;
        const price = await resolveRecurringPrice(input.stripe, ORSA_FAMILY_PRODUCT_KEY, "ORSA Family Membership Seat", HOUSEHOLD_SEAT_MONTHLY_CENTS);
        const checkout = await input.stripe.checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          line_items: [{ price, quantity }],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: operation.id,
          metadata: {
            householdId: household.id, memberId: member.id, operationId: operation.id, sal_product: ORSA_FAMILY_PRODUCT_KEY,
          },
          subscription_data: { metadata: {
            householdId: household.id, memberId: member.id, operationId: operation.id, sal_product: ORSA_FAMILY_PRODUCT_KEY,
          } },
        }, { idempotencyKey: `household-checkout:${operation.id}` });
        if (!checkout.url) throw new Error("Stripe did not return a household Checkout URL");
        const expiresAt = checkout.expires_at
          ? new Date(checkout.expires_at * 1000)
          : new Date(Date.now() + 24 * 60 * 60 * 1000);
        await tx.update(households).set({
          stripeCustomerId: customerId,
          pendingCheckoutSessionId: checkout.id,
          pendingCheckoutExpiresAt: expiresAt,
          updatedAt: new Date(),
        }).where(eq(households.id, household.id));
        await tx.update(householdBillingOperations).set({
          checkoutSessionId: checkout.id, checkoutExpiresAt: expiresAt,
          targetQuantity: quantity, updatedAt: new Date(), lastError: null,
        }).where(eq(householdBillingOperations.id, operation.id));
        return { status: "pending_checkout" as const, url: checkout.url, operationId: operation.id };
      }

      let customerId = household.stripeCustomerId;
      let subscriptionId = household.stripeSubscriptionId;
      let itemId = household.stripeSubscriptionItemId;
      if (input.targetStatus === "active" && household.stripeCancelAtPeriodEnd && subscriptionId) {
        await input.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false }, { idempotencyKey: `${operation.id}:uncancel` });
      }
      if (itemId && quantity > 0) {
        await input.stripe.subscriptionItems.update(itemId, {
          quantity, proration_behavior: "none",
        }, { idempotencyKey: operation.id });
      } else if (subscriptionId && quantity === 0) {
        // Final seat ends entitlement immediately locally; Stripe ends service
        // at the already-paid period boundary without a retroactive credit.
        await input.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        }, { idempotencyKey: operation.id });
      }
      const now = new Date();
      await tx.update(households).set({
        stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId,
        stripeSubscriptionItemId: itemId,
        stripeCancelAtPeriodEnd: quantity === 0 ? true : false,
        updatedAt: now,
      }).where(eq(households.id, household.id));
      await tx.update(householdMembers).set({
        status: input.targetStatus,
        activatedAt: input.targetStatus === "active" ? now : member.activatedAt,
        removedAt: input.targetStatus === "removed" ? now : null,
      }).where(eq(householdMembers.id, member.id));
      const [completed] = await tx.update(householdBillingOperations).set({
        status: "completed", targetQuantity: quantity, completedAt: now, updatedAt: now, lastError: null,
      }).where(eq(householdBillingOperations.id, operation.id)).returning();
      return { status: "active" as const, operationId: completed.id };
    });
  } catch (error) {
    await db.update(householdBillingOperations).set({
      lastError: error instanceof Error ? error.message.slice(0, 500) : "Billing operation failed",
      targetQuantity: intendedQuantity,
      updatedAt: new Date(),
    }).where(eq(householdBillingOperations.id, operation.id));
    throw new HouseholdBillingReconciliationError("Household billing is pending reconciliation; retry this operation");
  }
}

export async function setSponsoredSeatStatus(
  householdId: string,
  memberId: string,
  status: "active" | "removed",
  stripe: Stripe,
  checkoutUrls?: { successUrl: string; cancelUrl: string },
) {
  return runHouseholdBillingOperation({
    householdId, memberId, targetStatus: status, stripe,
    successUrl: checkoutUrls?.successUrl, cancelUrl: checkoutUrls?.cancelUrl,
  });
}

export async function syncHouseholdStripeEvent(stripe: Stripe, input: {
  subscriptionId: string;
  kind: "checkout" | "paid" | "failed" | "updated" | "deleted";
  failureMessage?: string;
  checkoutSessionId?: string;
  authoritativeSubscription?: Stripe.Subscription;
  occurredAt?: Date;
}): Promise<"applied" | "foreign" | "retired"> {
  const subscription = input.authoritativeSubscription ?? await stripe.subscriptions.retrieve(input.subscriptionId);
  const metadata = subscription.metadata;
  const metadataHouseholdId = metadata?.sal_product === ORSA_FAMILY_PRODUCT_KEY ? metadata.householdId : undefined;
  let [household] = metadataHouseholdId
    ? await db.select().from(households).where(eq(households.id, metadataHouseholdId))
    : await db.select().from(households).where(eq(households.stripeSubscriptionId, input.subscriptionId));
  if (!household) return "foreign";
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${household.id}, 63002))`);
    [household] = await tx.select().from(households).where(eq(households.id, household.id));
    if (!household) return "foreign";
    const operationId = metadata?.operationId;
    const memberId = metadata?.memberId;
    const [operation] = operationId
      ? await tx.select().from(householdBillingOperations).where(and(
          eq(householdBillingOperations.id, operationId),
          eq(householdBillingOperations.householdId, household.id),
        ))
      : [];
    if (household.stripeSubscriptionId && household.stripeSubscriptionId !== input.subscriptionId) {
      const replacingTerminalSubscription = (household.stripeSubscriptionStatus === "canceled"
        || household.stripeSubscriptionStatus === "unpaid"
        || household.stripeSubscriptionStatus === "incomplete_expired")
        && operation?.status === "pending";
      if (!replacingTerminalSubscription) return "retired";
    }
    if (input.occurredAt && household.stripeBillingEventAt && input.occurredAt < household.stripeBillingEventAt) {
      // A verified paid invoice is stronger domain evidence than a later-
      // observed subscription snapshot. Do not let observation time block
      // initial activation or recovery. A newer actual payment failure still
      // protects against an older paid replay.
      const staleAgainstFailure = household.lastPaymentFailureAt
        && input.occurredAt < household.lastPaymentFailureAt;
      if (input.kind !== "paid" || staleAgainstFailure) return "applied";
    }
    if (!household.stripeSubscriptionId && (!operation || operation.status !== "pending")) return "foreign";
    const item = subscription.items.data[0];
    const itemId = item?.id ?? household.stripeSubscriptionItemId;
    const subscriptionAny = subscription as any;
    const periodEndSeconds = subscriptionAny.current_period_end ?? (item ? (item as any).current_period_end : undefined);
    const terminal = input.kind === "deleted" || subscription.status === "canceled";
    const now = new Date();
    const eventAt = input.occurredAt ?? now;
    // Checkout completion proves that Stripe created/bound the subscription,
    // not that its first invoice was paid. Only invoice.paid activates a seat.
    const bindSignal = input.kind === "checkout" || input.kind === "paid";
    const paidSignal = input.kind === "paid";
    await tx.update(households).set({
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? household.stripeCustomerId,
      stripeSubscriptionId: input.subscriptionId,
      stripeSubscriptionItemId: terminal ? null : itemId,
      stripeSubscriptionStatus: terminal ? "canceled" : subscription.status,
      stripeCancelAtPeriodEnd: terminal ? false : subscription.cancel_at_period_end,
      stripeCurrentPeriodEnd: periodEndSeconds ? new Date(periodEndSeconds * 1000) : household.stripeCurrentPeriodEnd,
      lastPaymentFailureAt: input.kind === "failed" ? eventAt : paidSignal ? null : household.lastPaymentFailureAt,
      lastPaymentFailureMessage: input.kind === "failed"
        ? (input.failureMessage || "Household subscription payment failed").slice(0, 500)
        : paidSignal ? null : household.lastPaymentFailureMessage,
      pendingCheckoutSessionId: paidSignal
        ? null
        : bindSignal ? (input.checkoutSessionId ?? household.pendingCheckoutSessionId) : household.pendingCheckoutSessionId,
      pendingCheckoutExpiresAt: paidSignal ? null : household.pendingCheckoutExpiresAt,
      stripeBillingEventAt: household.stripeBillingEventAt && household.stripeBillingEventAt > eventAt
        ? household.stripeBillingEventAt
        : eventAt,
      updatedAt: now,
    }).where(eq(households.id, household.id));
    if (paidSignal && operation?.status === "pending" && memberId && operation.memberId === memberId) {
      await tx.update(householdMembers).set({
        status: "active", activatedAt: now, removedAt: null,
      }).where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, household.id)));
      await tx.update(householdBillingOperations).set({
        status: "completed", completedAt: now, updatedAt: now, lastError: null,
        checkoutSessionId: input.checkoutSessionId ?? operation.checkoutSessionId,
      }).where(eq(householdBillingOperations.id, operation.id));
    }
    return "applied";
  });
}

export type NerInvoicePaidResult = {
  enrollment: typeof nerEnrollments.$inferSelect | undefined;
  newPayment: boolean;
  reachedLifetime: boolean;
  disposition: "credited" | "duplicate" | "retired" | "unmatched" | "invalid_amount";
};

export async function applyNerInvoicePaid(
  invoiceId: string,
  subscriptionId: string,
  customerId: string | null,
  amountPaid: number,
): Promise<NerInvoicePaidResult> {
  let [bindingHint] = await db.select().from(nerSubscriptionBindings)
    .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
  let enrollmentId = bindingHint?.enrollmentId;
  if (!enrollmentId) {
    const [legacyEnrollment] = await db.select({ id: nerEnrollments.id }).from(nerEnrollments)
      .where(eq(nerEnrollments.stripeSubscriptionId, subscriptionId));
    enrollmentId = legacyEnrollment?.id;
  }
  if (!enrollmentId) {
    return { enrollment: undefined, newPayment: false, reachedLifetime: false, disposition: "unmatched" };
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${enrollmentId}, 63004))`);
    const [enrollment] = await tx.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId!));
    if (!enrollment) return { enrollment: undefined, newPayment: false, reachedLifetime: false, disposition: "unmatched" as const };
    if (enrollment.stripeSubscriptionId) {
      await tx.insert(nerSubscriptionBindings).values({
        enrollmentId: enrollment.id,
        stripeSubscriptionId: enrollment.stripeSubscriptionId,
        scheduleId: enrollment.stripeScheduleId,
        state: "active",
        activatedAt: enrollment.updatedAt,
      }).onConflictDoNothing();
    }
    const [binding] = await tx.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
    const authorization = classifyNerInvoiceAuthorization(
      enrollment.stripeSubscriptionId,
      subscriptionId,
      binding?.state ?? null,
    );
    if (authorization === "retired") {
      return { enrollment, newPayment: false, reachedLifetime: enrollment.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT, disposition: "retired" as const };
    }
    if (authorization !== "active" || !invoiceMatchesAuthorizedSubscription(enrollment.stripeSubscriptionId, subscriptionId)) {
      return { enrollment: undefined, newPayment: false, reachedLifetime: false, disposition: "unmatched" as const };
    }
    if (amountPaid !== NER_MONTHLY_INSTALLMENT_CENTS) {
      return { enrollment, newPayment: false, reachedLifetime: false, disposition: "invalid_amount" as const };
    }
    const [existing] = await tx.select({ id: nerInstallments.id }).from(nerInstallments).where(eq(nerInstallments.stripeInvoiceId, invoiceId));
    if (existing) return { enrollment, newPayment: false, reachedLifetime: enrollment.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT, disposition: "duplicate" as const };
    if (enrollment.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT) {
      return { enrollment, newPayment: false, reachedLifetime: true, disposition: "duplicate" as const };
    }
    const [installment] = await tx.insert(nerInstallments).values({ enrollmentId: enrollment.id, stripeInvoiceId: invoiceId, amountPaid })
      .onConflictDoNothing().returning();
    if (!installment) return { enrollment, newPayment: false, reachedLifetime: enrollment.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT, disposition: "duplicate" as const };
    const state = applyNerInstallmentPaid(enrollment);
    const [updated] = await tx.update(nerEnrollments).set({
      status: state.status, paidInstallmentCount: state.paidInstallmentCount, stripeCustomerId: customerId ?? enrollment.stripeCustomerId,
      lastFailureAt: null, lastFailureMessage: null, paymentRetryAt: null, updatedAt: new Date(),
    }).where(and(
      eq(nerEnrollments.id, enrollment.id),
      eq(nerEnrollments.stripeSubscriptionId, subscriptionId),
    )).returning();
    if (!updated) throw new Error("NER authorized subscription changed while applying invoice");
    return { enrollment: updated, newPayment: true, reachedLifetime: updated.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT, disposition: "credited" as const };
  });
}

export type NerLifecycleDisposition = "applied" | "retired" | "unknown" | "pending_retryable" | "pending_noop" | "lifetime";

async function lifecycleEnrollmentId(subscriptionId: string): Promise<string | undefined> {
  const [binding] = await db.select({ enrollmentId: nerSubscriptionBindings.enrollmentId })
    .from(nerSubscriptionBindings)
    .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
  if (binding) return binding.enrollmentId;
  const [legacy] = await db.select({ id: nerEnrollments.id }).from(nerEnrollments)
    .where(eq(nerEnrollments.stripeSubscriptionId, subscriptionId));
  return legacy?.id;
}

export async function applyNerInvoiceFailed(
  subscriptionId: string,
  message: string,
  retry: { nextPaymentAttempt: Date | null; retriesExhausted: boolean } = { nextPaymentAttempt: null, retriesExhausted: true },
): Promise<NerLifecycleDisposition> {
  const enrollmentId = await lifecycleEnrollmentId(subscriptionId);
  if (!enrollmentId) return "unknown";
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${enrollmentId}, 63004))`);
    const [enrollment] = await tx.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    if (!enrollment) return "unknown";
    if (enrollment.stripeSubscriptionId) {
      await tx.insert(nerSubscriptionBindings).values({
        enrollmentId: enrollment.id,
        stripeSubscriptionId: enrollment.stripeSubscriptionId,
        scheduleId: enrollment.stripeScheduleId,
        state: "active",
        activatedAt: enrollment.updatedAt,
      }).onConflictDoNothing();
    }
    const [binding] = await tx.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
    const authorization = classifyNerInvoiceAuthorization(enrollment.stripeSubscriptionId, subscriptionId, binding?.state ?? null);
    if (authorization === "retired") return "retired";
    if (authorization !== "active") {
      return binding?.state === "pending" && enrollment.stripeSubscriptionId === subscriptionId
        ? "pending_retryable"
        : binding?.state === "pending" ? "pending_noop" : "unknown";
    }
    if (enrollment.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT || enrollment.status === "lifetime") {
      return "lifetime";
    }
    const state = retry.retriesExhausted
      ? applyNerPaymentFailure(enrollment, message)
      : { ...enrollment, status: enrollment.paidInstallmentCount > 0 ? "provisional" as const : enrollment.status };
    const [updated] = await tx.update(nerEnrollments).set({
      status: state.status,
      lastFailureMessage: message,
      lastFailureAt: new Date(),
      paymentRetryAt: retry.nextPaymentAttempt,
      updatedAt: new Date(),
    }).where(and(
      eq(nerEnrollments.id, enrollment.id),
      eq(nerEnrollments.stripeSubscriptionId, subscriptionId),
    )).returning({ id: nerEnrollments.id });
    if (!updated) throw new Error("NER subscription changed while applying payment failure");
    return "applied";
  });
}

export async function applyNerSubscription(subscriptionId: string, stripeStatus: string): Promise<NerLifecycleDisposition> {
  const enrollmentId = await lifecycleEnrollmentId(subscriptionId);
  if (!enrollmentId) return "unknown";
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${enrollmentId}, 63004))`);
    const [enrollment] = await tx.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    if (!enrollment) return "unknown";
    if (enrollment.stripeSubscriptionId) {
      await tx.insert(nerSubscriptionBindings).values({
        enrollmentId: enrollment.id,
        stripeSubscriptionId: enrollment.stripeSubscriptionId,
        scheduleId: enrollment.stripeScheduleId,
        state: "active",
        activatedAt: enrollment.updatedAt,
      }).onConflictDoNothing();
    }
    const [binding] = await tx.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
    const authorization = classifyNerInvoiceAuthorization(enrollment.stripeSubscriptionId, subscriptionId, binding?.state ?? null);
    if (authorization === "retired") return "retired";
    if (authorization !== "active") {
      return binding?.state === "pending" && enrollment.stripeSubscriptionId === subscriptionId
        ? "pending_retryable"
        : binding?.state === "pending" ? "pending_noop" : "unknown";
    }
    if (enrollment.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT || enrollment.status === "lifetime") {
      if (enrollment.status !== "lifetime") {
        await tx.update(nerEnrollments).set({ status: "lifetime", updatedAt: new Date() }).where(and(
          eq(nerEnrollments.id, enrollment.id),
          eq(nerEnrollments.stripeSubscriptionId, subscriptionId),
        ));
      }
      return "lifetime";
    }
    const state = stripeStatus === "past_due" && enrollment.paymentRetryAt && enrollment.paymentRetryAt > new Date()
      ? { ...enrollment, status: enrollment.paidInstallmentCount > 0 ? "provisional" as const : enrollment.status }
      : applyNerSubscriptionStatus(enrollment, stripeStatus);
    const [updated] = await tx.update(nerEnrollments).set({
      status: state.status,
      updatedAt: new Date(),
    }).where(and(
      eq(nerEnrollments.id, enrollment.id),
      eq(nerEnrollments.stripeSubscriptionId, subscriptionId),
    )).returning({ id: nerEnrollments.id });
    if (!updated) throw new Error("NER subscription changed while applying lifecycle event");
    return "applied";
  });
}