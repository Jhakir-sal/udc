export const NER_MONTHLY_INSTALLMENT_CENTS = 250;
export const NER_LIFETIME_INSTALLMENT_COUNT = 12;

export type NerStatus = "pending_checkout" | "provisional" | "lifetime" | "past_due" | "paused" | "cancelled";
export type NerExternalStatus = "not_requested" | "pending" | "registered" | "failed";
export type NerState = {
  status: NerStatus;
  paidInstallmentCount: number;
  externalStatus: NerExternalStatus;
  lastFailureMessage?: string | null;
};

export function applyNerInstallmentPaid(state: NerState): NerState {
  const paidInstallmentCount = Math.min(NER_LIFETIME_INSTALLMENT_COUNT, state.paidInstallmentCount + 1);
  return {
    ...state,
    paidInstallmentCount,
    status: paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT ? "lifetime" : "provisional",
    lastFailureMessage: null,
  };
}

// Pure model of the invoice-id ledger used by the transactional webhook path.
// It is intentionally exported so cap/replay behavior can be exercised without
// substituting regex assertions for state-transition tests.
export function applySerializedNerInvoice(
  state: NerState,
  creditedInvoiceIds: ReadonlySet<string>,
  invoiceId: string,
): { state: NerState; creditedInvoiceIds: Set<string>; applied: boolean } {
  if (creditedInvoiceIds.has(invoiceId) || state.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT) {
    return { state, creditedInvoiceIds: new Set(creditedInvoiceIds), applied: false };
  }
  return {
    state: applyNerInstallmentPaid(state),
    creditedInvoiceIds: new Set(Array.from(creditedInvoiceIds).concat(invoiceId)),
    applied: true,
  };
}

export function applyNerPaymentFailure(state: NerState, message: string): NerState {
  if (state.status === "lifetime") return state;
  return { ...state, status: "past_due", lastFailureMessage: message };
}

export function applyNerSubscriptionStatus(state: NerState, subscriptionStatus: string): NerState {
  if (state.paidInstallmentCount >= NER_LIFETIME_INSTALLMENT_COUNT) return { ...state, status: "lifetime" };
  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
    return { ...state, status: state.paidInstallmentCount ? "provisional" : "pending_checkout" };
  }
  if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") return { ...state, status: "past_due" };
  if (subscriptionStatus === "paused") return { ...state, status: "paused" };
  if (subscriptionStatus === "canceled" || subscriptionStatus === "incomplete_expired") return { ...state, status: "cancelled" };
  return state;
}

export function beginNerExternalRegistration(state: NerState): NerState {
  return state.externalStatus === "registered" ? state : { ...state, externalStatus: "pending" };
}

export function completeNerExternalRegistration(state: NerState, reference: string): NerState {
  if (!reference.trim()) throw new Error("NER registration reference is required");
  return { ...state, externalStatus: "registered", lastFailureMessage: null };
}

export function failNerExternalRegistration(state: NerState, message: string): NerState {
  return { ...state, externalStatus: "failed", lastFailureMessage: message };
}