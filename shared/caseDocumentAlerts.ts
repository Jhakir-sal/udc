import { z } from "zod";

export type CaseDocumentAlerts = {
  unseenCount: number;
  unseenDocumentIds: string[];
  latestUploadedAt: string | null;
};
export const markCaseDocumentsSeen = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, "Select each document only once."),
}).strict();
