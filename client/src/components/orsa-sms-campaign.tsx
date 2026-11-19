import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Candidate = {
  id: string; displayName: string | null; phone: string | null; active: boolean;
  sharedPhone: boolean; consentRecordedAt: string | null; consentEvidence: string | null;
  optedOutAt: string | null; status: string; deliveryStatus: string | null; attemptedAt: string | null; submittedAt: string | null;
};

export function OrsaSmsCampaign() {
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [batchSending, setBatchSending] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [recipientsReviewed, setRecipientsReviewed] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(50);
  const campaign = useQuery<{ candidates: Candidate[]; messagePreview: string; landingUrl: string }>({ queryKey: ["/api/admin/orsa/sms-campaign"] });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/sms-campaign"] });
  const consent = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/orsa/sms-campaign/${id}/consent`, { evidence: evidence[id] }),
    onSuccess: () => { setNotice("Consent recorded. Review the recipient again before sending."); refresh(); },
    onError: () => refresh(),
  });
  const send = useMutation({
    mutationFn: async ({ id, phone }: { id: string; phone: string }) =>
      apiRequest("POST", `/api/admin/orsa/sms-campaign/${id}/send`, { phone, confirmed: true }),
    onSuccess: () => { setNotice("Message submitted to the provider; delivery is not guaranteed."); refresh(); },
    onError: () => refresh(),
  });
  const optOut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/orsa/sms-campaign/${id}/opt-out`, {}),
    onSuccess: () => { setNotice("Phone opted out."); refresh(); },
  });
  const candidates = campaign.data?.candidates ?? [];
  const readyRecipients = candidates.filter(c => c.active && c.displayName?.trim() && c.phone && !c.sharedPhone && c.consentRecordedAt && !c.optedOutAt && c.status === "not_sent");
  const activeNoEmail = candidates.filter(c => c.active);
  const ready = readyRecipients.length;
  const selectedIds = new Set(selectedRecipientIds);
  const selectedRecipients = readyRecipients.filter(c => selectedIds.has(c.id));
  const searchable = memberSearch.trim().toLowerCase();
  const orderedActive = [...activeNoEmail].sort((a, b) => {
    const actionable = (c: Candidate) => !!c.displayName?.trim() && !!c.phone && !c.sharedPhone && !c.optedOutAt && c.status === "not_sent";
    return Number(actionable(b)) - Number(actionable(a)) ||
      (a.displayName || "").localeCompare(b.displayName || "") || (a.phone || "").localeCompare(b.phone || "");
  });
  const matchingActive = orderedActive.filter(c => !searchable ||
    c.displayName?.toLowerCase().includes(searchable) || c.phone?.includes(searchable));

  async function sendConsentedBatch() {
    if (!selectedRecipients.length || !recipientsReviewed || batchSending || import.meta.env.DEV) return;
    const snapshot = selectedRecipients.map(({ id, phone }) => ({ id, phone: phone! }));
    if (!window.confirm(
      `Send the ORSA HeartPlan link to the ${snapshot.length} selected, reviewed phone number${snapshot.length === 1 ? "" : "s"}? ` +
      "This sends real texts in groups of up to 25. Keep this page open; uncertain results must be reviewed, not retried.",
    )) return;
    setBatchSending(true);
    setBatchMessage("Starting the confirmed text batch…");
    let submitted = 0;
    let needsReview = 0;
    let skipped = 0;
    try {
      for (let offset = 0; offset < snapshot.length; offset += 25) {
        const response = await apiRequest("POST", "/api/admin/orsa/sms-campaign/send-batch", {
          recipients: snapshot.slice(offset, offset + 25),
          confirmed: true,
        });
        const result = await response.json() as { submitted: number; needsReview: number; skipped: number };
        submitted += result.submitted;
        needsReview += result.needsReview;
        skipped += result.skipped;
        setBatchMessage(`${submitted} submitted · ${needsReview} need review · ${skipped} skipped · ${Math.max(0, snapshot.length - offset - 25)} not yet processed`);
      }
      setBatchMessage(`${submitted} submitted to the text provider; ${needsReview} need delivery review; ${skipped} skipped. Refresh the recipient states before considering any more outreach.`);
    } catch (error) {
      setBatchMessage(`Batch stopped. ${submitted} were submitted; ${needsReview} need review. ${error instanceof Error ? error.message : "Request failed."} Check updated statuses before taking any other action; do not automatically retry.`);
    } finally {
      setBatchSending(false);
      setSelectedRecipientIds([]);
      setRecipientsReviewed(false);
      refresh();
    }
  }

  return <Card>
    <CardHeader><CardTitle>ORSA members without email — text campaign</CardTitle>
      <CardDescription>Records with NA or unusable email are separate from the email campaign. Only active members with a valid, unique phone and documented permission for this text can receive the HeartPlan link. A provider submission is not proof of delivery. Replies of STOP opt out that phone. A text does not verify membership or activate benefits.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm">{activeNoEmail.length} active no-email members · {activeNoEmail.filter(c => !c.displayName?.trim()).length} missing a name · {activeNoEmail.filter(c => !c.phone).length} without a usable phone · {activeNoEmail.filter(c => c.phone && c.sharedPhone).length} with a shared phone · {ready} consented and ready to text</p>
      <p className="text-sm text-muted-foreground">Only active roster members are shown below. {candidates.length - activeNoEmail.length} inactive records are excluded; their missing names and phones are not texting recipients. A member without a roster name cannot be texted.</p>
      <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
        <p className="font-medium">Text members will receive</p>
        <p className="break-words">{campaign.data?.messagePreview ?? "Loading message…"}</p>
        <a href="/orsa/heartplan" target="_blank" rel="noopener noreferrer" className="inline-block font-medium text-primary underline underline-offset-2">Preview the co-branded ORSA HeartPlan landing page</a>
        <p className="text-muted-foreground">The page explains the offer and how a member without a roster email can verify a new email before member benefits are granted.</p>
      </div>
      {ready > 0 && <div className="space-y-3 rounded-md border p-3 text-sm">
        <p className="font-medium">Select and review the exact recipients</p>
        <p className="text-muted-foreground">Only the selected active, consented numbers below are included. Inspect names and phones before confirming; the list will not expand during sending.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={batchSending} onClick={() => { setSelectedRecipientIds(readyRecipients.map(c => c.id)); setRecipientsReviewed(false); }}>Select all {ready} consented numbers</Button>
          <Button size="sm" variant="ghost" disabled={batchSending} onClick={() => { setSelectedRecipientIds([]); setRecipientsReviewed(false); }}>Clear selection</Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-auto rounded-md border bg-background p-2" role="group" aria-label="Consented ORSA text recipients">
          {readyRecipients.map(c => <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-muted">
            <input type="checkbox" checked={selectedIds.has(c.id)} disabled={batchSending}
              onChange={e => { setSelectedRecipientIds(ids => e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id)); setRecipientsReviewed(false); }} />
            <span className="break-words"><strong>{c.displayName || "Unnamed member"}</strong> · {c.phone}<span className="block text-xs text-muted-foreground">Consent: {c.consentEvidence || "Not recorded"}</span></span>
          </label>)}
        </div>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={recipientsReviewed} disabled={!selectedRecipients.length || batchSending}
            onChange={e => setRecipientsReviewed(e.target.checked)} />
          <span>I reviewed the selected member names and phone numbers and confirmed their recorded permission for this text.</span>
        </label>
        <Button disabled={!selectedRecipients.length || !recipientsReviewed || batchSending || send.isPending || import.meta.env.DEV} onClick={() => void sendConsentedBatch()}>
          {batchSending ? "Sending confirmed texts…" : `Send to ${selectedRecipients.length} selected member${selectedRecipients.length === 1 ? "" : "s"}`}
        </Button>
      </div>}
      {batchMessage && <p role="status" className="text-sm">{batchMessage}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {(consent.error || send.error || optOut.error) && <Alert variant="destructive"><AlertDescription>{String((consent.error || send.error || optOut.error) instanceof Error ? (consent.error || send.error || optOut.error)!.message : "Request failed")}. Refresh before attempting anything else; never resend an uncertain outcome.</AlertDescription></Alert>}
      {campaign.isError && <Alert variant="destructive"><AlertDescription>Could not load campaign recipients.</AlertDescription></Alert>}
      {campaign.isLoading && <p className="text-sm">Loading recipients…</p>}
      <div className="space-y-2">
        <label htmlFor="orsa-sms-member-search" className="text-sm font-medium">Active no-email members</label>
        <Input id="orsa-sms-member-search" type="search" placeholder="Find a member by name or phone" value={memberSearch}
          onChange={e => { setMemberSearch(e.target.value); setVisibleLimit(50); }} />
        <p className="text-sm text-muted-foreground">Showing {Math.min(matchingActive.length, visibleLimit)} of {matchingActive.length} matching active members. Named members with unique phones are shown first; this list is for review, not permission to send.</p>
      </div>
      <div className="max-h-[32rem] space-y-3 overflow-y-auto">
        {matchingActive.slice(0, visibleLimit).map(c => {
          const eligible = c.displayName?.trim() && c.phone && !c.sharedPhone && !c.optedOutAt && c.status === "not_sent";
          return <div key={c.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{c.displayName?.trim() || "Name missing — update roster"}</strong> · {c.phone || "No valid phone"}
                <div className="text-muted-foreground">{!c.displayName?.trim() ? "Name missing — update roster before texting" : !c.phone ? "No valid phone — update roster" : c.sharedPhone ? "Shared phone — resolve roster first" : c.optedOutAt ? "Opted out — do not text" : c.status === "not_sent" ? c.consentRecordedAt ? "Consented — not sent" : "Consent required" : c.status === "submitted" ? c.deliveryStatus === "delivered" ? "Provider reports delivered" : c.deliveryStatus === "failed" ? "Provider reports delivery failed — do not retry" : "Submitted to provider (not delivery confirmation)" : c.status === "sending" ? "Attempt in progress/uncertain — do not retry" : "Outcome needs review — do not retry"}{c.attemptedAt && ` · Attempted ${new Date(c.attemptedAt).toLocaleString()}`}</div>
              </div>
              {c.phone && !c.optedOutAt && <Button size="sm" variant="outline" disabled={optOut.isPending || batchSending} onClick={() => { if (window.confirm(`Mark ${c.phone} as opted out of this campaign?`)) optOut.mutate(c.id); }}>Mark opted out</Button>}
            </div>
            {eligible && !c.consentRecordedAt && <div className="mt-3 flex flex-wrap gap-2">
              <Input className="min-w-64 flex-1" aria-label={`SMS consent evidence for ${c.displayName || c.phone}`} placeholder="How and when did the member explicitly consent to this text?" value={evidence[c.id] || ""} onChange={e => setEvidence({ ...evidence, [c.id]: e.target.value })} />
              <Button size="sm" variant="outline" disabled={consent.isPending || batchSending || (evidence[c.id] || "").trim().length < 10} onClick={() => consent.mutate(c.id)}>Record consent</Button>
            </div>}
            {eligible && c.consentRecordedAt && <div className="mt-3 space-y-2">
              <p>Consent recorded {new Date(c.consentRecordedAt).toLocaleString()}: {c.consentEvidence}</p>
              <p className="break-words rounded bg-muted p-2">{campaign.data?.messagePreview}</p>
              <Button size="sm" disabled={send.isPending || batchSending || import.meta.env.DEV} onClick={() => {
                if (window.confirm(`Send this one-time ORSA text to ${c.displayName || "this member"} at ${c.phone}? Confirm consent and recipient first. This contacts a real person.`)) send.mutate({ id: c.id, phone: c.phone! });
              }}>Review & send text</Button>
            </div>}
          </div>;
        })}
      </div>
      {matchingActive.length > visibleLimit && <Button variant="outline" onClick={() => setVisibleLimit(limit => limit + 50)}>Show 50 more members</Button>}
      {import.meta.env.DEV && <p className="text-sm text-muted-foreground">Text delivery is disabled in development. Consent and opt-outs can still be reviewed.</p>}
    </CardContent>
  </Card>;
}