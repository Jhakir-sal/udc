import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exactNotificationMatches, normalizeNotificationCompany } from "../shared/accountCompanyNotification";

test("company matching uses normalized exact names and explicit aliases, not guesses", () => {
  const companies = [
    { id: "bank", name: "Bank of America", aliases: ["BofA"] },
    { id: "auto", name: "Chase Auto", aliases: [] },
    { id: "bank2", name: "Chase", aliases: ["JPMorgan Chase"] },
    { id: "phone", name: "AT&T", aliases: ["AT and T"] },
  ];
  assert.equal(normalizeNotificationCompany("  Bank-of-America  "), "bank of america");
  assert.deepEqual(exactNotificationMatches("BANK OF AMERICA", companies).map((row) => row.id), ["bank"]);
  assert.deepEqual(exactNotificationMatches("BofA", companies).map((row) => row.id), ["bank"]);
  assert.deepEqual(exactNotificationMatches("Chase", companies).map((row) => row.id), ["bank2"]);
  assert.deepEqual(exactNotificationMatches("Chase checking ending 1234", companies), []);
  assert.deepEqual(exactNotificationMatches("", companies), []);
  assert.deepEqual(exactNotificationMatches("AT&T", companies).map((row) => row.id), ["phone"]);
});

test("ambiguous exact aliases remain ambiguous for concierge review", () => {
  const companies = [
    { name: "Example Bank", aliases: ["Example"] },
    { name: "Example Credit", aliases: ["Example"] },
  ];
  assert.equal(exactNotificationMatches("Example", companies).length, 2);
});

test("account context requires staff and preserves case, company, and persisted notice boundaries", () => {
  const source = readFileSync(new URL("./accountCompanyNotification.ts", import.meta.url), "utf8");
  assert.match(source, /options\.isAuthenticated, options\.isAdmin/);
  assert.match(source, /storage\.getConnectedAccount\(accountId\)/);
  assert.match(source, /storage\.getCertificate\(account\.certificateId\)/);
  assert.match(source, /account\.companyId \? linkedCompany/);
  assert.match(source, /exact\.length === 1/);
  assert.match(source, /matchedReferences\.length === 1/);
  assert.match(source, /eq\(companyDeathNotices\.accountId, account\.id\)/);
  assert.match(source, /eq\(companyDeathNotices\.companyId, company\.id\)/);
  assert.match(source, /ne\(companyDeathNotices\.status, "revoked"\)/);
  assert.match(source, /recipient: options\.hasVerifiedRouting\(item\) \? item\.notificationEmail : null/);
  assert.doesNotMatch(source, /sendEmail|\.insert\(|\.update\(|\.delete\(/);
});

test("final send rechecks the verified death record and unchanged recipient before claiming delivery", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const source = routes.slice(
    routes.indexOf('app.post("/api/company-notices/:id/send"'),
    routes.indexOf('app.get("/api/company-portal/notices"'),
  );
  assert.match(source, /storage\.getCertificate\(row\.notice\.certificateId\)/);
  assert.match(source, /currentCertificate\?\.status !== "verified"/);
  assert.match(source, /row\.notice\.destinationEmail !== row\.company\.notificationEmail/);
  assert.match(source, /req\.body\.expectedRecipient !== row\.notice\.destinationEmail/);
  assert.match(source, /eq\(companyDeathNotices\.destinationEmail, row\.notice\.destinationEmail\)/);
  assert.ok(source.indexOf('currentCertificate?.status !== "verified"') < source.indexOf('status: "sending"'));
  assert.match(source, /eq\(companyDeathNotices\.status, "draft"\)/);
});

test("secure-link email entry is visible in account details and keeps the selected account context", () => {
  const page = readFileSync(new URL("../client/src/pages/case-detail.tsx", import.meta.url), "utf8");
  const entryStart = page.indexOf('data-testid={`button-email-secure-link-details-${selectedAccount.id}`}');
  assert(entryStart > 0);
  const entry = page.slice(entryStart, page.indexOf("</Button>", entryStart));
  assert.match(entry, /accountId: String\(selectedAccount\.id\)/);
  assert.match(entry, /accountName: selectedAccount\.accountName/);
  assert.match(entry, /certificateId: certId/);
  assert.match(entry, /setSelectedAccount\(null\)/);
  assert.match(entry, /setAccountNotificationTarget\(target\)/);
  assert.match(entry, /Send link to company/);
  assert.doesNotMatch(entry, /mutate|apiRequest|sendNotice/);
  assert(entryStart < page.indexOf("<AccountFamilyDocuments"));

  const component = readFileSync(new URL("../client/src/components/account-company-notification.tsx", import.meta.url), "utf8");
  assert.match(component, /button-email-secure-link-\$\{accountId\}/);
  assert.match(component, /event\.stopPropagation\(\)/);
  assert.match(component, /Confirm send secure link/);
  assert.match(component, /signed[- ]LPOA/);
  assert.match(component, /require staff approval/);
  assert.match(component, /Internal case reference/);
});

test("company link sending is account-first with recipient and message ahead of setup and notes", () => {
  const page = readFileSync(new URL("../client/src/pages/case-detail.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/<AccountCompanyNotificationAction\b/g) || []).length, 1);
  const table = page.slice(page.indexOf("<TableHead>Account</TableHead>"));
  assert(table.indexOf("<TableHead>Account</TableHead>") < table.indexOf("<TableHead>Account Holder</TableHead>"));
  assert(table.indexOf("<AccountCompanyNotificationAction") < table.indexOf("text-holder-${account.id}"));
  assert(table.indexOf("<AccountCompanyNotificationAction") < table.indexOf("<AccountCompanyPhone"));
  const source = readFileSync(new URL("../client/src/components/account-company-notification.tsx", import.meta.url), "utf8");
  const dialog = source.slice(source.indexOf("<Dialog open={open}"));
  assert.match(dialog, /<DialogTitle[^>]*>Send link to company/);
  assert(dialog.indexOf("<CompanyEmailEditor") < dialog.indexOf("Private SAL team notes"));
  const previewStart = dialog.indexOf('data-testid="secure-link-message-preview"');
  assert(previewStart > 0 && previewStart < dialog.indexOf("Private SAL team notes"));
  assert.match(dialog, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  const footer = dialog.slice(dialog.indexOf("<footer"));
  assert.match(footer, /button-review-secure-link-email/);
  assert.match(footer, /button-confirm-send-secure-link/);
  assert.match(footer, /companyEmailDirty/);
  assert.match(footer, /canPrepareEmail/);
});

test("private account notes stay in the staff context, never the company email or portal payload", () => {
  const context = readFileSync(new URL("./accountCompanyNotification.ts", import.meta.url), "utf8");
  assert.match(context, /options\.isAuthenticated, options\.isAdmin/);
  assert.match(context, /internalNotes: account\.notes \?\? null/);
  assert.match(context, /Cache-Control", "private, no-store"/);
  const emailArguments = context.slice(context.indexOf("const email = buildCompanyDeathNoticeEmail("), context.indexOf("const response:"));
  assert.doesNotMatch(emailArguments, /internalNotes|account\.notes/);
  const email = readFileSync(new URL("./email.ts", import.meta.url), "utf8");
  const template = email.slice(email.indexOf("export function buildCompanyDeathNoticeEmail("), email.indexOf("export async function sendEmail("));
  assert.doesNotMatch(template, /internalNotes|params\.notes/);
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const companyPortal = routes.slice(routes.indexOf('app.get("/api/company-portal/notices"'), routes.indexOf('app.post("/api/company-portal/notices/:id/acknowledge"'));
  assert.doesNotMatch(companyPortal, /internalNotes|connectedAccounts\.notes/);
  const logging = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const exclusions = logging.slice(logging.indexOf("const isPrivateBody"), logging.indexOf("if (capturedJsonResponse && !isPrivateBody)"));
  assert(exclusions.includes("company-notification"));
  assert(exclusions.includes("accounts"));
});

test("editing company email never makes a candidate address send-ready or verifies it automatically", () => {
  const context = readFileSync(new URL("./accountCompanyNotification.ts", import.meta.url), "utf8");
  assert.match(context, /notificationEmail: item\.notificationEmail/);
  assert.match(context, /officialDomain: item\.officialDomain/);
  assert.match(context, /recipient: options\.hasVerifiedRouting\(item\) \? item\.notificationEmail : null/);
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const edit = routes.slice(routes.indexOf('app.patch("/api/admin/company-directory/:id"'),
    routes.indexOf('registerCompanyRoutingApproval(app, isAuthenticated, isAdmin)'));
  assert.match(edit, /isAuthenticated, isAdmin/);
  assert.match(edit, /parsed\.data\.notificationEmail !== current\[0\]\.notificationEmail/);
  assert.match(edit, /verifiedAt: null, verifiedBy: null, routingApproval: null/);
  assert.doesNotMatch(edit, /sendEmail|verifiedAt: new Date/);
});
