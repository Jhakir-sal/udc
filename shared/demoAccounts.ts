export const DEMO_ACCOUNT_EMAILS = [
  "georgemilian1@gmail.com",
  "dashventuresllc1@gmail.com",
  "hello@stepsafterlife.com",
] as const;

export const DEMO_EXPERIENCE_SELECTOR_EMAIL = "hello@stepsafterlife.com";

export function normalizeAccountEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() || "";
}

export function isDemoAccountEmail(email: string | null | undefined): boolean {
  const normalized = normalizeAccountEmail(email);
  return (DEMO_ACCOUNT_EMAILS as readonly string[]).includes(normalized);
}