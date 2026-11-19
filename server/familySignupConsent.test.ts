import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { familySignupConsentSchema, buildFamilySignupConsentRecords, FAMILY_SIGNUP_SOURCE, FAMILY_INVITATION_SOURCE } from "./familySignupConsent";

test("family signup requires terms and privacy but not communications opt-in", () => {
  for (const communicationsConsent of [true, false]) {
    const consent = { termsAccepted: true, privacyAcknowledged: true, communicationsConsent } as const;
    assert.equal(familySignupConsentSchema.safeParse(consent).success, true);
    const records = buildFamilySignupConsentRecords("family-user", consent, FAMILY_SIGNUP_SOURCE);
    assert.deepEqual(records.map(({ consentType, decision }) => [consentType, decision]), [
      ["terms", true], ["privacy", true], ["communications", communicationsConsent],
    ]);
    for (const record of records) {
      assert.equal(createHash("sha256").update(record.disclosureText).digest("hex"), record.contentHash);
      assert.equal(record.signupSource, FAMILY_SIGNUP_SOURCE);
      assert.ok(record.documentVersion && record.sourceUrl);
    }
    assert.equal(buildFamilySignupConsentRecords("family-user", consent, FAMILY_INVITATION_SOURCE)[0].signupSource, FAMILY_INVITATION_SOURCE);
  }
  assert.equal(familySignupConsentSchema.safeParse({ termsAccepted: false, privacyAcknowledged: true, communicationsConsent: false }).success, false);
  assert.equal(familySignupConsentSchema.safeParse({ termsAccepted: true, privacyAcknowledged: false, communicationsConsent: false }).success, false);
  assert.equal(familySignupConsentSchema.safeParse({ termsAccepted: true, privacyAcknowledged: true }).success, false);
});

test("all account creation screens include separate required terms and optional TCPA", () => {
  for (const path of ["../client/src/pages/register.tsx", "../client/src/pages/family-register.tsx", "../client/src/pages/heartplan-register.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /<SignupConsent /);
  }
});