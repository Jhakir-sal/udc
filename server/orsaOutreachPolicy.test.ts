import test from "node:test";
import assert from "node:assert/strict";
import { buildOutreachMembers, inOutreachGroup, type OutreachRosterRecord } from "./orsaOutreachPolicy";

const now = new Date("2026-11-16T16:00:00Z");
function member(id: string, overrides: Partial<OutreachRosterRecord> = {}): OutreachRosterRecord {
  return {
    id, displayName: id, normalizedEmail: `${id}@example.invalid`, normalizedPhone: "2025550101",
    sharedEligibilityEmail: null, active: true, invitationStatus: "pending",
    invitationFirstAttemptAt: null, invitationAttemptedAt: null, invitationSentAt: null,
    invitationAcceptedAt: null, invitationAcceptedUserId: null, ...overrides,
  };
}
const base = () => ({
  roster: [member("new")], emailDeliveries: [], sms: [],
  emailOptOuts: new Set<string>(), smsStops: new Set<string | null>(), accountEmails: new Set<string>(),
});

test("first contact groups use both channels without treating SMS as an email", () => {
  const input = base();
  const [fresh] = buildOutreachMembers(input);
  assert.equal(inOutreachGroup(fresh, "no_outreach"), true);
  assert.equal(fresh.canEmail, true);
  assert.equal(fresh.canText, true);
  const [texted] = buildOutreachMembers({
    ...input,
    sms: [{ phone: "+12025550101", status: "submitted", optedOutAt: null, attemptedAt: now, submittedAt: now, deliveryStatus: "queued" }],
  });
  assert.equal(texted.smsState, "submitted");
  assert.equal(texted.canText, false);
  assert.equal(texted.canEmail, true);
  assert.equal(inOutreachGroup(texted, "no_outreach"), false);
  assert.equal(inOutreachGroup(texted, "needs_review"), true);
});

test("SMS STOP is never retextable; email suppression is independent and explicit", () => {
  const [smsStop] = buildOutreachMembers({ ...base(), smsStops: new Set(["+12025550101"]) });
  assert.equal(smsStop.smsState, "opted_out");
  assert.equal(smsStop.canText, false);
  assert.equal(smsStop.canEmail, true);
  assert.equal(inOutreachGroup(smsStop, "opted_out"), true);
  assert.equal(inOutreachGroup(smsStop, "no_outreach"), true);
  assert.equal(inOutreachGroup(smsStop, "sms_opted_out"), true);
  assert.equal(inOutreachGroup(smsStop, "not_texted"), true);
  const [emailStop] = buildOutreachMembers({ ...base(), emailOptOuts: new Set(["new@example.invalid"]) });
  assert.equal(emailStop.canEmail, false);
  assert.equal(emailStop.smsState, "not_contacted");
  // "canText" is only the history/contact filter, not consent or send approval.
  assert.equal(emailStop.canText, true);
});

test("contact populations partition history independently of eligibility and suppression", () => {
  const rows = buildOutreachMembers({
    ...base(),
    roster: [
      member("neither", { normalizedPhone: null }),
      member("email", { normalizedPhone: "2025550102", invitationStatus: "sent", invitationSentAt: now }),
      member("text", { normalizedPhone: "2025550103" }),
      member("both", { normalizedPhone: "2025550104", invitationStatus: "failed", invitationFirstAttemptAt: now }),
    ],
    emailOptOuts: new Set(["neither@example.invalid", "both@example.invalid"]),
    sms: ["2025550103", "2025550104"].map(phone => ({
      phone, status: "submitted", attemptedAt: now, submittedAt: now,
      optedOutAt: phone.endsWith("4") ? now : null, deliveryStatus: "queued",
    })),
  });
  const ids = (group: Parameters<typeof inOutreachGroup>[1]) =>
    rows.filter(row => inOutreachGroup(row, group)).map(row => row.id);
  assert.deepEqual(ids("emailed"), ["email", "both"]);
  assert.deepEqual(ids("texted"), ["text", "both"]);
  assert.deepEqual(ids("both_contacted"), ["both"]);
  assert.deepEqual(ids("email_only"), ["email"]);
  assert.deepEqual(ids("sms_only"), ["text"]);
  assert.deepEqual(ids("no_outreach"), ["neither"]);
  assert.deepEqual(ids("not_emailed"), ["neither", "text"]);
  assert.deepEqual(ids("not_texted"), ["neither", "email"]);
  assert.deepEqual(ids("sms_opted_out"), ["both"]);
  assert.deepEqual(ids("email_opted_out"), ["neither", "both"]);
  assert.equal(rows[0].canEmail, false, "History group membership never grants send eligibility");
  assert.equal(rows[3].canText, false);
});

test("any campaign claim or invitation attempt blocks never-emailed, including changed addresses", () => {
  for (const status of ["sent", "sending", "needs_review", "skipped"]) {
    const [row] = buildOutreachMembers({
      ...base(), emailDeliveries: [{ memberId: "new", normalizedEmail: "old@example.invalid", status, attemptedAt: now, sentAt: status === "sent" ? now : null }],
    });
    assert.equal(row.emailAttempted, true);
    assert.equal(row.canEmail, false);
    assert.equal(inOutreachGroup(row, "not_emailed"), false);
  }
  const [invited] = buildOutreachMembers({ ...base(), roster: [member("new", { invitationStatus: "failed", invitationFirstAttemptAt: now })] });
  assert.equal(invited.emailState, "needs_review");
  assert.equal(invited.canEmail, false);
});

test("old member IDs, shared contact details, existing accounts and inactive records cannot become a new audience", () => {
  const [oldEmail] = buildOutreachMembers({
    ...base(), emailDeliveries: [{ memberId: "removed", normalizedEmail: "new@example.invalid", status: "needs_review", attemptedAt: now, sentAt: null }],
  });
  assert.equal(oldEmail.canEmail, false);
  const shared = buildOutreachMembers({ ...base(), roster: [member("one"), member("two")] });
  assert.equal(shared.every(row => row.smsState === "shared_contact" && !row.canText), true);
  const [signedUp] = buildOutreachMembers({ ...base(), accountEmails: new Set(["new@example.invalid"]) });
  assert.equal(signedUp.canEmail, false);
  assert.equal(signedUp.canText, false);
  assert.deepEqual(buildOutreachMembers({ ...base(), roster: [member("inactive", { active: false })] }), []);
});

test("confirmed delivery and failed delivery remain distinct from submission", () => {
  for (const [status, expected] of [["delivered", "delivered"], ["SendingFailed", "failed"], ["queued", "submitted"]] as const) {
    const [row] = buildOutreachMembers({
      ...base(), sms: [{ phone: "+12025550101", status: "submitted", optedOutAt: null, attemptedAt: now, submittedAt: now, deliveryStatus: status }],
    });
    assert.equal(row.smsState, expected);
    assert.equal(row.canText, false);
  }
});
