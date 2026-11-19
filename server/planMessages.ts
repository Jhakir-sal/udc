import type { PlanLetter } from "@shared/schema";
import {
  PLAN_MESSAGE_MAX_BYTES,
  PLAN_MESSAGE_MAX_DURATION_SECONDS,
  PLAN_MESSAGE_MIME_TYPES,
} from "@shared/schema";

export function validateStoredPlanMessageMedia(
  messageType: "audio" | "video",
  expected: { contentType: string; fileSize: number; durationSeconds: number },
  actual: { contentType?: string | null; size?: string | number | null },
): string | null {
  const contentType = (actual.contentType || "").toLowerCase();
  const size = Number(actual.size);
  if (!(PLAN_MESSAGE_MIME_TYPES[messageType] as readonly string[]).includes(contentType)) return "Uploaded file type does not match an allowed format";
  if (contentType !== expected.contentType.toLowerCase()) return "Uploaded file type does not match the requested type";
  if (!Number.isSafeInteger(size) || size <= 0 || size !== expected.fileSize) return "Uploaded file size does not match the requested size";
  if (size > PLAN_MESSAGE_MAX_BYTES[messageType]) return "Uploaded file is too large";
  if (!Number.isInteger(expected.durationSeconds) || expected.durationSeconds <= 0 || expected.durationSeconds > PLAN_MESSAGE_MAX_DURATION_SECONDS) {
    return "Media duration must be between 1 and 300 seconds";
  }
  return null;
}

export function redactPlanLetterForAdmin(letter: PlanLetter) {
  const {
    objectPath: _objectPath,
    pendingObjectPath: _pendingObjectPath,
    transcriptObjectPath: _transcriptObjectPath,
    ...withoutPaths
  } = letter;
  return {
    ...withoutPaths,
    body: null,
    transcript: null,
    sealed: !letter.releasedAt,
  };
}

export function isPlanLetterAddressedToEmail(
  letter: Pick<PlanLetter, "recipientContactId" | "recipientName">,
  contacts: Array<{ id: string; fullName: string; email: string | null }>,
  email: string | null,
): boolean {
  if (!email?.trim()) return false;
  const recipient = letter.recipientContactId
    ? contacts.find((contact) => contact.id === letter.recipientContactId)
    : contacts.find((contact) => contact.email && contact.fullName.toLowerCase() === letter.recipientName.toLowerCase());
  return Boolean(recipient?.email && recipient.email.trim().toLowerCase() === email.trim().toLowerCase());
}

export function canReadReleasedPlanLetter(input: {
  letter: Pick<PlanLetter, "releasedAt" | "recipientContactId">;
  certificateOwnerId: string | null;
  userId: string;
  userEmail: string | null;
  recipientEmail: string | null;
}): boolean {
  if (!input.letter.releasedAt) return false;
  if (input.certificateOwnerId === input.userId) return true;
  return Boolean(input.userEmail && input.recipientEmail &&
    input.userEmail.trim().toLowerCase() === input.recipientEmail.trim().toLowerCase());
}