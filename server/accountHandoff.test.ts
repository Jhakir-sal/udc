import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./db";
import { caseEvents, certificates, connectedAccounts, notifications } from "@shared/schema";
import { adminAccountUpdateSchema, familyAccountView, saveAdminAccountUpdate } from "./accountHandoff";

test("handoff validation rejects unsafe values and supports explicit clearing", () => {
  assert.equal(adminAccountUpdateSchema.safeParse({ responsibleParty: "anyone" }).success, false);
  assert.equal(adminAccountUpdateSchema.safeParse({ familyContactEmail: "javascript:alert(1)" }).success, false);
  assert.equal(adminAccountUpdateSchema.safeParse({ familyContactPhone: "tel:malicious" }).success, false);
  assert.equal(adminAccountUpdateSchema.safeParse({ familyActionInstructions: "a".repeat(4001) }).success, false);
  assert.equal(adminAccountUpdateSchema.safeParse({ notes: "a".repeat(20001) }).success, false);
  assert.equal(adminAccountUpdateSchema.safeParse({ notes: "" }).success, true);
  assert.equal(adminAccountUpdateSchema.safeParse({ certificateId: "another-case" }).success, false);
  assert.equal(adminAccountUpdateSchema.safeParse({}).success, false);
  const cleared = adminAccountUpdateSchema.parse({
    responsibleParty: "sal_team", selectedAction: null,
    familyActionInstructions: " ", familyContactPhone: "", familyContactEmail: "",
  });
  assert.equal(cleared.familyActionInstructions, null);
  assert.equal(cleared.familyContactPhone, null);
  assert.equal(cleared.familyContactEmail, null);
  assert.equal(cleared.selectedAction, null);
});

test("account handoff persists family details, history and in-app notification without executing the action", async () => {
  const certId = randomUUID();
  const accountId = randomUUID();
  try {
    await db.insert(certificates).values({
      id: certId, deceasedName: "Synthetic Handoff Case", dateOfDeath: "2026-01-01",
      dateOfBirth: "1950-01-01", certificateNumber: `SYN-HANDOFF-${certId}`, issuingAuthority: "Synthetic Test",
    });
    await db.insert(connectedAccounts).values({
      id: accountId, certificateId: certId, accountName: "Synthetic Service", accountType: "Utility",
      category: "miscellaneous", responsibleParty: "sal_team", status: "active", notes: "INTERNAL STAFF NOTE",
    });
    const data = adminAccountUpdateSchema.parse({
      responsibleParty: "family", selectedAction: "continue",
      familyActionInstructions: "Call the account department.\nAsk what paperwork is needed.",
      familyContactPhone: "+1 (202) 555-0123", familyContactEmail: "service@example.invalid",
    });
    const actor = { id: null, name: "Synthetic Concierge" };
    assert.equal(await saveAdminAccountUpdate(randomUUID(), accountId, data, actor), undefined);
    const updated = await saveAdminAccountUpdate(certId, accountId, data, actor);
    assert.equal(updated?.responsibleParty, "family");
    assert.equal(updated?.familyContactEmail, "service@example.invalid");
    assert.equal(updated?.familyActionInstructions, data.familyActionInstructions);
    assert.equal(updated?.status, "active");
    assert.equal(updated?.notificationSentAt, null);
    assert.equal(updated?.completedBy, null);
    assert.equal(updated?.notes, "INTERNAL STAFF NOTE");
    assert.equal(familyAccountView(updated!).notes, null);
    // The email-panel notes editor sends only notes: it must not change status,
    // handoff instructions or notify the family/company.
    const privateNote = "Synthetic private SAL follow-up.\nDo not send to the company.";
    const noteUpdate = await saveAdminAccountUpdate(certId, accountId,
      adminAccountUpdateSchema.parse({ notes: privateNote }), actor);
    assert.equal(noteUpdate?.notes, privateNote);
    assert.equal(noteUpdate?.status, updated?.status);
    assert.equal(noteUpdate?.responsibleParty, updated?.responsibleParty);
    assert.equal(noteUpdate?.familyActionInstructions, updated?.familyActionInstructions);
    assert.equal(noteUpdate?.notificationSentAt, null);
    assert.equal(familyAccountView(noteUpdate!).notes, null);
    const [persisted] = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, accountId));
    assert.equal(persisted.notes, privateNote);
    const clearedNotes = await saveAdminAccountUpdate(certId, accountId,
      adminAccountUpdateSchema.parse({ notes: "" }), actor);
    assert.equal(clearedNotes?.notes, "");
    assert.equal(familyAccountView(clearedNotes!).notes, null);
    assert.equal(familyAccountView(updated!).familyContactEmail, data.familyContactEmail);
    const events = await db.select().from(caseEvents).where(eq(caseEvents.certificateId, certId));
    const alerts = await db.select().from(notifications).where(eq(notifications.certificateId, certId));
    assert.equal(events.length, 1);
    assert.equal(events[0].actorName, "Synthetic Concierge");
    assert.equal(events[0].eventType, "account_handoff_updated");
    assert.equal(alerts.length, 1);
    assert(!alerts[0].message.includes("INTERNAL STAFF NOTE"));
    assert(!events[0].description.includes("service@example.invalid"));
    await saveAdminAccountUpdate(certId, accountId, data, actor);
    assert.equal((await db.select().from(caseEvents).where(eq(caseEvents.certificateId, certId))).length, 1);
    const returned = await saveAdminAccountUpdate(certId, accountId, { responsibleParty: "sal_team" }, actor);
    assert.equal(returned?.familyContactPhone, data.familyContactPhone);
    assert.equal(familyAccountView(returned!).familyContactPhone, null);
    assert.equal(familyAccountView(returned!).familyActionInstructions, null);
    const cleared = await saveAdminAccountUpdate(certId, accountId, adminAccountUpdateSchema.parse({
      familyActionInstructions: "", familyContactPhone: "", familyContactEmail: "", selectedAction: null,
    }), actor);
    assert.equal(cleared?.familyActionInstructions, null);
    assert.equal(cleared?.familyContactPhone, null);
    assert.equal(cleared?.familyContactEmail, null);
    assert.equal(cleared?.selectedAction, null);
    assert.equal(cleared?.status, "active");
  } finally {
    await db.delete(notifications).where(eq(notifications.certificateId, certId));
    await db.delete(caseEvents).where(eq(caseEvents.certificateId, certId));
    await db.delete(connectedAccounts).where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.certificateId, certId)));
    await db.delete(certificates).where(eq(certificates.id, certId));
    await pool.end();
  }
});
