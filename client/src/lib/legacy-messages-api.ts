import { apiRequest } from "@/lib/queryClient";

export const LEGACY_MESSAGES_KEY = ["/api/heartplan/letters"] as const;

export type LegacyMessageKind = "text" | "audio" | "video";

export interface LegacyMessage {
  id: string;
  recipientName: string;
  recipientContactId: string | null;
  subject: string | null;
  body: string | null;
  messageType: LegacyMessageKind;
  uploadStatus: "uploading" | "ready" | "failed";
  transcriptStatus: "pending" | "completed" | "failed" | null;
  transcript?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  fileSize?: number | null;
  durationSeconds?: number | null;
  objectPath?: string | null;
  releasedAt: string | null;
  createdAt: string | Date;
}

export async function createLegacyMessage(payload: {
  recipientName: string;
  recipientContactId?: string;
  subject?: string;
  body?: string;
  messageType: LegacyMessageKind;
}) {
  const response = await apiRequest("POST", "/api/heartplan/letters", payload);
  return response.json() as Promise<LegacyMessage>;
}

export function uploadLegacyMessageMedia(
  uploadURL: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadURL);
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("x-ms-blob-type", "BlockBlob");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The media upload was interrupted. Please try again."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(request.responseText || `Upload failed (${request.status})`));
        return;
      }
      try {
        resolve(request.responseText ? JSON.parse(request.responseText) : {});
      } catch {
        resolve({});
      }
    };
    request.send(file);
  });
}

export async function prepareLegacyMessageMedia(
  payload: {
    recipientName: string;
    recipientContactId?: string;
    subject?: string;
    messageType: "audio" | "video";
    fileName: string;
    contentType: string;
    fileSize: number;
    durationSeconds: number;
    recordingConsent: true;
  },
  replacingId?: string,
) {
  const endpoint = replacingId
    ? `/api/heartplan/letters/${replacingId}/replacement-url`
    : "/api/heartplan/letters/upload-url";
  const response = await apiRequest("POST", endpoint, payload);
  return response.json() as Promise<{ id: string; uploadURL: string }>;
}

export async function finalizeLegacyMessageMedia(messageId: string, durationSeconds: number) {
  const response = await apiRequest("POST", `/api/heartplan/letters/${messageId}/finalize`, {
    durationSeconds: Math.max(1, Math.round(durationSeconds)),
  });
  return response.json();
}

export async function updateLegacyMessage(
  messageId: string,
  payload: { body?: string | null; transcript?: string | null },
) {
  const response = await apiRequest("PATCH", `/api/heartplan/letters/${messageId}`, payload);
  return response.json();
}

export async function updateLegacyMessageTranscript(messageId: string, transcript: string) {
  return updateLegacyMessage(messageId, { transcript });
}

/*
 * Media uses a signed PUT URL, rather than passing large private files through
 * the application server. Keeping this flow here makes endpoint changes local.
 */
export async function uploadAndFinalizeLegacyMessageMedia(
  prepared: { id: string; uploadURL: string },
  file: File,
  durationSeconds: number,
  onProgress: (percent: number) => void,
) {
  await uploadLegacyMessageMedia(prepared.uploadURL, file, onProgress);
  return finalizeLegacyMessageMedia(prepared.id, durationSeconds);
}

export async function deleteLegacyMessage(messageId: string) {
  await apiRequest("DELETE", `/api/heartplan/letters/${messageId}`);
}

export function legacyMessageStreamUrl(messageId: string, objectPath?: string | null) {
  // Prefer a dedicated authenticated stream when the API provides one, while
  // retaining compatibility with existing object-storage paths.
  return objectPath || `/api/heartplan/letters/${messageId}/stream`;
}