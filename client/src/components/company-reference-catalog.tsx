import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Building2, Check, ChevronDown, Mail, Phone, Plus, RotateCw, Search, ShieldAlert } from "lucide-react";
import type { CompanyReferenceCatalog, CompanyReferenceEntry } from "../../../shared/companyReference";
import { ACCOUNT_CATEGORIES, type AccountCategory } from "../../../shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type ImportDraft = {
  entry: CompanyReferenceEntry;
  officialDomain: string;
  category: AccountCategory;
  isNational: boolean;
};

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isActualCandidateEmail = (entry: CompanyReferenceEntry) =>
  entry.hasEmailCandidate && validEmail(entry.email);
const safeSourceUrl = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !!parsed.hostname;
  } catch {
    return false;
  }
};
const display = (value: string) => value?.trim() || "Not listed in workbook";
const categoryLabel = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function CompanyReferenceCatalog() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [candidateOnly, setCandidateOnly] = useState(false);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [domainError, setDomainError] = useState("");
  const catalog = useQuery<CompanyReferenceCatalog>({
    queryKey: ["/api/admin/company-reference"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/company-reference")).json(),
  });

  const importEntry = useMutation({
    mutationFn: async (current: ImportDraft) => {
      const domain = current.officialDomain.trim();
      if (!domain) throw new Error("Enter the company's official domain. It is never inferred from workbook research.");
      return apiRequest("POST", `/api/admin/company-reference/${encodeURIComponent(current.entry.id)}/import`, {
        officialDomain: domain,
        category: current.category,
        isNational: current.isNational,
        reviewed: true,
      });
    },
    onSuccess: async () => {
      setDraft(null);
      setDomainError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/company-directory"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/company-directory"] }),
      ]);
      toast({ title: "Added to active directory", description: "Research was preserved as notes. No notification email or verification was added." });
    },
    onError: (error: Error) => setDomainError(error.message || "Could not add this company. Try again."),
  });

  const entries = catalog.data?.entries ?? [];
  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (candidateOnly && !isActualCandidateEmail(entry)) return false;
      if (!term) return true;
      return [
        entry.company, entry.category, entry.department, entry.email, entry.emailAcceptance,
        entry.portal, entry.phone, entry.fax, entry.mailingAddress, entry.notes, entry.whenToNotify,
        entry.sourceQuality, entry.sourceUrl, entry.sourceReportedDate,
        entry.staffPortal?.url, entry.staffPortal?.note,
      ].some((field) => field?.toLowerCase().includes(term));
    });
  }, [entries, search, category, candidateOnly]);

  const beginImport = (entry: CompanyReferenceEntry) => {
    setDomainError("");
    setDraft({ entry, officialDomain: "", category: "miscellaneous", isNational: false });
  };

  return (
    <Card className="overflow-hidden border-[hsl(var(--border))]">
      <CardHeader className="border-b bg-[hsl(var(--muted)/.36)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-accent">Workbook research · private reference</p>
            <CardTitle>Company reference catalog</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Research for concierge review only. Nothing here is SAL-verified, a required action, or permission to send documents.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1.5 border-amber-500/40 bg-amber-50 text-amber-900">
            <ShieldAlert className="h-3.5 w-3.5" /> Unverified workbook
          </Badge>
        </div>
        {catalog.data && (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Count label="Reference entries" value={catalog.data.total} />
            <Count label="Categories" value={catalog.data.categories.length} />
            <Count label="Email candidates" value={entries.filter(isActualCandidateEmail).length} />
            <Count label="SAL verified" value={0} subdued />
          </div>
        )}
        {catalog.data?.workbookDate && <p className="mt-3 text-xs text-muted-foreground">Workbook date: {catalog.data.workbookDate} · Source dates and claims are unverified research.</p>}
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search companies, contacts, notes…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search reference catalog" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Filter by category"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(catalog.data?.categories ?? []).map((item) => <SelectItem key={item} value={item}>{categoryLabel(item)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant={candidateOnly ? "default" : "outline"} onClick={() => setCandidateOnly((value) => !value)} aria-pressed={candidateOnly}>
            <Mail className="mr-2 h-4 w-4" /> Candidate emails {candidateOnly ? "on" : "only"}
          </Button>
        </div>
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{filteredEntries.length} of {catalog.data?.total ?? 0} entries</span>
          <span>Candidate status does not mean verified or approved for use.</span>
        </div>

        {catalog.isLoading && <div className="space-y-2" aria-label="Loading reference catalog">{[1, 2, 3].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-lg bg-muted" />)}</div>}
        {catalog.isError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="font-medium">Reference catalog unavailable</p><p className="mt-1 text-sm text-muted-foreground">The research list could not be loaded. Your active directory and its routing remain unchanged.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => catalog.refetch()} disabled={catalog.isFetching}><RotateCw className="mr-2 h-4 w-4" />Retry</Button></div></div>
          </div>
        )}
        {!catalog.isLoading && !catalog.isError && filteredEntries.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Search className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
            <p className="font-medium">No matching reference entries</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another search or clear the filters.</p>
            <Button className="mt-3" variant="ghost" size="sm" onClick={() => { setSearch(""); setCategory("all"); setCandidateOnly(false); }}>Clear filters</Button>
          </div>
        )}
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <details key={entry.id} className="group rounded-xl border bg-card transition-colors open:border-accent/40 open:bg-[hsl(var(--muted)/.18)]">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-accent/10 p-2 text-accent"><Building2 className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{entry.company}</p><Badge variant="secondary" className="text-[10px]">{categoryLabel(entry.category)}</Badge>
                      {isActualCandidateEmail(entry) ? <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Email candidate · unverified</Badge> : /paypal/i.test(entry.email) ? <Badge variant="outline">PayPal placeholder · not a candidate</Badge> : <Badge variant="outline">No valid email candidate</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{display(entry.department)}{entry.email ? ` · ${entry.email}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); beginImport(entry); }}><Plus className="mr-1.5 h-3.5 w-3.5" />Add to directory</Button>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </div>
              </summary>
                 <div className="grid min-w-0 gap-4 border-t px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Department" value={entry.department} />
                <Detail label="Email acceptance wording" value={entry.emailAcceptance} />
                <Detail label="When to notify" value={entry.whenToNotify} />
                <Detail label="Phone" value={entry.phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <Detail label="Fax" value={entry.fax} />
                <Detail label="Mailing address" value={entry.mailingAddress} />
                <Detail label="Portal text" value={entry.portal} />
                {entry.staffPortal && safeSourceUrl(entry.staffPortal.url) && (
                  <div className="min-w-0 rounded-lg border bg-muted/30 p-3 sm:col-span-2 lg:col-span-3">
                    <p className="mb-2 text-sm font-semibold">SAL notification portal · account available</p>
                    <a className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-4" href={entry.staffPortal.url} target="_blank" rel="noopener noreferrer">
                      Open Bank of America portal <ArrowUpRight className="h-4 w-4 shrink-0" />
                    </a>
                    <p className="mt-2 text-sm leading-relaxed">{entry.staffPortal.note}</p>
                  </div>
                )}
                <Detail label="Research notes" value={entry.notes} />
                <Detail label="Source quality (unverified)" value={entry.sourceQuality} />
                <Detail label="Source reported date (unverified)" value={entry.sourceReportedDate} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Source URL (not validated)</p>
                  {safeSourceUrl(entry.sourceUrl) ? <a className="inline-flex items-center gap-1 break-all text-sm text-accent underline-offset-4 hover:underline" href={entry.sourceUrl.trim()} target="_blank" rel="noreferrer">{entry.sourceUrl}<ArrowUpRight className="h-3.5 w-3.5 shrink-0" /></a> : <p className="whitespace-pre-wrap break-words text-sm">{display(entry.sourceUrl)}</p>}
                </div>
                <p className="sm:col-span-2 lg:col-span-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">Workbook research only. Do not treat this entry, its dates, contact information, portal text, or email wording as SAL verification, a mandatory action, or authorization to disclose/send documents.</p>
              </div>
            </details>
          ))}
        </div>
      </CardContent>
       <Dialog open={!!draft} onOpenChange={(open) => { if (!open && !importEntry.isPending) { setDraft(null); setDomainError(""); } }}>
         {draft && <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
             <DialogHeader><DialogTitle>Review before adding</DialogTitle><DialogDescription>{draft.entry.company}</DialogDescription></DialogHeader>
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950"><strong>This adds a directory record only.</strong> It does not verify routing, set a notification email, send a message, or authorize document sharing. Workbook research is retained in notes and remains unverified.</div>
             <fieldset disabled={importEntry.isPending} className="space-y-4">
              <div><Label htmlFor="reference-domain">Official company domain (required)</Label><Input id="reference-domain" className="mt-1" placeholder="company.example" value={draft.officialDomain} onChange={(event) => { setDraft({ ...draft, officialDomain: event.target.value }); setDomainError(""); }} autoComplete="off" /><p className="mt-1 text-xs text-muted-foreground">Enter and review the actual official domain yourself. It is never inferred from this workbook.</p></div>
              <div><Label>Directory category</Label><Select value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value as AccountCategory })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{categoryLabel(item)}</SelectItem>)}</SelectContent></Select></div>
              <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={draft.isNational} onChange={(event) => setDraft({ ...draft, isNational: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--accent))]" />National company</label>
             </fieldset>
            {domainError && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{domainError}</p>}
            <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="outline" disabled={importEntry.isPending} onClick={() => { setDraft(null); setDomainError(""); }}>Cancel</Button><Button disabled={importEntry.isPending || !draft.officialDomain.trim()} onClick={() => importEntry.mutate(draft)}>{importEntry.isPending ? "Adding…" : <><Check className="mr-2 h-4 w-4" />Add, do not send</>}</Button></div>
         </DialogContent>}
       </Dialog>
    </Card>
  );
}

function Count({ label, value, subdued = false }: { label: string; value: number; subdued?: boolean }) {
  return <div className="rounded-lg border bg-card px-3 py-2"><p className="text-xl font-semibold tabular-nums">{value}</p><p className={`text-xs ${subdued ? "text-muted-foreground" : "text-muted-foreground"}`}>{label}</p></div>;
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div><p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{label}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{display(value)}</p></div>;
}
