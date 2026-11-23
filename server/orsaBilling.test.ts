import test from "node:test";
import assert from "node:assert/strict";
import { parseOrsaRosterCsv, validateOrsaRoster } from "@shared/orsa";
import { activeFamilySeatQuantity, entitlementsForAccount } from "./entitlements";
import { applyNerInstallmentPaid, applyNerPaymentFailure, applyNerSubscriptionStatus, applySerializedNerInvoice, type NerState } from "./ner";
import { canReplaceNerSubscription, checkoutAttemptFor, classifyNerInvoiceAuthorization, configureNerSubscriptionBinding, enforceNerFixedCycles, householdTargetQuantity, invoiceMatchesAuthorizedSubscription, isAuthoritativePendingNerMetadata, nerFutureScheduleIterations } from "./orsaBillingService";
import { decideLedgerClaim } from "./stripeWebhookLedger";
import Stripe from "stripe";
import { runPaidUpgradeIfEligible } from "./heartPlanUpgradePolicy";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { nerEnrollments, nerInstallments, nerSubscriptionBindings, orsaRosterAudits, orsaRosterMembers, salNotifications } from "@shared/schema";
import { householdBillingOperations, householdMembers, households } from "@shared/schema";
import { activateSponsoredSeat, applyNerInvoiceFailed, applyNerInvoicePaid, applyNerSubscription, bindNerCheckoutSubscription, bindPendingNerInvoiceSubscription, prepareNerCheckout, setSponsoredSeatStatus, syncHouseholdStripeEvent } from "./orsaBillingService";
import {
  accountOrsaMembership,
  accountWasCreatedAfterInvitation,
  activeOrsaEmails,
  claimOrsaInvitation,
  finishOrsaInvitation,
  householdBillingIsCurrent,
  reconcileOrsaRosterInvitationStates,
  replaceOrsaRoster,
  setOrsaMemberActive,
  upsertOrsaRoster,
  verifyEmailAndAcceptOrsaInvitation,
} from "./orsaService";
import { StripeWebhookVerificationError, verifyStripeWebhook } from "./stripeWebhookVerification";
import { isAuthenticated } from "./auth";
import { users } from "@shared/models/auth";
import { readFile } from "node:fs/promises";
import { ORSA_RECONCILIATION_STALE_MS, reconcileOrsaBilling } from "./orsaBillingReconciler";

test("roster skips normalized repeats but rejects invalid rows before replacement", () => {
  const invalid = validateOrsaRoster([{ email: " A@EXAMPLE.com " }, { email: "a@example.com" }, { email: "nope" }]);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.rows.length, 0);
  assert.equal(invalid.issues.length, 1);
  assert.equal(invalid.skippedDuplicates, 1);
});

test("CSV roster uses explicit headers and preserves quoted names", () => {
  const parsed = parseOrsaRosterCsv('email,display_name,active\na@example.com,"Doe, Jane",true');
  const checked = validateOrsaRoster(parsed);
  assert.deepEqual(checked.rows[0], {
    normalizedEmail: "a@example.com", normalizedPhone: null, contactKey: null,
    displayName: "Doe, Jane", externalMemberId: null, active: true,
  });
});

test("real member, phone, email headings cannot be imported as a person", () => {
  const csv = "\uFEFFmember name,member phone,member email\nCraig Anderson,2125550101,shared@example.test\nRachel Anderson,2125550102,shared@example.test\n";
  assert.throws(() => parseOrsaRosterCsv(csv, {
    memberPhoneEmailColumns: true, firstRowIsHeader: false,
  }), /first row looks like headings/);
  const rows = parseOrsaRosterCsv(csv, { memberPhoneEmailColumns: true, firstRowIsHeader: true });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.displayName), ["Craig Anderson", "Rachel Anderson"]);
  assert.equal(validateOrsaRoster(rows, { sharedEmailEligibility: true }).ok, true);
  assert.equal(parseOrsaRosterCsv(csv).length, 2);
});

test("CSV roster skips only identical repeated member rows", () => {
  const parsed = parseOrsaRosterCsv(
    'email,member_name,phone,active\n Ada@Example.com ,"Ada Stone",(212) 555-0100,true\nada@example.com, ADA  STONE ,2125550100,true',
  );
  const checked = validateOrsaRoster(parsed);
  assert.equal(checked.ok, true);
  assert.equal(checked.rows.length, 1);
  assert.equal(checked.skippedDuplicates, 1);
  assert.equal(checked.rows[0].normalizedEmail, "ada@example.com");
});

test("shared contact option excludes repeated emails from distinct members, not unique member emails", () => {
  const parsed = parseOrsaRosterCsv(
    "email,member_name,phone\ncontact@example.com,Ada Stone,2125550100\nCONTACT@example.com,Grace Hopper,2125550101\ncontact@example.com, ADA STONE ,(212) 555-0100\nsolo@example.com,Al Lin,2125550102",
  );
  assert.equal(validateOrsaRoster(parsed).ok, false);
  const checked = validateOrsaRoster(parsed, { sharedEmailContacts: true });
  assert.equal(checked.ok, true);
  assert.equal(checked.skippedDuplicates, 1);
  assert.equal(checked.sharedEmailRows, 2);
  assert.deepEqual(checked.sharedEmails, ["contact@example.com"]);
  assert.deepEqual(checked.rows.map(row => row.normalizedEmail), [null, null, "solo@example.com"]);
  assert.ok(checked.rows[0].contactKey);
  assert.ok(checked.rows[1].contactKey);
});

test("shared contact email leaves named members without email and rejects conflicting IDs", () => {
  const named = validateOrsaRoster([
    { email: "shared@example.com", displayName: "Ada Stone" },
    { email: "shared@example.com", displayName: "Grace Hopper", phone: "2125550101" },
  ], { sharedEmailContacts: true });
  assert.equal(named.ok, true);
  assert.deepEqual(named.rows.map(row => row.normalizedEmail), [null, null]);
  assert.ok(named.rows[0].contactKey?.startsWith('["name-only"'));
  const conflictingId = validateOrsaRoster([
    { email: "shared@example.com", externalMemberId: "M-1", displayName: "Ada" },
    { email: "shared@example.com", externalMemberId: "M-1", displayName: "Grace" },
  ], { sharedEmailContacts: true });
  assert.equal(conflictingId.ok, false);
  assert.match(conflictingId.issues[0].message, /Duplicate external member ID with conflicting details/);
});

test("confirmed shared eligibility keeps two member names without identifying either by email", () => {
  const checked = validateOrsaRoster([
    { email: "household@example.test", displayName: "Craig Anderson", phone: "2125550101" },
    { email: "HOUSEHOLD@example.test", displayName: "Rachel Anderson", phone: "2125550102" },
  ], { sharedEmailEligibility: true });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.rows.map(row => row.displayName), ["Craig Anderson", "Rachel Anderson"]);
  assert.deepEqual(checked.rows.map(row => row.normalizedEmail), [null, null]);
  assert.deepEqual(checked.rows.map(row => row.sharedEligibilityEmail), ["household@example.test", "household@example.test"]);
  const missingName = validateOrsaRoster([
    { email: "household@example.test", displayName: "Craig Anderson" },
    { email: "household@example.test", phone: "2125550102" },
  ], { sharedEmailEligibility: true });
  assert.equal(missingName.ok, false);
  assert.match(missingName.issues[0].message, /requires a name for each member/);
  assert.throws(() => validateOrsaRoster([
    { email: "household@example.test", displayName: "Craig" },
  ], { sharedEmailContacts: true, sharedEmailEligibility: true }), /not both/);
});

test("DB integration: shared eligibility is verified-account-only and never grants primary billing", async () => {
  const actorId = randomUUID();
  const email = `shared_eligibility_${randomUUID()}@example.test`;
  const checked = validateOrsaRoster([
    { email, displayName: "Craig Anderson", phone: "2125550101" },
    { email, displayName: "Rachel Anderson", phone: "2125550102" },
  ], { sharedEmailEligibility: true });
  assert.equal(checked.ok, true);
  const account = { id: randomUUID(), email };
  try {
    await upsertOrsaRoster(checked.rows, actorId, checked.sharedEmails);
    assert.deepEqual(await accountOrsaMembership({ ...account, emailVerified: false }),
      { orsaVerified: false, membershipType: null, canManageBilling: false });
    assert.deepEqual(await accountOrsaMembership({ ...account, emailVerified: true }),
      { orsaVerified: true, membershipType: "shared", canManageBilling: false });
    const members = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.sharedEligibilityEmail, email));
    assert.deepEqual(members.map(member => member.displayName).sort(), ["Craig Anderson", "Rachel Anderson"]);
    assert.equal(members.every(member => !member.normalizedEmail), true);
    assert.equal((await claimOrsaInvitation(members[0].id)).disposition, "no_email");
    await setOrsaMemberActive(members[0].id, false, actorId);
    assert.equal((await accountOrsaMembership({ ...account, emailVerified: true })).orsaVerified, true);
    await setOrsaMemberActive(members[1].id, false, actorId);
    assert.equal((await accountOrsaMembership({ ...account, emailVerified: true })).orsaVerified, false);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.sharedEligibilityEmail, email));
  }
});

test("DB integration: batched roster upsert preserves member IDs and invitation history", async () => {
  const actorId = randomUUID();
  const prefix = `batch_${randomUUID()}`;
  const input = Array.from({ length: 275 }, (_, index) => ({
    email: `${prefix}_${index}@example.test`,
    displayName: `Member ${index}`,
  }));
  try {
    const first = validateOrsaRoster(input);
    assert.equal(first.ok, true);
    await upsertOrsaRoster(first.rows, actorId);
    const before = await db.select().from(orsaRosterMembers).where(inArray(orsaRosterMembers.normalizedEmail, input.map(row => row.email)));
    assert.equal(before.length, input.length);
    const retainedId = before.find(member => member.normalizedEmail === input[0].email)!.id;
    await db.update(orsaRosterMembers).set({ invitationStatus: "sent" }).where(eq(orsaRosterMembers.id, retainedId));
    const updated = validateOrsaRoster(input.map(row => ({ ...row, displayName: `${row.displayName} Updated` })));
    await upsertOrsaRoster(updated.rows, actorId);
    const after = await db.select().from(orsaRosterMembers).where(inArray(orsaRosterMembers.normalizedEmail, input.map(row => row.email)));
    assert.equal(after.length, input.length);
    assert.equal(after.find(member => member.id === retainedId)?.invitationStatus, "sent");
    assert.equal(after.every(member => member.displayName?.endsWith("Updated")), true);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(inArray(orsaRosterMembers.normalizedEmail, input.map(row => row.email)));
  }
});

test("CSV roster never guesses the member email from an unfamiliar column", () => {
  const parsed = parseOrsaRosterCsv('membership,contact,display_name\nA1,one@example.com,"Doe, Jane"\nA2,two@example.com,John');
  assert.deepEqual(parsed.map((row) => row.email), ["", ""]);
  assert.deepEqual(parsed.map((row) => row.displayName), ["Doe, Jane", "John"]);
  assert.equal(validateOrsaRoster(parsed).ok, true);
  const staff = parseOrsaRosterCsv("member_name,phone,entered_by\nAda Stone,2125550100,staff@example.com");
  assert.equal(staff[0].email, "");
  assert.equal(validateOrsaRoster(staff).ok, true);
});

test("CSV roster parses phone-only rows using common phone headers", () => {
  const parsed = parseOrsaRosterCsv(
    "member_name,phone_number,active\nAda Stone,(212) 555-0100,true\nGrace Hopper,+1 415-555-0133,false",
  );
  const checked = validateOrsaRoster(parsed);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.rows.map(({ normalizedEmail, normalizedPhone, contactKey, displayName }) => ({
    normalizedEmail, normalizedPhone, contactKey, displayName,
  })), [
    { normalizedEmail: null, normalizedPhone: "2125550100", contactKey: '["2125550100","ada stone"]', displayName: "Ada Stone" },
    { normalizedEmail: null, normalizedPhone: "14155550133", contactKey: '["14155550133","grace hopper"]', displayName: "Grace Hopper" },
  ]);
  assert.equal(checked.rows[1].active, false);
});

test("NA email placeholders import as no email for later SMS follow-up", () => {
  const parsed = parseOrsaRosterCsv(
    "member_email,member_name,phone_number\nNA,Ada Stone,2125550100\n na ,Grace Hopper,2125550101",
  );
  const checked = validateOrsaRoster(parsed);
  assert.equal(checked.ok, true);
  assert.equal(checked.rows.length, 2);
  assert.deepEqual(checked.rows.map(row => row.normalizedEmail), [null, null]);
  assert.ok(checked.rows.every(row => row.contactKey));
  assert.equal(checked.skippedDuplicates, 0);
  assert.equal(validateOrsaRoster([{ email: "NA", externalMemberId: "M-1" }]).rows[0].normalizedEmail, null);
  assert.equal(validateOrsaRoster([{ email: "NA", displayName: "Ada Stone" }]).ok, true);
  assert.equal(validateOrsaRoster([{ email: "N/A", phone: "2125550100", displayName: "Ada Stone" }]).ok, true);
});

test("blank and NA cells preserve all named members without inventing contact information", () => {
  const rows = parseOrsaRosterCsv(
    "first_name,last_name,email,phone,external_member_id\nAda,Stone,,NA,\nAda,Stone,NA,,NA\nGrace,,NA,N/A,\n,Bell,,,",
  );
  const checked = validateOrsaRoster(rows);
  assert.equal(checked.ok, true);
  assert.equal(checked.rows.length, 4);
  assert.equal(checked.skippedDuplicates, 0);
  assert.deepEqual(checked.rows.map(row => row.displayName), ["Ada Stone", "Ada Stone", "Grace", "Bell"]);
  assert.ok(checked.rows.every(row => row.normalizedEmail === null && row.normalizedPhone === null && row.externalMemberId === null));
  assert.equal(new Set(checked.rows.map(row => row.contactKey)).size, 4);
  const namesOnly = validateOrsaRoster(parseOrsaRosterCsv("Name\nAda Stone\nAda Stone\nGrace Hopper"));
  assert.equal(namesOnly.ok, true);
  assert.equal(namesOnly.rows.length, 3);
  assert.notEqual(namesOnly.rows[0].contactKey, namesOnly.rows[1].contactKey);
  const badAddress = validateOrsaRoster([{ displayName: "Ada", email: "not-an-email" }]);
  assert.equal(badAddress.ok, true);
  assert.equal(badAddress.rows[0].normalizedEmail, null);
  assert.deepEqual(badAddress.unusableEmailRows, [1]);
  const withSpacer = validateOrsaRoster([
    { displayName: "Ada Stone" },
    { displayName: "NA", email: "NA", phone: "N/A", externalMemberId: "" },
  ]);
  assert.equal(withSpacer.ok, true);
  assert.equal(withSpacer.rows.length, 1);
  assert.equal(withSpacer.skippedEmptyRows, 1);
  assert.equal(validateOrsaRoster([{ displayName: "NA", email: "NA" }]).ok, false);
});

test("thousands of named members import despite malformed email cells at reported rows", () => {
  const rows = Array.from({ length: 5740 }, (_, index) => ({
    displayName: `Member ${index + 1}`,
    email: index === 3438 ? "not-an-email" : index === 5739 ? "no email available" : "NA",
  }));
  const checked = validateOrsaRoster(rows);
  assert.equal(checked.ok, true);
  assert.equal(checked.rows.length, 5740);
  assert.deepEqual(checked.unusableEmailRows, [3439, 5740]);
  assert.equal(checked.rows[3438].normalizedEmail, null);
  assert.equal(checked.rows[5739].normalizedEmail, null);
  assert.equal(checked.rows[5739].displayName, "Member 5740");
});

test("roster accepts only valid email or an alternative member identity", () => {
  assert.equal(validateOrsaRoster([{ email: "ada@example.com" }]).ok, true);
  assert.equal(validateOrsaRoster([{ phone: "212-555-0100" }]).ok, true);
  assert.equal(validateOrsaRoster([{ email: " NA ", phone: "(212) 555-0100" }]).rows[0].contactKey, '["2125550100",""]');
  assert.equal(validateOrsaRoster([{ email: "", phoneNumber: "212-555-0100", displayName: "Ada Stone" }]).ok, true);
  assert.equal(validateOrsaRoster([{ email: null, externalMemberId: "M-1" }]).ok, true);
  const badEmail = validateOrsaRoster([{ email: "invalid", phone: "2125550100", displayName: "Ada" }]);
  assert.equal(badEmail.ok, true);
  assert.equal(badEmail.rows[0].normalizedEmail, null);
  assert.deepEqual(badEmail.unusableEmailRows, [1]);
  const badPhone = validateOrsaRoster([{ phone: "212-555-0100 ext 3", displayName: "Ada" }]);
  assert.equal(badPhone.ok, true);
  assert.equal(badPhone.rows[0].normalizedPhone, null);
  assert.deepEqual(badPhone.unusablePhoneRows, [1]);
  const emailWithBadPhone = validateOrsaRoster([{ email: "ada@example.com", phone: "not a phone" }]);
  assert.equal(emailWithBadPhone.ok, true);
  assert.equal(emailWithBadPhone.rows[0].normalizedEmail, "ada@example.com");
  assert.equal(emailWithBadPhone.rows[0].normalizedPhone, null);
  assert.equal(validateOrsaRoster([{ phone: "555", displayName: "Ada" }]).ok, true);
  const unnamedDuplicates = validateOrsaRoster([{ phone: "2125550100" }, { email: "NA", phone: "(212) 555-0100" }]);
  assert.equal(unnamedDuplicates.ok, true);
  assert.equal(unnamedDuplicates.skippedDuplicates, 1);
  const ambiguousPhone = validateOrsaRoster([{ phone: "2125550100" }, { phone: "2125550100", displayName: "Another Member" }]);
  assert.equal(ambiguousPhone.ok, false);
  assert.match(ambiguousPhone.issues[0].message, /Phone number without a member name is shared/);
  assert.equal(validateOrsaRoster([
    { email: "ada@example.com", phone: "2125550100" },
    { email: "NA", phone: "2125550100" },
  ]).ok, false);
  const duplicates = validateOrsaRoster([
    { phone: "212-555-0100", displayName: "Ada Stone" },
    { phone: "(212) 555-0100", displayName: " ADA   STONE " },
  ]);
  assert.equal(duplicates.ok, true);
  assert.equal(duplicates.skippedDuplicates, 1);
  assert.equal(duplicates.rows.length, 1);
  const conflictingEmail = validateOrsaRoster([
    { email: "ada@example.com", displayName: "Ada Stone" },
    { email: " ADA@EXAMPLE.COM ", displayName: "Different Member" },
  ]);
  assert.equal(conflictingEmail.ok, false);
  assert.match(conflictingEmail.issues[0].message, /Duplicate email with conflicting details/);
  const conflictingStatus = validateOrsaRoster([
    { phone: "212-555-0100", displayName: "Ada Stone", active: true },
    { phone: "2125550100", displayName: "Ada Stone", active: false },
  ]);
  assert.equal(conflictingStatus.ok, false);
  assert.match(conflictingStatus.issues[0].message, /Duplicate phone and member name with conflicting details/);
  const separateMembers = validateOrsaRoster([
    { email: "ada@example.com", displayName: "Ada Stone" },
    { email: "other@example.com", displayName: "Ada Stone" },
  ]);
  assert.equal(separateMembers.ok, true);
  assert.equal(separateMembers.rows.length, 2);
});

test("headerless roster keeps the first member and rejects ambiguous email columns", () => {
  const parsed = parseOrsaRosterCsv("A1,one@example.com\nA2,two@example.com");
  assert.deepEqual(parsed.map((row) => row.email), ["one@example.com", "two@example.com"]);
  assert.throws(
    () => parseOrsaRosterCsv("personal,work\none@example.com,one@work.test"),
    /Could not identify roster headers/,
  );
});

test("an explicit email header wins even when empty; contact addresses cannot override it", () => {
  const inferred = parseOrsaRosterCsv("email,phone,contact\n,2125550100,staff@example.com");
  assert.equal(inferred[0].email, "");
  const checked = validateOrsaRoster(inferred);
  assert.equal(checked.ok, true);
  assert.equal(checked.rows[0].normalizedEmail, null);
  assert.equal(checked.rows[0].contactKey, '["2125550100",""]');
  const named = parseOrsaRosterCsv("email,notes\nmember@example.com,contact@example.com\ninvalid,help@example.com");
  assert.equal(named[0].email, "member@example.com");
  assert.equal(validateOrsaRoster(named).ok, false);
});

test("data entry person's name is never substituted for the member's name", () => {
  const withMember = parseOrsaRosterCsv("name,email,member_name\nData Entry Person,member@example.com,Actual Member");
  assert.equal(withMember[0].displayName, "Actual Member");
  const withoutMember = parseOrsaRosterCsv("name,email\nData Entry Person,one@example.com\nData Entry Person,two@example.com");
  assert.deepEqual(withoutMember.map((row) => row.displayName), [null, null]);
  assert.equal(validateOrsaRoster(withoutMember).ok, true);
});

test("roster preview fields match persisted fields and reveal issues without allowing a partial write", () => {
  const csv = "name,member_first_name,member_last_name,email,active\nOperator,Ada,Stone, ADA@EXAMPLE.COM ,no\nOperator,Ben,Lee,ada@example.com,yes";
  // XLSX first worksheets are converted to CSV before reaching the same parser.
  const checked = validateOrsaRoster(parseOrsaRosterCsv(csv));
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.rows, []);
  assert.deepEqual(checked.mappedRows, [
    { normalizedEmail: "ada@example.com", normalizedPhone: null, displayName: "Ada Stone", externalMemberId: null, contactKey: null, active: false },
    { normalizedEmail: "ada@example.com", normalizedPhone: null, displayName: "Ben Lee", externalMemberId: null, contactKey: null, active: true },
  ]);
  assert.deepEqual(checked.mappedRowNumbers, [1, 2]);
  assert.deepEqual(checked.issues.map(issue => [issue.row, issue.field]), [[2, "email"]]);
  const json = validateOrsaRoster([{ email: " MEMBER@EXAMPLE.COM ", displayName: "  Member Name  ", active: false }]);
  assert.equal(json.ok, true);
  assert.deepEqual(json.mappedRows, json.rows);
  assert.deepEqual(json.rows[0], { normalizedEmail: "member@example.com", normalizedPhone: null, displayName: "Member Name", externalMemberId: null, contactKey: null, active: false });
  const shared = validateOrsaRoster([
    { email: "contact@example.com", displayName: "Ada" },
    { email: "contact@example.com", displayName: "Ben" },
  ], { sharedEmailContacts: true });
  assert.equal(shared.ok, true);
  assert.deepEqual(shared.mappedRows.map(row=>row.normalizedEmail), [null, null]);
});

test("first and last name columns identify members, not the data-entry name", () => {
  const rows = parseOrsaRosterCsv(
    "name,first_name,last_name,email\nData Entry Person,Ada,Stone,ada@example.com\nData Entry Person,Ben,Lee,ben@example.com",
  );
  assert.deepEqual(rows.map((row) => row.displayName), ["Ada Stone", "Ben Lee"]);
  assert.equal(validateOrsaRoster(rows).ok, true);
});

test("explicit member first and last name columns work for a single member", () => {
  const rows = parseOrsaRosterCsv(
    "entered_by_first_name,member_first_name,member_last_name,email\nData Entry Person,Ada,Stone,ada@example.com",
  );
  assert.equal(rows[0].displayName, "Ada Stone");
});

test("generic first and last name columns work for a single member", () => {
  const rows = parseOrsaRosterCsv("name,first_name,last_name,email\nData Entry Person,Ada,Stone,ada@example.com");
  assert.equal(rows[0].displayName, "Ada Stone");
});

test("members sharing a first and last name are not mistaken for a data-entry person", () => {
  const rows = parseOrsaRosterCsv(
    "name,first_name,last_name,email\nData Entry Person,Ada,Stone,one@example.com\nData Entry Person,Ada,Stone,two@example.com",
  );
  assert.deepEqual(rows.map((row) => row.displayName), ["Ada Stone", "Ada Stone"]);
});

test("a generic full-name column is not used as a member field", () => {
  const rows = parseOrsaRosterCsv("name,email\nAda Stone,ada@example.com\nBen Lee,ben@example.com");
  assert.deepEqual(rows.map((row) => row.displayName), [null, null]);
});

test("explicit first-column member-name mapping keeps names even with unusable contact values", () => {
  const csv = "Name,Email,Phone\nAda Stone,ada@example.com,NA\nBen Lee,not-an-email,\nGrace Hopper,NA,bad-phone";
  const defaultRows = parseOrsaRosterCsv(csv);
  assert.deepEqual(defaultRows.map((row) => row.displayName), [null, null, null]);
  assert.equal(validateOrsaRoster(defaultRows).ok, false);
  const mapped = parseOrsaRosterCsv(csv, { firstColumnMemberName: true });
  assert.deepEqual(mapped.map((row) => row.displayName), ["Ada Stone", "Ben Lee", "Grace Hopper"]);
  const checked = validateOrsaRoster(mapped);
  assert.equal(checked.ok, true);
  assert.equal(checked.rows.length, 3);
  assert.deepEqual(checked.unusableEmailRows, [2]);
  assert.deepEqual(checked.unusablePhoneRows, [3]);
  assert.deepEqual(checked.rows.map(row => row.normalizedEmail), ["ada@example.com", null, null]);
  assert.equal(checked.rows[1].contactKey?.startsWith('["name-only"'), true);
});

test("first-column mapping overrides other name columns only when the administrator opts in", () => {
  const csv = "name,first_name,last_name,email\nActual Member,Data,Entry,member@example.com";
  assert.equal(parseOrsaRosterCsv(csv)[0].displayName, "Data Entry");
  assert.equal(parseOrsaRosterCsv(csv, { firstColumnMemberName: true })[0].displayName, "Actual Member");
  const headerless = parseOrsaRosterCsv("Ada Stone,ada@example.com\nBen Lee,ben@example.com", { firstColumnMemberName: true });
  assert.deepEqual(headerless.map(row => row.displayName), ["Ada Stone", "Ben Lee"]);
});

test("explicit Member, Phone, Email column order keeps each phone with its own email", () => {
  const csv = "Member,Daytime Phone,Email\nAda Stone,(212) 555-0100,ada@example.com\nBen Lee,+1 415-555-0133,ben@example.com\nGrace Hopper,bad-phone,not-an-email";
  assert.deepEqual(parseOrsaRosterCsv(csv).map(row => row.phone), [null, null, null]);
  const options = { memberPhoneEmailColumns: true, firstRowIsHeader: true };
  const checked = validateOrsaRoster(parseOrsaRosterCsv(csv, options));
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.rows.map(({ displayName, normalizedPhone, normalizedEmail }) => ({
    displayName, normalizedPhone, normalizedEmail,
  })), [
    { displayName: "Ada Stone", normalizedPhone: "2125550100", normalizedEmail: "ada@example.com" },
    { displayName: "Ben Lee", normalizedPhone: "14155550133", normalizedEmail: "ben@example.com" },
    { displayName: "Grace Hopper", normalizedPhone: null, normalizedEmail: null },
  ]);
  assert.deepEqual(checked.unusablePhoneRows, [3]);
  assert.deepEqual(checked.unusableEmailRows, [3]);
});

test("positional imports require a deliberate first-row choice and preserve headerless first member", () => {
  const csv = "Ada Stone,(212) 555-0100,ada@example.com\nBen Lee,4155550133,ben@example.com";
  assert.throws(() => parseOrsaRosterCsv(csv, { memberPhoneEmailColumns: true }), /Choose whether the first row/);
  assert.throws(() => parseOrsaRosterCsv(csv, { memberPhoneEmailColumns: true, firstRowIsHeader: true }), /first row looks like a member/);
  const mapped = parseOrsaRosterCsv(csv, { memberPhoneEmailColumns: true, firstRowIsHeader: false });
  assert.deepEqual(mapped.map(row => row.displayName), ["Ada Stone", "Ben Lee"]);
  assert.deepEqual(mapped.map(row => row.phone), ["(212) 555-0100", "4155550133"]);
  assert.throws(() => parseOrsaRosterCsv("Member,Phone,Email\nAda,2125550100,ada@example.com",
    { memberPhoneEmailColumns: true, firstRowIsHeader: false }), /first row looks like headings/);
});

test("only active roster matching grants ORSA benefits", () => {
  assert.equal(entitlementsForAccount("Member@Example.com", new Set(["member@example.com"]), true).heartPlanTier, "legacy");
  assert.equal(entitlementsForAccount("Member@Example.com", new Set(["member@example.com"]), false).orsaVerified, false);
  assert.equal(entitlementsForAccount("member@example.com", new Set(), true).caseServiceExempt, false);
  assert.equal(entitlementsForAccount(null, new Set(["member@example.com"]), true).orsaVerified, false);
});

test("a verified account is a conversion only if it was created after the first invitation attempt", () => {
  const attemptAt = new Date("2025-01-01T12:00:00.000Z");
  assert.equal(accountWasCreatedAfterInvitation(new Date(attemptAt.getTime() + 1), attemptAt), true);
  assert.equal(accountWasCreatedAfterInvitation(attemptAt, attemptAt), false);
  assert.equal(accountWasCreatedAfterInvitation(new Date(attemptAt.getTime() - 1), attemptAt), false);
  assert.equal(accountWasCreatedAfterInvitation(new Date(), null), false);
});

test("DB integration: an unverified roster email never receives primary ORSA benefits", async () => {
  const id = randomUUID();
  const email = `unverified_${randomUUID()}@example.test`;
  await db.insert(orsaRosterMembers).values({ id, normalizedEmail: email, active: true });
  try {
    assert.equal((await accountOrsaMembership({
      id: randomUUID(), email, emailVerified: false,
    })).orsaVerified, false);
    assert.equal((await accountOrsaMembership({
      id: randomUUID(), email, emailVerified: null,
    })).orsaVerified, false);
    assert.equal((await accountOrsaMembership({
      id: randomUUID(), email, emailVerified: true,
    })).orsaVerified, true);
  } finally {
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
  }
});

test("DB integration: no-email rows are idempotent and never gain email-based entitlements", async () => {
  const actorId = randomUUID();
  const checked = validateOrsaRoster([{ email: "NA", phone: "2125550199" }]);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  const row = checked.rows[0];
  try {
    await upsertOrsaRoster([row], actorId);
    const [initial] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.contactKey, row.contactKey!));
    assert.ok(initial);
    await db.update(orsaRosterMembers).set({
      invitationStatus: "sent",
      invitationFirstAttemptAt: new Date("2025-01-01T00:00:00.000Z"),
      invitationSentAt: new Date("2025-01-02T00:00:00.000Z"),
    }).where(eq(orsaRosterMembers.id, initial.id));

    await upsertOrsaRoster([row], actorId);
    const [reimported] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.contactKey, row.contactKey!));
    assert.equal(reimported.id, initial.id);
    assert.equal(reimported.normalizedEmail, null);
    assert.equal(reimported.invitationStatus, "sent");
    assert.ok(reimported.invitationFirstAttemptAt);
    assert.ok(reimported.invitationSentAt);
    assert.equal(await setOrsaMemberActive(initial.id, false, actorId), true);
    assert.equal(await setOrsaMemberActive(initial.id, true, actorId), true);
    assert.equal((await reconcileOrsaRosterInvitationStates()).find((entry) => entry.member.id === initial.id)?.invitationStatus, "no_email");
    assert.equal((await activeOrsaEmails()).has(""), false);
    assert.equal((await accountOrsaMembership({
      id: randomUUID(), email: `no_email_${randomUUID()}@example.test`, emailVerified: true,
    })).orsaVerified, false);
    assert.equal((await claimOrsaInvitation(initial.id)).disposition, "no_email");
    const [stillNoLease] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, initial.id));
    assert.equal(stillNoLease.invitationLeaseId, null);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.contactKey, row.contactKey!));
  }
});

test("DB integration: name-only members remain distinct and stable on reimport", async () => {
  const actorId = randomUUID();
  const displayName = `Roster Name ${randomUUID()}`;
  const checked = validateOrsaRoster([{ displayName }, { displayName }]);
  assert.equal(checked.ok, true);
  assert.equal(checked.rows.length, 2);
  const keys = checked.rows.map(row => row.contactKey!);
  try {
    await upsertOrsaRoster(checked.rows, actorId);
    const first = await db.select().from(orsaRosterMembers).where(inArray(orsaRosterMembers.contactKey, keys));
    assert.equal(first.length, 2);
    assert.ok(first.every(member => member.normalizedEmail === null && member.normalizedPhone === null));
    await upsertOrsaRoster(checked.rows, actorId);
    const again = await db.select().from(orsaRosterMembers).where(inArray(orsaRosterMembers.contactKey, keys));
    assert.deepEqual(new Set(again.map(member => member.id)), new Set(first.map(member => member.id)));
    assert.equal((await claimOrsaInvitation(first[0].id)).disposition, "no_email");
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(inArray(orsaRosterMembers.contactKey, keys));
  }
});

test("DB integration: malformed contact values cannot become outreach destinations", async () => {
  const actorId = randomUUID();
  const checked = validateOrsaRoster([{
    displayName: `Bad Contact ${randomUUID()}`, email: "not-an-email", phone: "bad-phone",
  }]);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.unusableEmailRows, [1]);
  assert.deepEqual(checked.unusablePhoneRows, [1]);
  const key = checked.rows[0].contactKey!;
  try {
    await upsertOrsaRoster(checked.rows, actorId);
    const [member] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.contactKey, key));
    assert.ok(member);
    assert.equal(member.normalizedEmail, null);
    assert.equal(member.normalizedPhone, null);
    assert.equal((await claimOrsaInvitation(member.id)).disposition, "no_email");
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.contactKey, key));
  }
});

test("DB integration: reimporting positional rows associates a phone with its existing email record", async () => {
  const actorId = randomUUID();
  const email = `orsa_phone_${randomUUID()}@example.test`;
  const name = `Member ${randomUUID()}`;
  const phone = parseInt(randomUUID().slice(0, 8), 16).toString().padStart(10, "0");
  const original = validateOrsaRoster([{ displayName: name, email }]);
  const updated = validateOrsaRoster(parseOrsaRosterCsv(
    `Member,Phone,Email\n${name},${phone},${email}`,
    { memberPhoneEmailColumns: true, firstRowIsHeader: true },
  ));
  assert.equal(updated.ok, true);
  try {
    await upsertOrsaRoster(original.rows, actorId);
    const [before] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.normalizedEmail, email));
    assert.ok(before);
    assert.equal(before.normalizedPhone, null);
    await upsertOrsaRoster(updated.rows, actorId);
    const [after] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.normalizedEmail, email));
    assert.equal(after.id, before.id);
    assert.equal(after.normalizedPhone, phone);
    assert.equal(after.displayName, name);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.normalizedEmail, email));
  }
});

test("DB integration: shared contact option cannot silently reassign an active member email", async () => {
  const id = randomUUID();
  const actorId = randomUUID();
  const sharedEmail = `shared_${randomUUID()}@example.test`;
  await db.insert(orsaRosterMembers).values({ id, normalizedEmail: sharedEmail, active: true });
  try {
    const checked = validateOrsaRoster([
      { email: sharedEmail, externalMemberId: `member-${randomUUID()}`, displayName: "Ada Stone" },
      { email: sharedEmail, externalMemberId: `member-${randomUUID()}`, displayName: "Grace Hopper" },
    ], { sharedEmailContacts: true });
    assert.equal(checked.ok, true);
    await assert.rejects(() => upsertOrsaRoster(checked.rows, actorId, checked.sharedEmails), (error: Error) =>
      error.message.includes("shared contact email is already assigned") &&
      error.message.includes(sharedEmail) && error.message.includes("name unavailable"));
    await assert.rejects(() => replaceOrsaRoster(checked.rows, actorId, checked.sharedEmails), /shared contact email is already assigned/);
    const [unchanged] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
    assert.equal(unchanged.active, true);
    assert.equal(unchanged.normalizedEmail, sharedEmail);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, id));
  }
});

test("DB integration: conflicting roster identifiers cannot merge or split member history", async () => {
  const actorId = randomUUID();
  const emailId = randomUUID();
  const phoneId = randomUUID();
  const originalEmail = `roster_${randomUUID()}@example.test`;
  const otherEmail = `roster_${randomUUID()}@example.test`;
  const externalMemberId = `member-${randomUUID()}`;
  const phoneOnly = validateOrsaRoster([{
    phone: "212-555-0187", displayName: `Phone Member ${randomUUID()}`,
  }]).rows[0];
  await db.insert(orsaRosterMembers).values([
    { id: emailId, normalizedEmail: originalEmail, externalMemberId },
    {
      id: phoneId, normalizedEmail: null, normalizedPhone: phoneOnly.normalizedPhone,
      displayName: phoneOnly.displayName, contactKey: phoneOnly.contactKey,
    },
  ]);
  const importRow = async (row: Parameters<typeof validateOrsaRoster>[0][number]) => {
    const checked = validateOrsaRoster([row]);
    assert.equal(checked.ok, true);
    await upsertOrsaRoster(checked.rows, actorId);
  };
  try {
    await assert.rejects(importRow({
      email: originalEmail, externalMemberId: `different-${randomUUID()}`,
    }), /external ID conflicts/);
    await assert.rejects(importRow({
      email: otherEmail, externalMemberId,
    }), /existing email differs/);
    await assert.rejects(importRow({
      email: otherEmail, phone: "212-555-0187", displayName: phoneOnly.displayName,
    }), /Phone number matches another roster record/);
    await assert.rejects(importRow({
      externalMemberId: `new-${randomUUID()}`, phone: "212-555-0187", displayName: phoneOnly.displayName,
    }), /Phone number matches another roster record/);
    await assert.rejects(importRow({ phone: "212-555-0187" }), /Phone number matches another roster record/);
    await importRow({ email: originalEmail });
    const [unchanged] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, emailId));
    assert.equal(unchanged.externalMemberId, externalMemberId);
    assert.equal(unchanged.normalizedEmail, originalEmail);
    const [stillPhoneOnly] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, phoneId));
    assert.equal(stillPhoneOnly.normalizedEmail, null);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, phoneId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, emailId));
  }
});

test("DB integration: verification racing a sending lease retains accepted state when send finalizes", async () => {
  const memberId = randomUUID();
  const userId = randomUUID();
  const email = `orsa_race_${randomUUID()}@example.test`;
  const actorId = randomUUID();
  const now = new Date();
  await db.insert(orsaRosterMembers).values({ id: memberId, normalizedEmail: email, active: true });
  try {
    const claim = await claimOrsaInvitation(memberId, now);
    assert.equal(claim.disposition, "claimed");
    if (claim.disposition !== "claimed") return;
    await db.insert(users).values({
      id: userId,
      email,
      role: "planner",
      emailVerified: false,
      createdAt: new Date(now.getTime() + 1000),
    });
    const duplicateClaim = await claimOrsaInvitation(memberId, new Date(now.getTime() + 1500));
    assert.equal(duplicateClaim.disposition, "sending");
    const unverifiedDuringSend = await reconcileOrsaRosterInvitationStates(new Date(now.getTime() + 1600));
    const stillSending = unverifiedDuringSend.find((row) => row.member.id === memberId);
    assert.equal(stillSending?.invitationStatus, "sending");
    assert.equal(stillSending?.member.invitationLeaseId, claim.leaseId);
    await verifyEmailAndAcceptOrsaInvitation(userId, email, new Date(now.getTime() + 2000));
    const [acceptedDuringSend] = await db.select().from(orsaRosterMembers)
      .where(eq(orsaRosterMembers.id, memberId));
    assert.equal(acceptedDuringSend.invitationStatus, "accepted");
    assert.equal(acceptedDuringSend.invitationLeaseId, claim.leaseId);
    const reconciled = await reconcileOrsaRosterInvitationStates(new Date(now.getTime() + 2500));
    const duringSendStatus = reconciled.find((row) => row.member.id === memberId);
    assert.equal(duringSendStatus?.invitationStatus, "accepted");
    assert.equal(duringSendStatus?.member.invitationLeaseId, claim.leaseId);

    const finalized = await finishOrsaInvitation(
      memberId,
      claim.leaseId,
      true,
      actorId,
      new Date(now.getTime() + 3000),
    );
    assert.equal(finalized.recorded, true);
    assert.equal(finalized.invitationStatus, "accepted");
    assert.ok(finalized.invitationSentAt);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, userId));
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
  }
});

test("DB integration: roster GET reconciles verified old accounts as existing, not sent", async () => {
  const beforeMemberId = randomUUID();
  const afterMemberId = randomUUID();
  const beforeUserId = randomUUID();
  const afterUserId = randomUUID();
  const beforeEmail = `orsa_existing_${randomUUID()}@example.test`;
  const afterEmail = `orsa_converted_${randomUUID()}@example.test`;
  const attemptAt = new Date();
  await db.insert(orsaRosterMembers).values([
    {
      id: beforeMemberId,
      normalizedEmail: beforeEmail,
      active: true,
      invitationStatus: "sent",
      invitationFirstAttemptAt: attemptAt,
      invitationSentAt: attemptAt,
    },
    {
      id: afterMemberId,
      normalizedEmail: afterEmail,
      active: true,
      invitationStatus: "sent",
      invitationFirstAttemptAt: attemptAt,
      invitationSentAt: attemptAt,
    },
  ]);
  try {
    await db.insert(users).values([
      {
        id: beforeUserId,
        email: beforeEmail,
        role: "planner",
        emailVerified: true,
        createdAt: new Date(attemptAt.getTime() - 1000),
      },
      {
        id: afterUserId,
        email: afterEmail,
        role: "planner",
        emailVerified: true,
        createdAt: new Date(attemptAt.getTime() + 1000),
      },
    ]);
    const reconciled = await reconcileOrsaRosterInvitationStates(new Date(attemptAt.getTime() + 2000));
    assert.equal(reconciled.find((row) => row.member.id === beforeMemberId)?.invitationStatus, "already_registered");
    assert.equal(reconciled.find((row) => row.member.id === afterMemberId)?.invitationStatus, "accepted");
    const [oldRecord] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, beforeMemberId));
    const [newRecord] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, afterMemberId));
    assert.equal(oldRecord.invitationStatus, "already_registered");
    assert.equal(newRecord.invitationStatus, "accepted");
    assert.equal(newRecord.invitationAcceptedUserId, afterUserId);
  } finally {
    await db.delete(users).where(eq(users.id, beforeUserId));
    await db.delete(users).where(eq(users.id, afterUserId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, beforeMemberId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, afterMemberId));
  }
});

test("DB integration: uncertain and stale invitation sends require explicit retry", async () => {
  const memberId = randomUUID();
  const actorId = randomUUID();
  const email = `orsa_retry_${randomUUID()}@example.test`;
  const now = new Date();
  await db.insert(orsaRosterMembers).values({ id: memberId, normalizedEmail: email, active: true });
  try {
    const first = await claimOrsaInvitation(memberId, now);
    assert.equal(first.disposition, "claimed");
    if (first.disposition !== "claimed") return;
    const uncertain = await finishOrsaInvitation(memberId, first.leaseId, false, actorId, new Date(now.getTime() + 1000));
    assert.equal(uncertain.recorded, true);
    assert.equal(uncertain.invitationStatus, "needs_review");

    const explicitRetry = await claimOrsaInvitation(memberId, new Date(now.getTime() + 2000));
    assert.equal(explicitRetry.disposition, "claimed");
    if (explicitRetry.disposition !== "claimed") return;
    const concurrent = await Promise.all([
      claimOrsaInvitation(memberId, new Date(now.getTime() + 3000)),
      claimOrsaInvitation(memberId, new Date(now.getTime() + 3000)),
    ]);
    assert.deepEqual(concurrent.map((result) => result.disposition), ["sending", "sending"]);

    await db.update(orsaRosterMembers).set({
      invitationLeaseExpiresAt: new Date(now.getTime() + 1000),
    }).where(eq(orsaRosterMembers.id, memberId));
    const staleLease = await claimOrsaInvitation(memberId, new Date(now.getTime() + 10_000));
    assert.equal(staleLease.disposition, "needs_review");
    const [saved] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
    assert.equal(saved.invitationStatus, "needs_review");
    assert.equal(saved.invitationLeaseId, null);
  } finally {
    await db.delete(orsaRosterAudits).where(eq(orsaRosterAudits.actorUserId, actorId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
  }
});

test("DB integration: pre-existing unverified accounts require verification recovery, not an invite", async () => {
  const memberId = randomUUID();
  const userId = randomUUID();
  const email = `orsa_attention_${randomUUID()}@example.test`;
  const now = new Date();
  await db.insert(orsaRosterMembers).values({ id: memberId, normalizedEmail: email, active: true });
  await db.insert(users).values({
    id: userId,
    email,
    role: "planner",
    emailVerified: false,
    createdAt: new Date(now.getTime() - 1000),
  });
  try {
    const result = await claimOrsaInvitation(memberId, now);
    assert.equal(result.disposition, "needs_attention");
    const [saved] = await db.select().from(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
    assert.equal(saved.invitationStatus, "needs_attention");
    assert.equal(saved.invitationLeaseId, null);
  } finally {
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(orsaRosterMembers).where(eq(orsaRosterMembers.id, memberId));
  }
});

test("only active household seats contribute to Stripe quantity", () => {
  assert.equal(activeFamilySeatQuantity(["invited", "active", "removed", "active"]), 2);
});

test("ORSA admin routes always run the full MFA authentication gate before role authorization", async () => {
  const source = await readFile(new URL("./routes.ts", import.meta.url), "utf8");
  const declarations = source.match(/app\.(?:get|post|put|patch|delete)\("\/api\/admin\/orsa\/[^"]+"[^;]+;/g) ?? [];
  assert.equal(declarations.length, 13);
  assert.match(source, /registerOrsaAccountInvitationRoutes\(app,\s*isAuthenticated,\s*isAdmin\)/);
  assert.match(source, /registerOrsaWarmupRoutes\(app,\s*isAuthenticated,\s*isAdmin\)/);
  for (const declaration of declarations) {
    assert.match(declaration, /,\s*isAuthenticated,\s*isAdmin,/);
  }
});

test("MFA-pending password and SSO admin sessions are rejected before ORSA admin authorization", async () => {
  const userId = `orsa-mfa-${randomUUID()}`;
  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.test`,
    role: "admin",
    emailVerified: true,
  });

  const invoke = async (req: any) => {
    const result: { status: number; body?: any; nextCalled: boolean } = {
      status: 200,
      nextCalled: false,
    };
    const res: any = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: any) {
        result.body = body;
        return this;
      },
    };
    await Promise.resolve(isAuthenticated(req, res, () => {
      result.nextCalled = true;
    }));
    return result;
  };

  try {
    let passwordSessionDestroyed = false;
    const passwordResult = await invoke({
      session: {
        userId,
        destroy(callback: () => void) {
          passwordSessionDestroyed = true;
          callback();
        },
      },
      user: undefined,
      isAuthenticated: () => false,
    });
    assert.equal(passwordResult.status, 401);
    assert.equal(passwordResult.body?.code, "MFA_REQUIRED");
    assert.equal(passwordResult.nextCalled, false);
    assert.equal(passwordSessionDestroyed, true);

    const ssoResult = await invoke({
      session: {},
      user: {
        claims: { sub: userId },
        expires_at: Math.floor(Date.now() / 1000) + 300,
        pending2FAUserId: userId,
        mfaVerified: false,
      },
      isAuthenticated: () => true,
    });
    assert.equal(ssoResult.status, 401);
    assert.equal(ssoResult.body?.code, "MFA_REQUIRED");
    assert.equal(ssoResult.nextCalled, false);
  } finally {
    await db.delete(users).where(eq(users.id, userId));
  }
});

test("NER caps payments and preserves count through failure and resume", () => {
  let state: NerState = { status: "pending_checkout", paidInstallmentCount: 0, externalStatus: "not_requested" };
  for (let i = 0; i < 15; i++) state = applyNerInstallmentPaid(state);
  assert.equal(state.paidInstallmentCount, 12);
  assert.equal(state.status, "lifetime");
  assert.equal(applyNerPaymentFailure(state, "declined").status, "lifetime");
  const resumed = applyNerSubscriptionStatus({ ...state, paidInstallmentCount: 2, status: "paused" }, "active");
  assert.deepEqual({ status: resumed.status, count: resumed.paidInstallmentCount }, { status: "provisional", count: 2 });
});

test("NER schedule counts only future cycles after Checkout's first invoice", () => {
  assert.equal(nerFutureScheduleIterations(0), 11);
  assert.equal(nerFutureScheduleIterations(1), 10);
  assert.equal(nerFutureScheduleIterations(11), 0);
  assert.equal(nerFutureScheduleIterations(12), 0);
});

test("schedule preserves checkout period and appends the exact remaining cycles", async () => {
  for (const [prior, future] of [[0, 11], [1, 10]] as const) {
    let configured: any;
    const stripe = {
      subscriptionSchedules: {
        create: async () => ({ id: `sched_${prior}` }),
        retrieve: async () => ({ current_phase: { start_date: 100, end_date: 200 } }),
        update: async (_id: string, value: any) => { configured = value; },
      },
      subscriptions: {
        retrieve: async () => ({ items: { data: [{ price: { id: "price_ner" }, quantity: 1 }] } }),
        update: async () => { throw new Error("must not cancel early"); },
      },
    } as unknown as Stripe;
    assert.equal(await enforceNerFixedCycles(stripe, {
      subscriptionId: "sub_1", enrollmentId: "enr_1",
      successfulBeforeCheckout: prior, existingScheduleId: null,
    }), `sched_${prior}`);
    assert.deepEqual(
      configured.phases.map((phase: any) => ({
        start: phase.start_date, end: phase.end_date, months: phase.duration?.interval_count,
      })),
      [{ start: 100, end: 200, months: undefined }, { start: undefined, end: undefined, months: future }],
    );
    assert.equal(configured.end_behavior, "cancel");
  }
});

test("prior count 11 makes checkout invoice final without creating a schedule", async () => {
  let canceledAtPeriodEnd = false;
  const stripe = {
    subscriptionSchedules: {
      create: async () => { throw new Error("schedule must not be created"); },
    },
    subscriptions: {
      update: async (_id: string, value: any) => { canceledAtPeriodEnd = value.cancel_at_period_end; },
    },
  } as unknown as Stripe;
  assert.equal(await enforceNerFixedCycles(stripe, {
    subscriptionId: "sub_1", enrollmentId: "enr_1",
    successfulBeforeCheckout: 11, existingScheduleId: null,
  }), null);
  assert.equal(canceledAtPeriodEnd, true);
});

test("webhook leases reclaim only failed or expired processing deliveries", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(decideLedgerClaim("processed", null, now), "processed");
  assert.equal(decideLedgerClaim("failed", null, now), "claimed");
  assert.equal(decideLedgerClaim("processing", new Date(now.getTime() - 1), now), "claimed");
  assert.equal(decideLedgerClaim("processing", new Date(now.getTime() + 60_000), now), "busy");
});

test("checkout attempts reuse open sessions and advance after stale sessions", () => {
  assert.equal(checkoutAttemptFor(0, false, false), 0);
  assert.equal(checkoutAttemptFor(3, true, true), 3);
  assert.equal(checkoutAttemptFor(3, true, false), 4);
  // Parallel callers serialized on the same enrollment both observe/reuse the
  // persisted attempt rather than manufacturing another idempotency key.
  assert.equal(checkoutAttemptFor(4, true, true), checkoutAttemptFor(4, true, true));
});

test("serialized NER invoices credit distinct ids but never a replay or thirteenth", () => {
  let state: NerState = { status: "pending_checkout", paidInstallmentCount: 11, externalStatus: "not_requested" };
  let ids = new Set<string>();
  let result = applySerializedNerInvoice(state, ids, "in_12");
  assert.equal(result.applied, true);
  state = result.state; ids = result.creditedInvoiceIds;
  result = applySerializedNerInvoice(state, ids, "in_13");
  assert.equal(result.applied, false);
  assert.equal(result.state.paidInstallmentCount, 12);
  assert.equal(applySerializedNerInvoice(state, ids, "in_12").applied, false);

  state = { status: "pending_checkout", paidInstallmentCount: 0, externalStatus: "not_requested" };
  ids = new Set();
  for (const invoice of ["parallel_a", "parallel_b"]) {
    const next = applySerializedNerInvoice(state, ids, invoice);
    state = next.state; ids = next.creditedInvoiceIds;
  }
  assert.equal(state.paidInstallmentCount, 2);
});

test("parallel seat transitions recalculate quantity from locked current state", () => {
  const afterAdd = householdTargetQuantity(1, "invited", "active");
  assert.equal(afterAdd, 2);
  const afterRemove = householdTargetQuantity(afterAdd, "active", "removed");
  assert.equal(afterRemove, 1);
  assert.equal(householdTargetQuantity(1, "active", "active"), 1);
});

test("ORSA-covered planners cannot execute the paid Stripe upgrade path", async () => {
  let stripePathExecutions = 0;
  const covered = await runPaidUpgradeIfEligible({ orsaVerified: true }, async () => {
    stripePathExecutions += 1;
    return { id: "cs_must_not_exist" };
  });
  assert.deepEqual(covered, { blocked: true });
  assert.equal(stripePathExecutions, 0);

  const uncovered = await runPaidUpgradeIfEligible({ orsaVerified: false }, async () => {
    stripePathExecutions += 1;
    return { id: "cs_allowed" };
  });
  assert.equal(uncovered.blocked, false);
  assert.equal(stripePathExecutions, 1);
});

test("cancelled NER subscription replacement preserves one credit and schedules ten future cycles", async () => {
  let configured: any;
  let releasedSchedule: string | undefined;
  const stripe = {
    subscriptions: {
      retrieve: async (id: string) => id === "sub_old"
        ? { id, status: "canceled" }
        : { id, status: "active", items: { data: [{ price: { id: "price_ner" }, quantity: 1 }] } },
    },
    subscriptionSchedules: {
      retrieve: async (id: string) => id === "sched_old"
        ? { id, status: "active" }
        : { id, status: "active", current_phase: { start_date: 300, end_date: 400 } },
      release: async (id: string) => { releasedSchedule = id; },
      create: async () => ({ id: "sched_new" }),
      update: async (_id: string, value: any) => { configured = value; },
    },
  } as unknown as Stripe;

  const scheduleId = await configureNerSubscriptionBinding(stripe, {
    enrollmentId: "enr_1",
    newSubscriptionId: "sub_new",
    previousSubscriptionId: "sub_old",
    previousScheduleId: "sched_old",
    successfulBeforeCheckout: 1,
  });
  assert.equal(scheduleId, "sched_new");
  assert.equal(releasedSchedule, "sched_old");
  assert.equal(configured.phases[1].duration.interval_count, 10);

  let state: NerState = { status: "provisional", paidInstallmentCount: 1, externalStatus: "registered" };
  let invoices = new Set(["invoice_old_first"]);
  assert.equal(invoiceMatchesAuthorizedSubscription("sub_new", "sub_old"), false);
  assert.equal(invoiceMatchesAuthorizedSubscription("sub_new", "sub_new"), true);
  const next = applySerializedNerInvoice(state, invoices, "invoice_new_checkout");
  state = next.state;
  invoices = next.creditedInvoiceIds;
  assert.equal(state.paidInstallmentCount, 2);
  assert.deepEqual(Array.from(invoices).sort(), ["invoice_new_checkout", "invoice_old_first"]);
});

test("active or potentially billable old NER subscriptions reject replacement", async () => {
  for (const status of ["active", "trialing", "past_due"]) {
    assert.equal(canReplaceNerSubscription(status), false);
    let scheduleCreated = false;
    const stripe = {
      subscriptions: { retrieve: async () => ({ status }) },
      subscriptionSchedules: { create: async () => { scheduleCreated = true; } },
    } as unknown as Stripe;
    await assert.rejects(() => configureNerSubscriptionBinding(stripe, {
      enrollmentId: "enr_1",
      newSubscriptionId: "sub_new",
      previousSubscriptionId: "sub_old",
      previousScheduleId: null,
      successfulBeforeCheckout: 1,
    }), /may still bill/);
    assert.equal(scheduleCreated, false);
  }
});

test("initial invoice-before-checkout is authoritatively linkable, scheduled, and credited once", async () => {
  assert.equal(isAuthoritativePendingNerMetadata({
    nerEnrollmentId: "enr_initial",
    sal_product: "orsa_ner_installment_v1",
  }), true);
  assert.equal(classifyNerInvoiceAuthorization(null, "sub_initial", "pending"), "retryable");
  assert.equal(nerFutureScheduleIterations(0), 11);

  let state: NerState = { status: "pending_checkout", paidInstallmentCount: 0, externalStatus: "not_requested" };
  let ids = new Set<string>();
  const first = applySerializedNerInvoice(state, ids, "in_initial");
  assert.equal(first.applied, true);
  state = first.state; ids = first.creditedInvoiceIds;
  const replay = applySerializedNerInvoice(state, ids, "in_initial");
  assert.equal(replay.applied, false);
  assert.equal(replay.state.paidInstallmentCount, 1);
});

test("replacement invoice-before-checkout schedules from pre-invoice count and preserves prior credit", () => {
  const preInvoiceCount = 1;
  assert.equal(classifyNerInvoiceAuthorization("sub_old", "sub_new", "pending"), "retryable");
  assert.equal(nerFutureScheduleIterations(preInvoiceCount), 10);
  const credited = applySerializedNerInvoice(
    { status: "provisional", paidInstallmentCount: preInvoiceCount, externalStatus: "registered" },
    new Set(["in_old_1"]),
    "in_new_checkout",
  );
  assert.equal(credited.state.paidInstallmentCount, 2);
  assert.deepEqual(Array.from(credited.creditedInvoiceIds).sort(), ["in_new_checkout", "in_old_1"]);
});

test("old-invoice versus replacement lock ordering has deterministic outcomes", () => {
  const starting: NerState = { status: "provisional", paidInstallmentCount: 1, externalStatus: "registered" };

  // Old invoice owns the enrollment lock first: it is credited, then the
  // replacement computes its schedule from the updated durable count.
  const oldFirst = applySerializedNerInvoice(starting, new Set(["in_1"]), "in_old_late");
  assert.equal(oldFirst.state.paidInstallmentCount, 2);
  assert.equal(nerFutureScheduleIterations(oldFirst.state.paidInstallmentCount), 9);
  assert.equal(classifyNerInvoiceAuthorization("sub_new", "sub_old", "retired"), "retired");

  // Replacement owns the same lock first: it schedules from count one and
  // retires old before that invoice can inspect authorization.
  assert.equal(nerFutureScheduleIterations(starting.paidInstallmentCount), 10);
  assert.equal(classifyNerInvoiceAuthorization("sub_new", "sub_old", "retired"), "retired");
  const unchanged = applySerializedNerInvoice(starting, new Set(["in_1"]), "in_old_late");
  // The pure credit transition is intentionally not invoked by production for
  // the retired classification; durable count therefore remains one.
  assert.equal(starting.paidInstallmentCount, 1);
  assert.equal(unchanged.state.paidInstallmentCount, 2);
});

test("retired invoices are safe no-credit and foreign metadata is ignored", () => {
  assert.equal(classifyNerInvoiceAuthorization("sub_new", "sub_old", "retired"), "retired");
  assert.equal(classifyNerInvoiceAuthorization("sub_new", "sub_unknown", null), "retryable");
  assert.equal(isAuthoritativePendingNerMetadata({}), false);
  assert.equal(isAuthoritativePendingNerMetadata({
    nerEnrollmentId: "enr_1",
    sal_product: "some_foreign_product",
  }), false);
});

function mockedBindingStripe(input: {
  enrollmentId: string;
  newSubscriptionId: string;
  oldSubscriptionId?: string;
  oldStatus?: string;
  configuredFuture?: (months: number) => void;
}) {
  return {
    subscriptions: {
      retrieve: async (id: string) => {
        if (id === input.oldSubscriptionId) {
          return { id, status: input.oldStatus ?? "canceled", metadata: {}, customer: "cus_old" };
        }
        return {
          id,
          status: "active",
          customer: "cus_new",
          metadata: { nerEnrollmentId: input.enrollmentId, sal_product: "orsa_ner_installment_v1" },
          items: { data: [{ price: { id: "price_ner" }, quantity: 1 }] },
        };
      },
      update: async () => ({}),
    },
    subscriptionSchedules: {
      create: async () => ({ id: `sched_${input.newSubscriptionId}` }),
      retrieve: async (id: string) => id === "sched_old"
        ? { id, status: "active" }
        : { id, status: "active", current_phase: { start_date: 500, end_date: 600 } },
      update: async (_id: string, value: any) => {
        input.configuredFuture?.(value.phases[1].duration.interval_count);
        return {};
      },
      release: async () => ({}),
    },
  } as unknown as Stripe;
}

async function cleanupNerFixture(enrollmentId: string) {
  await db.delete(nerInstallments).where(eq(nerInstallments.enrollmentId, enrollmentId));
  await db.delete(nerSubscriptionBindings).where(eq(nerSubscriptionBindings.enrollmentId, enrollmentId));
  await db.delete(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
}

test("DB integration: invoice-before-checkout activates history then credits exactly once", async () => {
  const enrollmentId = randomUUID();
  const subscriptionId = `sub_initial_${randomUUID()}`;
  try {
    await db.insert(nerEnrollments).values({
      id: enrollmentId,
      userId: `user_${randomUUID()}`,
      pendingCheckoutSessionId: `cs_${randomUUID()}`,
      checkoutExpiresAt: new Date(Date.now() + 60_000),
    });
    const stripe = mockedBindingStripe({ enrollmentId, newSubscriptionId: subscriptionId });
    assert.deepEqual(await bindPendingNerInvoiceSubscription(stripe, subscriptionId), {
      disposition: "bound", enrollmentId,
    });
    const invoiceId = `in_initial_${randomUUID()}`;
    const first = await applyNerInvoicePaid(invoiceId, subscriptionId, "cus_new", 250);
    const replay = await applyNerInvoicePaid(invoiceId, subscriptionId, "cus_new", 250);
    assert.equal(first.disposition, "credited");
    assert.equal(first.enrollment?.paidInstallmentCount, 1);
    assert.equal(replay.disposition, "duplicate");
    const [binding] = await db.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
    assert.equal(binding.state, "active");
  } finally {
    await cleanupNerFixture(enrollmentId);
  }
});

test("DB integration: replacement-first retires old and old invoice is a safe no-op", async () => {
  const enrollmentId = randomUUID();
  const oldSubscriptionId = `sub_old_${randomUUID()}`;
  const newSubscriptionId = `sub_new_${randomUUID()}`;
  let futureMonths = -1;
  try {
    await db.insert(nerEnrollments).values({
      id: enrollmentId,
      userId: `user_${randomUUID()}`,
      status: "provisional",
      paidInstallmentCount: 1,
      stripeSubscriptionId: oldSubscriptionId,
      stripeScheduleId: "sched_old",
      pendingCheckoutSessionId: `cs_${randomUUID()}`,
      checkoutExpiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(nerSubscriptionBindings).values({
      enrollmentId,
      stripeSubscriptionId: oldSubscriptionId,
      scheduleId: "sched_old",
      state: "active",
      activatedAt: new Date(),
    });
    const stripe = mockedBindingStripe({
      enrollmentId,
      newSubscriptionId,
      oldSubscriptionId,
      oldStatus: "canceled",
      configuredFuture: (months) => { futureMonths = months; },
    });
    await bindPendingNerInvoiceSubscription(stripe, newSubscriptionId);
    const oldLate = await applyNerInvoicePaid(`in_retired_${randomUUID()}`, oldSubscriptionId, "cus_old", 250);
    const replacementInvoice = await applyNerInvoicePaid(`in_replacement_${randomUUID()}`, newSubscriptionId, "cus_new", 250);
    assert.equal(futureMonths, 10);
    assert.equal(oldLate.disposition, "retired");
    assert.equal(oldLate.newPayment, false);
    assert.equal(replacementInvoice.enrollment?.paidInstallmentCount, 2);
    const bindings = await db.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.enrollmentId, enrollmentId));
    assert.deepEqual(
      bindings.map((binding) => [binding.stripeSubscriptionId, binding.state]).sort(),
      [[newSubscriptionId, "active"], [oldSubscriptionId, "retired"]].sort(),
    );
  } finally {
    await cleanupNerFixture(enrollmentId);
  }
});

test("DB integration: old-invoice-first credit changes replacement schedule to nine cycles", async () => {
  const enrollmentId = randomUUID();
  const oldSubscriptionId = `sub_old_${randomUUID()}`;
  const newSubscriptionId = `sub_new_${randomUUID()}`;
  let futureMonths = -1;
  try {
    await db.insert(nerEnrollments).values({
      id: enrollmentId,
      userId: `user_${randomUUID()}`,
      status: "provisional",
      paidInstallmentCount: 1,
      stripeSubscriptionId: oldSubscriptionId,
      stripeScheduleId: "sched_old",
      pendingCheckoutSessionId: `cs_${randomUUID()}`,
      checkoutExpiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(nerSubscriptionBindings).values({
      enrollmentId,
      stripeSubscriptionId: oldSubscriptionId,
      scheduleId: "sched_old",
      state: "active",
      activatedAt: new Date(),
    });
    const oldFirst = await applyNerInvoicePaid(`in_old_${randomUUID()}`, oldSubscriptionId, "cus_old", 250);
    assert.equal(oldFirst.enrollment?.paidInstallmentCount, 2);
    const stripe = mockedBindingStripe({
      enrollmentId,
      newSubscriptionId,
      oldSubscriptionId,
      oldStatus: "canceled",
      configuredFuture: (months) => { futureMonths = months; },
    });
    await bindPendingNerInvoiceSubscription(stripe, newSubscriptionId);
    assert.equal(futureMonths, 9);
  } finally {
    await cleanupNerFixture(enrollmentId);
  }
});

test("DB concurrency: retired subscription deletion/failure cannot overwrite replacement in either lock ordering", async () => {
  for (const eventKind of ["deleted", "payment_failed"] as const) {
    for (const order of ["old_first", "replacement_first"] as const) {
      const enrollmentId = randomUUID();
      const oldSubscriptionId = `sub_old_${randomUUID()}`;
      const newSubscriptionId = `sub_new_${randomUUID()}`;
      try {
        await db.insert(nerEnrollments).values({
          id: enrollmentId,
          userId: `user_${randomUUID()}`,
          status: "provisional",
          paidInstallmentCount: 1,
          stripeSubscriptionId: oldSubscriptionId,
          stripeScheduleId: "sched_old",
          pendingCheckoutSessionId: `cs_${randomUUID()}`,
          checkoutExpiresAt: new Date(Date.now() + 60_000),
        });
        await db.insert(nerSubscriptionBindings).values({
          enrollmentId,
          stripeSubscriptionId: oldSubscriptionId,
          scheduleId: "sched_old",
          state: "active",
          activatedAt: new Date(),
        });
        const stripe = mockedBindingStripe({
          enrollmentId,
          newSubscriptionId,
          oldSubscriptionId,
          oldStatus: "canceled",
        });
        const oldEvent = () => eventKind === "deleted"
          ? applyNerSubscription(oldSubscriptionId, "canceled")
          : applyNerInvoiceFailed(oldSubscriptionId, "old subscription failed");

        if (order === "old_first") {
          assert.equal(await oldEvent(), "applied");
          await bindPendingNerInvoiceSubscription(stripe, newSubscriptionId);
        } else {
          await bindPendingNerInvoiceSubscription(stripe, newSubscriptionId);
          assert.equal(await oldEvent(), "retired");
        }

        const [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
        const [newBinding] = await db.select().from(nerSubscriptionBindings)
          .where(eq(nerSubscriptionBindings.stripeSubscriptionId, newSubscriptionId));
        assert.equal(enrollment.stripeSubscriptionId, newSubscriptionId);
        assert.equal(enrollment.status, "provisional");
        assert.equal(enrollment.lastFailureAt, null);
        assert.equal(enrollment.lastFailureMessage, null);
        assert.equal(newBinding.state, "active");
      } finally {
        await cleanupNerFixture(enrollmentId);
      }
    }
  }
});

test("DB integration: current subscription failure and deletion apply under active binding", async () => {
  const enrollmentId = randomUUID();
  const subscriptionId = `sub_current_${randomUUID()}`;
  try {
    await db.insert(nerEnrollments).values({
      id: enrollmentId,
      userId: `user_${randomUUID()}`,
      status: "provisional",
      paidInstallmentCount: 2,
      stripeSubscriptionId: subscriptionId,
    });
    await db.insert(nerSubscriptionBindings).values({
      enrollmentId,
      stripeSubscriptionId: subscriptionId,
      state: "active",
      activatedAt: new Date(),
    });
    assert.equal(await applyNerInvoiceFailed(subscriptionId, "card declined"), "applied");
    let [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    assert.equal(enrollment.status, "past_due");
    assert.equal(enrollment.lastFailureMessage, "card declined");

    assert.equal(await applyNerSubscription(subscriptionId, "canceled"), "applied");
    [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    assert.equal(enrollment.status, "cancelled");
  } finally {
    await cleanupNerFixture(enrollmentId);
  }
});

test("DB integration: lifetime enrollment ignores current subscription lifecycle noise", async () => {
  const enrollmentId = randomUUID();
  const subscriptionId = `sub_lifetime_${randomUUID()}`;
  try {
    await db.insert(nerEnrollments).values({
      id: enrollmentId,
      userId: `user_${randomUUID()}`,
      status: "lifetime",
      paidInstallmentCount: 12,
      stripeSubscriptionId: subscriptionId,
    });
    await db.insert(nerSubscriptionBindings).values({
      enrollmentId,
      stripeSubscriptionId: subscriptionId,
      state: "active",
      activatedAt: new Date(),
    });
    assert.equal(await applyNerInvoiceFailed(subscriptionId, "late failure"), "lifetime");
    assert.equal(await applyNerSubscription(subscriptionId, "canceled"), "lifetime");
    const [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    assert.equal(enrollment.status, "lifetime");
    assert.equal(enrollment.lastFailureMessage, null);
  } finally {
    await cleanupNerFixture(enrollmentId);
  }
});

test("sponsored entitlement requires paid/current household billing with no unresolved failure", () => {
  assert.equal(householdBillingIsCurrent({ stripeSubscriptionStatus: "active", lastPaymentFailureAt: null }), true);
  assert.equal(householdBillingIsCurrent({ stripeSubscriptionStatus: "trialing", lastPaymentFailureAt: null }), true);
  assert.equal(householdBillingIsCurrent({ stripeSubscriptionStatus: "active", lastPaymentFailureAt: new Date() }), false);
  assert.equal(householdBillingIsCurrent({ stripeSubscriptionStatus: "past_due", lastPaymentFailureAt: null }), false);
});

test("Stripe webhook signed mode verifies a real SDK signature and never downgrades", async () => {
  const secret = "whsec_task63_test_secret";
  const payload = JSON.stringify({
    id: "evt_signed_task63",
    object: "event",
    api_version: "2024-06-20",
    created: 1_700_000_000,
    type: "checkout.session.completed",
    data: { object: { id: "cs_signed_hint", object: "checkout.session" } },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const sdk = new Stripe("sk_test_task63");
  const stripe = {
    webhooks: sdk.webhooks,
    checkout: { sessions: { retrieve: async () => ({
      id: "cs_signed_hint", status: "complete", payment_status: "paid",
      created: 1_700_000_000, subscription: null, payment_intent: "pi_authoritative",
      metadata: { trusted: "yes" },
    }) } },
  } as unknown as Stripe;
  const trusted = await verifyStripeWebhook({
    stripe, webhookSecret: secret, signature: header, rawBody: Buffer.from(payload),
    body: JSON.parse(payload),
  });
  assert.equal(trusted.mode, "signed");
  assert.equal(trusted.ledgerKey, "signed:evt_signed_task63");
  assert.equal((trusted.object as Stripe.Checkout.Session).metadata?.trusted, "yes");
  await assert.rejects(() => verifyStripeWebhook({
    stripe, webhookSecret: secret, signature: "t=1,v1=wrong", rawBody: Buffer.from(payload),
    body: JSON.parse(payload),
  }), StripeWebhookVerificationError);
  await assert.rejects(() => verifyStripeWebhook({
    stripe, webhookSecret: secret, rawBody: Buffer.from(payload), body: JSON.parse(payload),
  }), StripeWebhookVerificationError);
});

test("API-verified webhook fallback replaces forged invoice and Checkout fields", async () => {
  let invoiceStatus: Stripe.Invoice.Status = "open";
  const authoritativeInvoice = () => ({
    id: "in_authoritative", status: invoiceStatus, paid: invoiceStatus === "paid",
    amount_paid: invoiceStatus === "paid" ? 300 : 0, amount_remaining: invoiceStatus === "paid" ? 0 : 300,
    attempt_count: 1, next_payment_attempt: null, created: 1_700_000_000,
    status_transitions: { paid_at: invoiceStatus === "paid" ? 1_700_000_100 : null },
    subscription: "sub_authoritative", customer: "cus_authoritative",
    metadata: { trusted: "yes" },
  });
  let checkoutPaid = false;
  const stripe = {
    invoices: { retrieve: async () => authoritativeInvoice() },
    checkout: { sessions: { retrieve: async () => ({
      id: "cs_authoritative", status: checkoutPaid ? "complete" : "open",
      payment_status: checkoutPaid ? "paid" : "unpaid", created: 1_700_000_000,
      subscription: null, payment_intent: "pi_authoritative", metadata: { trusted: "yes" },
    }) } },
    subscriptions: { retrieve: async () => ({
      id: "sub_authoritative", status: "active", latest_invoice: "in_authoritative",
      created: 1_700_000_000, cancel_at_period_end: false, canceled_at: null, ended_at: null,
      items: { data: [] }, metadata: {},
    }) },
  } as unknown as Stripe;
  const forgedPaid = {
    id: "evt_attacker_controlled",
    type: "invoice.paid",
    data: { object: { id: "in_authoritative", status: "paid", amount_paid: 999999, metadata: { householdId: "forged" } } },
  };
  await assert.rejects(() => verifyStripeWebhook({ stripe, body: forgedPaid }), StripeWebhookVerificationError);
  invoiceStatus = "paid";
  const paid = await verifyStripeWebhook({ stripe, body: forgedPaid });
  assert.equal((paid.object as Stripe.Invoice).amount_paid, 300);
  assert.equal((paid.object as Stripe.Invoice).metadata?.trusted, "yes");
  assert.equal(paid.ledgerKey.includes("evt_attacker_controlled"), false);
  assert.equal((await verifyStripeWebhook({ stripe, body: forgedPaid })).ledgerKey, paid.ledgerKey);

  const checkoutHint = {
    id: "evt_forged_checkout",
    type: "checkout.session.completed",
    data: { object: { id: "cs_authoritative", status: "complete", payment_status: "paid" } },
  };
  await assert.rejects(() => verifyStripeWebhook({ stripe, body: checkoutHint }), StripeWebhookVerificationError);
  checkoutPaid = true;
  const checkout = await verifyStripeWebhook({ stripe, body: checkoutHint });
  assert.equal((checkout.object as Stripe.Checkout.Session).metadata?.trusted, "yes");
});

test("API-verified fallback derives subscription lifecycle and failure ledger state from Stripe", async () => {
  let subscriptionStatus: Stripe.Subscription.Status = "active";
  let attemptCount = 1;
  let nextPaymentAttempt: number | null = 1_700_001_000;
  const futurePeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const stripe = {
    subscriptions: { retrieve: async () => ({
      id: "sub_lifecycle", status: subscriptionStatus, latest_invoice: "in_failure",
      created: 1_700_000_000, cancel_at_period_end: false, canceled_at: null, ended_at: null,
      items: { data: [{ current_period_end: futurePeriodEnd }] }, metadata: {},
    }) },
    invoices: { retrieve: async () => ({
      id: "in_failure", status: "open", paid: false, amount_paid: 0, amount_remaining: 300,
      attempted: true, attempt_count: attemptCount, next_payment_attempt: nextPaymentAttempt, created: 1_700_000_000,
      subscription: "sub_lifecycle", status_transitions: {},
    }) },
  } as unknown as Stripe;
  const subscriptionHint = {
    id: "evt_attacker", type: "customer.subscription.deleted",
    data: { object: { id: "sub_lifecycle", status: "canceled" } },
  };
  const current = await verifyStripeWebhook({ stripe, body: subscriptionHint });
  assert.equal(current.type, "customer.subscription.updated");
  subscriptionStatus = "canceled";
  assert.equal((await verifyStripeWebhook({ stripe, body: subscriptionHint })).type, "customer.subscription.deleted");

  subscriptionStatus = "past_due";
  const firstSubscriptionState = await verifyStripeWebhook({ stripe, body: subscriptionHint });
  const repeatedSubscriptionState = await verifyStripeWebhook({ stripe, body: subscriptionHint });
  assert.equal(firstSubscriptionState.ledgerKey, repeatedSubscriptionState.ledgerKey);
  assert.ok(firstSubscriptionState.occurredAt.getTime() < futurePeriodEnd * 1000);
  attemptCount = 2;
  nextPaymentAttempt = 1_700_002_000;
  const changedSubscriptionState = await verifyStripeWebhook({ stripe, body: subscriptionHint });
  assert.notEqual(changedSubscriptionState.ledgerKey, firstSubscriptionState.ledgerKey);

  const failureHint = {
    id: "evt_attacker_failure", type: "invoice.payment_failed",
    data: { object: { id: "in_failure", paid: true, attempt_count: 999 } },
  };
  const first = await verifyStripeWebhook({ stripe, body: failureHint });
  const repeated = await verifyStripeWebhook({ stripe, body: failureHint });
  assert.equal(first.ledgerKey, repeated.ledgerKey);
  assert.equal(first.ledgerKey.includes("evt_attacker_failure"), false);
  attemptCount = 3;
  nextPaymentAttempt = 1_700_003_000;
  const changed = await verifyStripeWebhook({ stripe, body: failureHint });
  assert.notEqual(changed.ledgerKey, first.ledgerKey);
});

test("DB integration: NER scheduled retry preserves provisional before exhausted failure", async () => {
  const enrollmentId = randomUUID();
  const subscriptionId = `sub_retry_${randomUUID()}`;
  try {
    await db.insert(nerEnrollments).values({
      id: enrollmentId, userId: `user_${randomUUID()}`, status: "provisional",
      paidInstallmentCount: 1, stripeSubscriptionId: subscriptionId,
    });
    await db.insert(nerSubscriptionBindings).values({
      enrollmentId, stripeSubscriptionId: subscriptionId, state: "active", activatedAt: new Date(),
    });
    const retryAt = new Date(Date.now() + 86_400_000);
    assert.equal(await applyNerInvoiceFailed(subscriptionId, "retry scheduled", {
      nextPaymentAttempt: retryAt, retriesExhausted: false,
    }), "applied");
    let [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    assert.equal(enrollment.status, "provisional");
    assert.equal(enrollment.paymentRetryAt?.getTime(), retryAt.getTime());
    assert.equal(await applyNerInvoiceFailed(subscriptionId, "retries exhausted", {
      nextPaymentAttempt: null, retriesExhausted: true,
    }), "applied");
    [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    assert.equal(enrollment.status, "past_due");
    assert.equal(enrollment.paymentRetryAt, null);
  } finally {
    await cleanupNerFixture(enrollmentId);
  }
});

test("DB integration: NER retry exhaustion resumes remaining installments through replacement Checkout", async () => {
  const enrollmentId = randomUUID();
  const userId = `user_${randomUUID()}`;
  const oldSubscriptionId = `sub_old_${randomUUID()}`;
  const newSubscriptionId = `sub_new_${randomUUID()}`;
  let futureMonths = -1;
  try {
    await db.insert(nerEnrollments).values({
      id: enrollmentId, userId, status: "provisional", paidInstallmentCount: 1,
      stripeCustomerId: "cus_ner", stripeSubscriptionId: oldSubscriptionId,
    });
    await db.insert(nerSubscriptionBindings).values({
      enrollmentId, stripeSubscriptionId: oldSubscriptionId, state: "active", activatedAt: new Date(),
    });
    await applyNerInvoiceFailed(oldSubscriptionId, "first failure", {
      nextPaymentAttempt: new Date(Date.now() + 3600_000), retriesExhausted: false,
    });
    let [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    assert.equal(enrollment.status, "provisional");
    await applyNerInvoiceFailed(oldSubscriptionId, "final failure", {
      nextPaymentAttempt: null, retriesExhausted: true,
    });
    await applyNerSubscription(oldSubscriptionId, "canceled");
    const checkoutStripe = {
      subscriptions: { retrieve: async () => ({ id: oldSubscriptionId, status: "canceled" }) },
      products: { search: async () => ({ data: [{ id: "prod_ner" }] }) },
      prices: { list: async () => ({ data: [{ id: "price_ner", unit_amount: 250, currency: "usd", recurring: { interval: "month" } }] }) },
      checkout: { sessions: {
        create: async () => ({ id: "cs_ner_resume", url: "https://checkout.test/ner", expires_at: Math.floor(Date.now() / 1000) + 3600 }),
        retrieve: async () => ({ status: "open", url: "https://checkout.test/ner" }),
      } },
    } as unknown as Stripe;
    const prepared = await prepareNerCheckout(checkoutStripe, {
      userId, email: "owner@example.com",
      successUrl: "https://app.test/orsa?ner=success", cancelUrl: "https://app.test/orsa?ner=cancel",
    });
    assert.equal(prepared.checkout.url, "https://checkout.test/ner");
    const bindingStripe = mockedBindingStripe({
      enrollmentId, newSubscriptionId, oldSubscriptionId, oldStatus: "canceled",
      configuredFuture: (months) => { futureMonths = months; },
    });
    await bindNerCheckoutSubscription(bindingStripe, {
      enrollmentId, subscriptionId: newSubscriptionId, customerId: "cus_ner",
      checkoutSessionId: "cs_ner_resume",
    });
    assert.equal(futureMonths, 10);
    const paid = await applyNerInvoicePaid(`in_${randomUUID()}`, newSubscriptionId, "cus_ner", 250);
    assert.equal(paid.newPayment, true);
    assert.equal(paid.enrollment?.paidInstallmentCount, 2);
    assert.equal(paid.enrollment?.status, "provisional");
  } finally {
    await cleanupNerFixture(enrollmentId);
  }
});

async function cleanupHouseholdFixture(householdId: string) {
  await db.delete(householdBillingOperations).where(eq(householdBillingOperations.householdId, householdId));
  await db.delete(householdMembers).where(eq(householdMembers.householdId, householdId));
  await db.delete(households).where(eq(households.id, householdId));
}

test("DB integration: first household seat stays invited through Checkout then paid webhook activates it", async () => {
  const householdId = randomUUID();
  const primaryUserId = `primary_${randomUUID()}`;
  const sponsoredEmail = `sponsor_${randomUUID()}@example.com`;
  const sponsoredUserId = `sponsored_${randomUUID()}`;
  let checkoutMetadata: any;
  let subscriptionStatus = "unpaid";
  try {
    await db.insert(households).values({ id: householdId, primaryUserId });
    const stripe = {
      customers: { create: async () => ({ id: "cus_household" }) },
      products: {
        search: async () => ({ data: [{ id: "prod_family" }] }),
        create: async () => { throw new Error("not expected"); },
      },
      prices: {
        list: async () => ({ data: [{ id: "price_family", unit_amount: 300, currency: "usd", recurring: { interval: "month" } }] }),
        create: async () => { throw new Error("not expected"); },
      },
      checkout: { sessions: {
        create: async (value: any) => { checkoutMetadata = value.metadata; return { id: "cs_family", url: "https://checkout.test/family", expires_at: Math.floor(Date.now() / 1000) + 3600 }; },
        retrieve: async () => ({
          id: "cs_family", status: "complete", payment_status: "paid",
          created: Math.floor(Date.now() / 1000) - 5, subscription: "sub_family",
          payment_intent: "pi_family", metadata: checkoutMetadata,
        }),
      } },
      subscriptions: {
        create: async () => { throw new Error("first seat must use Checkout"); },
        retrieve: async () => ({
          id: "sub_family", status: subscriptionStatus, customer: "cus_household", cancel_at_period_end: false,
          metadata: checkoutMetadata,
          items: { data: [{ id: "si_family", price: { id: "price_family" }, quantity: 1 }] },
        }),
      },
      invoices: { retrieve: async () => ({
        id: "in_family_paid", status: "paid", paid: true, amount_paid: 300,
        amount_remaining: 0, attempt_count: 1, next_payment_attempt: null,
        created: Math.floor(Date.now() / 1000), status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
        subscription: "sub_family", customer: "cus_household", metadata: {},
      }) },
    } as unknown as Stripe;
    const result = await activateSponsoredSeat({
      primaryUserId, email: sponsoredEmail, name: "Sponsored",
      stripe, ownerEmail: "owner@example.com",
      successUrl: "https://app.test/orsa?success=1", cancelUrl: "https://app.test/orsa?cancel=1",
    });
    assert.equal(result.status, "pending_checkout");
    assert.equal(result.url, "https://checkout.test/family");
    let [member] = await db.select().from(householdMembers).where(eq(householdMembers.id, result.memberId));
    assert.equal(member.status, "invited");
    assert.equal(checkoutMetadata.householdId, householdId);
    assert.equal(checkoutMetadata.memberId, result.memberId);
    const verifiedCheckout = await verifyStripeWebhook({
      stripe,
      body: { id: "evt_untrusted_checkout", type: "checkout.session.completed", data: { object: { id: "cs_family" } } },
    });
    assert.equal(await syncHouseholdStripeEvent(stripe, {
      subscriptionId: "sub_family", kind: "checkout", checkoutSessionId: "cs_family",
      occurredAt: verifiedCheckout.occurredAt, authoritativeSubscription: verifiedCheckout.subscription,
    }), "applied");
    assert.equal(await syncHouseholdStripeEvent(stripe, {
      subscriptionId: "sub_family", kind: "checkout", checkoutSessionId: "cs_family",
      occurredAt: verifiedCheckout.occurredAt, authoritativeSubscription: verifiedCheckout.subscription,
    }), "applied");
    [member] = await db.select().from(householdMembers).where(eq(householdMembers.id, result.memberId));
    assert.equal(member.status, "invited");
    let [operation] = await db.select().from(householdBillingOperations)
      .where(eq(householdBillingOperations.id, checkoutMetadata.operationId));
    assert.equal(operation.status, "pending");
    assert.equal((await accountOrsaMembership({
      id: sponsoredUserId, email: sponsoredEmail, emailVerified: true,
    })).orsaVerified, false);

    subscriptionStatus = "active";
    const verifiedLifecycle = await verifyStripeWebhook({
      stripe,
      body: { id: "evt_untrusted_subscription", type: "customer.subscription.updated", data: { object: { id: "sub_family" } } },
    });
    assert.equal(await syncHouseholdStripeEvent(stripe, {
      subscriptionId: "sub_family", kind: "updated",
      occurredAt: verifiedLifecycle.occurredAt, authoritativeSubscription: verifiedLifecycle.subscription,
    }), "applied");
    const verifiedPaid = await verifyStripeWebhook({
      stripe,
      body: { id: "evt_untrusted", type: "invoice.paid", data: { object: { id: "in_family_paid", amount_paid: 999999 } } },
    });
    assert.equal(verifiedPaid.mode, "api_verified_fallback");
    assert.ok(verifiedPaid.occurredAt.getTime() <= verifiedLifecycle.occurredAt.getTime());
    const authoritativePaidInvoice = verifiedPaid.object as Stripe.Invoice;
    assert.equal(await syncHouseholdStripeEvent(stripe, {
      subscriptionId: typeof (authoritativePaidInvoice as any).subscription === "string"
        ? (authoritativePaidInvoice as any).subscription
        : (authoritativePaidInvoice as any).subscription.id,
      kind: "paid", occurredAt: verifiedPaid.occurredAt, authoritativeSubscription: verifiedPaid.subscription,
    }), "applied");
    [member] = await db.select().from(householdMembers).where(eq(householdMembers.id, result.memberId));
    assert.equal(member.status, "active");
    const firstActivatedAt = member.activatedAt?.getTime();
    assert.equal(await syncHouseholdStripeEvent(stripe, {
      subscriptionId: "sub_family", kind: "paid", occurredAt: verifiedPaid.occurredAt,
      authoritativeSubscription: verifiedPaid.subscription,
    }), "applied");
    [member] = await db.select().from(householdMembers).where(eq(householdMembers.id, result.memberId));
    assert.equal(member.activatedAt?.getTime(), firstActivatedAt);
    [operation] = await db.select().from(householdBillingOperations)
      .where(eq(householdBillingOperations.id, checkoutMetadata.operationId));
    assert.equal(operation.status, "completed");
    assert.equal((await accountOrsaMembership({
      id: sponsoredUserId, email: sponsoredEmail, emailVerified: true,
    })).orsaVerified, true);
    const [updatedHousehold] = await db.select().from(households).where(eq(households.id, householdId));
    assert.equal(updatedHousehold.stripeSubscriptionStatus, "active");
    assert.equal(updatedHousehold.lastPaymentFailureAt, null);
  } finally {
    await cleanupHouseholdFixture(householdId);
  }
});

test("DB integration: household quantity changes never prorate and final removal cancels without quantity zero", async () => {
  const householdId = randomUUID();
  const primaryUserId = `primary_${randomUUID()}`;
  const firstMemberId = randomUUID();
  const secondMemberId = randomUUID();
  const quantities: Array<{ quantity: number; proration: string }> = [];
  const subscriptionUpdates: any[] = [];
  try {
    await db.insert(households).values({
      id: householdId, primaryUserId, stripeCustomerId: "cus_family",
      stripeSubscriptionId: "sub_family", stripeSubscriptionItemId: "si_family",
      stripeSubscriptionStatus: "active",
    });
    await db.insert(householdMembers).values([
      { id: firstMemberId, householdId, normalizedEmail: `one_${randomUUID()}@example.com`, status: "active" },
      { id: secondMemberId, householdId, normalizedEmail: `two_${randomUUID()}@example.com`, status: "invited" },
    ]);
    const stripe = {
      subscriptionItems: { update: async (_id: string, value: any) => { quantities.push({ quantity: value.quantity, proration: value.proration_behavior }); } },
      subscriptions: { update: async (_id: string, value: any) => { subscriptionUpdates.push(value); } },
    } as unknown as Stripe;
    await setSponsoredSeatStatus(householdId, secondMemberId, "active", stripe);
    assert.deepEqual(quantities, [{ quantity: 2, proration: "none" }]);
    await setSponsoredSeatStatus(householdId, secondMemberId, "removed", stripe);
    await setSponsoredSeatStatus(householdId, firstMemberId, "removed", stripe);
    assert.deepEqual(quantities.map((entry) => entry.quantity), [2, 1]);
    assert.deepEqual(subscriptionUpdates[subscriptionUpdates.length - 1], { cancel_at_period_end: true });
    assert.equal(quantities.some((entry) => entry.quantity === 0), false);
  } finally {
    await cleanupHouseholdFixture(householdId);
  }
});

test("DB integration: household failure removes sponsored entitlement and paid recovery restores it", async () => {
  const householdId = randomUUID();
  const primaryUserId = `primary_${randomUUID()}`;
  const sponsoredUserId = `sponsored_${randomUUID()}`;
  const sponsoredEmail = `paid_${randomUUID()}@example.com`;
  const metadata = { householdId, memberId: randomUUID(), operationId: randomUUID(), sal_product: "orsa_family_seat_v1" };
  try {
    await db.insert(households).values({
      id: householdId, primaryUserId, stripeCustomerId: "cus_family",
      stripeSubscriptionId: "sub_family", stripeSubscriptionItemId: "si_family",
      stripeSubscriptionStatus: "active",
    });
    await db.insert(householdMembers).values({
      id: metadata.memberId, householdId, normalizedEmail: sponsoredEmail, status: "active",
    });
    const stripe = { subscriptions: { retrieve: async () => ({
      id: "sub_family", status: "active", customer: "cus_family", cancel_at_period_end: false,
      metadata, items: { data: [{ id: "si_family" }] },
    }) } } as unknown as Stripe;
    assert.equal((await accountOrsaMembership({ id: sponsoredUserId, email: sponsoredEmail, emailVerified: true })).orsaVerified, true);
    const failedAt = new Date(Date.now() + 10_000);
    await syncHouseholdStripeEvent(stripe, { subscriptionId: "sub_family", kind: "failed", failureMessage: "card failed", occurredAt: failedAt });
    assert.equal((await accountOrsaMembership({ id: sponsoredUserId, email: sponsoredEmail, emailVerified: true })).orsaVerified, false);
    await syncHouseholdStripeEvent(stripe, { subscriptionId: "sub_family", kind: "paid", occurredAt: new Date(failedAt.getTime() - 1000) });
    assert.equal((await accountOrsaMembership({ id: sponsoredUserId, email: sponsoredEmail, emailVerified: true })).orsaVerified, false);
    await syncHouseholdStripeEvent(stripe, { subscriptionId: "sub_family", kind: "paid", occurredAt: new Date(failedAt.getTime() + 1000) });
    assert.equal((await accountOrsaMembership({ id: sponsoredUserId, email: sponsoredEmail, emailVerified: true })).orsaVerified, true);
  } finally {
    await cleanupHouseholdFixture(householdId);
  }
});

test("DB integration: repeated worker runs cannot duplicate a household seat mutation", async () => {
  const householdId = randomUUID();
  const memberId = randomUUID();
  let providerMutations = 0;
  try {
    await db.insert(households).values({
      id: householdId,
      primaryUserId: `primary_${randomUUID()}`,
      stripeCustomerId: "cus_worker_family",
      stripeSubscriptionId: "sub_worker_family",
      stripeSubscriptionItemId: "si_worker_family",
      stripeSubscriptionStatus: "active",
    });
    await db.insert(householdMembers).values({
      id: memberId,
      householdId,
      normalizedEmail: `worker_${randomUUID()}@example.test`,
      status: "invited",
    });
    const stale = new Date(Date.now() - ORSA_RECONCILIATION_STALE_MS - 1000);
    await db.insert(householdBillingOperations).values({
      householdId,
      memberId,
      targetStatus: "active",
      createdAt: stale,
      updatedAt: stale,
    });
    const stripe = {
      subscriptionItems: {
        update: async (_id: string, value: any, options: any) => {
          providerMutations += 1;
          assert.equal(value.quantity, 1);
          assert.equal(options.idempotencyKey.length > 0, true);
        },
      },
      subscriptions: { update: async () => ({}) },
    } as unknown as Stripe;
    const now = new Date();
    const [first, second] = await Promise.all([
      reconcileOrsaBilling(stripe, { now, batchSize: 20 }),
      reconcileOrsaBilling(stripe, { now, batchSize: 20 }),
    ]);
    assert.equal(first.completed + second.completed >= 1, true);
    assert.equal(providerMutations, 1);
    const [member] = await db.select().from(householdMembers).where(eq(householdMembers.id, memberId));
    assert.equal(member.status, "active");
  } finally {
    await cleanupHouseholdFixture(householdId);
    await db.delete(salNotifications).where(eq(salNotifications.type, "orsa_reconciliation_completed"));
  }
});

test("DB integration: repeated worker runs activate one NER binding and configure one schedule", async () => {
  const enrollmentId = randomUUID();
  const subscriptionId = `sub_worker_${randomUUID()}`;
  let scheduleCreates = 0;
  let scheduleUpdates = 0;
  try {
    const stale = new Date(Date.now() - ORSA_RECONCILIATION_STALE_MS - 1000);
    await db.insert(nerEnrollments).values({
      id: enrollmentId,
      userId: `user_${randomUUID()}`,
      createdAt: stale,
      updatedAt: stale,
    });
    await db.insert(nerSubscriptionBindings).values({
      enrollmentId,
      stripeSubscriptionId: subscriptionId,
      checkoutSessionId: `cs_${randomUUID()}`,
      createdAt: stale,
    });
    const stripe = {
      subscriptions: {
        retrieve: async () => ({
          id: subscriptionId,
          status: "active",
          customer: "cus_worker_ner",
          items: { data: [{ price: { id: "price_worker_ner" }, quantity: 1 }] },
        }),
        update: async () => ({}),
      },
      subscriptionSchedules: {
        create: async (_value: any, options: any) => {
          scheduleCreates += 1;
          assert.match(options.idempotencyKey, new RegExp(enrollmentId));
          return { id: "sched_worker_ner" };
        },
        retrieve: async () => ({ current_phase: { start_date: 100, end_date: 200 } }),
        update: async (_id: string, _value: any, options: any) => {
          scheduleUpdates += 1;
          assert.match(options.idempotencyKey, new RegExp(enrollmentId));
          return {};
        },
      },
    } as unknown as Stripe;
    const now = new Date();
    const [first, second] = await Promise.all([
      reconcileOrsaBilling(stripe, { now }),
      reconcileOrsaBilling(stripe, { now }),
    ]);
    assert.equal(first.completed + second.completed, 2);
    assert.equal(scheduleCreates, 1);
    assert.equal(scheduleUpdates, 1);
    const [binding] = await db.select().from(nerSubscriptionBindings)
      .where(eq(nerSubscriptionBindings.stripeSubscriptionId, subscriptionId));
    assert.equal(binding.state, "active");
  } finally {
    await cleanupNerFixture(enrollmentId);
    await db.delete(salNotifications).where(eq(salNotifications.type, "orsa_reconciliation_completed"));
  }
});

test("DB integration: repeated worker runs cannot duplicate installments or external registration", { concurrency: false }, async () => {
  const enrollmentId = randomUUID();
  const invoiceId = `in_worker_${randomUUID()}`;
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NER_API_URL;
  const originalPath = process.env.NER_REGISTRATION_PATH;
  let registrations = 0;
  try {
    process.env.NER_API_URL = "https://ner.example.test";
    process.env.NER_REGISTRATION_PATH = "/registrations";
    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      registrations += 1;
      assert.equal(new Headers(init?.headers).get("idempotency-key"), `ner-registration:${enrollmentId}`);
      return new Response(JSON.stringify({ reference: "registry-reference" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const stale = new Date(Date.now() - ORSA_RECONCILIATION_STALE_MS - 1000);
    await db.insert(nerEnrollments).values({
      id: enrollmentId,
      userId: `user_${randomUUID()}`,
      paidInstallmentCount: 1,
      status: "provisional",
      externalStatus: "not_requested",
      createdAt: stale,
      updatedAt: stale,
    });
    await db.insert(nerInstallments).values({
      enrollmentId,
      stripeInvoiceId: invoiceId,
      amountPaid: 250,
      paidAt: stale,
    });
    const stripe = {} as Stripe;
    const now = new Date();
    const [first, second] = await Promise.all([
      reconcileOrsaBilling(stripe, { now }),
      reconcileOrsaBilling(stripe, { now }),
    ]);
    assert.equal(first.completed + second.completed, 1);
    assert.equal(first.retrying + second.retrying, 1);
    assert.equal(registrations, 1);
    const installments = await db.select().from(nerInstallments).where(eq(nerInstallments.enrollmentId, enrollmentId));
    assert.equal(installments.length, 1);
    const [enrollment] = await db.select().from(nerEnrollments).where(eq(nerEnrollments.id, enrollmentId));
    assert.equal(enrollment.paidInstallmentCount, 1);
    assert.equal(enrollment.externalStatus, "registered");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NER_API_URL;
    else process.env.NER_API_URL = originalUrl;
    if (originalPath === undefined) delete process.env.NER_REGISTRATION_PATH;
    else process.env.NER_REGISTRATION_PATH = originalPath;
    await cleanupNerFixture(enrollmentId);
    await db.delete(salNotifications).where(eq(salNotifications.type, "orsa_reconciliation_completed"));
  }
});

test("DB integration: permanently failed recovery creates one generic concierge alert", async () => {
  const householdId = randomUUID();
  const memberId = randomUUID();
  try {
    await db.insert(households).values({
      id: householdId,
      primaryUserId: `primary_${randomUUID()}`,
      stripeSubscriptionId: "sub_missing_worker",
      stripeSubscriptionItemId: "si_missing_worker",
      stripeSubscriptionStatus: "active",
    });
    await db.insert(householdMembers).values({
      id: memberId,
      householdId,
      normalizedEmail: `failed_worker_${randomUUID()}@example.test`,
      status: "invited",
    });
    const stale = new Date(Date.now() - ORSA_RECONCILIATION_STALE_MS - 1000);
    const [operation] = await db.insert(householdBillingOperations).values({
      householdId,
      memberId,
      targetStatus: "active",
      reconciliationAttemptCount: 4,
      createdAt: stale,
      updatedAt: stale,
    }).returning();
    const missing: any = new Error("contains private provider details");
    missing.code = "resource_missing";
    const stripe = {
      subscriptionItems: { update: async () => { throw missing; } },
      subscriptions: { update: async () => { throw missing; } },
    } as unknown as Stripe;
    const now = new Date();
    assert.equal((await reconcileOrsaBilling(stripe, { now })).failedPermanent, 1);
    assert.equal((await reconcileOrsaBilling(stripe, { now: new Date(now.getTime() + 1000) })).scanned, 0);
    const [failed] = await db.select().from(householdBillingOperations).where(eq(householdBillingOperations.id, operation.id));
    assert.equal(failed.status, "failed_permanent");
    const alerts = await db.select().from(salNotifications).where(eq(salNotifications.type, "orsa_reconciliation_failed_permanent"));
    const matching = alerts.filter((alert) => {
      const payload = JSON.parse(alert.payload || "{}");
      return payload.kind === "household" && payload.outcome === "failed_permanent";
    });
    assert.equal(matching.length, 1);
    assert.equal(matching[0].payload?.includes(operation.id), false);
    assert.equal(matching[0].payload?.includes("private provider details"), false);
  } finally {
    await cleanupHouseholdFixture(householdId);
    await db.delete(salNotifications).where(eq(salNotifications.type, "orsa_reconciliation_failed_permanent"));
  }
});

test("DB integration: worker recovers an interruption before first-seat Checkout was persisted", async () => {
  const householdId = randomUUID();
  const memberId = randomUUID();
  let checkoutCreates = 0;
  try {
    await db.insert(households).values({
      id: householdId,
      primaryUserId: `primary_${randomUUID()}`,
    });
    await db.insert(householdMembers).values({
      id: memberId,
      householdId,
      normalizedEmail: `checkout_worker_${randomUUID()}@example.test`,
      status: "invited",
    });
    const stale = new Date(Date.now() - ORSA_RECONCILIATION_STALE_MS - 1000);
    const [operation] = await db.insert(householdBillingOperations).values({
      householdId,
      memberId,
      targetStatus: "active",
      checkoutSuccessUrl: "https://app.example.test/orsa?success=1",
      checkoutCancelUrl: "https://app.example.test/orsa?cancel=1",
      createdAt: stale,
      updatedAt: stale,
    }).returning();
    const stripe = {
      customers: { create: async () => ({ id: "cus_recovered_checkout" }) },
      products: {
        search: async () => ({ data: [{ id: "prod_family" }] }),
        create: async () => { throw new Error("not expected"); },
      },
      prices: {
        list: async () => ({ data: [{ id: "price_family", unit_amount: 300, currency: "usd", recurring: { interval: "month" } }] }),
        create: async () => { throw new Error("not expected"); },
      },
      checkout: { sessions: {
        create: async (value: any, options: any) => {
          checkoutCreates += 1;
          assert.equal(options.idempotencyKey, `household-checkout:${operation.id}`);
          assert.equal(value.success_url, "https://app.example.test/orsa?success=1");
          return {
            id: "cs_recovered_checkout",
            url: "https://checkout.example.test/recovered",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          };
        },
      } },
    } as unknown as Stripe;
    const summary = await reconcileOrsaBilling(stripe, { now: new Date() });
    assert.equal(summary.retrying, 1);
    assert.equal(checkoutCreates, 1);
    const [updated] = await db.select().from(householdBillingOperations).where(eq(householdBillingOperations.id, operation.id));
    assert.equal(updated.checkoutSessionId, "cs_recovered_checkout");
    assert.equal(updated.status, "pending");
  } finally {
    await cleanupHouseholdFixture(householdId);
  }
});