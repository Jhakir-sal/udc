import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  HEARTPLAN_SIGNUP_SOURCE,
  HEARTPLAN_TCPA,
  HEARTPLAN_TERMS,
  HEARTPLAN_PRIVACY,
} from "@shared/heartPlanConsent";
import {
  HEARTPLAN_PRIVACY_SNAPSHOT,
  HEARTPLAN_TERMS_SNAPSHOT,
} from "@shared/legalPolicySnapshots";
import { HEARTPLAN_TERMS_CURRENT_SNAPSHOT } from "@shared/heartPlanTerms2026";
import {
  buildHeartPlanConsentRecords,
  heartPlanRegistrationSchema,
} from "./heartPlanConsent";

const baseRegistration = {
  email: "Planner@Example.com",
  password: "ValidPassword!234",
  firstName: "Plan",
  lastName: "Ner",
  consent: {
    termsAccepted: true,
    privacyAcknowledged: true,
    communicationsConsent: true,
    source: HEARTPLAN_SIGNUP_SOURCE,
  },
} as const;

test("terms and privacy are required while communications consent may be declined", () => {
  assert.equal(heartPlanRegistrationSchema.safeParse(baseRegistration).success, true);
  assert.equal(heartPlanRegistrationSchema.safeParse({
    ...baseRegistration,
    consent: { ...baseRegistration.consent, termsAccepted: false },
  }).success, false);
  assert.equal(heartPlanRegistrationSchema.safeParse({
    ...baseRegistration,
    consent: { ...baseRegistration.consent, privacyAcknowledged: false },
  }).success, false);
  assert.equal(heartPlanRegistrationSchema.safeParse({
    ...baseRegistration,
    consent: { ...baseRegistration.consent, communicationsConsent: false },
  }).success, true);
  assert.equal(heartPlanRegistrationSchema.safeParse({
    ...baseRegistration,
    consent: { ...baseRegistration.consent, source: "forged" },
  }).success, false);
});

test("audit records retain exact snapshots, hashes, versions, source, and decline", () => {
  const records = buildHeartPlanConsentRecords("user-1", baseRegistration.consent);
  assert.deepEqual(records.map((record) => [record.consentType, record.decision]), [
    ["terms", true],
    ["privacy", true],
    ["communications", true],
  ]);
  assert.equal(records[0].disclosureText, HEARTPLAN_TERMS_CURRENT_SNAPSHOT);
  assert.ok(HEARTPLAN_TERMS_CURRENT_SNAPSHOT.startsWith(HEARTPLAN_TERMS_SNAPSHOT));
  assert.match(HEARTPLAN_TERMS_CURRENT_SNAPSHOT, /Any paid HeartPlan purchase is a preparation fee/);
  assert.match(HEARTPLAN_TERMS_CURRENT_SNAPSHOT, /not a payment for or toward final Steps After Life concierge services/);
  assert.doesNotMatch(HEARTPLAN_TERMS_CURRENT_SNAPSHOT, /\$500|\$1,500|\$3,000/);
  assert.doesNotMatch(HEARTPLAN_TERMS_SNAPSHOT, /Final Concierge Services/);
  assert.equal(records[1].disclosureText, HEARTPLAN_PRIVACY_SNAPSHOT);
  assert.equal(records[2].disclosureText, HEARTPLAN_TCPA.disclosure);
  assert.equal(records[0].documentVersion, HEARTPLAN_TERMS.version);
  assert.equal(records[1].documentVersion, HEARTPLAN_PRIVACY.version);
  assert.equal(records[2].signupSource, HEARTPLAN_SIGNUP_SOURCE);

  for (const record of records) {
    assert.equal(
      crypto.createHash("sha256").update(record.disclosureText).digest("hex"),
      record.contentHash,
    );
  }
});