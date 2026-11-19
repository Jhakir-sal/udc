import { z } from "zod";
import { ACCOUNT_CATEGORIES, type AccountCategory } from "@shared/schema";

export const documentSuggestionSchema = z.object({
  merchantName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(240).default("Recurring payment"),
  amountCents: z.number().int().nonnegative().max(100_000_000).nullable().default(null),
  frequency: z.string().trim().max(40).nullable().default(null),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  category: z.enum(ACCOUNT_CATEGORIES).default("miscellaneous"),
  recommendedAction: z.string().trim().max(120).default("Review before taking action"),
});

export const documentAnalysisResponseSchema = z.object({
  suggestions: z.array(documentSuggestionSchema).max(100).default([]),
});

const categoryTerms: Array<[AccountCategory, RegExp]> = [
  ["real_estate", /\b(phone|wireless|mobile|cell|internet|cable|electric|power|gas|water|utility|utilities|verizon|at&t|t-mobile|comcast|xfinity|spectrum)\b/i],
  ["financial", /\b(bank|banking|credit card|creditcard|visa|mastercard|amex|american express|discover|loan|mortgage|brokerage|investment|life insurance|insurance|annuity)\b/i],
  ["subscriptions", /\b(subscription|streaming|software|saas|membership monthly|recurring|netflix|hulu|spotify|amazon prime|adobe)\b/i],
  ["memberships", /\b(dues|club|association|gym|fitness|country club|professional membership)\b/i],
  ["protected_information", /\b(health|medical|medicare|medicaid|pharmacy|prescription)\b/i],
];

function recommendedActionFor(category: AccountCategory, text: string, current: string): string {
  if (category === "financial" && /\b(amex|american express|credit card|creditcard|visa|mastercard|discover)\b/i.test(text)) {
    return "Review the balance and recurring charges, then contact the card issuer after confirming who has estate authority.";
  }
  if (category === "real_estate" && /\b(xfinity|comcast|spectrum|internet|cable)\b/i.test(text)) {
    return "Confirm whether the household still needs service, then transfer or cancel it and return any rented equipment.";
  }
  if (category === "real_estate" && /\b(phone|wireless|mobile|cell|verizon|at&t|t-mobile)\b/i.test(text)) {
    return "Confirm whether the number or device must be preserved, then transfer or cancel service with the provider.";
  }
  if (current && current !== "Review before taking action" && current !== "review") return current;
  if (category === "financial") return "Review the balance, ownership, and recurring activity before contacting the institution.";
  if (category === "real_estate") return "Confirm whether the household still needs this service before transferring or canceling it.";
  if (category === "subscriptions") return "Confirm the subscription is no longer needed, then cancel it through the provider.";
  if (category === "memberships") return "Check cancellation terms and any benefits before ending the membership.";
  return "Review this item with the concierge team before taking action.";
}

export function categorizeDocumentSuggestion(input: z.input<typeof documentSuggestionSchema>): z.infer<typeof documentSuggestionSchema> {
  const parsed = documentSuggestionSchema.parse(input);
  const text = `${parsed.merchantName} ${parsed.description}`;
  const matched = categoryTerms.find(([, pattern]) => pattern.test(text));
  // Deterministic high-signal rules take precedence over an AI label so a
  // cell-phone or life-insurance payment cannot be misfiled as a subscription.
  const category = matched?.[0] || parsed.category;
  return {
    ...parsed,
    category,
    recommendedAction: recommendedActionFor(category, text, parsed.recommendedAction),
  };
}

export function normalizeDocumentSuggestions(value: unknown) {
  const parsed = documentAnalysisResponseSchema.parse(value);
  return parsed.suggestions.map(categorizeDocumentSuggestion);
}