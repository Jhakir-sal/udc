import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Mail } from "lucide-react";
import { OrsaWarmupControls } from "@/components/orsa-warmup-controls";
import type { OutreachEmailAudience } from "@shared/orsaOutreach";

type CampaignTemplate = {
  id: string;
  subject: string;
  preheader: string;
  suggestedSendDate: string;
  sendable: boolean;
  reason?: string;
};
type CampaignOverview = {
  templates: CampaignTemplate[];
  eligibleCount: number;
  suppressedCount: number;
  sentCounts: Record<string, number>;
  engagement: Record<string, { submitted: number; uniqueOpens: number; uniqueClicks: number }>;
  needsReviewCount: Record<string, number>;
  optoutsReviewed: boolean;
  configured: boolean;
};
type CampaignPreview = {
  previewId: string;
  retryHeld?: boolean;
  audience: OutreachEmailAudience;
  subject: string;
  html: string;
  text: string;
  eligibleCount: number;
  availableCount?: number;
  groupLimit?: number;
  alreadySentCount: number;
  recipients: { email: string; displayName: string | null }[];
};
type ReviewRecord = { email: string; status: string; attemptedAt: string };
type BatchResult = {
  sent: number;
  remaining: number;
  needsReview: number;
  skipped: number;
  paused?: boolean;
  throttled?: boolean;
  retryAfterSeconds?: number;
  reason?: string;
  waitingForReview?: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the request. Please try again.";
}

function rate(count: number, submitted: number): string {
  return submitted ? `${(100 * count / submitted).toFixed(1)}%` : "—";
}

type OrsaEmailCampaignProps = {
  requestedAudience?: OutreachEmailAudience;
  audienceRequestId?: number;
  active?: boolean;
};

export function OrsaEmailCampaign({ requestedAudience, audienceRequestId, active = true }: OrsaEmailCampaignProps) {
  const [templateId, setTemplateId] = useState("launch-week");
  const [audience, setAudience] = useState<OutreachEmailAudience>(requestedAudience ?? "never_emailed");
  const [optOutInput, setOptOutInput] = useState("");
  const [supportInboxChecked, setSupportInboxChecked] = useState(false);
  const [suppressionMessage, setSuppressionMessage] = useState("");
  const [reviewed, setReviewed] = useState<{ id: string; data: CampaignPreview } | null>(null);
  const [progress, setProgress] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientLimit, setRecipientLimit] = useState(50);
  const [groupSize, setGroupSize] = useState(10);
  const [acceptDuplicateRisk, setAcceptDuplicateRisk] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const waitInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitResolver = useRef<((continued: boolean) => void) | null>(null);
  const cancelWaiting = useRef(false);
  const handledAudienceRequest = useRef(audienceRequestId ?? 0);
  const overview = useQuery<CampaignOverview>({ queryKey: ["/api/admin/orsa/email-campaign"], enabled: active || sending });
  useEffect(() => {
    if ((audienceRequestId ?? 0) === handledAudienceRequest.current) return;
    handledAudienceRequest.current = audienceRequestId ?? 0;
    if (sending) return;
    if (requestedAudience) {
      setAudience(requestedAudience);
      if (requestedAudience === "never_emailed") setTemplateId("launch-week");
      setReviewed(null);
      setProgress("");
      setSendError("");
    }
  }, [requestedAudience, audienceRequestId, sending]);
  const preview = useMutation({
    mutationFn: async ({ id, retryHeld = false, recipientLimit, audience: requested }: { id: string; retryHeld?: boolean; recipientLimit: number; audience: OutreachEmailAudience }) =>
      (await apiRequest("POST", "/api/admin/orsa/email-campaign/preview", { templateId: id, retryHeld, recipientLimit, audience: requested })).json() as Promise<CampaignPreview>,
    onSuccess: (data, { id, audience: requested }) => {
      setReviewed({ id, data: { ...data, audience: data.audience || requested } }); setSendError(""); setProgress("");
      setAcceptDuplicateRisk(false); setRecipientSearch(""); setRecipientLimit(50);
    },
  });
  useEffect(() => () => {
    cancelWaiting.current = true;
    if (waitInterval.current) clearInterval(waitInterval.current);
    waitResolver.current?.(false);
    waitResolver.current = null;
  }, []);
  function waitForThrottle(seconds: number): Promise<boolean> {
    if (cancelWaiting.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      let remaining = Math.max(1, Math.ceil(seconds));
      cancelWaiting.current = false;
      setWaitSeconds(remaining);
      setProgress(`A spacing limit is active. Waiting ${remaining}s before the next request. Keep this page open.`);
      waitResolver.current = resolve;
      waitInterval.current = setInterval(() => {
        remaining -= 1;
        setWaitSeconds(Math.max(remaining, 0));
        if (remaining <= 0) {
          if (waitInterval.current) clearInterval(waitInterval.current);
          waitInterval.current = null;
          waitResolver.current = null;
          resolve(!cancelWaiting.current);
        } else {
          setProgress(`A spacing limit is active. Waiting ${remaining}s before the next request. Keep this page open.`);
        }
      }, 1000);
    });
  }
  function stopLocalWait() {
    cancelWaiting.current = true;
    if (waitInterval.current) clearInterval(waitInterval.current);
    waitInterval.current = null;
    waitResolver.current?.(false);
    waitResolver.current = null;
    setWaitSeconds(0);
    setProgress("Local waiting stopped. No further batch requests will be made.");
  }
  const selected = overview.data?.templates.find((template) => template.id === templateId);
  const approvedPreview = reviewed?.id === templateId && reviewed.data.audience === audience ? reviewed.data : null;
  const matchedRecipients = (approvedPreview?.recipients ?? []).filter(({ email, displayName }) => {
    const search = recipientSearch.trim().toLowerCase();
    return !search || email.toLowerCase().includes(search) || displayName?.toLowerCase().includes(search);
  });
  const review = useQuery<{ records: ReviewRecord[] }>({
    queryKey: ["/api/admin/orsa/email-campaign/review", templateId],
    enabled: Boolean((active || sending) && templateId && overview.data?.needsReviewCount?.[templateId]),
    queryFn: async () => (await apiRequest("GET", `/api/admin/orsa/email-campaign/review?templateId=${encodeURIComponent(templateId)}`)).json(),
  });
  const suppress = useMutation({
    mutationFn: async (emails: string[]) => (await apiRequest("POST", "/api/admin/orsa/email-campaign/suppress", { emails })).json(),
    onSuccess: (_result, emails) => {
      setOptOutInput("");
      setSuppressionMessage(`${emails.length} address${emails.length === 1 ? "" : "es"} recorded as opted out. Recheck the eligible count before confirming a campaign.`);
      setReviewed(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-campaign"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/outreach"] });
    },
  });
  const markReviewed = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/orsa/email-campaign/optouts-reviewed", { confirmed: true })).json(),
    onSuccess: () => {
      setSupportInboxChecked(false);
      setSuppressionMessage("Previous ORSA email opt-out requests marked as reviewed.");
      setReviewed(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-campaign"] });
    },
  });

  async function sendSelected() {
    if (!selected?.sendable || !approvedPreview || !overview.data?.configured || !overview.data.optoutsReviewed || sending || approvedPreview.eligibleCount < 1) return;
    if (approvedPreview.retryHeld && !acceptDuplicateRisk) return;
    const count = approvedPreview.eligibleCount;
    if (!window.confirm(
      `Send “${approvedPreview.subject}” to up to ${count} eligible ORSA email address${count === 1 ? "" : "es"} in the ${approvedPreview.audience === "never_emailed" ? "never-emailed" : "selected-message history"} scope? ` +
      (approvedPreview.retryHeld
        ? "This retries uncertain deliveries; some members may receive a duplicate. Recorded submissions, active sends, and opted-out addresses are excluded. Sending pauses on the first new failure. "
        : "This sends real emails. Previously sent copies and opted-out addresses will be skipped. ") +
      "Keep this page open until it finishes.",
    )) return;
    setSending(true);
    cancelWaiting.current = false;
    setSendError("");
    setProgress("Starting the confirmed batch…");
    let sent = 0;
    let review = 0;
    let skipped = 0;
    let paused = false;
    let waitingForReview = false;
    let pauseReason = "";
    try {
      const confirmation = await (await apiRequest("POST", "/api/admin/orsa/email-campaign/confirm", {
        previewId: approvedPreview.previewId,
        expectedCount: count,
        confirmed: true,
        ...(approvedPreview.retryHeld ? { acceptDuplicateRisk: true } : {}),
      })).json() as { runId: string };
      let remaining = count;
      // A single confirmation sends all eligible recipients. Each request is
      // bounded to the confirmed recipient snapshot on the server.
      let batch = 0;
      const maxRequests = Math.max(10, count * 3 + 10);
      while (remaining > 0 && batch < maxRequests && !cancelWaiting.current) {
        batch += 1;
        const result = await (await apiRequest("POST", "/api/admin/orsa/email-campaign/send-batch", { runId: confirmation.runId })).json() as BatchResult;
        sent += result.sent;
        review += result.needsReview;
        skipped += result.skipped;
        remaining = result.remaining;
        paused = Boolean(result.paused);
        waitingForReview = Boolean(result.waitingForReview);
        pauseReason = result.reason ?? "";
        setProgress(`${sent} submitted · ${review} need review · ${remaining} remain in the confirmed group`);
        if (paused || result.waitingForReview || result.needsReview > 0) break;
        if (remaining === 0) break;
        if (result.throttled && !result.paused && !result.waitingForReview && (result.retryAfterSeconds ?? 0) > 0) {
          const continued = await waitForThrottle(result.retryAfterSeconds!);
          if (!continued) break;
          continue;
        }
        if (result.sent === 0 && result.needsReview === 0 && result.skipped === 0) break;
      }
      const notSubmitted = Math.max(skipped, count - sent - review - remaining);
      setProgress(`${sent} submitted to the email provider; ${review} need delivery review; ${notSubmitted} skipped; ${remaining} remain in this confirmed group.${paused ? ` Outreach paused. ${pauseReason || "Check SendGrid before creating a new retry preview."}` : waitingForReview ? ` Sending stopped for review. ${pauseReason || "A daily-cap or delivery review condition requires a fresh review; this run will not resume automatically."}` : review > 0 ? " Review the provider outcome before any retry." : remaining ? " The batch was interrupted; review the status before starting again." : ""}`);
      setReviewed(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-campaign"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-campaign/review", templateId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/outreach"] });
    } catch (error) {
      setSendError(`${errorMessage(error)} ${sent} already submitted; do not start a second campaign without checking the updated status.`);
      setReviewed(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-campaign"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/outreach"] });
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-warmup"] });
    }
  }

  return (
    <>
    {!active && sending && <Alert className="border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/20">
      <AlertTitle>Email batch is still running</AlertTitle>
      <AlertDescription>The confirmed recipient snapshot is unchanged. Return to Email campaigns to follow progress; do not start a second send.</AlertDescription>
    </Alert>}
    <div className={active ? "space-y-4" : "hidden"} aria-hidden={!active}>
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
        Email delivery settings and global pause
        <span className="ml-2 text-sm font-normal text-muted-foreground">Change email speed here · faster 4-second option available</span>
      </summary>
      <div className="border-t px-4 py-4 sm:px-5">
        <OrsaWarmupControls />
      </div>
    </details>
    <Card data-testid="card-orsa-email-campaign">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />ORSA member email campaign</CardTitle>
        <CardDescription>Choose an ORSA campaign email, review a frozen recipient group, then confirm a batch. This does not send account invitations. No email is sent by previewing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overview.isLoading && <p className="text-sm text-muted-foreground">Loading email choices…</p>}
        {overview.isError && <Alert variant="destructive"><AlertTitle>Could not load the campaign</AlertTitle><AlertDescription>{errorMessage(overview.error)}</AlertDescription></Alert>}
        {overview.data && <>
          <p className="text-sm text-muted-foreground">
            Campaign base pool: {overview.data.eligibleCount} active roster members with candidate email addresses · {overview.data.suppressedCount} opted-out addresses excluded.
            This is not the selected audience; the reviewed preview shows the exact recipient count.
          </p>
          <p className="rounded-md border bg-muted/30 p-3 text-sm">The no-recorded-attempt scope excludes any recorded prior ORSA campaign email or account-invitation attempt, including failed or uncertain attempts; it also excludes opt-outs, unavailable/shared emails, and existing accounts for activation. “Selected-message history” is a separate, per-template follow-up mode. Held-delivery retries are always explicitly reviewed and require separate duplicate-risk acceptance. Every preview freezes recipients and is rechecked before send.</p>
          <div className="space-y-2">
            <label htmlFor="orsa-email-audience" className="text-sm font-medium">Recipient scope</label>
            <select id="orsa-email-audience" value={audience} disabled={sending || preview.isPending}
              onChange={(event) => {
                const next = event.target.value as OutreachEmailAudience;
                setAudience(next);
                if (next === "never_emailed") setTemplateId("launch-week");
                setReviewed(null);
                setProgress("");
                setSendError("");
              }}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="never_emailed">No recorded prior email attempt — no campaign or invitation attempt on record</option>
              <option value="selected_message">Selected-message history — per-template follow-up</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {audience === "never_emailed"
                ? "Use launch-week for the first recorded campaign attempt. This audience has no recorded prior ORSA campaign email or invitation attempt. This does not prove whether a member was contacted outside the recorded history. Link recovery is only for prior launch-week recipients and is unavailable here."
                : "Legacy per-template mode. Members with prior attempts of this message are excluded from standard previews; this is not the never-emailed audience."}
            </p>
          </div>
          <details open={!overview.data.optoutsReviewed} className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Email opt-outs apply across all emails
              <span className="ml-2 text-sm font-normal text-muted-foreground">{overview.data.optoutsReviewed ? "Review saved" : "Review required before sending"}</span>
            </summary>
            <p className="text-sm text-muted-foreground">Earlier invitations asked members to email support to unsubscribe. Before live campaign sending, check that inbox and enter any addresses that must not receive these emails. Opt-outs apply to every template, including link recovery.</p>
            <label htmlFor="orsa-email-optouts" className="text-sm font-medium">Addresses to suppress (one per line or comma-separated)</label>
            <textarea
              id="orsa-email-optouts"
              value={optOutInput}
              onChange={(event) => setOptOutInput(event.target.value)}
              placeholder="Enter addresses from past unsubscribe requests"
              className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm"
              maxLength={12000}
            />
            <Button variant="outline" disabled={suppress.isPending || !optOutInput.trim() || sending} onClick={() => suppress.mutate(optOutInput.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean))}>
              {suppress.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save these opt-outs
            </Button>
            {suppress.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(suppress.error)}</p>}
            {!overview.data.optoutsReviewed && <>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={supportInboxChecked} onChange={(event) => setSupportInboxChecked(event.target.checked)} className="mt-1" />
                <span>I checked earlier ORSA unsubscribe requests in the support inbox and entered every address above before enabling campaign sends.</span>
              </label>
              <Button variant="outline" disabled={!supportInboxChecked || markReviewed.isPending || sending} onClick={() => markReviewed.mutate()}>
                Mark past opt-outs reviewed
              </Button>
            </>}
            {overview.data.optoutsReviewed && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Past opt-out requests have been marked as reviewed. You can add more addresses at any time.</p>}
            {markReviewed.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(markReviewed.error)}</p>}
            {suppressionMessage && <p role="status" className="text-sm">{suppressionMessage}</p>}
          </details>
          <div className="space-y-2">
             <label htmlFor="orsa-email-group-size" className="text-sm font-medium">Recipient group size</label>
             <input id="orsa-email-group-size" type="number" min={1} max={10000} value={groupSize}
               onChange={(event) => { setGroupSize(Math.max(1, Math.min(10000, Math.trunc(Number(event.target.value) || 1)))); setReviewed(null); }}
               disabled={sending} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="input-orsa-email-recipient-group-size" />
             <p className="text-xs text-muted-foreground">First-time and held-retry previews freeze up to this many recipients. Search below only filters the displayed snapshot.</p>
             <Button type="button" variant="outline" size="sm" disabled={sending}
               data-testid="button-orsa-email-review-all"
               onClick={() => { setGroupSize(10000); setReviewed(null); }}>
               Review all eligible
             </Button>
             <p className="text-xs text-muted-foreground">Review all selects up to 10,000, capped by the saved remaining daily budget. It does not send email. Build a fresh preview, review its exact count and message, then confirm. Keep this page open and your device awake while sending.</p>
           </div>
           <div className="space-y-2">
            <label htmlFor="orsa-email-template" className="text-sm font-medium">Email to send</label>
            <select
              id="orsa-email-template"
              data-testid="select-orsa-email-template"
              value={templateId}
              disabled={sending}
               onChange={(event) => { setTemplateId(event.target.value); setReviewed(null); setProgress(""); setSendError(""); setAcceptDuplicateRisk(false); }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose an email…</option>
               {overview.data.templates.filter((template) => audience === "selected_message" || template.id !== "link-recovery").map((template) => <option key={template.id} value={template.id}>{template.subject} · opens {template.suggestedSendDate} ET</option>)}
            </select>
          </div>
          {selected && <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <p><strong>Preview text:</strong> {selected.preheader}</p>
            <p><strong>Already submitted:</strong> {overview.data.sentCounts[selected.id] ?? 0}</p>
            <p><strong>Unique opens:</strong> {overview.data.engagement?.[selected.id]?.uniqueOpens ?? 0} ({rate(overview.data.engagement?.[selected.id]?.uniqueOpens ?? 0, overview.data.engagement?.[selected.id]?.submitted ?? 0)} of trackable submissions)</p>
            <p><strong>Unique CTA clicks:</strong> {overview.data.engagement?.[selected.id]?.uniqueClicks ?? 0} ({rate(overview.data.engagement?.[selected.id]?.uniqueClicks ?? 0, overview.data.engagement?.[selected.id]?.submitted ?? 0)} of trackable submissions)</p>
            <p className="text-xs text-muted-foreground">Tracking counts each address once per email; older sends without tracking are excluded from the rate. Opens rely on an image loading; mail privacy tools may hide or inflate them. CTA clicks include the HTML button and plain-text link; automated link scanning may inflate clicks. Submitted means the email provider accepted it, not confirmed inbox delivery. Refresh the page for later results.</p>
            {(overview.data.needsReviewCount?.[selected.id] ?? 0) > 0 && <p className="text-amber-800 dark:text-amber-300"><strong>{overview.data.needsReviewCount[selected.id]} delivery results need review.</strong> No uncertain delivery is automatically retried.</p>}
            {!selected.sendable && <p className="text-amber-800 dark:text-amber-300">{selected.reason || "This email cannot be sent today."}</p>}
            {selected.id === "link-recovery" && <p className="rounded border-l-4 border-teal-700 bg-teal-50/70 p-3 text-teal-950 dark:bg-teal-950/20 dark:text-teal-100">
              Account activation is the next outreach email for members who were sent the introduction but have not registered. It includes an Activate My Account button and a backup registration address. Existing accounts and opted-out addresses are excluded. Previous sends of this message remain recorded; uncertain deliveries require the separate retry review below.
            </p>}
          </div>}
          {selected && (overview.data.needsReviewCount?.[selected.id] ?? 0) > 0 && <details className="rounded-md border border-amber-500/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Advanced delivery review and controlled retry · {overview.data.needsReviewCount[selected.id]} need review</summary>
            <div className="mt-3 space-y-3">
              <p>Uncertain outcomes are held for review, not retried automatically. A controlled retry requires reviewing the possible duplicate-delivery risk and confirming a fresh recipient snapshot.</p>
              {review.isLoading && <p>Loading delivery results…</p>}
              {review.isError && <p className="text-destructive">{errorMessage(review.error)}</p>}
              {review.data?.records.map((record, index) => <p key={`${record.email}-${index}`} className="break-words">{record.email} · {record.status} · {new Date(record.attemptedAt).toLocaleString()}</p>)}
              <Button variant="outline" onClick={() => { setAudience("selected_message"); setReviewed(null); preview.mutate({ id: selected.id, retryHeld: true, recipientLimit: groupSize, audience: "selected_message" }); }}
                disabled={preview.isPending || sending} data-testid="button-orsa-email-retry-preview">
                Preview held emails for controlled retry
              </Button>
            </div>
          </details>}
          <Button variant="outline" onClick={() => selected && preview.mutate({ id: selected.id, recipientLimit: groupSize, audience })} disabled={!selected || preview.isPending || sending} data-testid="button-orsa-email-preview">
            {preview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Preview selected email
          </Button>
          {preview.isError && <Alert variant="destructive"><AlertTitle>Preview unavailable</AlertTitle><AlertDescription>{errorMessage(preview.error)}</AlertDescription></Alert>}
          {approvedPreview && <div className="space-y-3 rounded-lg border p-3">
            {approvedPreview.retryHeld && <Alert>
              <AlertTitle>Controlled retry — possible duplicate delivery</AlertTitle>
              <AlertDescription>This preview contains eligible held deliveries only, not new invitations or the already-submitted campaign emails. Your confirmation is recorded with this recipient snapshot. A new sending failure pauses this retry run.</AlertDescription>
            </Alert>}
            <p className="text-sm"><strong>Subject:</strong> {approvedPreview.subject}</p>
            <p className="text-sm text-muted-foreground">“Sample Member” appears only in this preview. Sent emails greet each recipient by the first name on their roster record, or “Hello,” if no name is available.</p>
            <p className="rounded-md border-l-4 border-accent bg-muted/30 p-3 text-sm font-medium">
              Approved scope: {approvedPreview.retryHeld ? "controlled retry of held deliveries" : approvedPreview.audience === "never_emailed" ? "No recorded prior email attempt — excludes recorded campaign and invitation attempts" : "Selected-message history — per-template follow-up"}.
            </p>
            <p className="text-sm">{approvedPreview.eligibleCount} in this frozen group · {approvedPreview.availableCount ?? approvedPreview.eligibleCount} eligible in the full pool · {approvedPreview.groupLimit ?? groupSize} group limit · {approvedPreview.alreadySentCount} already submitted this template.</p>
            <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
              <label htmlFor="orsa-email-recipient-search" className="font-medium">Recipients in this confirmed group ({approvedPreview.recipients.length})</label>
              <input id="orsa-email-recipient-search" type="search" className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                placeholder="Find a name or email address" value={recipientSearch}
                onChange={event => { setRecipientSearch(event.target.value); setRecipientLimit(50); }} />
              <p className="text-muted-foreground">Showing {Math.min(matchedRecipients.length, recipientLimit)} of {matchedRecipients.length} matching recipients. Searching here does not change who will receive the batch.</p>
              <div className="max-h-64 space-y-1 overflow-auto rounded border bg-background p-2" role="list" aria-label="ORSA email campaign recipients">
                {matchedRecipients.slice(0, recipientLimit).map(({ displayName, email }) => <div key={email} role="listitem" className="break-words rounded px-2 py-1.5">
                  <strong>{displayName?.trim() || "Name unavailable"}</strong> · {email}
                </div>)}
              </div>
              {matchedRecipients.length > recipientLimit && <Button size="sm" variant="outline" onClick={() => setRecipientLimit(limit => limit + 50)}>Show 50 more recipients</Button>}
            </div>
            <iframe title="Selected ORSA email preview" sandbox="" srcDoc={approvedPreview.html} className="h-[680px] w-full rounded border bg-white" />
            <details className="text-sm"><summary className="cursor-pointer font-medium">Plain-text version</summary><pre className="mt-2 whitespace-pre-wrap break-words font-sans">{approvedPreview.text}</pre></details>
            {approvedPreview.retryHeld && <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acceptDuplicateRisk} onChange={(event) => setAcceptDuplicateRisk(event.target.checked)}
                disabled={sending} className="mt-1" data-testid="checkbox-orsa-email-retry-risk" />
              <span>I accept that earlier delivery is uncertain and some members may receive a duplicate. Retry only the held recipients shown in this preview.</span>
            </label>}
            <Button
              onClick={() => void sendSelected()}
              disabled={!selected?.sendable || !overview.data.configured || !overview.data.optoutsReviewed || sending || approvedPreview.eligibleCount === 0 || (approvedPreview.retryHeld && !acceptDuplicateRisk)}
              data-testid="button-orsa-email-send-batch"
            >
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {sending ? "Sending confirmed batch…" : approvedPreview.retryHeld ? `Start controlled retry for up to ${approvedPreview.eligibleCount} held emails` : `Send this email to up to ${approvedPreview.eligibleCount} eligible members`}
            </Button>
          </div>}
          {!overview.data.configured && <p className="text-sm text-muted-foreground">Sending is available only on the published app with the email provider configured. You can preview safely here.</p>}
          {!overview.data.optoutsReviewed && <p className="text-sm text-muted-foreground">Sending is paused until previous opt-out requests have been reconciled above.</p>}
          <p className="text-xs text-muted-foreground">Sending runs in bounded batches to the confirmed group only. Keep this page open until complete; if interrupted, review statuses before resuming. An uncertain provider result is held for review, not automatically retried.</p>
        </>}
        {progress && <p role="status" className="text-sm">{progress}</p>}
        {sendError && <Alert variant="destructive"><AlertTitle>Batch stopped</AlertTitle><AlertDescription>{sendError}</AlertDescription></Alert>}
         {sending && waitSeconds > 0 && <Button type="button" variant="outline" size="sm" onClick={stopLocalWait} data-testid="button-orsa-email-stop-wait">Stop waiting and cancel local run</Button>}
      </CardContent>
    </Card>
    </div>
    </>
  );
}