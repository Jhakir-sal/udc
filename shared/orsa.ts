import { z } from "zod";

export const normalizeOrsaEmail = (email: string | null | undefined): string =>
  (email ?? "").trim().toLowerCase();

export const normalizeOrsaPhone = (phone: string | null | undefined): string | null => {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return null;
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
};

export const normalizeOrsaName = (name: string | null | undefined): string =>
  (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export type OrsaRosterInput = {
  email?: string | null;
  externalMemberId?: string | null;
  displayName?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  active?: boolean;
};

export type ValidOrsaRosterRow = {
  normalizedEmail: string | null;
  sharedEligibilityEmail?: string | null;
  normalizedPhone: string | null;
  externalMemberId: string | null;
  displayName: string | null;
  contactKey: string | null;
  active: boolean;
};

export type RosterValidationIssue = {
  row: number;
  field: "email" | "externalMemberId" | "active" | "phone" | "displayName";
  message: string;
};

const emailSchema = z.string().email().max(320);
const rosterValue = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return !trimmed || /^n\/?a$/i.test(trimmed) ? null : trimmed;
};

/** Stable dedupe identity only for members without an email or external ID. */
export function orsaContactKey(phone: string, displayName: string): string {
  return JSON.stringify([phone, normalizeOrsaName(displayName)]);
}

/**
 * Validates the complete candidate set before a replace/upsert is attempted.
 * Callers must persist only when `ok` is true so a bad import can never
 * partially replace an existing roster.
 */
export function validateOrsaRoster(rows: OrsaRosterInput[], options: { sharedEmailContacts?: boolean; sharedEmailEligibility?: boolean } = {}): {
  ok: boolean;
  rows: ValidOrsaRosterRow[];
  mappedRows: ValidOrsaRosterRow[];
  mappedRowNumbers: number[];
  issues: RosterValidationIssue[];
  skippedDuplicates: number;
  skippedEmptyRows: number;
  sharedEmailRows: number;
  sharedEmails: string[];
  unusableEmailRows: number[];
  unusablePhoneRows: number[];
} {
  const issues: RosterValidationIssue[] = [];
  const emails = new Map<string, number>();
  const externalIds = new Map<string, number>();
  const contactKeys = new Map<string, { row: number; phoneOnly: boolean }>();
  const phoneRows = new Map<string, { row: number; unnamedPhoneOnly: boolean }>();
  const nameOnlyOccurrences = new Map<string, number>();
  const seenRows = new Set<string>();
  const normalized: ValidOrsaRosterRow[] = [];
  const mappedRowNumbers: number[] = [];
  let skippedDuplicates = 0;
  let skippedEmptyRows = 0;
  let sharedEmailRows = 0;
  const sharedEmails = new Set<string>();
  const unusableEmailRows: number[] = [];
  const unusablePhoneRows: number[] = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, rows: [], mappedRows: [], mappedRowNumbers: [], issues: [{ row: 0, field: "email", message: "Provide at least one roster row" }], skippedDuplicates, skippedEmptyRows, sharedEmailRows, sharedEmails: [], unusableEmailRows, unusablePhoneRows };
  }
  if (options.sharedEmailContacts && options.sharedEmailEligibility) {
    throw new Error("Choose shared contact or shared eligibility, not both");
  }

  if (options.sharedEmailContacts || options.sharedEmailEligibility) {
    const memberSignatures = new Map<string, string>();
    for (const row of rows) {
      const email = typeof row?.email === "string" ? normalizeOrsaEmail(row.email) : "";
      if (!emailSchema.safeParse(email).success) continue;
      const inputPhone = row?.phone !== undefined ? row.phone : row?.phoneNumber;
      const signature = JSON.stringify([
        typeof row?.externalMemberId === "string" ? row.externalMemberId.trim() || null : null,
        typeof inputPhone === "string" ? normalizeOrsaPhone(inputPhone) : null,
        normalizeOrsaName(typeof row?.displayName === "string" ? row.displayName : null),
        row?.active ?? true,
      ]);
      const previous = memberSignatures.get(email);
      if (previous && previous !== signature) sharedEmails.add(email);
      else if (!previous) memberSignatures.set(email, signature);
    }
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const issueCountBeforeRow = issues.length;
    if (row?.email !== undefined && row.email !== null && typeof row.email !== "string") {
      issues.push({ row: rowNumber, field: "email", message: "Email must be a string when provided" });
    }
    const suppliedEmail = normalizeOrsaEmail(typeof row?.email === "string" ? rosterValue(row.email) : null) || null;
    // Keep the member, but do not store or invite a malformed address.
    const usableEmail = suppliedEmail && emailSchema.safeParse(suppliedEmail).success ? suppliedEmail : null;
    if (suppliedEmail && !usableEmail) unusableEmailRows.push(rowNumber);
    const normalizedEmail = usableEmail && !sharedEmails.has(usableEmail) ? usableEmail : null;
    const sharedEligibilityEmail = options.sharedEmailEligibility && usableEmail && sharedEmails.has(usableEmail)
      ? usableEmail : null;
    if (row?.externalMemberId !== undefined && row.externalMemberId !== null && typeof row.externalMemberId !== "string") {
      issues.push({ row: rowNumber, field: "externalMemberId", message: "External member ID must be a string when provided" });
    }
    const externalMemberId = typeof row?.externalMemberId === "string" ? rosterValue(row.externalMemberId) : null;
    if (row?.displayName !== undefined && row.displayName !== null && typeof row.displayName !== "string") {
      issues.push({ row: rowNumber, field: "displayName", message: "Member name must be a string when provided" });
    }
    const displayName = typeof row?.displayName === "string" ? rosterValue(row.displayName) : null;
    if (sharedEligibilityEmail && !displayName) {
      issues.push({ row: rowNumber, field: "displayName", message: "A confirmed shared eligibility address requires a name for each member" });
    }
    const inputPhone = row?.phone !== undefined ? row.phone : row?.phoneNumber;
    if (inputPhone !== undefined && inputPhone !== null && typeof inputPhone !== "string") {
      issues.push({ row: rowNumber, field: "phone", message: "Phone number must be a string when provided" });
    }
    const suppliedPhone = typeof inputPhone === "string" ? rosterValue(inputPhone) : null;
    const normalizedPhone = normalizeOrsaPhone(suppliedPhone);
    if (suppliedPhone && !normalizedPhone) {
      // A bad phone cannot be used for SMS, but must not drop a named member.
      unusablePhoneRows.push(rowNumber);
    }
    let contactKey: string | null = null;

    // Entirely empty/NA spacer rows do not represent a member. Ignore them,
    // but never allow a replace consisting only of spacer rows.
    if (!normalizedEmail && !normalizedPhone && !externalMemberId && !displayName &&
      !suppliedEmail && !suppliedPhone && issues.length === issueCountBeforeRow) {
      skippedEmptyRows++;
      return;
    }
    if (!normalizedEmail && !externalMemberId && !normalizedPhone && !displayName) {
      issues.push({ row: rowNumber, field: "displayName", message: usableEmail && sharedEmails.has(usableEmail)
        ? "Shared contact email cannot identify a member; add a member name, phone number, or external member ID"
        : "A member name or usable email, phone number, or external member ID is required" });
    }

    const phoneOnly = !normalizedEmail && !externalMemberId;
    if (row?.active !== undefined && row.active !== null &&
      !(typeof row.active === "boolean" || (typeof row.active === "string" && !rosterValue(row.active)))) {
      issues.push({ row: rowNumber, field: "active", message: "Active must be true or false" });
    }
    const active = typeof row?.active === "boolean" ? row.active : true;
    const nameOnly = !normalizedEmail && !normalizedPhone && !externalMemberId;
    // Only repeated, valid, fully equivalent member rows can be ignored.
    // A shared email/ID with differing details must still block the entire import.
    if (issues.length === issueCountBeforeRow) {
      const rowKey = JSON.stringify([
        normalizedEmail, sharedEligibilityEmail, normalizedPhone, externalMemberId,
        normalizeOrsaName(displayName), active,
      ]);
      // Names alone are not unique: two separate people may have identical names.
      if (!nameOnly && seenRows.has(rowKey)) {
        skippedDuplicates++;
        return;
      }
      if (!nameOnly) seenRows.add(rowKey);
      if (suppliedEmail && sharedEmails.has(suppliedEmail)) sharedEmailRows++;
    }
    if (normalizedEmail) {
      if (emails.has(normalizedEmail)) {
        issues.push({ row: rowNumber, field: "email", message: `Duplicate email with conflicting details (also row ${emails.get(normalizedEmail)}); review before importing` });
      } else {
        emails.set(normalizedEmail, rowNumber);
      }
    }
    if (externalMemberId) {
      if (externalIds.has(externalMemberId)) {
        issues.push({ row: rowNumber, field: "externalMemberId", message: `Duplicate external member ID with conflicting details (also row ${externalIds.get(externalMemberId)}); review before importing` });
      } else {
        externalIds.set(externalMemberId, rowNumber);
      }
    }
    if (normalizedPhone) {
      const previousPhone = phoneRows.get(normalizedPhone);
      const unnamedPhoneOnly = phoneOnly && !displayName;
      if (previousPhone && (unnamedPhoneOnly || previousPhone.unnamedPhoneOnly)) {
        issues.push({ row: rowNumber, field: "phone", message: `Phone number without a member name is shared with row ${previousPhone.row}; review member identities` });
      } else if (!previousPhone) {
        phoneRows.set(normalizedPhone, { row: rowNumber, unnamedPhoneOnly });
      }
    }
    if (normalizedPhone && (displayName || phoneOnly)) {
      const candidateKey = orsaContactKey(normalizedPhone, displayName ?? "");
      if (phoneOnly) contactKey = candidateKey;
      const previous = contactKeys.get(candidateKey);
      if (previous && (phoneOnly || previous.phoneOnly)) {
        issues.push({ row: rowNumber, field: "phone", message: `Duplicate phone and member name with conflicting details (also row ${previous.row}); review member identities` });
      } else if (!previous) {
        contactKeys.set(candidateKey, { row: rowNumber, phoneOnly });
      }
    }
    if (nameOnly && displayName) {
      const name = normalizeOrsaName(displayName);
      const occurrence = (nameOnlyOccurrences.get(name) ?? 0) + 1;
      nameOnlyOccurrences.set(name, occurrence);
      // A provisional roster key, never an email/phone or proof of identity.
      contactKey = JSON.stringify(["name-only", name, occurrence]);
    }
    normalized.push({
      normalizedEmail, normalizedPhone, externalMemberId, displayName, contactKey, active,
      ...(sharedEligibilityEmail ? { sharedEligibilityEmail } : {}),
    });
    mappedRowNumbers.push(rowNumber);
  });
  if (!issues.length && !normalized.length) {
    issues.push({ row: 0, field: "displayName", message: "No member rows to import" });
  }
  return { ok: issues.length === 0, rows: issues.length ? [] : normalized, mappedRows: normalized, mappedRowNumbers, issues, skippedDuplicates, skippedEmptyRows, sharedEmailRows, sharedEmails: Array.from(sharedEmails), unusableEmailRows, unusablePhoneRows };
}

/** A small RFC-4180-style parser suitable for admin imports (not a heuristic split). */
export function parseOrsaRosterCsv(csv: string, options: {
  firstColumnMemberName?: boolean;
  memberPhoneEmailColumns?: boolean;
  firstRowIsHeader?: boolean;
} = {}): OrsaRosterInput[] {
  const records: string[][] = [];
  let field = "", record: string[] = [], quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted && char === '"' && csv[i + 1] === '"') { field += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { record.push(field); field = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      record.push(field); field = "";
      if (record.some((value) => value.trim())) records.push(record);
      record = []; continue;
    }
    field += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  if (!records.length) return [];
  const firstRow = records[0].map((value) => value.trim().toLowerCase());
  if (options.memberPhoneEmailColumns) {
    if (typeof options.firstRowIsHeader !== "boolean") {
      throw new Error("Choose whether the first row contains headings or a member before importing");
    }
    const compact = (value: string) => value.replace(/[^a-z0-9]/g, "");
    const looksLikeHeadings =
      ["name", "member", "membername", "fullname", "memberfullname", "displayname"].includes(compact(firstRow[0] ?? "")) &&
      /^(member|contact|primary|borrower|home|sms)?(phone|telephone|mobile|cell)(number)?$/.test(compact(firstRow[1] ?? "")) &&
      /^(member|contact)?email(address)?$/.test(compact(firstRow[2] ?? ""));
    if (!options.firstRowIsHeader && looksLikeHeadings) {
      throw new Error("The first row looks like headings; choose 'First row is headings' to avoid importing it as a member");
    }
    if (options.firstRowIsHeader && (normalizeOrsaPhone(firstRow[1]) ||
      emailSchema.safeParse(normalizeOrsaEmail(firstRow[2])).success)) {
      throw new Error("The first row looks like a member; choose 'First row is a member' to avoid skipping it");
    }
    return (options.firstRowIsHeader ? records.slice(1) : records).map((values) => ({
      displayName: values[0] ?? null,
      phone: values[1] ?? null,
      email: values[2] ?? "",
    }));
  }
  const emailHeaders = ["email", "e-mail", "email address", "email_address", "emailaddress", "e-mail address", "member email"];
  const compactHeader = (header: string) => header.replace(/[^a-z0-9]/g, "");
  const phoneHeaders = [
    "phone", "phonenumber", "mobile", "mobilephone", "mobilenumber",
    "cell", "cellphone", "cellnumber", "telephone", "telephonenumber", "contactnumber",
    "memberphone", "memberphonenumber", "borrowerphone", "primaryphone",
    "contactphone", "smsphone", "homephone",
  ];
  const emailHeaderAliases = new Set([
    ...emailHeaders,
    "memberemail", "memberemailaddress", "contactemail",
  ]);
  const emailHeaderIndex = firstRow.findIndex((header) => emailHeaderAliases.has(header) ||
    ["email", "emailaddress", "memberemail", "memberemailaddress", "contactemail"].includes(compactHeader(header)));
  const hasRecognizedHeaders = emailHeaderIndex >= 0 || (firstRow.length === 1 && firstRow[0] === "name") ||
    (options.firstColumnMemberName === true && compactHeader(firstRow[0]) === "name") || firstRow.some((header) => [
    "externalmemberid", "memberid", "firstname", "lastname", "givenname", "familyname", "displayname", "membername",
    ...phoneHeaders,
  ].includes(compactHeader(header)));
  // Headerless files continue to support an email value in any column. A
  // phone-only import must have headers, since otherwise column intent is unknown.
  const firstRowContainsEmail = firstRow.some((value) => emailSchema.safeParse(normalizeOrsaEmail(value)).success);
  const headerless = !hasRecognizedHeaders && firstRowContainsEmail;
  if (!headerless && !hasRecognizedHeaders) {
    throw new Error("Could not identify roster headers; label the member email, phone, external member ID, or member name columns");
  }
  const headers = headerless ? [] : firstRow;
  const data = headerless ? records : records.slice(1);
  const matchingColumns = new Set<number>();
  for (const values of data) {
    values.forEach((value, index) => {
      if (emailSchema.safeParse(normalizeOrsaEmail(value)).success) matchingColumns.add(index);
    });
  }
  let emailIndex = headerless ? -1 : emailHeaderIndex;
  if (headerless && matchingColumns.size > 0) {
    if (matchingColumns.size > 1) throw new Error("Multiple columns contain email addresses; label the intended column email");
    emailIndex = Array.from(matchingColumns)[0];
  }
  const findHeader = (names: string[]) => headers.findIndex((header) => names.includes(compactHeader(header)));
  const externalIndex = findHeader(["externalmemberid", "memberid"]);
  const phoneIndex = findHeader(phoneHeaders);
  const memberFirstIndex = findHeader(["memberfirstname", "firstnameofmember", "membergivenname"]);
  const memberLastIndex = findHeader(["memberlastname", "lastnameofmember", "memberfamilyname", "membersurname"]);
  const firstIndex = memberFirstIndex >= 0 ? memberFirstIndex : findHeader(["firstname", "first", "givenname"]);
  const lastIndex = memberLastIndex >= 0 ? memberLastIndex : findHeader(["lastname", "last", "familyname", "surname"]);
  // First Name and Last Name are member fields, even for a single row or
  // multiple members with the same name. "Name" can be the data-entry person.
  const useFirstLast = firstIndex >= 0 && lastIndex >= 0;
  const explicitNameIndex = findHeader(["displayname", "membername", "memberfullname"]);
  const nameIndex = options.firstColumnMemberName === true ? 0
    : useFirstLast ? -1 : explicitNameIndex >= 0 ? explicitNameIndex : headers.length === 1 && headers[0] === "name" ? 0 : -1;
  const activeIndex = findHeader(["active"]);
  return data.map((values) => ({
    email: emailIndex < 0 ? "" : values[emailIndex] ?? "",
    externalMemberId: externalIndex < 0 ? null : values[externalIndex] ?? null,
    phone: phoneIndex < 0 ? null : values[phoneIndex] ?? null,
    displayName: useFirstLast && !options.firstColumnMemberName
      ? [rosterValue(values[firstIndex]), rosterValue(values[lastIndex])].filter(Boolean).join(" ") || null
      : nameIndex < 0 ? null : values[nameIndex] ?? null,
    active: activeIndex < 0 || !/^(false|0|no)$/i.test((values[activeIndex] ?? "").trim()),
  }));
}