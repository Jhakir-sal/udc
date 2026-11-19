import { createHash } from "node:crypto";
import Stripe from "stripe";

export const TRUSTED_STRIPE_WEBHOOK_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export type TrustedStripeWebhookType = typeof TRUSTED_STRIPE_WEBHOOK_TYPES[number];
export type StripeWebhookVerificationMode = "signed" | "api_verified_fallback";

export type TrustedStripeWebhook = {
  mode: StripeWebhookVerificationMode;
  ledgerKey: string;
  type: TrustedStripeWebhookType;
  object: Stripe.Checkout.Session | Stripe.Invoice | Stripe.Subscription;
  subscription?: Stripe.Subscription;
  latestInvoice?: Stripe.Invoice;
  occurredAt: Date;
};

export class StripeWebhookVerificationError extends Error {
  status = 400;
}

export function stripeWebhookReadiness(stripeAvailable: boolean, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET) {
  return {
    stripeAvailable,
    mode: webhookSecret ? "signed" as const : "api_verified_fallback" as const,
    ready: stripeAvailable,
  };
}

function objectIdFromHint(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== "object") return undefined;
  const object = (data as { object?: unknown }).object;
  if (!object || typeof object !== "object") return undefined;
  const id = (object as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function isAllowedType(value: unknown): value is TrustedStripeWebhookType {
  return typeof value === "string" && (TRUSTED_STRIPE_WEBHOOK_TYPES as readonly string[]).includes(value);
}

function fallbackLedgerKey(type: TrustedStripeWebhookType, trustedState: Record<string, unknown>): string {
  const digest = createHash("sha256").update(JSON.stringify({ type, ...trustedState })).digest("hex");
  return `api:${digest}`;
}

function subscriptionId(value: string | Stripe.Subscription | null | undefined): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function invoiceId(value: string | Stripe.Invoice | null | undefined): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

async function retrieveAuthoritative<T>(label: string, retrieve: () => Promise<T>): Promise<T> {
  try {
    return await retrieve();
  } catch (error: any) {
    if (error?.code === "resource_missing" || error?.statusCode === 404) {
      throw new StripeWebhookVerificationError(`${label} does not exist`);
    }
    throw error;
  }
}

export async function verifyStripeWebhook(input: {
  stripe: Stripe;
  webhookSecret?: string;
  signature?: string | string[];
  rawBody?: unknown;
  body: unknown;
}): Promise<TrustedStripeWebhook> {
  const { stripe } = input;
  const mode: StripeWebhookVerificationMode = input.webhookSecret ? "signed" : "api_verified_fallback";
  let hintedType: unknown;
  let hintedObjectId: string | undefined;
  let signedEvent: Stripe.Event | undefined;

  if (input.webhookSecret) {
    if (typeof input.signature !== "string" || !Buffer.isBuffer(input.rawBody)) {
      throw new StripeWebhookVerificationError("A valid Stripe signature is required");
    }
    try {
      signedEvent = stripe.webhooks.constructEvent(input.rawBody, input.signature, input.webhookSecret);
    } catch {
      throw new StripeWebhookVerificationError("Invalid Stripe signature");
    }
    hintedType = signedEvent.type;
    hintedObjectId = objectIdFromHint(signedEvent);
  } else {
    hintedType = input.body && typeof input.body === "object" ? (input.body as { type?: unknown }).type : undefined;
    hintedObjectId = objectIdFromHint(input.body);
  }

  if (!isAllowedType(hintedType)) throw new StripeWebhookVerificationError("Unsupported Stripe webhook type");
  if (!hintedObjectId) throw new StripeWebhookVerificationError("Stripe object ID is required");

  const signedLedgerKey = signedEvent ? `signed:${signedEvent.id}` : undefined;
  const signedOccurredAt = signedEvent ? new Date(signedEvent.created * 1000) : undefined;

  if (hintedType === "checkout.session.completed" || hintedType === "checkout.session.async_payment_succeeded") {
    if (!hintedObjectId.startsWith("cs_")) throw new StripeWebhookVerificationError("Invalid Checkout session ID");
    const session = await retrieveAuthoritative("Checkout session", () => stripe.checkout.sessions.retrieve(hintedObjectId));
    if (session.status !== "complete" || session.payment_status !== "paid") {
      throw new StripeWebhookVerificationError("Checkout session is not authoritatively complete and paid");
    }
    const subId = subscriptionId(session.subscription);
    const subscription = subId
      ? await retrieveAuthoritative("Subscription", () => stripe.subscriptions.retrieve(subId))
      : undefined;
    return {
      mode,
      ledgerKey: signedLedgerKey ?? fallbackLedgerKey(hintedType, {
        id: session.id, status: session.status, paymentStatus: session.payment_status,
        subscriptionId: subId ?? null, paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
      }),
      type: hintedType,
      object: session,
      subscription,
      occurredAt: signedOccurredAt ?? new Date((session.created || Math.floor(Date.now() / 1000)) * 1000),
    };
  }

  if (hintedType === "invoice.paid" || hintedType === "invoice.payment_failed") {
    if (!hintedObjectId.startsWith("in_")) throw new StripeWebhookVerificationError("Invalid invoice ID");
    const invoice = await retrieveAuthoritative("Invoice", () => stripe.invoices.retrieve(hintedObjectId));
    const subId = subscriptionId((invoice as any).subscription);
    const subscription = subId
      ? await retrieveAuthoritative("Subscription", () => stripe.subscriptions.retrieve(subId))
      : undefined;
    if (hintedType === "invoice.paid") {
      if (invoice.status !== "paid" || invoice.amount_paid <= 0) {
        throw new StripeWebhookVerificationError("Invoice is not authoritatively paid");
      }
    } else {
      const latestId = subscription ? invoiceId(subscription.latest_invoice) : undefined;
      const actualAttemptedFailure = invoice.status !== "paid"
        && invoice.attempted === true
        && (invoice.attempt_count ?? 0) > 0
        && invoice.amount_remaining > 0
        && Boolean(subId)
        && latestId === invoice.id
        && (Boolean(invoice.next_payment_attempt)
          || subscription?.status === "past_due"
          || subscription?.status === "unpaid"
          || subscription?.status === "canceled"
          || subscription?.status === "incomplete_expired");
      if (!actualAttemptedFailure) {
        throw new StripeWebhookVerificationError("Invoice does not prove a current attempted payment failure");
      }
    }
    const occurredSeconds = hintedType === "invoice.paid"
      ? invoice.status_transitions?.paid_at
      : invoice.created;
    return {
      mode,
      ledgerKey: signedLedgerKey ?? fallbackLedgerKey(hintedType, {
        id: invoice.id, status: invoice.status, amountPaid: invoice.amount_paid,
        attemptCount: invoice.attempt_count, nextPaymentAttempt: invoice.next_payment_attempt,
        subscriptionId: subId ?? null,
      }),
      type: hintedType,
      object: invoice,
      subscription,
      latestInvoice: invoice,
      occurredAt: signedOccurredAt ?? new Date((occurredSeconds || invoice.created) * 1000),
    };
  }

  if (!hintedObjectId.startsWith("sub_")) throw new StripeWebhookVerificationError("Invalid subscription ID");
  const subscription = await retrieveAuthoritative("Subscription", () => stripe.subscriptions.retrieve(hintedObjectId));
  const authoritativeType: TrustedStripeWebhookType = subscription.status === "canceled"
    ? "customer.subscription.deleted"
    : "customer.subscription.updated";
  const latestId = invoiceId(subscription.latest_invoice);
  const latestInvoice = subscription.status === "past_due" && latestId
    ? await retrieveAuthoritative("Latest invoice", () => stripe.invoices.retrieve(latestId))
    : undefined;
  const subscriptionAny = subscription as any;
  const firstItem = subscription.items.data[0] as any;
  const periodEnd = subscriptionAny.current_period_end ?? firstItem?.current_period_end ?? null;
  return {
    mode,
    ledgerKey: signedLedgerKey ?? fallbackLedgerKey(authoritativeType, {
      id: subscription.id, status: subscription.status, currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end, canceledAt: subscription.canceled_at,
      endedAt: subscription.ended_at, latestInvoiceId: latestId ?? null,
      latestInvoiceStatus: latestInvoice?.status ?? null,
      latestInvoiceAttemptCount: latestInvoice?.attempt_count ?? null,
      latestInvoiceNextPaymentAttempt: latestInvoice?.next_payment_attempt ?? null,
      latestInvoiceAmountRemaining: latestInvoice?.amount_remaining ?? null,
      latestInvoiceAmountPaid: latestInvoice?.amount_paid ?? null,
    }),
    type: authoritativeType,
    object: subscription,
    subscription,
    latestInvoice,
    // Stripe subscriptions have no reliable updated timestamp. In API-verified
    // mode this is an observation time, never the future current_period_end.
    occurredAt: signedOccurredAt ?? new Date(),
  };
}