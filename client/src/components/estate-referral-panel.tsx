import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, FileCheck2, Mail, MessageSquareText, Phone, Plus, Send } from "lucide-react";
import { ESTATE_REFERRAL_FIRMS, estateReferralFirmChoice, estateReferralLocalDate as toLocal, estateReferralIsoDate as toIso, estateReferralSaveSchema, estateReferralUpdateSchema, type EstateReferralEmailPreview, type EstateReferralOverview, type EstateReferralSave } from "@shared/estateReferral";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const statusLabels: Record<EstateReferralSave["status"], string> = {
  needed: "Needed", referred: "Referred", awaiting_update: "Awaiting update", in_progress: "In progress", closed: "Closed",
};
const reasonLabels: Record<EstateReferralSave["reason"], string> = {
  family_reported_no_plan: "Family reported no plan", search_no_match: "Search returned no match", staff_follow_up: "Staff follow-up",
};
type Draft = Omit<EstateReferralSave, "expectedVersion">;
const emptyDraft: Draft = {
  reason: "staff_follow_up", status: "needed", attorneyName: "", attorneyFirm: "", attorneyEmail: "", attorneyPhone: "",
  referredAt: null, nextFollowUpAt: null, familyPermissionConfirmed: false, resolutionSummary: "",
};
const base = (certId: string) => `/api/admin/case/${encodeURIComponent(certId)}/estate-referral`;
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function EstateReferralPanel({ certId }: { certId: string }) {
  const key = [base(certId)];
  const query = useQuery<EstateReferralOverview>({
    queryKey: key,
    enabled: !!certId,
    queryFn: async () => {
      const response = await fetch(base(certId), { credentials: "include" });
      if (!response.ok) throw new Error("Could not load estate referral details.");
      return response.json();
    },
    refetchInterval: 10_000,
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [initialized, setInitialized] = useState(false);
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState("");
  const [updateSummary, setUpdateSummary] = useState("");
  const [updateSource, setUpdateSource] = useState<"attorney" | "family" | "staff">("staff");
  const [reportedAt, setReportedAt] = useState(() => toLocal(new Date().toISOString()));
  const [preview, setPreview] = useState<EstateReferralEmailPreview | null>(null);
  const [sendError, setSendError] = useState("");
  const [updateError, setUpdateError] = useState("");
  const referral = query.data?.referral ?? null;
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  useEffect(() => {
    if (!query.data || (initialized && dirty)) return;
    const record = query.data.referral;
    const initial: Draft = record ? {
      reason: record.reason, status: record.status, attorneyName: record.attorneyName, attorneyFirm: record.attorneyFirm,
      attorneyEmail: record.attorneyEmail, attorneyPhone: record.attorneyPhone, referredAt: toLocal(record.referredAt),
      nextFollowUpAt: toLocal(record.nextFollowUpAt), familyPermissionConfirmed: !!record.permissionConfirmedAt,
      resolutionSummary: record.resolutionSummary,
    } : emptyDraft;
    if (initialized && baselineVersion === (record?.version ?? 0)) return;
    setDraft(initial); setBaseline(initial); setInitialized(true); setBaselineVersion(record?.version ?? 0);
  }, [query.data, initialized, dirty, baselineVersion]);

  const saveMutation = useMutation({
    mutationFn: async (payload: EstateReferralSave) => {
      const response = await apiRequest("PUT", base(certId), payload);
      return response.json();
    },
    onSuccess: async () => {
      setLocalError("");
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const updateMutation = useMutation({
    mutationFn: async (payload: { expectedVersion: number; source: "attorney" | "family" | "staff"; summary: string; reportedAt: string }) => {
      const response = await apiRequest("POST", `${base(certId)}/updates`, payload);
      return response.json();
    },
    onSuccess: async () => { setUpdateSummary(""); setUpdateError(""); await queryClient.invalidateQueries({ queryKey: key }); },
  });
  const previewMutation = useMutation({
    mutationFn: async (recipientKind: "attorney" | "family") => {
      const response = await apiRequest("POST", `${base(certId)}/requests/preview`, { expectedVersion: referral!.version, recipientKind });
      return response.json() as Promise<EstateReferralEmailPreview>;
    },
    onSuccess: (data) => { setSendError(""); setPreview(data); },
    onError: (error: any) => setSendError(error?.message || "Could not create a message preview. No email was sent."),
  });
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Review the message before sending.");
      const response = await apiRequest("POST", `${base(certId)}/requests/${encodeURIComponent(preview.id)}/send`, { confirmed: true });
      return response.json();
    },
    onSuccess: async () => { setPreview(null); setSendError(""); await queryClient.invalidateQueries({ queryKey: key }); },
    onError: async (error: any) => {
      setSendError(error?.message || "Send result could not be confirmed. Check the request history before trying again.");
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const patch = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(current => ({ ...current, [field]: value }));
  const chooseFirm = (value: string) => {
    const firm = ESTATE_REFERRAL_FIRMS.find(option => option.value === value)?.label || "";
    if (firm === draft.attorneyFirm) return;
    if ((draft.attorneyFirm || draft.attorneyName || draft.attorneyEmail || draft.attorneyPhone) &&
      !window.confirm("Change referral firm? The previous contact details, permission confirmation, and placement status will be cleared in this draft. Nothing changes until you save.")) return;
    setDraft(current => ({
      ...current, attorneyFirm: firm, attorneyName: "", attorneyEmail: "", attorneyPhone: "",
      familyPermissionConfirmed: false, referredAt: null, status: "needed", resolutionSummary: "",
    }));
  };
  const save = () => {
    const result = estateReferralSaveSchema.safeParse({
      ...draft, expectedVersion: baselineVersion,
      referredAt: toIso(draft.referredAt),
      nextFollowUpAt: toIso(draft.nextFollowUpAt),
    });
    if (!result.success) { setLocalError(result.error.issues.map(issue => issue.message).join(" ")); return; }
    setLocalError("");
    saveMutation.mutate(result.data, { onSuccess: (record) => {
      const saved = { ...draft };
      setDraft(saved); setBaseline(saved); setBaselineVersion(record.version);
    } });
  };
  const addUpdate = () => {
    const result = estateReferralUpdateSchema.safeParse({
      expectedVersion: referral?.version, source: updateSource, summary: updateSummary, reportedAt: toIso(reportedAt),
    });
    if (!result.success) { setUpdateError(result.error.issues.map(issue => issue.message).join(" ")); return; }
    setUpdateError(""); updateMutation.mutate(result.data);
  };
  const isOverdue = !!referral?.nextFollowUpAt && referral.status !== "closed" && new Date(referral.nextFollowUpAt) < new Date();
  const canRequest = !!referral && !dirty && referral.status !== "needed" && referral.status !== "closed" && draft.familyPermissionConfirmed && query.data?.deliveryConfigured;
  const initialLoading = query.isLoading;

  return (
    <Card id="estate-referral-tracker" className="min-w-0 scroll-mt-4 overflow-hidden border-amber-300/70 bg-[linear-gradient(115deg,hsl(var(--card)),hsl(42_55%_97%))] shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-md bg-amber-100 p-2 text-amber-900"><FileCheck2 className="h-5 w-5" /></div>
            <div>
              <CardTitle className="text-base">Estate attorney referral</CardTitle>
              <CardDescription className="mt-1 max-w-3xl">
                A staff-managed handoff and follow-up tracker—not a legal conclusion or legal advice. A search with no matches does not prove there is no estate plan; an attorney can review whether probate is needed.
              </CardDescription>
            </div>
          </div>
          {referral && <div className="flex flex-wrap items-center gap-2">
            {isOverdue && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" />Follow-up overdue</Badge>}
            <Badge variant={referral.status === "closed" ? "secondary" : "outline"}>{statusLabels[referral.status]}</Badge>
          </div>}
        </div>
        {query.data?.referralNeeded && <div role="status" className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-100/60 px-3 py-2.5 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Referral needed.</strong> Estate administration support has not been resolved or recorded. Confirm the family’s needs and track a referral when appropriate.</p>
        </div>}
      </CardHeader>

      {initialLoading ? <CardContent className="space-y-3"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /></CardContent> :
      query.isError ? <CardContent><div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><span>Estate referral details could not be loaded.</span><Button size="sm" variant="outline" onClick={() => query.refetch()}>Retry</Button></div></CardContent> :
      <CardContent className="space-y-5">
        {dirty && baselineVersion !== (referral?.version ?? 0) && <div role="alert" className="rounded-md border border-amber-400 p-3 text-sm">
          This referral changed in another tab. Your unsaved draft is preserved; reload the saved version before editing again.
          <Button className="mt-2" variant="outline" size="sm" onClick={() => {
            if (window.confirm("Discard this unsaved draft and load the latest saved referral?")) {
              setInitialized(false); setLocalError(""); saveMutation.reset();
            }
          }}>Reload saved referral</Button>
        </div>}
        {!referral && !expanded ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
          <div><p className="text-sm font-medium">No referral has been recorded</p><p className="mt-1 text-xs text-muted-foreground">Only record a handoff after it has actually happened.</p></div>
          <Button variant="outline" onClick={() => setExpanded(true)}><Plus className="mr-2 h-4 w-4" />Track attorney referral</Button>
        </div> : null}
        {(referral || expanded) && <div className="space-y-4">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="estate-reason">Reason to track</Label><Select value={draft.reason} onValueChange={(v: Draft["reason"]) => patch("reason", v)} disabled={saveMutation.isPending}>
              <SelectTrigger id="estate-reason"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(reasonLabels).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-1.5"><Label htmlFor="estate-status">Referral status</Label><Select value={draft.status} onValueChange={(v: Draft["status"]) => patch("status", v)} disabled={saveMutation.isPending}>
              <SelectTrigger id="estate-status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-1.5">
              <Label htmlFor="estate-referral-firm">Referral firm</Label>
              <Select value={estateReferralFirmChoice(draft.attorneyFirm)} onValueChange={chooseFirm} disabled={saveMutation.isPending}>
                <SelectTrigger id="estate-referral-firm" data-testid="select-estate-referral-firm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTATE_REFERRAL_FIRMS.map(firm => <SelectItem key={firm.value} value={firm.value}>{firm.label}</SelectItem>)}
                  <SelectItem value="manual">Other / add manually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="estate-firm">Firm name</Label><Input id="estate-firm" value={draft.attorneyFirm} maxLength={200} onChange={e => setDraft(current => ({ ...current, attorneyFirm: e.target.value, familyPermissionConfirmed: false }))} disabled={saveMutation.isPending} placeholder="Choose a firm or enter another manually" /></div>
            <div className="space-y-1.5"><Label htmlFor="estate-attorney">Attorney / referral contact name</Label><Input id="estate-attorney" value={draft.attorneyName} maxLength={160} onChange={e => patch("attorneyName", e.target.value)} disabled={saveMutation.isPending} placeholder="Staff-entered contact" /></div>
            <div className="space-y-1.5"><Label htmlFor="estate-email">Attorney email (optional)</Label><Input id="estate-email" type="email" value={draft.attorneyEmail} maxLength={320} onChange={e => patch("attorneyEmail", e.target.value)} disabled={saveMutation.isPending} /></div>
            <div className="space-y-1.5"><Label htmlFor="estate-phone">Attorney phone (optional)</Label><Input id="estate-phone" type="tel" value={draft.attorneyPhone} maxLength={60} onChange={e => patch("attorneyPhone", e.target.value)} disabled={saveMutation.isPending} /></div>
            <div className="space-y-1.5"><Label htmlFor="estate-referred">Actual referral date and time</Label><Input id="estate-referred" type="datetime-local" value={draft.referredAt || ""} onChange={e => patch("referredAt", e.target.value)} disabled={saveMutation.isPending} /></div>
            {draft.status !== "closed" && <div className="space-y-1.5"><Label htmlFor="estate-followup">Next follow-up date and time</Label><Input id="estate-followup" type="datetime-local" value={draft.nextFollowUpAt || ""} onChange={e => patch("nextFollowUpAt", e.target.value)} disabled={saveMutation.isPending} /></div>}
            {draft.status === "closed" && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="estate-resolution">Resolution summary</Label><Textarea id="estate-resolution" value={draft.resolutionSummary} maxLength={2000} onChange={e => patch("resolutionSummary", e.target.value)} disabled={saveMutation.isPending} rows={2} /></div>}
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-800" checked={draft.familyPermissionConfirmed} onChange={e => patch("familyPermissionConfirmed", e.target.checked)} disabled={saveMutation.isPending} />
            <span><span className="font-medium">Family permission to contact this attorney confirmed</span><span className="mt-0.5 block text-xs text-muted-foreground">This attestation is separate from case access. Saving does not send a message, create legal representation, or confirm the attorney accepted the referral.</span></span>
          </label>
          {referral && <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {referral.attorneyPhone && <a className="inline-flex min-w-0 items-center gap-1.5 break-all text-primary underline-offset-4 hover:underline" href={`tel:${referral.attorneyPhone}`}><Phone className="h-4 w-4 shrink-0" />{referral.attorneyPhone}</a>}
            {referral.attorneyEmail && <a className="inline-flex min-w-0 items-center gap-1.5 break-all text-primary underline-offset-4 hover:underline" href={`mailto:${referral.attorneyEmail}`}><Mail className="h-4 w-4 shrink-0" />{referral.attorneyEmail}</a>}
          </div>}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={saveMutation.isPending || !dirty && !!referral}>{saveMutation.isPending ? "Saving…" : referral ? "Save referral" : "Save referral record"}</Button>
            {dirty && <span className="text-xs text-amber-800">Unsaved changes — save before creating a message preview.</span>}
            {saveMutation.isSuccess && !dirty && <span className="inline-flex items-center gap-1 text-xs text-emerald-800"><Check className="h-3.5 w-3.5" />Saved</span>}
          </div>
          {localError && <p role="alert" className="text-sm text-destructive">{localError}</p>}
          {saveMutation.isError && <p role="alert" className="text-sm text-destructive">{(saveMutation.error as Error)?.message || "Unable to save referral details. Your edits remain here."}</p>}

          {referral && <section className="space-y-3 border-t pt-4" aria-labelledby="estate-contact-log">
            <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 id="estate-contact-log" className="text-sm font-semibold">Updates & handoff messages</h3><p className="text-xs text-muted-foreground">Replies are handled by SAL staff and recorded here manually. This tracker does not automatically read email.</p></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!canRequest || previewMutation.isPending} onClick={() => previewMutation.mutate("attorney")}><Mail className="mr-1.5 h-3.5 w-3.5" />Preview attorney email</Button>
                <Button size="sm" variant="outline" disabled={!canRequest || previewMutation.isPending} onClick={() => previewMutation.mutate("family")}><Send className="mr-1.5 h-3.5 w-3.5" />Preview family email</Button>
              </div>
            </div>
            {!query.data?.deliveryConfigured && <p className="text-xs text-muted-foreground">Email delivery is not configured. No outbound email is available.</p>}
            {dirty && <p className="text-xs text-amber-800">Save your edits before requesting a message preview.</p>}
            {referral.status === "needed" || referral.status === "closed" ? <p className="text-xs text-muted-foreground">Messages are unavailable while status is {statusLabels[referral.status].toLowerCase()}.</p> : null}
            {sendError && !preview && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
            {previewMutation.isError && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
            {referral.attorneyName && <p className="text-xs text-muted-foreground">Attorney: {referral.attorneyName}{referral.attorneyFirm ? ` · ${referral.attorneyFirm}` : ""}{referral.attorneyEmail ? ` · ${referral.attorneyEmail}` : ""}</p>}
            <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-2 rounded-md bg-muted/35 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log an update received</h4>
                <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label htmlFor="estate-source" className="text-xs">Reported by</Label><Select value={updateSource} onValueChange={(v: typeof updateSource) => setUpdateSource(v)}><SelectTrigger id="estate-source" className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="attorney">Attorney</SelectItem><SelectItem value="family">Family</SelectItem><SelectItem value="staff">Staff</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1"><Label htmlFor="estate-reported" className="text-xs">Reported date</Label><Input id="estate-reported" type="datetime-local" className="h-9" value={reportedAt} onChange={e => setReportedAt(e.target.value)} /></div></div>
                <Textarea aria-label="Update summary" placeholder="What did staff receive or learn?" maxLength={3000} rows={3} value={updateSummary} onChange={e => setUpdateSummary(e.target.value)} />
                <Button size="sm" variant="secondary" onClick={addUpdate} disabled={updateMutation.isPending}><MessageSquareText className="mr-1.5 h-3.5 w-3.5" />{updateMutation.isPending ? "Recording…" : "Record update"}</Button>
                {updateError && <p role="alert" className="text-xs text-destructive">{updateError}</p>}
                {updateMutation.isError && <p role="alert" className="text-xs text-destructive">{(updateMutation.error as Error)?.message || "Could not record update."}</p>}
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded history</h4>
                {query.data?.updates?.length ? <ol className="max-h-64 space-y-3 overflow-auto pr-1">{query.data.updates.map(item => <li key={item.id} className="border-l-2 border-amber-300 pl-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary" className="text-[10px]">{item.source}</Badge><span className="text-xs text-muted-foreground">Reported {dateLabel(item.reportedAt)} · recorded {dateLabel(item.recordedAt)}</span></div><p className="mt-1 whitespace-pre-wrap break-words">{item.summary}</p>
                </li>)}</ol> : <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No updates have been recorded yet.</p>}
                <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email request history</h4>
                {query.data?.requests?.length ? <ul className="space-y-2">{query.data.requests.map(request => <li key={request.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded border p-2 text-xs">
                  <span className="font-medium">{request.recipientKind === "family" ? "Family" : "Attorney"}</span><span className="break-all text-muted-foreground">{request.recipientEmail}</span><Badge variant="outline">{request.status}</Badge><span className="text-muted-foreground">{request.submittedAt ? `Submitted ${dateLabel(request.submittedAt)}` : `Created ${dateLabel(request.createdAt)}`}</span>
                </li>)}</ul> : <p className="text-xs text-muted-foreground">No email requests recorded.</p>}
                <p className="text-[11px] text-muted-foreground">Request history reflects submitted status—not proof of delivery or receipt.</p>
              </div>
            </div>
          </section>}
        </div>}
      </CardContent>}

      <Dialog open={!!preview} onOpenChange={open => { if (!open && !sendMutation.isPending) { setPreview(null); setSendError(""); } }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Review email before sending</DialogTitle><DialogDescription>Read the exact server-generated content. No message is sent until you confirm below.</DialogDescription></DialogHeader>
          {preview && <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm"><p><strong>To:</strong> <span className="break-all">{preview.to}</span></p><p className="mt-1"><strong>Subject:</strong> {preview.subject}</p></div>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-md border p-4 font-sans text-sm leading-relaxed">{preview.text}</pre>
            {sendError && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
            <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={sendMutation.isPending} onClick={() => { setPreview(null); setSendError(""); }}>Cancel</Button><Button disabled={sendMutation.isPending || !!sendError} onClick={() => sendMutation.mutate()}><Send className="mr-2 h-4 w-4" />{sendMutation.isPending ? "Submitting…" : "Confirm send"}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

