import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCaseContactOptions,
  caseContactPayload,
  mapCandidateToCaseContact,
  savedCaseContactDraft,
} from "./case-contact-options";

test("case choices retain same-name people, identify sources, and exclude discovered relatives", () => {
  const options = buildCaseContactOptions({
    certificate: { nextOfKinName: "Sam Example", submitterRelationship: "Child" },
    owner: { firstName: "Sam", lastName: "Example", email: "owner@example.invalid" },
    familyAccounts: [{ id: "member", accountName: "Sam Example", email: "other@example.invalid" }],
    relatives: [
      { id: "manual", fullName: "Manual Person", dataSource: "manual_entry" },
      { id: "discovered", fullName: "Discovered Person", dataSource: "public_records" },
      { id: "unverified", fullName: "Unverified Person", dataSource: "manual_entry", unverified: true },
    ],
  });
  assert.equal(options.length, 4);
  assert.equal(new Set(options.map((p) => p.id)).size, 4);
  assert.equal(options.filter((p) => p.name === "Sam Example").length, 3);
  assert.equal(options.find((p) => p.id === "case-owner")?.relationship, "Child");
  assert(!options.some((p) => /Discovered|Unverified/.test(p.name)));
});

test("candidate mapping clears missing details and save payload is strictly role-scoped", () => {
  const draft = mapCandidateToCaseContact("nextOfKin", { id: "new", name: "New Person", source: "Case person" });
  assert.deepEqual(caseContactPayload("nextOfKin", draft), {
    nextOfKinName: "New Person", nextOfKinRelationship: "", nextOfKinPhone: "",
    nextOfKinEmail: "", nextOfKinAddress: "", nextOfKinCity: "", nextOfKinState: "", nextOfKinZip: "",
  });
  assert(!("contactName" in caseContactPayload("nextOfKin", draft)));
  assert(!("informantName" in caseContactPayload("nextOfKin", draft)));
});

test("structured addresses remain complete when choosing the same person for another role", () => {
  const person = { id: "known", name: "Known Person", source: "Next of Kin",
    address: "123 Example Road", city: "Testville", state: "MI", zip: "48000", relationship: "Child" };
  const nok = mapCandidateToCaseContact("nextOfKin", person);
  assert.equal(nok.nextOfKinAddress, "123 Example Road");
  assert.equal(nok.nextOfKinCity, "Testville");
  assert.equal(nok.nextOfKinZip, "48000");
  for (const role of ["primaryContact", "informant"] as const) {
    const payload = caseContactPayload(role, mapCandidateToCaseContact(role, person));
    assert.equal(payload[role === "informant" ? "informantAddress" : "contactAddress"],
      "123 Example Road, Testville, MI, 48000");
  }
});

test("saved role drafts do not import another role or infer identity", () => {
  const draft = savedCaseContactDraft("informant", {
    contactName: "Other Role", nextOfKinName: "Another Role", informantName: "Saved Informant",
    informantPhone: null,
  });
  assert.equal(draft.informantName, "Saved Informant");
  assert.equal(draft.informantPhone, "");
  assert.equal(draft.contactName, "");
  assert.equal(draft.nextOfKinName, "");
});
