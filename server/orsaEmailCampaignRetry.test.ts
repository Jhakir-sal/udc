import test from "node:test";
import assert from "node:assert/strict";
import { eligibleRetryRecipients, matchesRetrySnapshot, pendingSnapshotRecipients } from "./orsaEmailCampaignRetry";
import type { RetryDeliveryRecord } from "./orsaEmailCampaignRetry";

const held: RetryDeliveryRecord = {
  id: "delivery-a", memberId: "a", email: "a@example.test", status: "needs_review",
  trackingTokenHash: "original", attemptedAt: new Date("2026-09-29T14:00:00Z"),
  sentAt: null, firstOpenedAt: null, firstClickedAt: null,
};
const candidate = { id: "a", email: "a@example.test" };

test("only exact held unengaged deliveries with no opt-out can enter a retry preview", () => {
  assert.equal(eligibleRetryRecipients([candidate], [held], new Set()).length, 1);
  for (const status of ["sent", "sending", "skipped"]) {
    assert.equal(eligibleRetryRecipients([candidate], [{ ...held, status }], new Set()).length, 0);
  }
  for (const field of ["sentAt", "firstOpenedAt", "firstClickedAt"] as const) {
    assert.equal(eligibleRetryRecipients([candidate], [{ ...held, [field]: new Date() }], new Set()).length, 0);
  }
  assert.equal(eligibleRetryRecipients([candidate], [held], new Set([candidate.email])).length, 0);
  assert.equal(eligibleRetryRecipients([{ ...candidate, email: "changed@example.test" }], [held], new Set()).length, 0);
  assert.equal(eligibleRetryRecipients([{ ...candidate, id: "different-member" }], [held], new Set()).length, 0);
  assert.equal(eligibleRetryRecipients([candidate], [held, { ...held, id: "other", memberId: "other", status: "sent" }], new Set()).length, 0);
});

test("a snapshot cannot include new recipients or reuse a delivery after its attempt hash changed", () => {
  const [snapshot] = eligibleRetryRecipients([candidate], [held], new Set());
  assert.ok(matchesRetrySnapshot(snapshot, snapshot));
  assert.equal(matchesRetrySnapshot(snapshot, { ...snapshot, priorTrackingTokenHash: "new-attempt" }), false);
  assert.deepEqual(pendingSnapshotRecipients([snapshot], [
    { ...snapshot, priorTrackingTokenHash: "new-attempt" }, { id: "new", email: "new@example.test" },
  ]), []);
});