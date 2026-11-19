import test from "node:test";
import assert from "node:assert/strict";
import { categorizeDocumentSuggestion, normalizeDocumentSuggestions } from "./documentCategorization";

test("categorizes phone and financial recurring payments", () => {
  assert.equal(categorizeDocumentSuggestion({ merchantName: "T-Mobile", description: "monthly payment" }).category, "real_estate");
  assert.equal(categorizeDocumentSuggestion({ merchantName: "Chase", description: "credit card payment" }).category, "financial");
  assert.equal(categorizeDocumentSuggestion({ merchantName: "Guardian", description: "life insurance premium" }).category, "financial");
  assert.equal(categorizeDocumentSuggestion({ merchantName: "Verizon", description: "monthly subscription", category: "subscriptions" }).category, "real_estate");
  assert.equal(categorizeDocumentSuggestion({ merchantName: "Netflix", description: "streaming service" }).category, "subscriptions");
  assert.equal(categorizeDocumentSuggestion({ merchantName: "Planet Fitness", description: "monthly gym dues" }).category, "memberships");
  assert.equal(categorizeDocumentSuggestion({ merchantName: "City Water", description: "utility bill" }).category, "real_estate");
  assert.equal(categorizeDocumentSuggestion({ merchantName: "Unknown Vendor", description: "payment" }).category, "miscellaneous");
});

test("categorizes Amex and Xfinity bills with clear next steps", () => {
  const amex = categorizeDocumentSuggestion({
    merchantName: "American Express",
    description: "Monthly statement",
  });
  assert.equal(amex.category, "financial");
  assert.match(amex.recommendedAction, /balance and recurring charges/i);
  assert.match(amex.recommendedAction, /estate authority/i);

  const xfinity = categorizeDocumentSuggestion({
    merchantName: "Xfinity",
    description: "Monthly bill",
  });
  assert.equal(xfinity.category, "real_estate");
  assert.match(xfinity.recommendedAction, /transfer or cancel/i);
  assert.match(xfinity.recommendedAction, /rented equipment/i);
});

test("normalizes bounded AI suggestions", () => {
  const result = normalizeDocumentSuggestions({ suggestions: [{ merchantName: "Club", description: "annual dues", confidence: "medium" }] });
  assert.equal(result[0].category, "memberships");
  assert.equal(result[0].amountCents, null);
});