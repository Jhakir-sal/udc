import { z } from "zod";

export const assignDocumentAccounts = z.object({
  accountIds: z.array(z.string().uuid()).max(200).refine(
    ids => new Set(ids).size === ids.length,
    "Select each account only once.",
  ),
}).strict();

export type DocumentAccountLink = { documentId: string; accountId: string };
