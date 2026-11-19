import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { caseRegistrationReference, caseIdFromRegistrationReference } from "../shared/caseRegistrationReference";
import { buildFamilyInvitationEmail } from "./email";

test("case registration reference is stable, distinct from a signup secret, and resolves to its case", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const reference = caseRegistrationReference(id);
  assert.match(reference, /^SAL-REG-(?:[0-9A-Z]{5}-){4}[0-9A-Z]{5}$/);
  assert.equal(caseIdFromRegistrationReference(reference), id);
  assert.equal(caseRegistrationReference(id), reference);
  assert.notEqual(reference, id);
  assert.notEqual(caseIdFromRegistrationReference(reference.replace(/.$/, "Z")), id);
  assert.equal(caseIdFromRegistrationReference("SAL-REG-INVITE-TOKEN"), null);
});

test("family invitation shows the registration reference without claiming it verifies death", () => {
  const reference = caseRegistrationReference("123e4567-e89b-12d3-a456-426614174000");
  const email = buildFamilyInvitationEmail({
    recipientName: "Family",
    deceasedName: "Example",
    inviteToken: "private-signup-secret",
    registrationReference: reference,
  });
  assert.match(email.html, /Account registration reference:/);
  assert.ok(email.html.includes(reference));
  assert.ok(email.text?.includes(reference));
  assert.match(email.html, /It does not verify a death or grant access/);
});

test("reference lookup is staff-only and family pages use the same case reference", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const search = routes.slice(routes.indexOf('app.get("/api/search"'), routes.indexOf('// Certificates', routes.indexOf('app.get("/api/search"')));
  assert.match(search, /type === "registration_reference"/);
  assert.match(search, /userRole\?\.role !== "admin"/);
  assert.match(routes, /registrationReference: caseRegistrationReference\(invitation\.certificateId\)/);
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../client/src/pages/onboarding.tsx", import.meta.url), "utf8");
  assert.match(app, /CaseRegistrationReference caseId=\{registrationCaseId\}/);
  assert.match(onboarding, /CaseRegistrationReference caseId=\{status\.certificateId\}/);
});