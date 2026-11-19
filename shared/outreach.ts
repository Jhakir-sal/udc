import { z } from "zod";

export const OUTREACH_SENDER = "hello@stepsafterlife.com";
export const OUTREACH_MAILING_ADDRESS = "21002 Mack Ave Grosse Pointe Woods Mi 48236";
export const OUTREACH_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const OUTREACH_TEMPLATES = [
  { id: "credit_union_intro", label: "Credit union partnership introduction", subject: "A partnership idea for your credit union" },
] as const;
export const PARTNER_OVERVIEW_FILENAME = "Steps_After_Life_Partner_Overview.pdf";
// The approved one-page "What we do" PDF. A new document needs a new template version.
export const PARTNER_OVERVIEW_SHA256 = "b12232e91181cefc718f331e8624b882ab317025a4da788a72f787423d55711b";

export const outreachTemplateInput = z.object({
  label: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(180).refine(value => !/[\x00-\x1f\x7f\u2028\u2029]/.test(value), "Subject must be a single line"),
  body: z.string().trim().min(1).max(10_000),
  attachPartnerOverview: z.boolean().default(false),
}).strict().refine(value => {
  const tokens = `${value.subject} ${value.body}`.match(/\{\{[^{}]*\}\}/g) || [];
  return tokens.every(token => ["{{first_name}}", "{{company_name}}"].includes(token));
}, { message: "Use only {{first_name}} and {{company_name}} placeholders" })
  .refine(value => !/\[\s*first[\s_-]*name\s*\]/i.test(`${value.subject}\n${value.body}`),
    { message: "Use {{first_name}} instead of [First Name] to personalize the greeting." })
  .refine(value => value.attachPartnerOverview || !/\battach(?:ed|ment|ments|ing)?\b/i.test(value.body),
    { message: "This message promises an attachment. Select the partner overview PDF before saving." });

export type OutreachTemplate = { id: string; label: string; subject: string; body: string };
export type OutreachContactInput = { email: string; firstName: string | null; companyName: string | null; fullName?: string | null };
export type OutreachSkippedRow = { row: number; reason: string };

/** Parse quoted CSV fields (including commas and newlines), rejecting malformed input. */
function parseOutreachCsvInternal(csv: string, skipInvalidContacts: boolean): { contacts: OutreachContactInput[]; skippedRows: OutreachSkippedRow[] } {
  if (new TextEncoder().encode(csv).length > 1_000_000) throw new Error("CSV must be smaller than 1 MB");
  const records: string[][] = [];
  let row: string[] = [], field = "", quoted = false, atFieldStart = true;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && atFieldStart) {
      quoted = true;
    } else if (char === '"' ) {
      throw new Error("Invalid quote in CSV");
    } else if (char === ",") {
      row.push(field); field = ""; atFieldStart = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(field); field = ""; atFieldStart = true;
      if (row.some(value => value.trim())) records.push(row);
      row = [];
    } else {
      field += char;
      atFieldStart = false;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  row.push(field);
  if (row.some(value => value.trim())) records.push(row);
  if (records.length < 2) throw new Error("CSV needs a header and at least one contact");
  const headers = records.shift()!.map(value => value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const emailIndex = headers.findIndex(header => ["email", "email_address", "emailaddress", "e_mail"].includes(header));
  if (emailIndex < 0) throw new Error("CSV needs an email column (email or email address)");
  const firstIndex = headers.findIndex(header => ["first_name", "firstname"].includes(header));
  const nameIndex = headers.findIndex(header => ["name", "full_name", "contact_name"].includes(header));
  const lastIndex = headers.findIndex(header => ["last_name", "lastname"].includes(header));
  const companyIndex = headers.findIndex(header => ["company_name", "company", "business", "business_name", "organization", "organisation", "credit_union"].includes(header));
  if (records.length > 2000) throw new Error("Import at most 2,000 contacts at a time");
  const seen = new Set<string>();
  const contacts: OutreachContactInput[] = [];
  const skippedRows: OutreachSkippedRow[] = [];
  for (let index = 0; index < records.length; index++) {
    const values = records[index];
    if (values.length !== headers.length) throw new Error(`Row ${index + 2} has the wrong number of columns`);
    const email = (values[emailIndex] || "").trim().toLowerCase();
    if (!z.string().email().max(320).safeParse(email).success) {
      if (!skipInvalidContacts) throw new Error(`Row ${index + 2} has an invalid email`);
      skippedRows.push({ row: index + 2, reason: "missing or invalid email" });
      continue;
    }
    if (seen.has(email)) throw new Error(`Duplicate email on row ${index + 2}`);
    const providedFirstName = firstIndex < 0 ? null : values[firstIndex]?.trim() || null;
    const fullName = nameIndex >= 0 ? values[nameIndex]?.trim() || null :
      providedFirstName && lastIndex >= 0 && values[lastIndex]?.trim()
        ? `${providedFirstName} ${values[lastIndex].trim()}` : null;
    const firstName = providedFirstName || fullName?.split(/\s+/)[0] || null;
    const companyName = companyIndex < 0 ? null : values[companyIndex]?.trim() || null;
    if (skipInvalidContacts && (firstIndex >= 0 || nameIndex >= 0) && !firstName) {
      skippedRows.push({ row: index + 2, reason: "missing name" });
      continue;
    }
    if ((firstName?.length || 0) > 100 || (fullName?.length || 0) > 200 || (companyName?.length || 0) > 200) {
      if (!skipInvalidContacts) throw new Error(`Row ${index + 2} has a name that is too long`);
      skippedRows.push({ row: index + 2, reason: "name or company is too long" });
      continue;
    }
    if ([firstName, fullName, companyName].some(value => value && /[\x00-\x1f\x7f\u2028\u2029]/.test(value))) {
      if (!skipInvalidContacts) throw new Error(`Row ${index + 2} has a name or company with invalid control characters`);
      skippedRows.push({ row: index + 2, reason: "invalid characters in name or company" });
      continue;
    }
    seen.add(email);
    contacts.push({ email, firstName, fullName, companyName });
  }
  return { contacts, skippedRows };
}

export function parseOutreachCsv(csv: string): OutreachContactInput[] {
  return parseOutreachCsvInternal(csv, false).contacts;
}

/** Keep a valid subset for imports, but never ignore malformed CSV or duplicate recipients. */
export function parseOutreachCsvForImport(csv: string) {
  return parseOutreachCsvInternal(csv, true);
}

export function renderOutreachEmail(contact: OutreachContactInput, templateId: string, unsubscribeUrl: string, customTemplate?: OutreachTemplate, options: { test?: boolean; attachment?: boolean } = {}) {
  if (templateId !== "credit_union_intro" && customTemplate?.id !== templateId) throw new Error("Unknown template");
  const firstName = contact.firstName || "there";
  const creditUnion = contact.companyName || "your credit union";
  const replaceTokens = (value: string) => value.replace(/\{\{(first_name|company_name)\}\}/g, (_, key: string) =>
    key === "first_name" ? firstName : contact.companyName || "your organization");
  const personalizedSubject = customTemplate ? replaceTokens(customTemplate.subject) : `A partnership idea for ${creditUnion}`;
  if (/[\x00-\x1f\x7f\u2028\u2029]/.test(personalizedSubject)) throw new Error("Contact has an invalid company name for an email subject");
  const subject = options.test ? `[TEST] ${personalizedSubject}` : personalizedSubject;
  const message = customTemplate ? replaceTokens(customTemplate.body) : `Hi ${firstName},

When a credit union member dies, their family can suddenly face a complicated process involving financial accounts, paperwork, institutions and deadlines.

Steps After Life helps reduce the beneficiary burden by providing support before and after a loss.

For credit unions, this can be more than a member benefit. It creates an opportunity to build relationships with beneficiaries and introduce them to the credit union and the broader financial services you provide.

${options.attachment ? "I've attached a brief overview of Steps After Life and our partner program." : "I can share a brief overview of Steps After Life and our partner program."} I'd welcome 15–20 minutes to introduce the program and explore whether it could be a fit for ${creditUnion}.

Best,
Dave Guzman
Steps After Life
888-557-2083
hello@stepsafterlife.com
`;
  const text = `${options.test ? "TEST EMAIL — sample details only\n\n" : ""}${message.trimEnd()}

Steps After Life · ${OUTREACH_MAILING_ADDRESS}
${options.test
    ? "This is a test. No outreach contact was emailed. Live messages include a personalized unsubscribe link."
    : `To stop receiving partnership emails: ${unsubscribeUrl}`}`;
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
  // Outlook's Word-based renderer does not reliably honor white-space:pre-wrap
  // on table cells. Encode first, then use actual HTML breaks for plain-text copy.
  const messageHtml = escape(message.trimEnd()).replace(/\r\n?|\n/g, "<br>");
  // CID images render in mail clients that strip data URIs; previews substitute
  // the same image as a data URI so the sandboxed admin iframe can display it.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px;background:#f8f7f1;color:#32453a;font-family:'DM Sans',Arial,sans-serif">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;margin:auto;border-collapse:collapse;background:#fff;border:1px solid #e7e6dc;border-top:4px solid #956834">
      <tr><td style="padding:28px 32px;background:#f8f7f1">
        <img src="cid:sal-outreach-logo" alt="Steps After Life" width="340" style="display:block;width:100%;max-width:340px;height:auto;color:#32453a;font:26px/1.2 'Fraunces',Georgia,serif;border:0">
      </td></tr>
      ${options.test ? '<tr><td style="padding:12px 32px;background:#e8f4ed;color:#32453a;font:bold 13px/1.5 \'DM Sans\',Arial,sans-serif">TEST EMAIL · SAMPLE DETAILS</td></tr>' : ""}
      <tr><td style="padding:32px;color:#26372e;font-family:Arial,sans-serif;font-size:16px;line-height:26px;mso-line-height-rule:exactly;word-break:break-word">${messageHtml}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #e7e6dc;background:#f8f7f1;color:#526158;font:13px/1.6 'DM Sans',Arial,sans-serif">
        <div>Steps After Life · ${escape(OUTREACH_MAILING_ADDRESS)}</div>
        ${options.test
          ? '<div style="margin-top:8px">This is a test. No outreach contact was emailed. Live messages include a personalized unsubscribe link.</div>'
          : `<div style="margin-top:8px"><a href="${escape(unsubscribeUrl)}" style="color:#32453a;text-decoration:underline">Unsubscribe from partnership emails</a></div>`}
      </td></tr>
    </table>
  </body></html>`;
  return { subject, text, html };
}