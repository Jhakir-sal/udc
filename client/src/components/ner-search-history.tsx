import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  FileSearch,
  FileText,
  RotateCw,
  Users,
} from "lucide-react";
import {
  NER_OUTCOME_LABELS,
  nerFamilyReportInput,
  summarizeNerSearchOrigin,
  type NerHistoryRecord,
  type NerHistoryResponse,
} from "@shared/nerSearch";
import { estateReferralIsoDate } from "@shared/estateReferral";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Variant = "admin" | "family";
type Props = { certId: string; deceasedName: string; variant: Variant };
type FamilyReport = {
  firstName: string;
  lastName: string;
  searchedAt: string;
  searcherName: string;
  result: "match" | "no_match" | "unknown";
  notes: string;
  confirmed: boolean;
};

const emptyReport: FamilyReport = {
  firstName: "",
  lastName: "",
  searchedAt: "",
  searcherName: "",
  result: "unknown",
  notes: "",
  confirmed: false,
};

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : value;
}

function outcomeState(record: NerHistoryRecord) {
  if (record.source === "family_report" || record.outcome === "family_reported") {
    return "Reported by family — not NER-confirmed";
  }
  if (record.outcome === "completed_match") return "NER returned potential matches";
  if (record.outcome === "completed_no_match") return "NER returned no matches";
  return "Requested — not confirmed";
}

function sourceBadge(record: NerHistoryRecord) {
  if (record.source === "family_report" || record.outcome === "family_reported") {
    return { label: "Reported by family", icon: Users };
  }
  if (record.actorRole === "admin") {
    return {
      label: record.outcome === "completed_match" || record.outcome === "completed_no_match" ? "SAL staff searched" : "SAL staff request",
      icon: Building2,
    };
  }
  return {
    label: record.outcome === "completed_match" || record.outcome === "completed_no_match" ? "Family searched" : "Family request",
    icon: Users,
  };
}

function originSummary(
  origin: "family" | "staff",
  state: "completed" | "requested" | "reported" | "none",
  record: NerHistoryRecord | null,
  familyReport: NerHistoryRecord | null,
  loading: boolean,
  unavailable: boolean,
) {
  if (loading) return origin === "family" ? "Loading family search history…" : "Loading SAL search history…";
  if (unavailable) return origin === "family" ? "Family history unavailable" : "SAL history unavailable";
  if (state === "completed" && record?.outcome === "completed_match") {
    return origin === "family" ? "Family searched · NER returned potential matches" : "SAL staff searched · NER returned potential matches";
  }
  if (state === "completed" && record?.outcome === "completed_no_match") {
    return origin === "family" ? "Family searched · NER returned no matches" : "SAL staff searched · NER returned no matches";
  }
  if (state === "requested") {
    return origin === "family" ? "Family search requested — not confirmed" : "SAL staff request — not confirmed";
  }
  if (state === "reported") {
    const report = familyReport || record;
    const reportedResult = report?.reportedOutcome ? ` · ${report.reportedOutcome.replace("_", " ")}` : "";
    return `Reported by family — not NER-confirmed${reportedResult}`;
  }
  return origin === "family" ? "No recorded family search" : "No recorded SAL search";
}

function OriginIndicator({
  origin,
  text,
}: {
  origin: "family" | "staff";
  text: string;
}) {
  const Icon = origin === "family" ? Users : Building2;
  return (
    <div
      className="min-w-0 rounded-md border bg-muted/20 px-3 py-2.5"
      data-testid={`ner-origin-${origin}`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
        <span>{origin === "family" ? "Family" : "SAL staff"}</span>
      </div>
      <p className="mt-1.5 break-words text-sm leading-snug text-muted-foreground">{text}</p>
    </div>
  );
}

function HistoryRecord({ record }: { record: NerHistoryRecord }) {
  const searchedDate = formatDate(record.requestedAt);
  const completedDate = formatDate(record.completedAt);
  const reportedDate = formatDate(record.reportedAt);
  const source = sourceBadge(record);
  const SourceIcon = source.icon;
  const finished = record.outcome === "completed_match" || record.outcome === "completed_no_match";
  const searcherLabel = record.source === "family_report"
    ? "Family-reported searcher"
    : finished ? "Search performed by" : "Requested by";
  const StateIcon = record.source === "family_report" || record.outcome === "family_reported"
    ? FileText
    : finished ? CheckCircle2 : Clock3;

  return (
    <article className="rounded-lg border border-border/80 bg-background/70 p-3 sm:p-4" data-testid={`ner-history-record-${record.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium">{record.searchedName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{searcherLabel} {record.searcherName || "Not provided"} · recorded by {record.actorName}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="gap-1 whitespace-nowrap">
            <SourceIcon className="h-3 w-3" aria-hidden="true" />{source.label}
          </Badge>
          <Badge variant={finished ? "default" : "secondary"} className="gap-1 whitespace-nowrap">
            <StateIcon className="h-3 w-3" aria-hidden="true" />{outcomeState(record)}
          </Badge>
        </div>
      </div>
      {record.outcome !== "completed_match" && record.outcome !== "completed_no_match" && record.source !== "family_report" && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid={`ner-history-outcome-${record.id}`}>
          {NER_OUTCOME_LABELS[record.outcome]}
        </p>
      )}
      <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
        {searchedDate && <p>Recorded: <span className="text-foreground">{searchedDate}</span></p>}
        {completedDate && <p>Completed: <span className="text-foreground">{completedDate}</span></p>}
        {reportedDate && <p>Reported search date: <span className="text-foreground">{reportedDate}</span></p>}
        {record.yearOfBirth && <p>Year supplied: <span className="text-foreground">{record.yearOfBirth}</span></p>}
        {record.zipCode && <p>ZIP supplied: <span className="text-foreground">{record.zipCode}</span></p>}
        {record.maidenName && <p>Maiden / previous name supplied: <span className="text-foreground">{record.maidenName}</span></p>}
        {record.resultCount !== null && <p>Potential results returned: <span className="text-foreground">{record.resultCount}</span></p>}
        {record.reportedOutcome && <p>Family-reported result: <span className="text-foreground">{record.reportedOutcome.replace("_", " ")}</span></p>}
      </div>
      {record.reportNotes && (
        <div className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Report details</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{record.reportNotes}</p>
        </div>
      )}
      {!record.matchesCaseName && (
        <Alert variant="destructive" className="mt-3" data-testid={`ner-history-name-warning-${record.id}`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Name differs from this case</AlertTitle>
          <AlertDescription>This recorded search used a different name than the case name.</AlertDescription>
        </Alert>
      )}
    </article>
  );
}

export function NerSearchHistory({ certId, deceasedName, variant }: Props) {
  const queryClient = useQueryClient();
  const endpoint = variant === "admin"
    ? `/api/admin/case/${encodeURIComponent(certId)}/ner-searches`
    : `/api/case/${encodeURIComponent(certId)}/ner-searches`;
  const [report, setReport] = useState<FamilyReport>(emptyReport);
  const [expanded, setExpanded] = useState(false);
  const detailsId = `ner-search-history-details-${certId}`;
  const history = useQuery<NerHistoryResponse>({
    queryKey: [endpoint],
    queryFn: async () => (await apiRequest("GET", endpoint)).json() as Promise<NerHistoryResponse>,
    enabled: Boolean(certId),
    refetchInterval: 10_000,
  });
  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!report.firstName.trim() || !report.lastName.trim()) {
        throw new Error("Enter the exact first and last name used for the NER search.");
      }
      const searchedAt = estateReferralIsoDate(report.searchedAt);
      if (!searchedAt) throw new Error("Enter a valid date and time for when the search was performed.");
      const parsed = nerFamilyReportInput.safeParse({
        firstName: report.firstName,
        lastName: report.lastName,
        searchedAt,
        result: report.result,
        searcherName: report.searcherName.trim() || undefined,
        notes: report.notes,
        confirmed: report.confirmed,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Check the family report details.");
      if (new Date(searchedAt).getTime() > Date.now()) throw new Error("The search date cannot be in the future.");
      const response = await apiRequest("POST", `${endpoint}/family-report`, parsed.data);
      return response.json();
    },
    onSuccess: async () => {
      setReport(emptyReport);
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
  });
  const historyRecords = history.data?.records ?? [];
  const origins = summarizeNerSearchOrigin(historyRecords);
  const loading = history.isLoading;
  const unavailable = history.isError && !history.data;
  const reportDate = formatDate(origins.familyReport?.reportedAt);

  return (
    <Card className="overflow-hidden" data-testid={`ner-search-history-${variant}-${certId}`}>
      <CardHeader className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileSearch className="h-4 w-4" aria-hidden="true" />NER search activity
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => history.refetch()}
              disabled={history.isFetching}
              data-testid="button-refresh-ner-history"
            >
              <RotateCw className={`mr-1.5 h-3.5 w-3.5 ${history.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded((value) => !value)}
              data-testid="button-expand-ner-details"
            >
              {expanded ? "Hide details" : "Expand details"}
              {expanded ? <ChevronUp className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs">
          A missing match does not prove there is no estate plan. External NER-site history is not automatically visible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <OriginIndicator
            origin="family"
            text={originSummary("family", origins.family.state, origins.family.record, origins.familyReport, loading, unavailable)}
          />
          <OriginIndicator
            origin="staff"
            text={originSummary("staff", origins.staff.state, origins.staff.record, origins.familyReport, loading, unavailable)}
          />
        </div>
        {origins.familyReport && (
          <p className="text-xs text-muted-foreground" data-testid="ner-family-report-summary">
            <FileText className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            Family report{reportDate ? ` · search date ${reportDate}` : ""} · not confirmed by NER
          </p>
        )}
        {history.isError && history.data && (
          <p className="text-xs text-destructive" data-testid="ner-history-refresh-error">
            Could not refresh history; showing the last successfully loaded activity.
          </p>
        )}
        <div id={detailsId} hidden={!expanded} data-testid="ner-history-details">
          <div className="space-y-4 border-t pt-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>A missing match is not proof there is no estate plan</AlertTitle>
              <AlertDescription>Search results are candidates, not verified legal identities. External NER-site history is not automatically visible here.</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild data-testid="link-ner-search-for-case">
                <a href={`/estate-registry?certificateId=${encodeURIComponent(certId)}&name=${encodeURIComponent(deceasedName)}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />Search NER for this case
                </a>
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3" data-testid="ner-history-loading">
                <Skeleton className="h-5 w-40" /><Skeleton className="h-20 w-full" />
              </div>
            ) : unavailable ? (
              <Alert variant="destructive" data-testid="ner-history-error">
                <AlertTitle>History could not be loaded</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>Please try again.</span>
                  <Button variant="outline" size="sm" onClick={() => history.refetch()}>Try again</Button>
                </AlertDescription>
              </Alert>
            ) : historyRecords.length ? (
              <div className="space-y-3" data-testid="ner-history-records">
                {historyRecords.map((record) => <HistoryRecord key={record.id} record={record} />)}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center" data-testid="ner-history-empty">
                <Clock3 className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 font-medium">No recorded NER search</p>
                <p className="mt-1 text-sm text-muted-foreground">Searches done outside this service may not be recorded here.</p>
              </div>
            )}

            <div className="border-t pt-4">
              <h3 className="font-semibold">Record a family-reported search</h3>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">For a search already performed outside SAL. This records a family report; it does not confirm a result with NER.</p>
              {reportMutation.isError && (
                <Alert variant="destructive" className="mb-4" data-testid="ner-family-report-error">
                  <AlertTitle>Report was not recorded</AlertTitle>
                  <AlertDescription>{(reportMutation.error as Error).message}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`ner-report-first-${certId}`}>Searched first name</Label>
                  <Input id={`ner-report-first-${certId}`} value={report.firstName} required onChange={(event) => setReport({ ...report, firstName: event.target.value })} data-testid="input-ner-report-first-name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ner-report-last-${certId}`}>Searched last name</Label>
                  <Input id={`ner-report-last-${certId}`} value={report.lastName} required onChange={(event) => setReport({ ...report, lastName: event.target.value })} data-testid="input-ner-report-last-name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ner-report-date-${certId}`}>When was it searched?</Label>
                  <Input id={`ner-report-date-${certId}`} type="datetime-local" value={report.searchedAt} onChange={(event) => setReport({ ...report, searchedAt: event.target.value })} data-testid="input-ner-report-date" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ner-report-searcher-${certId}`}>Who performed the search?</Label>
                  <Input id={`ner-report-searcher-${certId}`} value={report.searcherName} onChange={(event) => setReport({ ...report, searcherName: event.target.value })} data-testid="input-ner-report-searcher" />
                </div>
                <fieldset className="space-y-2 sm:col-span-2">
                  <legend className="text-sm font-medium">Family-reported result</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {([
                      ["match", "Potential match"],
                      ["no_match", "No match reported"],
                      ["unknown", "Not sure"],
                    ] as const).map(([value, label]) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name={`ner-report-result-${certId}`} value={value} checked={report.result === value} onChange={() => setReport({ ...report, result: value })} data-testid={`radio-ner-report-${value}`} />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`ner-report-notes-${certId}`}>Report details</Label>
                  <Textarea id={`ner-report-notes-${certId}`} value={report.notes} maxLength={1000} onChange={(event) => setReport({ ...report, notes: event.target.value })} data-testid="input-ner-report-notes" />
                </div>
                <div className="flex items-start gap-2 sm:col-span-2">
                  <Checkbox id={`ner-report-confirm-${certId}`} checked={report.confirmed} onCheckedChange={(checked) => setReport({ ...report, confirmed: checked === true })} data-testid="checkbox-ner-report-confirmed" />
                  <Label htmlFor={`ner-report-confirm-${certId}`} className="cursor-pointer text-sm leading-relaxed">
                    I confirm this is an accurate family report of a search performed. This is not confirmation from NER.
                  </Label>
                </div>
              </div>
              <Button
                className="mt-4"
                disabled={!report.firstName.trim() || !report.lastName.trim() || !report.searchedAt || !report.confirmed || reportMutation.isPending}
                onClick={() => reportMutation.mutate()}
                data-testid="button-submit-ner-family-report"
              >
                {reportMutation.isPending ? "Recording…" : "Record family report"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
