// Different challenges share a legacy storage field. Never accept a login or
// password-reset code as proof that someone received an enrollment text.
export function phoneEnrollmentCode(code: string): string {
  return `phone_enroll_${code}`;
}

export function mfaCode(code: string): string {
  return `mfa_${code}`;
}

export function matchesPhoneEnrollmentCode(stored: string | null, entered: unknown): boolean {
  return typeof entered === "string" && /^\d{6}$/.test(entered) && stored === phoneEnrollmentCode(entered);
}

export function matchesMfaCode(stored: string | null, entered: unknown): boolean {
  return typeof entered === "string" && /^\d{6}$/.test(entered) && stored === mfaCode(entered);
}