import { z } from "zod";

export const nerSearchInput = z.object({
  certificateId: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(150),
  yearOfBirth: z.string().regex(/^\d{4}$/).optional(),
  zipCode: z.string().trim().max(12).optional(),
  maidenName: z.string().trim().max(150).optional(),
}).strict();
export type NerSearchInput = z.infer<typeof nerSearchInput>;
export const nerFamilyReportInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(150),
  searchedAt: z.string().datetime(),
  result: z.enum(["match", "no_match", "unknown"]),
  searcherName: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000),
  confirmed: z.literal(true),
}).strict();

export type NerSearchOutcome = "submitted" | "completed_match" | "completed_no_match" | "redirect_required" | "unavailable" | "unrecognized_response" | "family_reported";
export const NER_OUTCOME_LABELS: Record<NerSearchOutcome, string> = {
  submitted: "Request recorded — completion not confirmed",
  completed_match: "NER returned potential matches",
  completed_no_match: "NER returned no matches",
  redirect_required: "Continue on NER — completion not confirmed",
  unavailable: "NER unavailable — search not confirmed",
  unrecognized_response: "NER response could not be verified",
  family_reported: "Family-reported search — not confirmed by NER",
};
export type NerHistoryRecord = {
  id: string; searchedName: string; yearOfBirth: string | null; zipCode: string | null; maidenName: string | null;
  source: "sal_request" | "family_report"; outcome: NerSearchOutcome; resultCount: number | null;
  actorName: string; actorRole: string; searcherName: string; requestedAt: string; completedAt: string | null;
  reportedAt: string | null; reportedOutcome: "match" | "no_match" | "unknown" | null;
  reportNotes: string | null; matchesCaseName: boolean;
};
export type NerSearchResult = {
  source: "api" | "redirect"; success: boolean; outcome: NerSearchOutcome; message: string; searchUrl: string;
  results: { principalName?: string; documentType?: string; jurisdiction?: string }[];
  historyRecorded: boolean; caseLinked: boolean;
};
export type NerHistoryResponse = { records: NerHistoryRecord[]; externalHistoryAvailable: false };

type NerOriginSummary = {
  state: "completed" | "requested" | "reported" | "none";
  record: NerHistoryRecord | null;
};

/** A reported search or an unfinished request must never become a completed search indicator. */
export function summarizeNerSearchOrigin(records: readonly NerHistoryRecord[]): {
  family: NerOriginSummary;
  staff: Omit<NerOriginSummary, "state"> & { state: "completed" | "requested" | "none" };
  familyReport: NerHistoryRecord | null;
} {
  const latest = (matches: readonly NerHistoryRecord[]) => matches.reduce<NerHistoryRecord | null>(
    (chosen, row) => !chosen || (Date.parse(row.requestedAt) || 0) > (Date.parse(chosen.requestedAt) || 0) ? row : chosen, null,
  );
  const completed = (row: NerHistoryRecord) => row.outcome === "completed_match" || row.outcome === "completed_no_match";
  const familyRequests = records.filter(row => row.source === "sal_request" && row.actorRole === "user");
  const staffRequests = records.filter(row => row.source === "sal_request" && row.actorRole === "admin");
  const familyReport = latest(records.filter(row => row.source === "family_report"));
  const familyCompleted = latest(familyRequests.filter(completed));
  const staffCompleted = latest(staffRequests.filter(completed));
  const familyRequested = latest(familyRequests);
  const staffRequested = latest(staffRequests);
  return {
    family: familyCompleted ? { state: "completed", record: familyCompleted }
      : familyRequested ? { state: "requested", record: familyRequested }
      : familyReport ? { state: "reported", record: familyReport }
      : { state: "none", record: null },
    staff: staffCompleted ? { state: "completed", record: staffCompleted }
      : staffRequested ? { state: "requested", record: staffRequested }
      : { state: "none", record: null },
    familyReport,
  };
}
