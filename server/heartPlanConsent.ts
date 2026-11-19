import { z } from "zod";
import {
  HEARTPLAN_PRIVACY,
  HEARTPLAN_SIGNUP_SOURCE,
  HEARTPLAN_TCPA,
  HEARTPLAN_TERMS,
} from "@shared/heartPlanConsent";
import {
  HEARTPLAN_PRIVACY_SNAPSHOT,
} from "@shared/legalPolicySnapshots";
import { HEARTPLAN_TERMS_CURRENT_SNAPSHOT } from "@shared/heartPlanTerms2026";
import { LIFE_INSURANCE_COVERAGE_VALUES } from "@shared/heartPlanLifeInsurance";

export const heartPlanRegistrationSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  lifeInsuranceCoverage: z.enum(LIFE_INSURANCE_COVERAGE_VALUES).optional(),
  consent: z.object({
    termsAccepted: z.literal(true),
    privacyAcknowledged: z.literal(true),
    communicationsConsent: z.boolean(),
    source: z.literal(HEARTPLAN_SIGNUP_SOURCE),
  }),
});

export function buildHeartPlanConsentRecords(
  userId: string,
  consent: z.infer<typeof heartPlanRegistrationSchema>["consent"],
) {
  return [
    {
      userId,
      consentType: "terms",
      decision: true,
      documentVersion: HEARTPLAN_TERMS.version,
      sourceUrl: HEARTPLAN_TERMS.publishedUrl,
      contentHash: HEARTPLAN_TERMS.contentHash,
      disclosureText: HEARTPLAN_TERMS_CURRENT_SNAPSHOT,
      signupSource: consent.source,
    },
    {
      userId,
      consentType: "privacy",
      decision: true,
      documentVersion: HEARTPLAN_PRIVACY.version,
      sourceUrl: HEARTPLAN_PRIVACY.publishedUrl,
      contentHash: HEARTPLAN_PRIVACY.contentHash,
      disclosureText: HEARTPLAN_PRIVACY_SNAPSHOT,
      signupSource: consent.source,
    },
    {
      userId,
      consentType: "communications",
      decision: consent.communicationsConsent,
      documentVersion: HEARTPLAN_TCPA.version,
      sourceUrl: HEARTPLAN_TCPA.path,
      contentHash: HEARTPLAN_TCPA.contentHash,
      disclosureText: HEARTPLAN_TCPA.disclosure,
      signupSource: consent.source,
    },
  ];
}