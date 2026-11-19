import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { utils, write } from "@e965/xlsx";
import { getCompanyReference, parseCompanyReference, companyReferenceNotes } from "./companyReference";

test("imports the complete master sheet once, not the duplicate Email-Ready tab", () => {
  const catalog = getCompanyReference();
  assert.equal(catalog.total, 208);
  assert.equal(catalog.categories.length, 24);
  assert.equal(catalog.emailCandidates, 11);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, 208);
  assert.ok(catalog.entries.every((entry) => entry.needsReview === true));
  assert.ok(catalog.entries.every((entry) => companyReferenceNotes(entry).length <= 2000));
});

test("keeps placeholders and restricted channels out of verified email routing", () => {
  const entries = getCompanyReference().entries;
  const paypal = entries.find((entry) => entry.company === "PayPal (US)")!;
  assert.equal(paypal.hasEmailCandidate, false);
  assert.match(paypal.email, /Listed on PayPal/);
  const citizens = entries.find((entry) => entry.company === "Citizens Bank")!;
  assert.equal(citizens.hasEmailCandidate, true);
  assert.equal(citizens.emailAcceptance, "Home-loan docs only");
  assert.match(citizens.notes, /deposit accounts by phone\/mail/);
});

test("Bank of America staff portal is separate from unverified workbook evidence and email routing", () => {
  const entry = getCompanyReference().entries.find((entry) => entry.company === "Bank of America")!;
  assert.equal(entry.staffPortal?.url, "https://secure.bankofamerica.com/mycomm-casemgmt/public/atp-login/");
  assert.match(entry.staffPortal!.note, /SAL has an account/);
  assert.match(entry.staffPortal!.note, /not been independently tested/);
  assert.equal(entry.hasEmailCandidate, false);
  assert.equal(entry.needsReview, true);
  assert.ok(entry.portal);
  assert.ok(companyReferenceNotes(entry).includes(entry.staffPortal!.url));
  assert.ok(companyReferenceNotes(entry).length <= 2000);
  assert.equal(getCompanyReference().entries.filter((entry) => entry.staffPortal).length, 1);
});

test("preserves important reporting instructions without treating source claims as verification", () => {
  const entries = getCompanyReference().entries;
  for (const name of ["DTE Energy (MI)", "Consumers Energy (MI)", "Charles Schwab", "Social Security Administration"]) {
    const entry = entries.find((entry) => entry.company === name)!;
    assert.ok(entry, name);
    assert.ok(entry.sourceUrl.startsWith("https://"));
    assert.equal(entry.needsReview, true);
    assert.equal(entry.sourceReportedDate, "2026-10-18");
    assert.match(companyReferenceNotes(entry), /not SAL verification/);
  }
  const ssa = entries.find((entry) => entry.company === "Social Security Administration")!;
  assert.equal(ssa.whenToNotify, "Every case");
  assert.match(companyReferenceNotes(ssa), /not an automatic rule/);
});

test("rejects broken or ambiguously duplicated workbooks instead of silently losing records", () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([["Company"], ["Example"]]), "Other");
  assert.throws(() => parseCompanyReference(write(workbook, { type: "buffer", bookType: "xlsx" })), /missing its Master List/);
  const duplicate = utils.book_new();
  utils.book_append_sheet(duplicate, utils.json_to_sheet([
    { Company: "Example", Category: "Bank", "Source URL": "https://example.test" },
    { Company: "Example", Category: "Bank", "Source URL": "https://example.test" },
  ]), "Master List");
  assert.throws(() => parseCompanyReference(write(duplicate, { type: "buffer", bookType: "xlsx" })), /duplicate/);
});

test("reference import is admin-only, additive, reviewed, and never authorizes email", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.get("/api/admin/company-reference"');
  const end = routes.indexOf('app.get("/api/admin/company-directory"', start);
  const source = routes.slice(start, end);
  assert.match(source, /isAuthenticated, isAdmin/g);
  assert.match(source, /reviewed: z.literal\(true\)/);
  assert.match(source, /notificationEmail: null, verifiedAt: null, verifiedBy: null/);
  assert.match(source, /onConflictDoNothing/);
  assert.doesNotMatch(source, /sendEmail|\.update\(/);
  assert.match(source, /sent: false, routingVerified: false/);
});
