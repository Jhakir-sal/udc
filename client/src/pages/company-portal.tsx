import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, CheckCircle2, FileText, LockKeyhole, Search, ShieldCheck, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Company = { id: string; name: string; notificationEmail?: string | null; officialDomain?: string | null; category?: string | null; status?: string };
type Notice = { id: string; companyName?: string; secureRecordId?: string; sentAt?: string; accountName?: string; status?: string; acknowledgedAt?: string | null; deceasedName?: string; dateOfDeath?: string; verificationStatus?: string; requestedAction?: string };
type Membership = { id: string; status: string; company?: Company; companyName?: string };

const statusClass: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  acknowledged: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  denied: "bg-rose-100 text-rose-800",
  rejected: "bg-rose-100 text-rose-800",
};

export default function CompanyPortal() {
  const { toast } = useToast();
  const [companySearch, setCompanySearch] = useState("");
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [attested, setAttested] = useState(false);
  const memberships = useQuery<Membership[]>({ queryKey: ["/api/company-memberships"] });
  const notices = useQuery<Notice[]>({ queryKey: ["/api/company-portal/notices"], enabled: !!memberships.data?.some((m) => m.status === "approved") });
  const noticeDetail = useQuery<Notice>({
    queryKey: ["/api/company-portal/notices", selectedNotice?.id],
    enabled: !!selectedNotice?.id,
    queryFn: async () => (await apiRequest("GET", `/api/company-portal/notices/${selectedNotice?.id}`)).json(),
  });
  const companies = useQuery<Company[]>({
    queryKey: ["/api/company-directory", companySearch],
    enabled: companySearch.trim().length > 1,
    queryFn: async () => (await apiRequest("GET", `/api/company-directory?q=${encodeURIComponent(companySearch.trim())}`)).json(),
  });
  const requestMembership = useMutation({
    mutationFn: (companyId: string) => apiRequest("POST", "/api/company-memberships", { companyId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/company-memberships"] }); toast({ title: "Enrollment request submitted" }); },
    onError: (e: Error) => toast({ title: "Request could not be submitted", description: e.message, variant: "destructive" }),
  });
  const acknowledge = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/company-portal/notices/${id}/acknowledge`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/company-portal/notices"] }); setSelectedNotice(null); toast({ title: "Receipt acknowledged" }); },
    onError: (e: Error) => toast({ title: "Could not acknowledge receipt", description: e.message, variant: "destructive" }),
  });
  const certificateRequest = useMutation({
    mutationFn: ({ id, purpose }: { id: string; purpose: string }) => apiRequest("POST", `/api/company-portal/notices/${id}/access-requests`, { purpose, releaseScope: "package", attestation: "I attest that I have legal authority to request these documents and will handle them according to applicable law." }),
    onSuccess: () => { setCertificateOpen(false); setPurpose(""); setAttested(false); toast({ title: "Document package request submitted", description: "The Steps After Life team must review this request before the documents can be released." }); },
    onError: (e: Error) => toast({ title: "Document package request could not be submitted", description: e.message, variant: "destructive" }),
  });
  const approved = useMemo(() => memberships.data?.filter((m) => m.status === "approved") ?? [], [memberships.data]);
  const hasPending = memberships.data?.some((m) => m.status === "pending");

  if (memberships.isLoading) return <PortalShell><Skeleton className="h-48" /><Skeleton className="h-32" /></PortalShell>;
  if (memberships.isError) return <PortalShell><ErrorState onRetry={() => memberships.refetch()} /></PortalShell>;
  return <PortalShell>
    <div className="flex flex-col gap-5 border-b border-border/70 pb-7 md:flex-row md:items-end md:justify-between">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-accent">Company response desk</p><h1 className="font-serif text-4xl tracking-tight">Company portal</h1><p className="mt-2 max-w-2xl text-muted-foreground">A quiet place to receive and acknowledge only the information your team needs.</p></div>
      <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground"><LockKeyhole className="h-4 w-4 text-accent" /> Access is membership-controlled</div>
    </div>
    {approved.length === 0 ? <EnrollmentCard search={companySearch} setSearch={setCompanySearch} companies={companies.data ?? []} loading={companies.isLoading} pending={hasPending || requestMembership.isPending} onRequest={(id) => requestMembership.mutate(id)} /> :
      <div className="space-y-6">
        <Card className="border-accent/25 bg-accent/5"><CardContent className="flex flex-wrap items-center gap-4 p-5"><ShieldCheck className="h-8 w-8 text-accent" /><div className="flex-1"><p className="font-semibold">Approved access</p><p className="text-sm text-muted-foreground">{approved.map((m) => m.companyName).filter(Boolean).join(" · ")}</p></div><Badge variant="secondary">Verified membership</Badge></CardContent></Card>
        <section><div className="mb-3 flex items-center justify-between"><div><h2 className="font-serif text-2xl">Notices</h2><p className="text-sm text-muted-foreground">Minimal notice details, with every release separately controlled.</p></div></div>
          {notices.isLoading ? <Skeleton className="h-36" /> : notices.isError ? <ErrorState onRetry={() => notices.refetch()} /> : !(notices.data || []).filter((n) => n.status === "sent" || n.status === "acknowledged").length ? <EmptyState /> : <div className="grid gap-3">{(notices.data || []).filter((n) => n.status === "sent" || n.status === "acknowledged").map((notice) => <button key={notice.id} onClick={() => setSelectedNotice(notice)} className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-accent/60 hover:bg-accent/[.03]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{notice.accountName || notice.companyName || "Company notice"}</p><p className="mt-1 text-sm text-muted-foreground">Sent {notice.sentAt ? new Date(notice.sentAt).toLocaleDateString() : "recently"} · Record {notice.secureRecordId || "secured"}</p></div><Badge className={statusClass[notice.status || "pending"] || ""}>{notice.acknowledgedAt ? "Acknowledged" : notice.status}</Badge></div></button>)}</div>}
        </section>
      </div>}
    <Dialog open={!!selectedNotice} onOpenChange={(open) => !open && setSelectedNotice(null)}><DialogContent><DialogHeader><DialogTitle>Company notice</DialogTitle><DialogDescription>Only the minimum information needed for this response is shown.</DialogDescription></DialogHeader><div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2"><p><span className="text-muted-foreground">Name:</span> {(noticeDetail.data || selectedNotice)?.deceasedName || "Protected record"}</p><p><span className="text-muted-foreground">Date of death:</span> {(noticeDetail.data || selectedNotice)?.dateOfDeath || "Protected record"}</p><p><span className="text-muted-foreground">Verification status:</span> {(noticeDetail.data || selectedNotice)?.verificationStatus || "Under review"}</p><p><span className="text-muted-foreground">Requested action:</span> {(noticeDetail.data || selectedNotice)?.requestedAction || "Please acknowledge receipt"}</p></div><DialogFooter className="flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={() => setCertificateOpen(true)}><FileText className="mr-2 h-4 w-4" />Request document package</Button>{!selectedNotice?.acknowledgedAt && <Button onClick={() => selectedNotice && acknowledge.mutate(selectedNotice.id)} disabled={acknowledge.isPending}><CheckCircle2 className="mr-2 h-4 w-4" />Acknowledge receipt</Button>}</DialogFooter></DialogContent></Dialog>
    <Dialog open={certificateOpen} onOpenChange={setCertificateOpen}><DialogContent><DialogHeader><DialogTitle>Request death certificate and signed LPOA</DialogTitle><DialogDescription>Both documents are packaged in a secure ZIP after Steps After Life reviews your request. No documents are attached to the notification email. State the purpose and confirm your legal authority.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="certificate-purpose">Purpose</Label><Textarea id="certificate-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Explain why your organization needs these documents." /></div><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={attested} onCheckedChange={(v) => setAttested(v === true)} /><span>I attest that I have legal authority to request these documents and that they will be handled according to applicable law.</span></label></div><DialogFooter><Button variant="outline" onClick={() => setCertificateOpen(false)}>Cancel</Button><Button disabled={purpose.trim().length < 10 || !attested || certificateRequest.isPending} onClick={() => selectedNotice && certificateRequest.mutate({ id: selectedNotice.id, purpose })}>Submit request</Button></DialogFooter></DialogContent></Dialog>
  </PortalShell>;
}

function PortalShell({ children }: { children: React.ReactNode }) { return <div className="family-shell min-h-[100dvh] p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-8">{children}</div></div>; }
function EnrollmentCard({ search, setSearch, companies, loading, pending, onRequest }: { search: string; setSearch: (s: string) => void; companies: Company[]; loading: boolean; pending?: boolean; onRequest: (id: string) => void }) { return <Card className="max-w-2xl"><CardHeader><div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/60"><Building2 className="h-5 w-5 text-accent" /></div><CardTitle>Request company access</CardTitle><CardDescription>Your account is not connected to an approved company membership. Search the directory to request enrollment.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company name" /></div>{pending && <p className="text-sm text-amber-700">Your enrollment request is pending review.</p>}{loading && <Skeleton className="h-16" />}{companies.map((c) => <div key={c.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{c.name}</p><p className="text-xs text-muted-foreground">Directory listing</p></div><Button size="sm" variant="outline" disabled={pending} onClick={() => onRequest(c.id)}>Request enrollment</Button></div>)}{search.length > 1 && !loading && !companies.length && <p className="py-4 text-center text-sm text-muted-foreground">No matching companies found.</p>}</CardContent></Card>; }
function EmptyState() { return <Card><CardContent className="p-12 text-center"><FileText className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" /><p className="font-medium">No notices yet</p><p className="mt-1 text-sm text-muted-foreground">New notices will appear here when your company receives them.</p></CardContent></Card>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <Card><CardContent className="p-8 text-center"><XCircle className="mx-auto mb-3 h-8 w-8 text-destructive" /><p className="font-medium">We couldn't load this workspace</p><Button className="mt-4" variant="outline" onClick={onRetry}>Try again</Button></CardContent></Card>; }