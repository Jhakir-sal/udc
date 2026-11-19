import test from "node:test";
import assert from "node:assert/strict";
import { shouldReadPastedAccounts } from "@shared/accountIntakeIntent";

test("pasted bank details and explicit requests open the reviewed account tool", () => {
  for (const text of [
    "Chase checking account number: 987654321",
    "Chase account # 987654321",
    "Account ending 4321, savings at Synthetic Community Bank",
    "Please add my Chase checking account.",
    "Can you create accounts from these bank details?",
    "Import these accounts: Netflix subscription and Chase checking",
    "Subject: Netflix subscription\nYour monthly subscription has renewed.",
  ]) assert.equal(shouldReadPastedAccounts(text), true, text);
});

test("normal questions, case summaries and message drafts remain advisory chat", () => {
  for (const text of [
    "", "Hello", "Summarize this case.",
    "What is the status of the checking account ending 4321?",
    "How do I add an account?",
    "Can the assistant create accounts?",
    "Draft an email to Chase about account ending 4321.",
    "Please create an email about the Chase checking account ending 4321.",
    "Explain what a joint savings account ending 4321 means.",
    "Write a family update SMS.",
  ]) assert.equal(shouldReadPastedAccounts(text), false, text);
});
