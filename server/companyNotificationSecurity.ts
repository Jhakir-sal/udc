import crypto from "crypto";

export function generateOpaqueSecureRecordId(): string {
  return `SAL-${crypto.randomBytes(24).toString("base64url")}`;
}

export function generateReleaseToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashIp(ip: string | undefined, secret = process.env.SESSION_SECRET || ""): string {
  return hashSecret(`${secret}:${ip || "unknown"}`);
}

export function emailMatchesOfficialDomain(email: string, officialDomain: string): boolean {
  const addressDomain = email.trim().toLowerCase().split("@").pop() || "";
  const expected = officialDomain.trim().toLowerCase().replace(/\.$/, "");
  return !!addressDomain && addressDomain === expected;
}

export function minimalDeathNoticePayload(input: {
  companyName: string;
  secureRecordId: string;
  portalUrl: string;
}): { companyName: string; statement: string; secureRecordId: string; portalUrl: string } {
  return {
    companyName: input.companyName,
    statement: "Steps After Life has verified a death associated with an account managed by your company. Sign in to review this notice.",
    secureRecordId: input.secureRecordId,
    portalUrl: input.portalUrl,
  };
}

export const NATIONAL_COMPANY_DIRECTORY_SEED = [
  ["Verizon Wireless", "verizon.com", "real_estate"],
  ["AT&T", "att.com", "real_estate"],
  ["T-Mobile", "t-mobile.com", "real_estate"],
  ["Comcast/Xfinity", "comcast.com", "real_estate"],
  ["Spectrum", "spectrum.com", "real_estate"],
  ["Chase", "chase.com", "financial"],
  ["Bank of America", "bankofamerica.com", "financial"],
  ["Wells Fargo", "wellsfargo.com", "financial"],
  ["Citi", "citi.com", "financial"],
  ["Capital One", "capitalone.com", "financial"],
  ["American Express", "americanexpress.com", "financial"],
  ["Discover", "discover.com", "financial"],
  ["State Farm", "statefarm.com", "financial"],
  ["Progressive", "progressive.com", "financial"],
  ["GEICO", "geico.com", "financial"],
  ["New York Life", "newyorklife.com", "financial"],
  ["Netflix", "netflix.com", "subscriptions"],
  ["Amazon", "amazon.com", "subscriptions"],
  ["Apple", "apple.com", "subscriptions"],
  ["Google", "google.com", "subscriptions"],
] as const;