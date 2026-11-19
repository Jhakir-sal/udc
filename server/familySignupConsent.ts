import { z } from "zod";
import { HEARTPLAN_PRIVACY, HEARTPLAN_TCPA, HEARTPLAN_TERMS } from "@shared/heartPlanConsent";
import { HEARTPLAN_PRIVACY_SNAPSHOT } from "@shared/legalPolicySnapshots";
import { HEARTPLAN_TERMS_CURRENT_SNAPSHOT } from "@shared/heartPlanTerms2026";

export const FAMILY_SIGNUP_SOURCE = "family_web_registration";
export const FAMILY_INVITATION_SOURCE = "family_invitation_registration";

export const familySignupConsentSchema = z.object({
  termsAccepted: z.literal(true),
  privacyAcknowledged: z.literal(true),
  communicationsConsent: z.boolean(),
}).strict();

export function buildFamilySignupConsentRecords(
  userId: string,
  consent: z.infer<typeof familySignupConsentSchema>,
  signupSource: typeof FAMILY_SIGNUP_SOURCE | typeof FAMILY_INVITATION_SOURCE,
) {
  return [
    {
      userId, consentType: "terms", decision: true,
      documentVersion: HEARTPLAN_TERMS.version, sourceUrl: HEARTPLAN_TERMS.publishedUrl,
      contentHash: HEARTPLAN_TERMS.contentHash, disclosureText: HEARTPLAN_TERMS_CURRENT_SNAPSHOT, signupSource,
    },
    {
      userId, consentType: "privacy", decision: true,
      documentVersion: HEARTPLAN_PRIVACY.version, sourceUrl: HEARTPLAN_PRIVACY.publishedUrl,
      contentHash: HEARTPLAN_PRIVACY.contentHash, disclosureText: HEARTPLAN_PRIVACY_SNAPSHOT, signupSource,
    },
    {
      userId, consentType: "communications", decision: consent.communicationsConsent,
      documentVersion: HEARTPLAN_TCPA.version, sourceUrl: HEARTPLAN_TCPA.path,
      contentHash: HEARTPLAN_TCPA.contentHash, disclosureText: HEARTPLAN_TCPA.disclosure, signupSource,
    },
  ];
}