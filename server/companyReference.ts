import { readFileSync } from "node:fs";
import { read, utils } from "@e965/xlsx";
import { createHash } from "node:crypto";
import type { CompanyReferenceCatalog, CompanyReferenceEntry } from "../shared/companyReference";

export const COMPANY_REFERENCE_FILE = "SAL_Deceased_Notification_Master_List_1792334353973.xlsx";
let cached: CompanyReferenceCatalog | undefined;

export function parseCompanyReference(bytes: Buffer): CompanyReferenceCatalog {
  const workbook = read(bytes, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets["Master List"];
  if (!sheet) throw new Error("SAL company workbook is missing its Master List.");
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!rows.length || !("Company" in rows[0]) || !("Source URL" in rows[0])) {
    throw new Error("SAL company workbook has unexpected columns.");
  }
  const entries = rows.filter((row) => String(row.Company).trim()).map((row) => {
    const value = (key: string) => String(row[key] ?? "").trim();
    const company = value("Company");
    const category = value("Category");
    const email = value("Email");
    return {
      id: createHash("sha256").update(`${category}\0${company}`).digest("hex").slice(0, 24),
      category, company, department: value("Team / Department"), email,
      portal: value("Online Portal / Form"), phone: value("Phone"), fax: value("Fax"),
      mailingAddress: value("Mailing Address"), emailAcceptance: value("Accepts Email Notice?"),
      notes: value("Notes"), whenToNotify: value("When to Notify"), sourceQuality: value("Source Quality"),
      sourceUrl: value("Source URL"), sourceReportedDate: value("Last Verified"),
      hasEmailCandidate: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      needsReview: true as const,
      ...(company === "Bank of America" && category === "Bank" ? {
        staffPortal: {
          url: "https://secure.bankofamerica.com/mycomm-casemgmt/public/atp-login/",
          note: "Owner-provided third-party notification portal. SAL has an account. Retrieve credentials from the team's approved password manager; never store them in case or directory notes. Portal sign-in and reporting requirements have not been independently tested. Submit reports manually after reviewing case authority; this does not enable email notification.",
        },
      } : {}),
    } satisfies CompanyReferenceEntry;
  });
  if (new Set(entries.map((row) => row.id)).size !== entries.length) {
    throw new Error("SAL company workbook contains duplicate company/category entries.");
  }
  return {
    entries, categories: Array.from(new Set(entries.map((row) => row.category))).sort(),
    total: entries.length, emailCandidates: entries.filter((row) => row.hasEmailCandidate).length,
    workbookDate: "2026-10-18",
  };
}

export function getCompanyReference(): CompanyReferenceCatalog {
  if (!cached) {
    const path = process.env.NODE_ENV === "production"
      ? `dist/attachments/${COMPANY_REFERENCE_FILE}` : `attached_assets/${COMPANY_REFERENCE_FILE}`;
    cached = parseCompanyReference(readFileSync(path));
  }
  return cached;
}

export function companyReferenceNotes(entry: CompanyReferenceEntry): string {
  // Preserve original evidence without treating imported claims as SAL approval.
  return [
    "Imported SAL research — not verified routing. Confirm the accepted process before use.",
    `Category: ${entry.category}; Department: ${entry.department}`,
    `Email candidate (unverified): ${entry.email || "None"}`,
    `Email acceptance (source claim): ${entry.emailAcceptance}`,
    `Portal/form: ${entry.portal}; Phone: ${entry.phone}; Fax: ${entry.fax}`,
    ...(entry.staffPortal ? [`SAL staff portal: ${entry.staffPortal.url}`, entry.staffPortal.note] : []),
    `Mail: ${entry.mailingAddress}`,
    `Source instructions (review required): ${entry.notes}`,
    `When to notify (source claim, not an automatic rule): ${entry.whenToNotify}`,
    `Source quality (workbook claim): ${entry.sourceQuality}`,
    `Source: ${entry.sourceUrl}`,
    `Workbook-reported date, not SAL verification: ${entry.sourceReportedDate}`,
    `Reference: ${entry.id}`,
  ].join("\n");
}
