export const HEARTPLAN_SIGNUP_SOURCE = "heartplan_web_registration";

export const HEARTPLAN_TERMS = {
  version: "2026-09-27.2",
  path: "/legal/terms",
  publishedUrl: "/legal/terms",
  contentHash: "c1e6aab4924233a7fb0f072f795c327e3b87662e2507d12fee3b515035013778",
  title: "Terms of Use",
} as const;

export const HEARTPLAN_PRIVACY = {
  version: "published-page-observed-2026-08-30",
  path: "/legal/privacy",
  publishedUrl: "https://stepsafterlife.com/privacy-policy/",
  contentHash: "8f17f0efbf0a0a72b9c3989a977c3fc0585accb0b1a777671581505423249008",
  title: "Privacy Policy",
} as const;

export const HEARTPLAN_TCPA = {
  version: "2026-08-30",
  path: "/legal/tcpa",
  title: "TCPA Disclosure",
  contentHash: "35b786e734df6d11609e9ecc8e64dd29be5dc835ee0c6256ac9ecc2ec9a0136e",
  disclosure: "I agree to receive calls, texts, and emails from Steps After Life and its affiliates. Msg & data rates may apply. Consent is not required to purchase.",
} as const;

export type HeartPlanSignupConsentInput = {
  termsAccepted: true;
  privacyAcknowledged: true;
  communicationsConsent: boolean;
  source: typeof HEARTPLAN_SIGNUP_SOURCE;
};