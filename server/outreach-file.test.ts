import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "@e965/xlsx";
import { readOutreachFile } from "../client/src/lib/outreach-file";
import { parseOutreachCsvForImport } from "@shared/outreach";

function file(name: string, bytes: Uint8Array): Pick<File, "name" | "size" | "text" | "arrayBuffer"> {
  return {
    name,
    size: bytes.byteLength,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

for (const bookType of ["xls", "xlsx"] as const) {
  test(`reads ${bookType} first worksheet and skips unusable contacts`, async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Email Address", "Name", "Company Name"],
      ["pat@example.org", "Pat Johnson", "Harbor, Inc."],
      [],
      ["missing@example.org", "", "Harbor, Inc."],
      ["later@example.org", "Lee Example", "Harbor Credit Union"],
      ["", "Unknown", "Harbor"],
    ]), "Contacts");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["email"], ["not-imported@example.org"],
    ]), "Other");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType }));
    const csv = await readOutreachFile(file(`contacts.${bookType}`, bytes));
    const parsed = parseOutreachCsvForImport(csv);
    assert.deepEqual(parsed.contacts, [
      { email: "pat@example.org", firstName: "Pat", fullName: "Pat Johnson", companyName: "Harbor, Inc." },
      { email: "later@example.org", firstName: "Lee", fullName: "Lee Example", companyName: "Harbor Credit Union" },
    ]);
    assert.deepEqual(parsed.skippedRows.map(({ reason }) => reason), ["missing name", "missing or invalid email"]);
  });
}

test("keeps CSV support and rejects unsupported or oversized files", async () => {
  const csv = file("contacts.csv", new TextEncoder().encode("email\npat@example.org"));
  assert.equal(await readOutreachFile(csv), "email\npat@example.org");
  await assert.rejects(readOutreachFile({ ...csv, name: "contacts.txt" }), /CSV, XLS, or XLSX/);
  await assert.rejects(readOutreachFile({ ...csv, name: "contacts.xlsx", size: 5_000_001 }), /smaller than 5 MB/);
});