import assert from "node:assert/strict";
import test from "node:test";
import { parseOutreachCsv, parseOutreachCsvForImport, renderOutreachEmail, outreachTemplateInput, OUTREACH_MAILING_ADDRESS, OUTREACH_SENDER, OUTREACH_TEMPLATES } from "@shared/outreach";
import { validateOutreachPdf } from "./outreachAttachment";

test("imports email-only lists and quoted personalized fields without duplicates", () => {
  assert.deepEqual(parseOutreachCsv("email\nPERSON@example.com\n"), [
    { email: "person@example.com", firstName: null, fullName: null, companyName: null },
  ]);
  assert.deepEqual(parseOutreachCsv('email,first_name,company_name\r\nalice@example.org,Alice,"Union, First"\r\n'), [
    { email: "alice@example.org", firstName: "Alice", fullName: null, companyName: "Union, First" },
  ]);
  assert.deepEqual(parseOutreachCsv('Email Address,Name,Company Name\npat@example.org,Pat Johnson,Harbor Credit Union'), [
    { email: "pat@example.org", firstName: "Pat", fullName: "Pat Johnson", companyName: "Harbor Credit Union" },
  ]);
  assert.throws(() => parseOutreachCsv("email\nA@example.com\na@example.com"), /Duplicate email/);
  assert.throws(() => parseOutreachCsv('email\n"unterminated'), /unterminated/);
  assert.throws(() => parseOutreachCsv("first_name\nDave"), /email column/);
  assert.throws(() => parseOutreachCsv("email\nnot-an-email"), /invalid email/);
  assert.throws(() => parseOutreachCsv('email,company_name\npat@example.org,"Harbor\nBcc: other@example.org"'), /invalid control characters/);
});

test("outreach import skips unusable contacts but retains valid rows and strict file checks", () => {
  const csv = [
    "Email Address,Name,Company Name",
    "pat@example.org,Pat Johnson,Harbor Credit Union",
    ",,",
    "bad-email,Unusable,Harbor Credit Union",
    "lee@example.org,,Harbor Credit Union",
    `long@example.org,${"L".repeat(201)},Harbor Credit Union`,
    'control@example.org,"Name\nBcc: other@example.org",Harbor Credit Union',
    "lee@example.org,Lee Example,Harbor Credit Union",
  ].join("\n");
  const result = parseOutreachCsvForImport(csv);
  assert.deepEqual(result.contacts.map(({ email }) => email), ["pat@example.org", "lee@example.org"]);
  assert.deepEqual(result.skippedRows.map(({ reason }) => reason), [
    "missing or invalid email", "missing name", "name or company is too long",
    "invalid characters in name or company",
  ]);
  assert.deepEqual(parseOutreachCsvForImport("email\nperson@example.org").contacts, [
    { email: "person@example.org", firstName: null, fullName: null, companyName: null },
  ]);
  assert.deepEqual(parseOutreachCsvForImport("email,name\nbad-email,Name").contacts, []);
  assert.throws(() => parseOutreachCsvForImport("email,name\nbad@example.org,Pat\nbad@example.org,Lee"), /Duplicate email/);
  assert.throws(() => parseOutreachCsvForImport("email,name\npat@example.org,Pat,Extra"), /wrong number of columns/);
});

test("saved templates personalize safely and always include compliance footer", () => {
  const input = {
    label: "Intro",
    subject: "Hello {{company_name}}",
    body: "Hi {{first_name}},\n\nCan we talk to {{company_name}}?\n\nDave",
  };
  assert.equal(outreachTemplateInput.safeParse(input).success, true);
  assert.equal(outreachTemplateInput.safeParse({ ...input, subject: "Hi\nBcc: other@example.org" }).success, false);
  assert.equal(outreachTemplateInput.safeParse({ ...input, body: "{{secret}}" }).success, false);
  assert.equal(outreachTemplateInput.safeParse({ ...input, body: "Hi [First Name]" }).success, false);
  assert.equal(outreachTemplateInput.safeParse({ ...input, body: "I've attached a PDF." }).success, false);
  assert.equal(outreachTemplateInput.safeParse({ ...input, body: "I've attached a PDF.", attachPartnerOverview: true }).success, true);
  const rendered = renderOutreachEmail(
    { email: "pat@example.org", firstName: "<Pat>", companyName: "A & B" },
    "custom-id", "https://example.org/unsubscribe",
    { id: "custom-id", ...input },
  );
  assert.equal(rendered.subject, "Hello A & B");
  assert.match(rendered.text, /Hi <Pat>/);
  assert.equal(OUTREACH_MAILING_ADDRESS, "21002 Mack Ave Grosse Pointe Woods Mi 48236");
  assert.ok(rendered.text.includes(`Steps After Life · ${OUTREACH_MAILING_ADDRESS}`));
  assert.ok(rendered.html.includes(`Steps After Life · ${OUTREACH_MAILING_ADDRESS}`));
  assert.match(rendered.text, /https:\/\/example.org\/unsubscribe/);
  assert.match(rendered.html, /Hi &lt;Pat&gt;/);
  assert.match(rendered.html, /A &amp; B/);
  assert.match(rendered.html, /Steps After Life/);
  assert.match(rendered.html, /color:#32453a/);
  assert.match(rendered.html, /href="https:\/\/example.org\/unsubscribe"/);
  assert.throws(() => renderOutreachEmail(
    { email: "pat@example.org", firstName: "Pat", companyName: "Harbor\nBcc: other@example.org" },
    "custom-id", "https://example.org/unsubscribe", { id: "custom-id", ...input },
  ), /invalid company name/);
});

test("credit union template escapes contact details, includes footer and no imaginary attachment", () => {
  const url = "https://example.org/outreach/unsubscribe/example";
  const rendered = renderOutreachEmail({
    email: "contact@example.org", firstName: "<Alice>", companyName: "A & B Credit Union",
  }, OUTREACH_TEMPLATES[0].id, url);
  assert.match(rendered.text, /Hi <Alice>,/);
  assert.match(rendered.text, /A & B Credit Union/);
  assert.match(rendered.text, /I can share a brief overview/);
  assert.match(rendered.text, /hello@stepsafterlife\.com/);
  assert.doesNotMatch(rendered.text, /Help@stepsafterlife\.com/i);
  assert.doesNotMatch(rendered.text, /I've attached/);
  assert.match(rendered.text, /21002 Mack Ave Grosse Pointe Woods Mi 48236/);
  assert.match(rendered.text, /https:\/\/example.org\/outreach\/unsubscribe\/example/);
  assert.match(rendered.html, /&lt;Alice&gt;/);
  assert.match(rendered.html, /A &amp; B Credit Union/);
  assert.equal(OUTREACH_SENDER, "hello@stepsafterlife.com");
  assert.throws(() => renderOutreachEmail({ email: "contact@example.org", firstName: null, companyName: null }, "wrong", url), /Unknown template/);
  const withPdf = renderOutreachEmail({
    email: "contact@example.org", firstName: "<Alice>", companyName: "A & B Credit Union",
  }, OUTREACH_TEMPLATES[0].id, url, undefined, { attachment: true });
  assert.match(withPdf.text, /I've attached a brief overview/);
  assert.match(withPdf.html, /I&#39;ve attached a brief overview/);
});

test("per-send PDFs must have bounded, intact content and safe names", () => {
  const content = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF").toString("base64");
  const attachment = validateOutreachPdf({ filename: "Approved overview.pdf", content });
  assert.equal(attachment?.content, content);
  assert.equal(attachment?.type, "application/pdf");
  assert.equal(attachment?.disposition, "attachment");
  assert.equal(validateOutreachPdf(undefined), undefined);
  assert.throws(() => validateOutreachPdf({ filename: "../overview.pdf", content }), /simple filename/);
  assert.throws(() => validateOutreachPdf({ filename: "overview.pdf", content: content + "!" }), /simple filename/);
  assert.throws(() => validateOutreachPdf({ filename: "overview.pdf", content: Buffer.from("not a PDF").toString("base64") }), /valid PDF/);
  assert.throws(() => validateOutreachPdf({ filename: "overview.pdf", content: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64") }), /5 MB/);
});

test("SAL-branded test messages use sample details and never include a real contact opt-out link", () => {
  const sample = renderOutreachEmail(
    { email: "staff@example.org", firstName: "Taylor", companyName: "Example Credit Union" },
    "credit_union_intro", "", undefined, { test: true },
  );
  assert.match(sample.subject, /^\[TEST\] /);
  assert.match(sample.text, /Taylor/);
  assert.ok(sample.text.includes(`Steps After Life · ${OUTREACH_MAILING_ADDRESS}`));
  assert.match(sample.html, /Steps After Life/);
  assert.match(sample.html, /TEST EMAIL · SAMPLE DETAILS/);
  assert.match(sample.html, /Hi Taylor,<br><br>When a credit union member dies/);
  assert.match(sample.html, /Best,<br>Dave Guzman<br>Steps After Life/);
  assert.doesNotMatch(sample.html, /white-space:pre-wrap/);
  assert.doesNotMatch(sample.html, /href=/);
  assert.doesNotMatch(sample.text, /To stop receiving partnership emails:/);
});

test("custom outreach copy keeps safe paragraph spacing in Outlook HTML and plain text", () => {
  const template = { id: "custom", label: "Custom", subject: "Hello", body: "Hi {{first_name}},\r\n\r\nA <thoughtful> note & offer.\r\n\r\nBest,\r\nTeam" };
  const rendered = renderOutreachEmail(
    { email: "staff@example.org", firstName: "Taylor", companyName: "Example Credit Union" },
    template.id, "https://example.org/unsubscribe", template,
  );
  assert.match(rendered.html, /Hi Taylor,<br><br>A &lt;thoughtful&gt; note &amp; offer\.<br><br>Best,<br>Team/);
  assert.doesNotMatch(rendered.html, /<thoughtful>/);
  assert.match(rendered.text, /Hi Taylor,\r\n\r\nA <thoughtful> note & offer/);
});