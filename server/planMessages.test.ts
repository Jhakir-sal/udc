import test from "node:test";
import assert from "node:assert/strict";
import { insertPlanLetterSchema, planMessageUploadSchema } from "@shared/schema";
import { canReadReleasedPlanLetter, isPlanLetterAddressedToEmail, redactPlanLetterForAdmin, validateStoredPlanMessageMedia } from "./planMessages";
import { readFileSync } from "node:fs";

test("preserves text-letter compatibility and requires text body", () => {
  assert.equal(insertPlanLetterSchema.safeParse({ planId: "p", recipientName: "Sam", body: "Hello" }).success, true);
  assert.equal(insertPlanLetterSchema.safeParse({ planId: "p", recipientName: "Sam", messageType: "text" }).success, false);
});

test("strictly validates media type, size, and duration", () => {
  const valid = { recipientName: "Sam", recipientContactId: "contact", messageType: "audio", fileName: "voice.mp3", contentType: "audio/mpeg", fileSize: 100, durationSeconds: 30, recordingConsent: true };
  assert.equal(planMessageUploadSchema.safeParse(valid).success, true);
  assert.equal(planMessageUploadSchema.safeParse({ ...valid, contentType: "text/html" }).success, false);
  assert.equal(planMessageUploadSchema.safeParse({ ...valid, fileSize: 26 * 1024 * 1024 }).success, false);
  assert.equal(planMessageUploadSchema.safeParse({ ...valid, durationSeconds: 301 }).success, false);
  assert.equal(planMessageUploadSchema.safeParse({ ...valid, recordingConsent: false }).success, false);
  assert.equal(validateStoredPlanMessageMedia("audio", { contentType: "audio/mpeg", fileSize: 100, durationSeconds: 30 }, { contentType: "audio/mpeg", size: "100" }), null);
  assert.match(validateStoredPlanMessageMedia("audio", { contentType: "audio/mpeg", fileSize: 100, durationSeconds: 30 }, { contentType: "audio/mpeg", size: "99" })!, /size/);
});

test("released access is limited to case owner or addressed recipient", () => {
  const letter = { releasedAt: new Date(), recipientContactId: "c" };
  assert.equal(canReadReleasedPlanLetter({ letter, certificateOwnerId: "family", userId: "family", userEmail: null, recipientEmail: null }), true);
  assert.equal(canReadReleasedPlanLetter({ letter, certificateOwnerId: "family", userId: "recipient", userEmail: "LOVE@example.com", recipientEmail: "love@example.com" }), true);
  assert.equal(canReadReleasedPlanLetter({ letter: { ...letter, releasedAt: null }, certificateOwnerId: "family", userId: "family", userEmail: null, recipientEmail: null }), false);
});

test("admin representation is permanently metadata-only, including released messages", () => {
  const row = { id: "l", body: "secret", transcript: "secret words", objectPath: "/objects/secret", pendingObjectPath: "/objects/pending", transcriptObjectPath: "/objects/transcript-source", releasedAt: null } as any;
  const redacted = redactPlanLetterForAdmin(row) as any;
  assert.equal(redacted.body, null);
  assert.equal(redacted.transcript, null);
  assert.equal("objectPath" in redacted, false);
  assert.equal("transcriptObjectPath" in redacted, false);
  assert.equal(redacted.sealed, true);
  const released = redactPlanLetterForAdmin({ ...row, releasedAt: new Date() }) as any;
  assert.equal(released.body, null);
  assert.equal(released.transcript, null);
  assert.equal("objectPath" in released, false);
});

test("recipient matching isolates messages across multiple trusted contacts", () => {
  const contacts = [
    { id: "a", fullName: "Alex Loved", email: "alex@example.com" },
    { id: "b", fullName: "Blair Loved", email: "blair@example.com" },
  ];
  const alexLetter = { recipientContactId: "a", recipientName: "Alex Loved" } as any;
  const blairLetter = { recipientContactId: "b", recipientName: "Blair Loved" } as any;
  assert.equal(isPlanLetterAddressedToEmail(alexLetter, contacts, "alex@example.com"), true);
  assert.equal(isPlanLetterAddressedToEmail(blairLetter, contacts, "alex@example.com"), false);
  assert.equal(isPlanLetterAddressedToEmail(blairLetter, contacts, "blair@example.com"), true);
});

test("media routes require authentication, planner ownership, cleanup, and immutable activation", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  for (const path of [
    "/api/heartplan/letters/upload-url",
    "/api/heartplan/letters/:id/replacement-url",
    "/api/heartplan/letters/:id/finalize",
  ]) {
    assert.match(routes, new RegExp(`app\\.post\\("${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", isAuthenticated, isPlanner,`));
  }
  assert.match(routes, /deleteObjectEntity\(oldObjectPath\)/);
  assert.match(routes, /deleteObjectEntity\(path\)/);
  assert.match(routes, /plan\.status === "activated"/);
  assert.match(schema, /recordingConsent: z\.literal\(true/);
  assert.match(routes, /consentConfirmedAt: new Date\(\)/);
  assert.match(routes, /referenced by a legacy message and cannot be deleted/);
});

test("generated transcription is conditional on the active media revision and no manual edit", () => {
  const storage = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(storage, /setPlanLetterGeneratedTranscript/);
  assert.match(storage, /eq\(planLetters\.transcriptObjectPath, objectPath\)/);
  assert.match(storage, /isNull\(planLetters\.transcriptEditedAt\)/);
  assert.match(routes, /transcriptEditedAt: new Date\(\)/);
  assert.match(routes, /transcriptObjectPath: letter\.pendingObjectPath/);
});

test("activation releases the same rows and sends sign-in invitations without message attachment", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /letterIds: letters\.map\(l => l\.id\)/);
  assert.match(routes, /buildFamilyInvitationEmail/);
  assert.match(routes, /Legacy messages are never placed in email/);
  assert.doesNotMatch(routes, /left this letter for you through HeartPlan/);
  assert.match(routes, /\/api\/family\/cases\/:certificateId\/legacy-messages", isAuthenticated/);
  assert.match(routes, /\/api\/family\/legacy-messages", isAuthenticated/);
  assert.match(routes, /\/api\/family\/legacy-messages\/:id\/stream", isAuthenticated/);
});