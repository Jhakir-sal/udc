import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Pause, Play, Plus, RefreshCw, Search, ShieldAlert, Users, XCircle } from "lucide-react";
import type { BulkSmsCandidate, BulkSmsOverview, BulkSmsRecipient, BulkSmsRun, CreateBulkSmsInput } from "@shared/orsaBulkSms";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEFAULT_ATTESTATION = "I attest that the selected ORSA members have authorized promotional text messages from ORSA and Steps After Life, based on the permission collected during our contract process.";
const TIMEZONES = [
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Denver", "Mountain"],
  ["America/Chicago", "Central"],
  ["America/New_York", "Eastern"],
] as const;
const STATUS_FILTERS = ["all", "pending", "submitted", "needs_review", "skipped", "sending"] as const;
type RecipientStatus = typeof STATUS_FILTERS[number];
type ConfirmAction = "start" | "pause" | "cancel" | null;

function apiError(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed. Refresh and try again.";
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function countFor(run: BulkSmsRun, status: string): number {
  if (status === "submitted") return Number(run.counts?.submitted ?? run.counts?.sent ?? 0);
  return Number(run.counts?.[status] ?? 0);
}

function dateLabel(value: string | null | undefined, timezone?: string): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid schedule";
  return date.toLocaleString(undefined, { timeZone: timezone || undefined, dateStyle: "medium", timeStyle: "short" });
}

function toScheduledIso(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(new Date(guess));
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
      const delta = desired - represented;
      guess += delta;
      if (delta === 0) break;
    }
    const converted = new Date(guess);
    const check = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(converted);
    const values = Object.fromEntries(check.map(part => [part.type, part.value]));
    if (Number(values.year) !== year || Number(values.month) !== month || Number(values.day) !== day ||
        Number(values.hour) !== hour || Number(values.minute) !== minute) return null;
    return converted.toISOString();
  } catch {
    return null;
  }
}

function smsSegments(message: string): number {
  return message.length <= 160 ? 1 : Math.ceil(message.length / 153);
}

function runSummary(run: BulkSmsRun) {
  return [
    ["Pending", countFor(run, "pending")],
    ["Submitted", countFor(run, "submitted")],
    ["Needs review", countFor(run, "needs_review")],
    ["Skipped", countFor(run, "skipped")],
    ["Sending", countFor(run, "sending")],
  ] as const;
}

export function OrsaBulkSms() {
  const overview = useQuery<BulkSmsOverview>({
    queryKey: ["/api/admin/orsa/bulk-sms"],
    refetchInterval: 10_000,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [eligibilityFilter, setEligibilityFilter] = useState<"all" | "eligible" | "excluded">("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [attestation, setAttestation] = useState(DEFAULT_ATTESTATION);
  const [smsPermissionConfirmed, setSmsPermissionConfirmed] = useState(false);
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [timezoneConfirmed, setTimezoneConfirmed] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(1000);
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [recipientStatus, setRecipientStatus] = useState<RecipientStatus>("all");
  const [offset, setOffset] = useState(0);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pendingRunId, setPendingRunId] = useState("");
  const [providerApprovalReviewed, setProviderApprovalReviewed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const [companionDraft, setCompanionDraft] = useState(false);
  const [otherMessagesToday, setOtherMessagesToday] = useState("");
  const otherUsageValid = otherMessagesToday.trim() !== "" &&
    Number.isInteger(Number(otherMessagesToday)) && Number(otherMessagesToday) >= 0 && Number(otherMessagesToday) <= 6000;
  const companionBudget = Math.max(0, 5900 - (otherUsageValid ? Number(otherMessagesToday) : 0));

  const candidates = overview.data?.candidates ?? [];
  const runs = overview.data?.runs ?? [];
  const message = overview.data?.message ?? "";
  const reasons = useMemo(() => Array.from(new Set(candidates.filter(candidate => !candidate.eligible && candidate.reason).map(candidate => candidate.reason!))).sort(), [candidates]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredCandidates = useMemo(() => candidates.filter(candidate => {
    const matchesSearch = !normalizedSearch || `${candidate.displayName ?? ""} ${candidate.phone ?? ""}`.toLowerCase().includes(normalizedSearch);
    const matchesEligibility = eligibilityFilter === "all" || (eligibilityFilter === "eligible" ? candidate.eligible : !candidate.eligible);
    const matchesReason = reasonFilter === "all" || candidate.reason === reasonFilter;
    return matchesSearch && matchesEligibility && matchesReason;
  }), [candidates, normalizedSearch, eligibilityFilter, reasonFilter]);
  const filteredEligible = filteredCandidates.filter(candidate => candidate.eligible);
  const eligibleCount = candidates.filter(candidate => candidate.eligible).length;
  const excludedCount = candidates.length - eligibleCount;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCandidates = candidates.filter(candidate => selectedSet.has(candidate.id) && candidate.eligible);
  const selectedRun = runs.find(run => run.id === selectedRunId) ?? null;
  const scheduledIso = scheduledAt ? toScheduledIso(scheduledAt, timezone) : "";
  const scheduledError = scheduledAt && !scheduledIso ? "Enter a valid local time in the selected timezone; daylight-saving gaps are not valid." : "";
  const scheduledHour = scheduledAt ? Number(scheduledAt.slice(11, 13)) : null;
  const scheduleWindowError = scheduledAt && scheduledIso && (scheduledHour! < 9 || scheduledHour! >= 19)
    ? "Scheduled runs must start at or after 9:00 AM and before 7:00 PM in the selected timezone."
    : "";
  const scheduleInPast = Boolean(scheduledIso && new Date(scheduledIso).getTime() <= Date.now());
  const scheduleError = scheduledError || scheduleWindowError || (scheduleInPast ? "Choose a future schedule time." : "");
  const createAllowed = (!companionDraft || (otherUsageValid && selectedCandidates.length <= companionBudget && dailyLimit <= companionBudget)) &&
    selectedCandidates.length > 0 && attestation.trim().length >= 40 && smsPermissionConfirmed &&
    timezoneConfirmed && Number.isInteger(intervalSeconds) && intervalSeconds >= 2 && intervalSeconds <= 300 &&
    Number.isInteger(dailyLimit) && dailyLimit >= 1 && dailyLimit <= 10000 && !scheduleError;
  const draftBlockers = [
    selectedCandidates.length === 0 ? "Select at least one eligible recipient." : "",
    companionDraft && !otherUsageValid ? "Enter today's actual RingCentral usage, including 0 if none." : "",
    companionDraft && otherUsageValid && (selectedCandidates.length > companionBudget || dailyLimit > companionBudget)
      ? "Reduce the selected recipients and daily limit to the remaining outreach budget." : "",
    attestation.trim().length < 40 ? "Complete the SMS permission statement (at least 40 characters)." : "",
    !smsPermissionConfirmed ? "Check the explicit SMS permission confirmation." : "",
    !timezoneConfirmed ? "Check the audience time-zone confirmation." : "",
    !Number.isInteger(intervalSeconds) || intervalSeconds < 2 || intervalSeconds > 300
      ? "Enter a whole-number interval from 2 to 300 seconds." : "",
    !Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000
      ? "Enter a whole-number daily limit from 1 to 10,000." : "",
    scheduleError,
  ].filter(Boolean);

  useEffect(() => {
    if (pendingRunId && runs.some(run => run.id === pendingRunId)) {
      setSelectedRunId(pendingRunId);
      setPendingRunId("");
    } else if (!selectedRunId && runs.length && !pendingRunId) setSelectedRunId(runs[0].id);
    else if (selectedRunId && !runs.some(run => run.id === selectedRunId)) setSelectedRunId(runs[0]?.id ?? "");
  }, [runs, selectedRunId, pendingRunId]);

  const recipientUrl = selectedRun
    ? `/api/admin/orsa/bulk-sms/${encodeURIComponent(selectedRun.id)}?status=${recipientStatus}&limit=100&offset=${offset}`
    : "";
  const recipientsQuery = useQuery<{ run: BulkSmsRun; recipients: BulkSmsRecipient[]; total: number }>({
    queryKey: [recipientUrl],
    enabled: Boolean(selectedRun),
    refetchInterval: selectedRun && ["running", "paused"].includes(selectedRun.status) ? 10_000 : false,
  });

  const refreshData = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/bulk-sms"] });
    if (selectedRunId) void queryClient.invalidateQueries({ queryKey: [recipientUrl] });
  };

  const createDraft = useMutation({
    mutationFn: async (input: CreateBulkSmsInput) => {
      const response = await apiRequest("POST", "/api/admin/orsa/bulk-sms", input);
      return response.json() as Promise<{ runId: string; queued: number; excluded: number }>;
    },
    onSuccess: result => {
      setDraftNotice(`Draft created: ${result.queued} recipients queued; ${result.excluded} excluded. No text messages were sent.`);
      setSelectedIds([]);
      setSmsPermissionConfirmed(false);
      setTimezoneConfirmed(false);
      setOffset(0);
      refreshData();
      setPendingRunId(result.runId);
      setSelectedRunId("");
    },
  });
  const runAction = useMutation({
    mutationFn: async ({ action, runId }: { action: Exclude<ConfirmAction, null>; runId: string }) => {
      const url = `/api/admin/orsa/bulk-sms/${encodeURIComponent(runId)}/${action}`;
      const body = action === "start" ? { confirmed: true, providerLimitsConfirmed: true } : { confirmed: true };
      const response = await apiRequest("POST", url, body);
      if (action === "start") return response.json() as Promise<{ ok: true }>;
      return response.json().catch(() => ({ ok: true as const }));
    },
    onSuccess: () => {
      setConfirmAction(null);
      setProviderApprovalReviewed(false);
      setActionError("");
      refreshData();
    },
    onError: error => {
      setActionError(apiError(error));
      setConfirmAction(null);
    },
  });

  function toggleCandidate(candidate: BulkSmsCandidate, checked: boolean) {
    if (!candidate.eligible) return;
    setSelectedIds(ids => checked ? Array.from(new Set([...ids, candidate.id])) : ids.filter(id => id !== candidate.id));
  }

  function selectAllFiltered() {
    setSelectedIds(ids => Array.from(new Set([...ids, ...filteredEligible.map(candidate => candidate.id)])));
  }

  function submitDraft() {
    if (!createAllowed) return;
    createDraft.mutate({
      memberIds: selectedCandidates.map(candidate => candidate.id),
      attestation: attestation.trim(),
      smsPermissionConfirmed: true,
      timezone,
      timezoneConfirmed: true,
      intervalSeconds,
      dailyLimit,
      scheduledAt: scheduledIso || new Date().toISOString(),
    });
  }

  function prepareCompanionDraft() {
    setCompanionDraft(true);
    setTimezone("America/New_York");
    setTimezoneConfirmed(false);
    setSmsPermissionConfirmed(false);
    setScheduledAt("");
    setDailyLimit(companionBudget);
    setSelectedIds(candidates.filter(candidate => candidate.eligible).slice(0, companionBudget).map(candidate => candidate.id));
    setProviderApprovalReviewed(false);
    setDraftNotice("Email companion loaded as an unsaved draft. No texts sent. Enter today's other SMS usage, review permission and pacing, then create the draft. Leave the optional start time blank to make it ready when separately approved. Starting remains a separate confirmation.");
  }

  function requestAction(action: Exclude<ConfirmAction, null>) {
    setActionError("");
    setProviderApprovalReviewed(false);
    setConfirmAction(action);
  }

  function confirmRunAction() {
    if (!selectedRun || !confirmAction || (confirmAction === "start" && !providerApprovalReviewed)) return;
    runAction.mutate({ action: confirmAction, runId: selectedRun.id });
  }

  const pageRecipients = recipientsQuery.data?.recipients ?? [];
  const totalRecipients = recipientsQuery.data?.total ?? 0;
  const currentStart = totalRecipients ? offset + 1 : 0;
  const currentEnd = Math.min(offset + 100, totalRecipients);

  return <section className="space-y-4" aria-labelledby="orsa-bulk-sms-title">
    <Card className="border-teal-700/25">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Users className="h-5 w-5 text-teal-700" aria-hidden="true"/>
              <CardTitle id="orsa-bulk-sms-title">Structured bulk SMS</CardTitle>
              <Badge variant={overview.data?.deliveryEnabled ? "secondary" : "outline"}>{overview.data?.deliveryEnabled ? "Live delivery enabled" : "Drafting only"}</Badge>
            </div>
            <CardDescription>Choose a reviewed audience and create a scheduled run. Draft creation records the selection and administrator attestation only; it sends nothing.</CardDescription>
            <Button type="button" variant="outline" className="mt-3 min-h-11 whitespace-normal text-left" disabled={!overview.data || createDraft.isPending}
              data-testid="button-orsa-sms-companion-draft" onClick={prepareCompanionDraft}>
              Prepare email companion · Eastern · up to 5,900
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { void overview.refetch(); refreshData(); }} aria-label="Refresh bulk SMS data">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true"/>Refresh
          </Button>
        </div>
        {overview.data?.workerNotice && <Alert className="border-amber-500/50 bg-amber-50 text-amber-950">
          <ShieldAlert className="h-4 w-4" aria-hidden="true"/>
          <AlertTitle>Unattended schedule reliability</AlertTitle>
          <AlertDescription>{overview.data.workerNotice} Queue records persist, but the current autoscale service may sleep. Dependable unattended timing requires publishing the worker on an always-on Reserved VM. Deployment settings are not changed here.</AlertDescription>
        </Alert>}
        <div className="rounded-md border border-teal-700/20 bg-teal-50/60 px-3 py-2 text-sm text-teal-950">
          <strong>Operational guardrails:</strong> submission is not delivery, and delivery is not guaranteed. Provider campaign approval is required before start. Estimated minimum duration is based on configured rate only, not a promise. Mixed-timezone audiences require separate runs; timezone is selected by the administrator and is never inferred from a phone number.
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {companionDraft && <div className="space-y-3 rounded-md border border-teal-700/30 bg-teal-50/50 p-3 text-sm" data-testid="orsa-sms-companion-settings">
          <h3 className="font-semibold">Email companion draft — not sending</h3>
          <p>Approved daily allowance: 6,000 messages. Reserve: 100 for login codes and other traffic. This is a planning allowance, not an account-wide provider usage meter. Check RingCentral for usage across all numbers and applications; new traffic can reduce capacity further.</p>
          <label htmlFor="bulk-other-usage" className="block font-medium">Messages already used today across the RingCentral campaign</label>
          <Input id="bulk-other-usage" type="number" min={0} max={6000} step={1}
            value={otherMessagesToday} placeholder="Enter actual usage, including 0"
            onChange={event => {
              const raw = event.target.value;
              setOtherMessagesToday(raw);
              const used = Number(raw);
              if (raw.trim() && Number.isInteger(used) && used >= 0 && used <= 6000) {
                const budget = Math.max(0, 5900 - used);
                setDailyLimit(budget);
                setSelectedIds(ids => ids.slice(0, budget));
              }
            }} />
          <p>Remaining outreach budget after reserve: {otherUsageValid ? companionBudget : "enter usage first"}. Extra eligible members remain unselected. Confirm the selected audience below.</p>
          <p>Eastern time is prefilled. Permission and time-zone confirmations remain unchecked. Pacing is unchanged and is not verified provider throughput. Leave the optional start time blank to make the draft ready when separately approved, or choose a future time. Draft creation does not start the queue. Confirm delivery of a small pilot before approving the full group.</p>
          <p>The worker waits outside 9 AM–7 PM and may resume a running queue the next eligible day. Pause any unfinished run if you want today-only outreach. Autoscale sleep can delay unattended processing.</p>
        </div>}
        {overview.isLoading && <div className="space-y-3" role="status" aria-label="Loading bulk SMS audience">
          <div className="h-6 w-1/3 animate-pulse rounded bg-muted"/><div className="h-24 animate-pulse rounded bg-muted"/><div className="h-32 animate-pulse rounded bg-muted"/>
        </div>}
        {overview.isError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" aria-hidden="true"/><AlertTitle>Bulk SMS data could not be loaded</AlertTitle><AlertDescription className="space-y-2"><p>{apiError(overview.error)}</p><Button type="button" variant="outline" size="sm" onClick={() => void overview.refetch()}>Retry</Button></AlertDescription></Alert>}

        {overview.data && <>
          <section className="space-y-3" aria-labelledby="sms-audience-heading">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><h3 id="sms-audience-heading" className="font-semibold">1. Select the audience explicitly</h3>
                <p className="text-sm text-muted-foreground">All active roster members are searchable, including members without email. Excluded records have no selectable checkbox.</p></div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{eligibleCount} eligible</Badge><Badge variant="outline">{excludedCount} excluded</Badge>
                <Badge>{selectedCandidates.length} selected</Badge>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto]">
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true"/>
                <Input className="pl-9" type="search" aria-label="Search active SMS audience by member name or phone" placeholder="Search name or phone" value={search} onChange={event => setSearch(event.target.value)}/>
              </div>
              <label className="sr-only" htmlFor="bulk-eligibility-filter">Eligibility filter</label>
              <select id="bulk-eligibility-filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={eligibilityFilter} onChange={event => setEligibilityFilter(event.target.value as typeof eligibilityFilter)}>
                <option value="all">All members</option><option value="eligible">Eligible</option><option value="excluded">Excluded</option>
              </select>
              <label className="sr-only" htmlFor="bulk-reason-filter">Exclusion reason filter</label>
              <select id="bulk-reason-filter" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={reasonFilter} onChange={event => setReasonFilter(event.target.value)}>
                <option value="all">All exclusion reasons</option>{reasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="min-h-10" disabled={!filteredEligible.length} onClick={selectAllFiltered}>Select all {filteredEligible.length} eligible shown</Button>
              <Button type="button" variant="ghost" size="sm" className="min-h-10" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Clear selection</Button>
              <span className="text-xs text-muted-foreground">{filteredEligible.length} eligible · {filteredCandidates.filter(candidate => !candidate.eligible).length} excluded in current filter</span>
            </div>
            {reasons.length > 0 && <p className="text-xs text-muted-foreground">
              Exclusion reasons: {reasons.map(reason => `${reason} (${candidates.filter(candidate => !candidate.eligible && candidate.reason === reason).length})`).join(" · ")}
            </p>}
            <div className="max-h-72 overflow-auto rounded-md border" role="group" aria-label="Active ORSA bulk SMS audience">
              {filteredCandidates.length ? filteredCandidates.map(candidate => <label key={candidate.id} className={`flex min-h-12 items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0 ${candidate.eligible ? "cursor-pointer hover:bg-teal-50/50" : "bg-muted/30 text-muted-foreground"}`}>
                {candidate.eligible
                  ? <input className="mt-1 h-4 w-4 shrink-0 accent-teal-700" type="checkbox" checked={selectedSet.has(candidate.id)} onChange={event => toggleCandidate(candidate, event.target.checked)} aria-label={`Select ${candidate.displayName || "unnamed member"}${candidate.phone ? `, ${candidate.phone}` : ""}`}/>
                  : <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px]" aria-label="Excluded from selection">—</span>}
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium text-foreground">{candidate.displayName || "Name unavailable"} <span className="font-normal text-muted-foreground">· {candidate.phone || "No usable phone"}</span></span>
                  {candidate.eligible ? <span className="text-xs text-teal-800">Eligible for administrator review</span> : <span className="text-xs">{candidate.reason || "Not eligible"}{candidate.consentRecorded ? " · consent record present" : ""}</span>}
                </span>
              </label>) : <p className="p-5 text-center text-sm text-muted-foreground">No active roster members match these filters.</p>}
            </div>
            <p className="text-xs text-muted-foreground">Eligibility is not evidence of promotional SMS permission. Confirm the selected members’ authorization from the contract process before creating a run.</p>
          </section>

          <section className="grid gap-4 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.72fr)]" aria-label="Draft configuration and message preview">
            <div className="space-y-3">
              <h3 className="font-semibold">2. Configure the run</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="bulk-timezone" className="mb-1 block text-sm font-medium">Run timezone</label>
                  <select id="bulk-timezone" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={timezone} onChange={event => { setTimezone(event.target.value); setTimezoneConfirmed(false); }}>
                    {TIMEZONES.map(([value, label]) => <option key={value} value={value}>{label} — {value}</option>)}
                  </select>
                </div>
                <div><label htmlFor="bulk-schedule" className="mb-1 block text-sm font-medium">Schedule start (optional)</label>
                  <Input id="bulk-schedule" type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} aria-describedby="bulk-schedule-help"/>
                  <p id="bulk-schedule-help" className="mt-1 text-xs text-muted-foreground">Optional: leave blank to make the draft ready when separately approved. For a future schedule, enter wall time in {timezone} between 9:00 AM and 7:00 PM. Texts still wait outside those hours; creating a draft never starts sending.</p>
                  {scheduleError && <p className="mt-1 text-xs text-destructive" role="alert">{scheduleError}</p>}
                </div>
                <div><label htmlFor="bulk-interval" className="mb-1 block text-sm font-medium">Minimum interval between texts (seconds)</label>
                  <Input id="bulk-interval" type="number" min={2} max={300} step={1} value={intervalSeconds} onChange={event => setIntervalSeconds(Number(event.target.value))}/>
                  <p className="mt-1 text-xs text-muted-foreground">Allowed: 2–300 seconds. Provider pacing may be slower.</p>
                </div>
                <div><label htmlFor="bulk-daily-limit" className="mb-1 block text-sm font-medium">Daily send limit</label>
                  <Input id="bulk-daily-limit" type="number" min={1} max={10000} step={1} value={dailyLimit} onChange={event => setDailyLimit(Number(event.target.value))}/>
                  <p className="mt-1 text-xs text-muted-foreground">Allowed: 1–10,000 submissions per day.</p>
                </div>
              </div>
              <label className="flex min-h-12 items-start gap-3 rounded-md border p-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-700" checked={timezoneConfirmed} onChange={event => setTimezoneConfirmed(event.target.checked)}/>
                <span>I confirm this selected timezone is appropriate for every recipient in this run. Mixed-timezone audiences must be split into separate runs; do not infer timezone from phone numbers.</span>
              </label>
              <div>
                <label htmlFor="bulk-attestation" className="mb-1 block text-sm font-medium">Administrator attestation — not independently verified opt-in evidence</label>
                <textarea id="bulk-attestation" className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" value={attestation} onChange={event => setAttestation(event.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">This statement is recorded with the draft. It does not independently verify member consent.</p>
              </div>
              <label className="flex min-h-12 items-start gap-3 rounded-md border border-teal-700/30 bg-teal-50/50 p-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-700" checked={smsPermissionConfirmed} onChange={event => setSmsPermissionConfirmed(event.target.checked)}/>
                <span><strong>Explicit SMS permission confirmed.</strong> I confirmed the selected members authorized promotional SMS through the permission collected during our contract process.</span>
              </label>
              {(intervalSeconds < 2 || intervalSeconds > 300 || !Number.isInteger(intervalSeconds) || dailyLimit < 1 || dailyLimit > 10000 || !Number.isInteger(dailyLimit)) &&
                <p role="alert" className="text-sm text-destructive">Enter a whole-number interval from 2–300 seconds and daily limit from 1–10,000.</p>}
              <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={!createAllowed || createDraft.isPending} onClick={submitDraft}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true"/>{createDraft.isPending ? "Creating draft…" : `Create draft for ${selectedCandidates.length} selected`}
              </Button>
              {!createAllowed && <div className="rounded-md border bg-muted/30 p-3 text-sm" data-testid="orsa-sms-draft-blockers">
                <p className="font-medium">Before you can create the draft:</p>
                <ul className="list-disc space-y-1 pl-5">{draftBlockers.map(reason => <li key={reason}>{reason}</li>)}</ul>
                <p className="mt-2 text-muted-foreground">Creating a draft does not send texts. Starting it is a separate approval.</p>
              </div>}
              {draftNotice && <p role="status" className="text-sm text-teal-800">{draftNotice}</p>}
              {createDraft.isError && <Alert variant="destructive"><AlertTitle>Draft was not created</AlertTitle><AlertDescription>{apiError(createDraft.error)} No texts were sent. Review the audience and try again.</AlertDescription></Alert>}
            </div>
            <aside className="space-y-3 rounded-md border bg-muted/20 p-3" aria-label="Exact branded SMS preview">
              <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Exact branded message</h3><Badge variant="outline">{smsSegments(message)} GSM segment{smsSegments(message) === 1 ? "" : "s"}</Badge></div>
              <div className="whitespace-pre-wrap break-words rounded-md border bg-background p-3 text-sm leading-relaxed">{overview.isLoading ? <span className="animate-pulse">Loading exact message…</span> : message || "Message copy unavailable."}</div>
              <p className="text-xs text-muted-foreground">{message.length} characters · standard estimate: 1 segment up to 160 characters, then 153 characters per concatenated segment.</p>
              <p className="text-xs text-muted-foreground">Rate-only estimate for {selectedCandidates.length} selected: at least {Math.max(0, selectedCandidates.length - 1) * intervalSeconds} seconds between first and last submission. Daily limit, provider capacity, and delivery delays can extend this; it is not guaranteed.</p>
              <p className="text-xs font-medium text-amber-900">Provider approval for this campaign and adequate account capacity are required before any live start.</p>
            </aside>
          </section>

          <section className="space-y-3 border-t pt-4" aria-labelledby="runs-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 id="runs-heading" className="font-semibold">3. Runs and recipient outcomes</h3><p className="text-sm text-muted-foreground">Counts are server-reported. “Submitted” means submitted to the provider, not delivered.</p></div>
              {overview.data.deliveryEnabled ? <Badge variant="secondary">Production delivery enabled</Badge> : <Badge variant="outline">Development: live start disabled</Badge>}
            </div>
            {runs.length === 0 ? <div className="rounded-md border border-dashed bg-muted/20 p-5 text-center">
              <Clock3 className="mx-auto mb-2 h-5 w-5 text-teal-700" aria-hidden="true"/><p className="font-medium">No bulk SMS runs yet</p><p className="mt-1 text-sm text-muted-foreground">Select eligible members above to prepare a draft. Draft creation never sends messages.</p>
            </div> : <div className="grid gap-3">
              {runs.map(run => {
                const totalCount = Object.values(run.counts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
                const submitted = countFor(run, "submitted");
                const progress = totalCount ? Math.min(100, Math.round((submitted / totalCount) * 100)) : 0;
                const active = run.id === selectedRunId;
                return <button type="button" key={run.id} onClick={() => { setSelectedRunId(run.id); setRecipientStatus("all"); setOffset(0); setActionError(""); }}
                  aria-pressed={active} className={`min-h-11 rounded-md border p-3 text-left transition-colors ${active ? "border-teal-700 bg-teal-50/60" : "hover:bg-muted/50"}`}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><strong className="font-mono text-xs">{run.id}</strong><Badge variant={run.status === "failed" || run.status === "cancelled" ? "destructive" : run.status === "running" ? "secondary" : "outline"}>{formatStatus(run.status)}</Badge></span>
                    <span className="text-xs text-muted-foreground">Created {dateLabel(run.createdAt)}</span>
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">{run.counts.pending ?? 0} pending · {submitted} submitted · {countFor(run, "needs_review")} needs review · {countFor(run, "skipped")} skipped · {countFor(run, "sending")} sending · {run.timezone} · every {run.intervalSeconds}s · limit {run.dailyLimit}/day</span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded bg-teal-900/10"><span className="block h-full bg-teal-700" style={{ width: `${progress}%` }}/></span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{progress}% submitted to provider · {dateLabel(run.scheduledAt, run.timezone)}{run.pauseReason ? ` · ${run.pauseReason}` : ""}</span>
                </button>;
              })}
            </div>}
          </section>
          {actionError && <Alert variant="destructive"><AlertTitle>Run action did not complete</AlertTitle><AlertDescription>{actionError} Refresh the run state before taking another action; never retry a recipient with an uncertain outcome.</AlertDescription></Alert>}
          {selectedRun && <section className="space-y-3 rounded-md border p-3" aria-labelledby="selected-run-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h4 id="selected-run-heading" className="font-semibold">Run detail · {formatStatus(selectedRun.status)}</h4><p className="text-xs text-muted-foreground">{selectedRun.id} · scheduled {dateLabel(selectedRun.scheduledAt, selectedRun.timezone)} · {selectedRun.timezone}</p></div>
              <div className="flex flex-wrap gap-2">
                {["draft", "paused"].includes(selectedRun.status) && <Button type="button" className="min-h-11" size="sm" disabled={!overview.data.deliveryEnabled || runAction.isPending} onClick={() => requestAction("start")}><Play className="mr-2 h-4 w-4" aria-hidden="true"/>Start live run</Button>}
                {["sending", "running"].includes(selectedRun.status) && <Button type="button" variant="outline" className="min-h-11" size="sm" disabled={runAction.isPending} onClick={() => requestAction("pause")}><Pause className="mr-2 h-4 w-4" aria-hidden="true"/>Pause</Button>}
                {!["cancelled", "completed", "failed"].includes(selectedRun.status) && <Button type="button" variant="destructive" className="min-h-11" size="sm" disabled={runAction.isPending} onClick={() => requestAction("cancel")}><XCircle className="mr-2 h-4 w-4" aria-hidden="true"/>Cancel run</Button>}
              </div>
            </div>
            {!overview.data.deliveryEnabled && ["draft", "paused"].includes(selectedRun.status) && <p className="text-xs text-muted-foreground">Live start is disabled outside production. Drafting and pausing remain available.</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {runSummary(selectedRun).map(([label, count]) => <span key={label}><strong>{count}</strong> {label}</span>)}
              <span><strong>{countFor(selectedRun, "submitted")}</strong> submitted · see provider delivery status below</span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-3">
              <div className="flex flex-wrap gap-2">
                <label className="text-xs font-medium">Recipient status
                  <select className="ml-2 h-10 rounded-md border border-input bg-background px-2 text-sm" value={recipientStatus} onChange={event => { setRecipientStatus(event.target.value as RecipientStatus); setOffset(0); }}>
                    {STATUS_FILTERS.map(status => <option key={status} value={status}>{status === "all" ? "All statuses" : formatStatus(status)}</option>)}
                  </select>
                </label>
              </div>
              <span className="text-xs text-muted-foreground">Showing {currentStart}–{currentEnd} of {totalRecipients}</span>
            </div>
            {recipientsQuery.isLoading ? <div className="space-y-2" role="status" aria-label="Loading recipients"><div className="h-9 animate-pulse rounded bg-muted"/><div className="h-16 animate-pulse rounded bg-muted"/></div>
              : recipientsQuery.isError ? <Alert variant="destructive"><AlertTitle>Recipient outcomes unavailable</AlertTitle><AlertDescription className="space-y-2"><p>{apiError(recipientsQuery.error)}</p><Button type="button" variant="outline" size="sm" onClick={() => void recipientsQuery.refetch()}>Retry recipient load</Button></AlertDescription></Alert>
                : pageRecipients.length === 0 ? <p className="rounded-md bg-muted/30 p-4 text-center text-sm text-muted-foreground">No recipients in this status view.</p>
                  : <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Phone</TableHead><TableHead>Outcome</TableHead><TableHead>Provider delivery</TableHead><TableHead>Submitted / attempted</TableHead></TableRow></TableHeader>
                      <TableBody>{pageRecipients.map(recipient => <TableRow key={recipient.id}>
                        <TableCell className="font-medium">{recipient.displayName || "Name unavailable"}<span className="block font-mono text-[10px] text-muted-foreground">{recipient.memberId}</span></TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{recipient.phone}</TableCell>
                        <TableCell><Badge variant={recipient.status === "needs_review" ? "destructive" : recipient.status === "submitted" ? "secondary" : "outline"}>{recipient.status === "submitted" ? "Submitted to provider" : formatStatus(recipient.status)}</Badge>
                          {recipient.reason && <span className="mt-1 block max-w-xs text-xs text-muted-foreground">{recipient.reason}</span>}
                          {recipient.status === "needs_review" && <span className="mt-1 block text-xs text-destructive">Uncertain outcome · review only, never retry.</span>}
                        </TableCell>
                        <TableCell className="text-xs">{recipient.deliveryStatus || "Not reported"}{recipient.deliveryStatus === "delivered" && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-teal-700" aria-label="Provider reports delivered"/>}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{recipient.submittedAt ? `Submitted ${dateLabel(recipient.submittedAt)}` : recipient.attemptedAt ? `Attempted ${dateLabel(recipient.attemptedAt)}` : "—"}</TableCell>
                      </TableRow>)}</TableBody>
                    </Table>
                  </div>}
            {totalRecipients > 100 && <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" className="min-h-11" size="sm" disabled={offset === 0 || recipientsQuery.isFetching} onClick={() => setOffset(value => Math.max(0, value - 100))}>Previous 100</Button>
              <span className="text-xs text-muted-foreground">Page {Math.floor(offset / 100) + 1} of {Math.ceil(totalRecipients / 100)}</span>
              <Button type="button" variant="outline" className="min-h-11" size="sm" disabled={offset + 100 >= totalRecipients || recipientsQuery.isFetching} onClick={() => setOffset(value => value + 100)}>Next 100</Button>
            </div>}
          </section>}
        </>}
      </CardContent>
    </Card>

    <AlertDialog open={Boolean(confirmAction)} onOpenChange={open => { if (!open) setConfirmAction(null); }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmAction === "start" ? "Confirm live SMS start" : confirmAction === "pause" ? "Pause this run?" : "Cancel this run?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction === "start"
              ? "Starting can submit real text messages to selected members in production. Review the final audience and delivery settings below."
              : confirmAction === "pause"
                ? "Pause stops future queue processing where possible. A message already submitted or in flight may have an uncertain outcome."
                : "Cancel stops remaining queue work. An uncertain recipient result is never retried; cancel does not undo a provider submission."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {confirmAction === "start" && selectedRun && <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
          <p><strong>Run:</strong> <span className="font-mono text-xs">{selectedRun.id}</span></p>
          <p><strong>Audience:</strong> {Object.values(selectedRun.counts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0)} queued recipients</p>
          <p><strong>Schedule:</strong> {dateLabel(selectedRun.scheduledAt, selectedRun.timezone)} · {selectedRun.timezone}</p>
          <p><strong>Rate:</strong> one message at least every {selectedRun.intervalSeconds} seconds · daily cap {selectedRun.dailyLimit}</p>
          <p className="font-medium">Exact branded message</p><p className="max-h-28 overflow-auto whitespace-pre-wrap break-words rounded border bg-background p-2 text-xs">{selectedRun.message}</p>
          <label className="flex min-h-12 items-start gap-3 border-t pt-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-700" checked={providerApprovalReviewed} onChange={event => setProviderApprovalReviewed(event.target.checked)}/>
            <span>I reviewed and confirm provider account SMS campaign approval and sending capacity for this message and volume.</span>
          </label>
        </div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={runAction.isPending} className="min-h-11">Keep run unchanged</AlertDialogCancel>
          <AlertDialogAction disabled={runAction.isPending || (confirmAction === "start" && (!providerApprovalReviewed || !overview.data?.deliveryEnabled))} className={confirmAction === "cancel" ? "min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" : "min-h-11"}
            onClick={event => { event.preventDefault(); confirmRunAction(); }}>
            {runAction.isPending ? "Applying…" : confirmAction === "start" ? "Start live run" : confirmAction === "pause" ? "Pause run" : "Cancel run"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
