import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Mail, ShieldAlert } from "lucide-react";

type InvitationOverview = {
  configured: boolean;
  sendable: boolean;
  reason?: string;
  readyCount: number;
  heldCount: number;
  submittedCount: number;
  acceptedCount: number;
  existingAccountCount: number;
  noIndividualEmailCount: number;
  suppressedCount: number;
};

type InvitationPreview = {
  previewId: string;
  retryHeld: boolean;
  subject: string;
  html: string;
  text: string;
  eligibleCount: number;
  availableCount?: number;
  groupLimit?: number;
  alreadySentCount: number;
  recipients: { email: string; displayName: string | null }[];
};

type BatchResult = {
  sent: number;
  remaining: number;
  needsReview: number;
  skipped: number;
  paused: boolean;
  reason?: string;
  throttled?: boolean;
  retryAfterSeconds?: number;
  waitingForReview?: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the request.";
}

export function OrsaAccountInvitations() {
  const [reviewed, setReviewed] = useState<InvitationPreview | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientLimit, setRecipientLimit] = useState(50);
  const [groupSize, setGroupSize] = useState(10);
  const [acceptDuplicateRisk, setAcceptDuplicateRisk] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState("");
  const [sendError, setSendError] = useState("");
  const [waitSeconds, setWaitSeconds] = useState(0);
  const waitInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitResolver = useRef<((continued: boolean) => void) | null>(null);
  const cancelWaiting = useRef(false);

  const overview = useQuery<InvitationOverview>({
    queryKey: ["/api/admin/orsa/account-invitations"],
  });
  const preview = useMutation({
    mutationFn: async ({ retryHeld, recipientLimit }: { retryHeld: boolean; recipientLimit: number }) =>
      (await apiRequest("POST", "/api/admin/orsa/account-invitations/preview", { retryHeld, recipientLimit }))
        .json() as Promise<InvitationPreview>,
    onSuccess: (data) => {
      setReviewed(data);
      setRecipientSearch("");
      setRecipientLimit(50);
      setAcceptDuplicateRisk(false);
      setProgress("");
      setSendError("");
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
      let remainingSeconds = Math.max(1, Math.ceil(seconds));
      cancelWaiting.current = false;
      setWaitSeconds(remainingSeconds);
      setProgress(`A sending interval is active. Waiting ${remainingSeconds}s before the next batch. Keep this page open.`);
      waitResolver.current = resolve;
      waitInterval.current = setInterval(() => {
        remainingSeconds -= 1;
        setWaitSeconds(Math.max(remainingSeconds, 0));
        if (remainingSeconds <= 0) {
          if (waitInterval.current) clearInterval(waitInterval.current);
          waitInterval.current = null;
          waitResolver.current = null;
          resolve(!cancelWaiting.current);
        } else {
          setProgress(`A sending interval is active. Waiting ${remainingSeconds}s before the next batch. Keep this page open.`);
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

  const matchingRecipients = useMemo(() => {
    const term = recipientSearch.trim().toLowerCase();
    return (reviewed?.recipients ?? []).filter(({ email, displayName }) =>
      !term || email.toLowerCase().includes(term) || displayName?.toLowerCase().includes(term),
    );
  }, [reviewed, recipientSearch]);

  async function refreshInvitationData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/account-invitations"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/roster"] }),
    ]);
  }

  async function sendReviewedSnapshot() {
    const snapshot = reviewed;
    if (!snapshot || !overview.data?.configured || !overview.data.sendable ||
      snapshot.eligibleCount < 1 || sending || (snapshot.retryHeld && !acceptDuplicateRisk)) return;

    const duplicateWarning = snapshot.retryHeld
      ? " This is a held-delivery retry: some members may receive a duplicate invitation."
      : " First-time invitations exclude prior invitation attempts.";
    const confirmed = window.confirm(
      `Send real ORSA account invitation emails to the ${snapshot.eligibleCount} recipients in this reviewed snapshot?` +
      duplicateWarning +
      " This does not send marketing campaign emails or texts, and it does not automatically create or activate accounts. Members must register and verify their email. Keep this page open until sending finishes.",
    );
    if (!confirmed) return;

    setSending(true);
    cancelWaiting.current = false;
    setSendError("");
    setProgress("Recording the reviewed recipient snapshot…");
    let sent = 0;
    let needsReview = 0;
    let skipped = 0;
    let remaining = snapshot.eligibleCount;
    let paused = false;
    let waitingForReview = false;
    let pauseReason = "";
    try {
      const confirmation = await (await apiRequest("POST", "/api/admin/orsa/account-invitations/confirm", {
        previewId: snapshot.previewId,
        expectedCount: snapshot.eligibleCount,
        confirmed: true,
        ...(snapshot.retryHeld ? { acceptDuplicateRisk: true } : {}),
      })).json() as { runId: string };

      // One confirmation authorizes the complete snapshot. Requests are processed
      // sequentially; a failed HTTP call is never retried automatically.
      let batch = 0;
      const maxRequests = Math.max(10, snapshot.eligibleCount * 3 + 10);
      while (remaining > 0 && batch < maxRequests && !cancelWaiting.current) {
        batch += 1;
        const before = { sent, needsReview, skipped, remaining };
        const result = await (await apiRequest(
          "POST",
          "/api/admin/orsa/account-invitations/send-batch",
          { runId: confirmation.runId },
        )).json() as BatchResult;
        sent += result.sent;
        needsReview += result.needsReview;
        skipped += result.skipped;
        remaining = result.remaining;
        paused = Boolean(result.paused);
        waitingForReview = Boolean(result.waitingForReview);
        pauseReason = result.reason ?? "";
        setProgress(`${sent} submitted · ${needsReview} need review · ${skipped} skipped · ${remaining} remain in the confirmed snapshot`);
        const madeProgress = sent !== before.sent || needsReview !== before.needsReview ||
          skipped !== before.skipped || remaining !== before.remaining;
        if (paused || result.waitingForReview || result.needsReview > 0 || remaining === 0) break;
        if (result.throttled && !result.paused && !result.waitingForReview && (result.retryAfterSeconds ?? 0) > 0) {
          const continued = await waitForThrottle(result.retryAfterSeconds!);
          if (!continued) break;
          continue;
        }
        if (!madeProgress) break;
      }

      setProgress(
        `${sent} submitted · ${needsReview} need review · ${skipped} skipped · ${remaining} remain.` +
        (paused ? ` Sending paused. ${pauseReason || "Review the provider result before any retry."}` :
          waitingForReview ? ` Sending stopped for review. ${pauseReason || "A daily-cap or delivery review condition requires a fresh review; this run will not resume automatically."}` :
          needsReview ? " Review these delivery results before any retry." :
            remaining ? " No further progress was made. Review status before starting another run." : ""),
      );
      setReviewed(null);
      await refreshInvitationData();
    } catch (error) {
      setSendError(
        `${errorMessage(error)} ${sent} invitation${sent === 1 ? "" : "s"} already submitted; do not retry without reviewing the updated invitation status and provider outcome.`,
      );
      setReviewed(null);
      await refreshInvitationData();
    } finally {
      setSending(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-warmup"] });
    }
  }

  const canSend = Boolean(
    overview.data?.configured && overview.data.sendable && reviewed?.eligibleCount &&
    (!reviewed.retryHeld || acceptDuplicateRisk) && !sending,
  );

  return (
    <Card data-testid="card-orsa-account-invitations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Account activation invitations</CardTitle>
        <CardDescription>
          Review a frozen recipient snapshot before sending. These are account invitations—not the ORSA marketing email campaign and not text messages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overview.isLoading && <div className="animate-pulse space-y-2 py-2" aria-label="Loading invitation status">
          <div className="h-4 w-2/3 rounded bg-muted" /><div className="h-4 w-1/2 rounded bg-muted" />
        </div>}
        {overview.isError && <Alert variant="destructive">
          <AlertTitle>Could not load invitation status</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{errorMessage(overview.error)}</p>
            <Button variant="outline" size="sm" disabled={sending} onClick={() => void overview.refetch()}>Retry loading status</Button>
          </AlertDescription>
        </Alert>}
        {overview.data && <>
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <p><strong>{overview.data.readyCount}</strong> ready for first invitation</p>
            <p><strong>{overview.data.heldCount}</strong> held for delivery review</p>
            <p><strong>{overview.data.submittedCount}</strong> submitted to provider</p>
            <p><strong>{overview.data.acceptedCount}</strong> accepted</p>
            <p><strong>{overview.data.existingAccountCount}</strong> already have accounts</p>
            <p><strong>{overview.data.noIndividualEmailCount}</strong> without an individual email</p>
            <p><strong>{overview.data.suppressedCount}</strong> suppressed</p>
          </div>
          <p className="rounded-md border-l-4 border-accent bg-muted/30 p-3 text-sm">
            Existing accounts are excluded, including accounts that have not verified their email. Direct those members to sign in or use account recovery instead. An invitation does not create, activate, or verify an account; each member must register and verify their email.
          </p>

          <div className="space-y-2">
            <label htmlFor="orsa-activation-group-size" className="text-sm font-medium">Recipient group size</label>
            <Input id="orsa-activation-group-size" type="number" min={1} max={500} step={1}
              value={groupSize} disabled={sending}
              onChange={(event) => setGroupSize(Math.max(1, Math.min(500, Math.trunc(Number(event.target.value) || 1))))}
              data-testid="input-orsa-activation-recipient-group-size" />
            <p className="text-xs text-muted-foreground">Each preview freezes a group of up to this many eligible invitations. Search only filters the displayed snapshot.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => { setReviewed(null); setAcceptDuplicateRisk(false); preview.mutate({ retryHeld: false, recipientLimit: groupSize }); }}
              disabled={preview.isPending || sending}
              data-testid="button-orsa-activation-preview"
            >
              {preview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Preview first-time invitations
            </Button>
            <Button
              variant="outline"
              onClick={() => { setReviewed(null); setAcceptDuplicateRisk(false); preview.mutate({ retryHeld: true, recipientLimit: groupSize }); }}
              disabled={preview.isPending || sending}
              data-testid="button-orsa-activation-retry-preview"
            >
              Preview held invitations for retry
            </Button>
          </div>

          {!overview.data.configured && <p className="text-sm text-muted-foreground">
            Sending requires the published production app with email configured. You can preview here without sending.
          </p>}
          {!overview.data.sendable && overview.data.reason && <p className="text-sm text-amber-800 dark:text-amber-300">{overview.data.reason}</p>}
          {!overview.data.sendable && !overview.data.reason && <p className="text-sm text-amber-800 dark:text-amber-300">Sending is currently unavailable. Preview remains available.</p>}
          {overview.data.readyCount === 0 && <p className="text-sm text-muted-foreground">There are no first-time invitations ready to send right now.</p>}
        </>}

        {preview.isError && <Alert variant="destructive">
          <AlertTitle>Invitation preview unavailable</AlertTitle>
          <AlertDescription>{errorMessage(preview.error)}</AlertDescription>
        </Alert>}

        {reviewed && <section className="space-y-4 rounded-lg border p-4" aria-label="Reviewed invitation snapshot">
          {reviewed.retryHeld && <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Held invitation retry — possible duplicate delivery</AlertTitle>
            <AlertDescription>
              This snapshot contains held invitations only. Already-submitted invitations are excluded; this is not a reminder send. Delivery of a held email may have succeeded despite an uncertain provider response.
            </AlertDescription>
          </Alert>}
          <div className="space-y-1 text-sm">
            <p><strong>Subject:</strong> {reviewed.subject}</p>
            <p>{reviewed.eligibleCount} recipients in this reviewed snapshot · {reviewed.availableCount ?? reviewed.eligibleCount} eligible in the full pool · group limit {reviewed.groupLimit ?? groupSize} · {reviewed.alreadySentCount} already submitted and excluded.</p>
            <p className="text-muted-foreground">Confirming sends to the entire snapshot, not only the names currently visible after filtering.</p>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
            <label htmlFor="orsa-activation-recipient-search" className="font-medium">Recipients ({reviewed.recipients.length})</label>
            <Input
              id="orsa-activation-recipient-search"
              type="search"
              placeholder="Search recipient name or email"
              value={recipientSearch}
              onChange={(event) => { setRecipientSearch(event.target.value); setRecipientLimit(50); }}
            />
            <p className="text-muted-foreground">
              Showing {Math.min(matchingRecipients.length, recipientLimit)} of {matchingRecipients.length} matching recipients. Searching does not change the send audience.
            </p>
            <div className="max-h-64 space-y-1 overflow-auto rounded border bg-background p-2" role="list" aria-label="Account invitation recipients">
              {matchingRecipients.slice(0, recipientLimit).map(({ displayName, email }, index) => (
                <div key={`${email}-${index}`} role="listitem" className="break-words rounded px-2 py-1.5">
                  <strong>{displayName?.trim() || "Name unavailable"}</strong> · {email}
                </div>
              ))}
              {!matchingRecipients.length && <p className="p-2 text-muted-foreground">No recipients match this search.</p>}
            </div>
            {matchingRecipients.length > recipientLimit && <Button size="sm" variant="outline" disabled={sending} onClick={() => setRecipientLimit((limit) => limit + 50)}>
              Show 50 more recipients
            </Button>}
          </div>

          <iframe
            title="Account invitation email preview"
            sandbox=""
            srcDoc={reviewed.html}
            className="h-[620px] w-full rounded border bg-white"
          />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Plain-text invitation</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{reviewed.text}</pre>
          </details>
          {reviewed.retryHeld && <label className="flex items-start gap-2 rounded-md border border-amber-500/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={acceptDuplicateRisk}
              onChange={(event) => setAcceptDuplicateRisk(event.target.checked)}
              disabled={sending}
              className="mt-1"
              data-testid="checkbox-orsa-activation-risk"
            />
            <span>I understand that a held invitation may already have arrived and accept that retrying may send a duplicate.</span>
          </label>}
          <Button
            onClick={() => void sendReviewedSnapshot()}
            disabled={!canSend}
            data-testid="button-orsa-activation-send"
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {sending ? "Sending confirmed invitations…" : reviewed.retryHeld
              ? `Send held retry · ${reviewed.eligibleCount} recipient${reviewed.eligibleCount === 1 ? "" : "s"}`
              : `Send first-time invitations · ${reviewed.eligibleCount} recipient${reviewed.eligibleCount === 1 ? "" : "s"}`}
          </Button>
          {(!overview.data?.configured || !overview.data.sendable || reviewed.eligibleCount === 0) &&
            <p className="text-sm text-muted-foreground">This reviewed snapshot cannot be sent under the current provider or eligibility status.</p>}
          <p className="text-xs text-muted-foreground">
            A confirmed send is submitted sequentially in server-limited chunks of 25. Keep this page open. Provider failures are surfaced for review and are never automatically retried.
          </p>
        </section>}

        {progress && <p role="status" className="rounded-md bg-muted/30 p-3 text-sm">{progress}</p>}
        {sending && waitSeconds > 0 && <Button type="button" size="sm" variant="outline" onClick={stopLocalWait} data-testid="button-orsa-activation-stop-wait">Stop waiting and cancel local run</Button>}
        {sendError && <Alert variant="destructive">
          <AlertTitle>Sending stopped — review before retrying</AlertTitle>
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>}
      </CardContent>
    </Card>
  );
}