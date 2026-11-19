import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ClipboardPaste, FileText, Loader2, Plus, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AccountCategory = "financial" | "memberships" | "subscriptions" | "real_estate" | "protected_information" | "miscellaneous";
type IntakeAccount = {
  accountName: string;
  accountType: string;
  category: AccountCategory;
  accountNumberLast4: string | null;
  isJoint: boolean;
};
type IntakeCandidate = IntakeAccount & { duplicate: boolean; duplicateOf?: string; included: boolean; key: string };
type IntakeCase = { id: string; deceasedName: string; certificateNumber?: string | null };
type ImportResult = { created: unknown[]; skipped: number; message: string };

const categoryLabels: Record<AccountCategory, string> = {
  financial: "Financial",
  memberships: "Memberships",
  subscriptions: "Subscriptions",
  real_estate: "Real estate",
  protected_information: "Protected information",
  miscellaneous: "Miscellaneous",
};

function redactLongNumber(value: string) {
  return value.replace(/\d(?:[\s-]*\d){4,}/g, "[redacted]");
}

function messageForError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status = Number(message.match(/(?:^|\s)(\d{3})(?:\s|:)/)?.[1]);
  if (status === 401 || status === 403) return { title: "Permission needed", body: "Your staff account does not have permission to use account intake for this case." };
  if (status === 404 || status === 501 || status === 502 || status === 503) return { title: "Extractor unavailable", body: "Account extraction is not available right now. You can still add accounts using the manual form." };
  return { title: "Unable to analyze details", body: "The details could not be processed. Please retry, or use the manual account form." };
}

export function AccountEmailIntake({ caseId, cases = [], caseName, disabled = false, initialText, autoAnalyze = false }: {
  caseId?: string;
  cases?: IntakeCase[];
  caseName?: string;
  disabled?: boolean;
  initialText?: string;
  autoAnalyze?: boolean;
}) {
  const [selectedCaseId, setSelectedCaseId] = useState(caseId || "");
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<IntakeCandidate[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "analyzing" | "review" | "empty" | "error" | "saved">("idle");
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<ImportResult | null>(null);
  const requestVersion = useRef(0);
  const autoAnalyzedSource = useRef<string | null>(null);
  const selected = useMemo(() => cases.find((item) => item.id === selectedCaseId), [cases, selectedCaseId]);
  const resolvedCaseId = caseId || selected?.id || "";
  const resolvedCaseName = caseName || selected?.deceasedName || "";

  useEffect(() => {
    if (!caseId && selectedCaseId && !selected) {
      requestVersion.current += 1;
      setSelectedCaseId("");
      setText("");
      setCandidates(null);
      setWarnings([]);
      setConfirmed(false);
      setSaveResult(null);
      setError(null);
      setState("idle");
    }
  }, [caseId, selected, selectedCaseId]);

  useEffect(() => {
    requestVersion.current += 1;
    setSelectedCaseId(caseId || "");
    setText("");
    setCandidates(null);
    setWarnings([]);
    setConfirmed(false);
    setSaveResult(null);
    setError(null);
    setState("idle");
    setSaving(false);
  }, [caseId]);

  useEffect(() => () => { requestVersion.current += 1; }, []);

  useEffect(() => {
    if (initialText === undefined) return;
    requestVersion.current += 1;
    setText(initialText);
    setCandidates(null);
    setWarnings([]);
    setConfirmed(false);
    setSaveResult(null);
    setError(null);
    setState("idle");
    autoAnalyzedSource.current = null;
  }, [caseId, initialText]);

  const resetPreview = () => {
    requestVersion.current += 1;
    setCandidates(null);
    setWarnings([]);
    setConfirmed(false);
    setSaveResult(null);
    setError(null);
    setState("idle");
  };

  const handleCaseChange = (value: string) => {
    requestVersion.current += 1;
    setSelectedCaseId(value);
    setText("");
    setCandidates(null);
    setWarnings([]);
    setConfirmed(false);
    setSaveResult(null);
    setError(null);
    setState("idle");
  };

  const handleTextChange = (value: string) => {
    requestVersion.current += 1;
    setText(value);
    setCandidates(null);
    setWarnings([]);
    setConfirmed(false);
    setSaveResult(null);
    setError(null);
    setState("idle");
  };

  const analyze = async () => {
    if (!resolvedCaseId || !text.trim() || saving) return;
    const version = ++requestVersion.current;
    setState("analyzing");
    setError(null);
    setCandidates(null);
    setWarnings([]);
    setConfirmed(false);
    setSaveResult(null);
    try {
      const response = await apiRequest("POST", `/api/admin/case/${encodeURIComponent(resolvedCaseId)}/account-intake/analyze`, { text: text.trim() });
      const result = await response.json() as { accounts?: Array<IntakeAccount & { duplicate?: boolean; duplicateOf?: string }>; warnings?: string[] };
      if (version !== requestVersion.current) return;
      const accounts = Array.isArray(result.accounts) ? result.accounts : [];
      setWarnings(Array.isArray(result.warnings) ? result.warnings.map((warning) => redactLongNumber(String(warning))) : []);
      setCandidates(accounts.map((account, index) => ({
        ...account,
        accountName: redactLongNumber(String(account.accountName || "")),
        accountType: redactLongNumber(String(account.accountType || "")),
        duplicateOf: account.duplicateOf ? redactLongNumber(account.duplicateOf) : undefined,
        category: account.category in categoryLabels ? account.category : "miscellaneous",
        accountNumberLast4: account.accountNumberLast4 ? String(account.accountNumberLast4).replace(/\D/g, "").slice(-4) : null,
        duplicate: !!account.duplicate,
        included: !account.duplicate,
        key: `${version}-${index}`,
      })));
      setState(accounts.length ? "review" : "empty");
    } catch (caught) {
      if (version !== requestVersion.current) return;
      setError(messageForError(caught));
      setState("error");
    }
  };

  useEffect(() => {
    if (!autoAnalyze || initialText === undefined || initialText.trim().length < 10 ||
      text !== initialText || autoAnalyzedSource.current === `${resolvedCaseId}:${initialText}`) return;
    autoAnalyzedSource.current = `${resolvedCaseId}:${initialText}`;
    void analyze();
  }, [autoAnalyze, initialText, text, resolvedCaseId]);

  const updateCandidate = (key: string, changes: Partial<IntakeCandidate>) => {
    setCandidates((current) => current?.map((candidate) => candidate.key === key ? { ...candidate, ...changes } : candidate) || null);
    setConfirmed(false);
    setSaveResult(null);
  };
  const includedCandidates = (candidates || []).filter((candidate) => candidate.included);
  const readyToSave = !!resolvedCaseId && state === "review" && confirmed && includedCandidates.length > 0 &&
    includedCandidates.every((candidate) => candidate.accountName.trim() && candidate.accountType.trim() &&
      (!candidate.accountNumberLast4 || /^\d{4}$/.test(candidate.accountNumberLast4)));

  const save = async () => {
    if (!readyToSave || saving || !resolvedCaseId) return;
    const targetCase = resolvedCaseId;
    const version = ++requestVersion.current;
    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest("POST", `/api/admin/case/${encodeURIComponent(targetCase)}/account-intake/import`, {
        confirmed: true,
        accounts: includedCandidates.map(({ accountName, accountType, category, accountNumberLast4, isJoint }) => ({
          accountName: accountName.trim(),
          accountType: accountType.trim(),
          category,
          accountNumberLast4: accountNumberLast4 ? accountNumberLast4.replace(/\D/g, "").slice(-4) || null : null,
          isJoint: !!isJoint,
        })),
      });
      const result = await response.json() as ImportResult;
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey.map((part) => String(part)).join("/");
          return key.startsWith(`/api/admin/case/${targetCase}`) ||
            key.includes("/api/admin/all-accounts") ||
            key.includes("/api/admin/family/") && key.includes("/accounts") ||
            key.includes("/api/admin/all-notifications") ||
            key.includes("/api/admin/family/") && key.includes("/notifications") ||
            key.includes("/api/admin/reports/summary");
        },
      });
      if (version !== requestVersion.current || targetCase !== resolvedCaseId) return;
      setSaveResult(result);
      setText("");
      setCandidates(null);
      setWarnings([]);
      setConfirmed(false);
      setState("saved");
    } catch (caught) {
      if (version !== requestVersion.current) return;
      const failure = messageForError(caught);
      setError({ title: "Accounts not saved", body: failure.title === "Permission needed" ? failure.body :
        "The save could not be confirmed. Your reviewed details are still here. Retry saving; existing duplicates will be skipped." });
      setState("review");
    } finally {
      if (version === requestVersion.current) setSaving(false);
    }
  };

  const selectIsDisabled = disabled || saving || !!caseId;
  return (
    <Card className="border-primary/20" data-testid="account-email-intake">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardPaste className="h-4 w-4 text-primary" />
          Paste email or account details
        </CardTitle>
        <CardDescription>
          Review extracted account details before anything is added. This creates connected-account records only; it does not verify accounts or notify companies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!caseId && (
          <div className="space-y-2">
            <Label htmlFor="intake-case-select">Case for these account details</Label>
            <Select value={selectedCaseId} onValueChange={handleCaseChange} disabled={selectIsDisabled}>
              <SelectTrigger id="intake-case-select" data-testid="case-selection">
                <SelectValue placeholder="Choose a case first" />
              </SelectTrigger>
              <SelectContent>
                {cases.map((item) => <SelectItem key={item.id} value={item.id}>{item.deceasedName}{item.certificateNumber ? ` · #${item.certificateNumber}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {!cases.length && <p className="text-xs text-muted-foreground">No cases are available to select.</p>}
          </div>
        )}
        {caseId && resolvedCaseName && <p className="text-xs text-muted-foreground">Case: <span className="font-medium text-foreground">{resolvedCaseName}</span></p>}

        <div className="space-y-2">
          <Label htmlFor="account-intake-paste">Email or account details</Label>
          <Textarea
            id="account-intake-paste"
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            disabled={disabled || saving}
            placeholder="Paste relevant email text or account details here…"
            className="min-h-32 resize-y"
            data-testid="paste"
          />
          <p className="text-xs text-muted-foreground">Do not paste passwords, Social Security numbers, or security codes. Full account numbers are never shown in the review; only the last four digits may be included. Raw text is not stored; the server sends redacted text to its extractor.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={analyze} disabled={!resolvedCaseId || !text.trim() || disabled || saving || state === "analyzing"} data-testid="analyze">
            {state === "analyzing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {state === "analyzing" ? "Analyzing…" : "Analyze details"}
          </Button>
          {(text || candidates || state !== "idle") && <Button variant="outline" onClick={() => { handleTextChange(""); resetPreview(); }} disabled={saving}>Clear</Button>}
          {resolvedCaseId && !text.trim() && state === "idle" && <span className="text-xs text-muted-foreground">Nothing is saved until you review and confirm.</span>}
        </div>

        {state === "analyzing" && <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-4" role="status"><div className="space-y-2 flex-1"><div className="h-3 w-40 animate-pulse rounded bg-muted" /><div className="h-3 w-3/4 animate-pulse rounded bg-muted" /></div><span className="text-sm text-muted-foreground">Reading details…</span></div>}
        {state === "empty" && <div className="flex gap-3 rounded-md border border-amber-300/70 bg-amber-50/70 p-4 text-sm dark:bg-amber-950/20"><AlertCircle className="h-4 w-4 shrink-0 text-amber-700" /><div><p className="font-medium">No accounts found</p><p className="mt-1 text-muted-foreground">Try pasting a message with clearer account names or details, or add an account manually.</p></div></div>}
        {error && <div className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert"><AlertCircle className="h-4 w-4 shrink-0 text-destructive" /><div><p className="font-medium">{error.title}</p><p className="mt-1 text-muted-foreground">{error.body}</p><Button variant="outline" size="sm" className="mt-3" onClick={state === "review" ? save : analyze} disabled={saving || (state === "review" ? !readyToSave : !text.trim())}>Try again</Button></div></div>}
        {state === "saved" && saveResult && <div className="flex gap-3 rounded-md border border-emerald-300/70 bg-emerald-50/70 p-4 text-sm dark:bg-emerald-950/20" role="status"><Check className="h-4 w-4 shrink-0 text-emerald-700" /><div><p className="font-medium">Account intake complete</p><p className="mt-1 text-muted-foreground">Created {saveResult.created?.length || 0}; skipped {saveResult.skipped || 0}.{saveResult.message ? ` ${redactLongNumber(saveResult.message)}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">These records are not account verification and no company was notified.</p></div></div>}

        {state === "review" && candidates && (
          <section className="space-y-4" aria-label="Review extracted account details" data-testid="reviewfields">
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <div><h3 className="text-sm font-semibold">Review {candidates.length} possible account{candidates.length === 1 ? "" : "s"}</h3><p className="text-xs text-muted-foreground">Correct details, then explicitly confirm the selected rows.</p></div>
              <Badge variant="secondary">{includedCandidates.length} selected</Badge>
            </div>
            {warnings.length > 0 && <div className="rounded-md border border-amber-300/70 bg-amber-50/70 p-3 text-sm dark:bg-amber-950/20"><div className="flex gap-2 font-medium"><ShieldAlert className="h-4 w-4 text-amber-700" />Review notes</div><ul className="ml-6 mt-2 list-disc space-y-1 text-xs text-muted-foreground">{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
            <div className="space-y-3">
              {candidates.map((candidate, index) => (
                <div key={candidate.key} className={`rounded-lg border p-4 ${candidate.duplicate ? "border-amber-300/70 bg-amber-50/30 dark:bg-amber-950/10" : "bg-background"}`} data-testid={`intake-candidate-${index}`}>
                  <div className="mb-3 flex items-start gap-3">
                    <Checkbox checked={candidate.included} onCheckedChange={(checked) => updateCandidate(candidate.key, { included: checked === true })} aria-label={`Include ${candidate.accountName || `account ${index + 1}`}`} disabled={saving} data-testid={`include-account-${index}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{candidate.accountName || `Account ${index + 1}`}</p>{candidate.duplicate && <Badge variant="outline" className="border-amber-500/50 text-amber-800">Possible duplicate</Badge>}</div>
                      {candidate.duplicate && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{candidate.duplicateOf ? `May match ${candidate.duplicateOf}.` : "A matching account may already exist."} Excluded by default; include only if this is a separate account.</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Exclude account" onClick={() => updateCandidate(candidate.key, { included: false })} disabled={saving}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor={`intake-name-${index}`} className="text-xs">Account / company name</Label><Input id={`intake-name-${index}`} value={candidate.accountName} onChange={(event) => updateCandidate(candidate.key, { accountName: redactLongNumber(event.target.value) })} disabled={saving} data-testid={`review-name-${index}`} /></div>
                    <div className="space-y-1.5"><Label htmlFor={`intake-type-${index}`} className="text-xs">Account type</Label><Input id={`intake-type-${index}`} value={candidate.accountType} onChange={(event) => updateCandidate(candidate.key, { accountType: redactLongNumber(event.target.value) })} disabled={saving} data-testid={`review-type-${index}`} /></div>
                    <div className="space-y-1.5"><Label htmlFor={`intake-category-${index}`} className="text-xs">Category</Label><Select value={candidate.category} onValueChange={(value) => updateCandidate(candidate.key, { category: value as AccountCategory })} disabled={saving}><SelectTrigger id={`intake-category-${index}`} data-testid={`review-category-${index}`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1.5"><Label htmlFor={`intake-last4-${index}`} className="text-xs">Account number · last 4 only</Label><Input id={`intake-last4-${index}`} inputMode="numeric" maxLength={4} value={candidate.accountNumberLast4 || ""} onChange={(event) => updateCandidate(candidate.key, { accountNumberLast4: event.target.value.replace(/\D/g, "").slice(0, 4) || null })} placeholder="Not provided" disabled={saving} data-testid={`review-last4-${index}`} /></div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm"><Checkbox checked={candidate.isJoint} onCheckedChange={(checked) => updateCandidate(candidate.key, { isJoint: checked === true })} disabled={saving} data-testid={`review-joint-${index}`} />Joint account</label>
                </div>
              ))}
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} disabled={saving || state !== "review"} data-testid="confirm" /><span>I reviewed the selected account details and want to create these connected-account records for {resolvedCaseName || "this case"}.</span></label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={!readyToSave || saving} data-testid="create">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {saving ? "Creating accounts…" : `Create ${includedCandidates.length} account${includedCandidates.length === 1 ? "" : "s"}`}
              </Button>
              <Button variant="outline" onClick={() => { if (!saving) resetPreview(); }} disabled={saving}><FileText className="mr-2 h-4 w-4" />Discard review</Button>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default AccountEmailIntake;
