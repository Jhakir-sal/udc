import assert from "node:assert/strict";
import test from "node:test";
import { canDecideReferral, canSendReferralProgress, safeMilestoneLabel, safeProgress } from "./referralSharing";

test("only a pending referral may win a family decision transition", () => {
  assert.equal(canDecideReferral("pending_family_confirmation"), true);
  for (const status of ["confirmed", "declined", "revoked"]) {
    assert.equal(canDecideReferral(status), false);
  }
});

test("default denies progress before confirmation and after terminal states", () => {
  for (const referralStatus of ["pending_family_confirmation", "declined", "revoked"]) {
    assert.equal(canSendReferralProgress({ referralStatus, companyActive: true, taskKey: "case_created", completed: true }), false);
  }
  assert.equal(canSendReferralProgress({ referralStatus: "confirmed", companyActive: false, taskKey: "case_created", completed: true }), false);
});

test("safe projection contains only broad labels and aggregate completion", () => {
  const value = safeProgress([
    { taskKey: "certificate_uploaded", completed: true },
    { taskKey: "accounts_added", completed: false },
    { taskKey: "unknown_private_task", completed: true },
  ]);
  assert.deepEqual(Object.keys(value).sort(), ["completedCount", "completedMilestones", "percent", "totalCount"]);
  assert.deepEqual(value.completedMilestones, ["Required intake received"]);
  assert.equal(JSON.stringify(value).includes("certificate"), false);
});

test("all internal task keys map to intentionally broad external labels", () => {
  for (const key of ["case_created", "certificate_uploaded", "verified_blockchain", "accounts_added", "notifications_sent", "gov_agencies_notified", "credit_protection", "insurance_benefits", "case_complete"]) {
    assert.ok(safeMilestoneLabel(key));
  }
  assert.equal(safeMilestoneLabel("notes"), null);
});