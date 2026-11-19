import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Building2, Check, ExternalLink, Mail, Plus, RotateCw, Search, ShieldOff } from "lucide-react";
import type { AccountCompanyNotification, NotificationCompany } from "@shared/accountCompanyNotification";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PrivateAccountNotes } from "@/components/private-account-notes";
import { CompanyCreateForm } from "@/components/company-create-form";
import { CompanyEmailEditor } from "@/components/company-email-editor";

type AccountCompanyNotificationProps = {
  accountId: string;
  accountName: string;
  certificateId: string;
  onOpen?: () => void;
};

const safeHttpUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !!url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
};

const statusLabel = (status: string) => status.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const terminalStatus = (status: string) => ["sent", "sending", "acknowledged", "delivered", "completed"].includes(status.toLowerCase());

export function AccountCompanyNotificationAction({ accountId, accountName, certificateId, onOpen }: AccountCompanyNotificationProps) {
  const [open, setOpen] = useState(false);
  const setOpenAndNotify = (next: boolean) => {
    if (next && !open) onOpen?.();
    setOpen(next);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2 min-h-11 gap-1.5"
        aria-label={`Send link to company for ${accountName}`}
        data-testid={`button-email-secure-link-${accountId}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpenAndNotify(true);
        }}
      >
        <Mail className="h-3.5 w-3.5" /> Send link to company
      </Button>
      <AccountCompanyNotificationDialog
        key={`${certificateId}:${accountId}`}
        accountId={accountId}
        accountName={accountName}
        certificateId={certificateId}
        open={open}
        onOpenChange={setOpenAndNotify}
      />
    </>
  );
}

export function AccountCompanyNotificationDialog({
  accountId,
  accountName,
  certificateId,
  open,
  onOpenChange,
}: AccountCompanyNotificationProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState("");
  const [reviewedNoticeId, setReviewedNoticeId] = useState("");
  const [reviewedRecipient, setReviewedRecipient] = useState("");
  const [sentNoticeId, setSentNoticeId] = useState("");
  const [showCompanyCreate, setShowCompanyCreate] = useState(false);
  const [companyEmailDirty, setCompanyEmailDirty] = useState(false);
  const [companyEmailPending, setCompanyEmailPending] = useState(false);
  const companyEmailDirtyRef = useRef(false);
  const companyEmailPendingRef = useRef(false);

  const handleCompanyEmailDirtyChange = useCallback((dirty: boolean) => {
    companyEmailDirtyRef.current = dirty;
    setCompanyEmailDirty(dirty);
    if (dirty) {
      setReviewedNoticeId("");
      setReviewedRecipient("");
    }
  }, []);

  const handleCompanyEmailPendingChange = useCallback((pending: boolean) => {
    companyEmailPendingRef.current = pending;
    setCompanyEmailPending(pending);
    if (pending) {
      setReviewedNoticeId("");
      setReviewedRecipient("");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const context = useQuery<AccountCompanyNotification>({
    queryKey: ["/api/admin/accounts", accountId, "company-notification", searchQuery, companyId],
    enabled: open && !!accountId && !!certificateId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (companyId) params.set("companyId", companyId);
      const suffix = params.toString();
      const result = await (await apiRequest("GET", `/api/admin/accounts/${encodeURIComponent(accountId)}/company-notification${suffix ? `?${suffix}` : ""}`)).json() as AccountCompanyNotification;
      if (result.accountId !== accountId || result.certificateId !== certificateId) {
        throw new Error("The account context did not match this case. Close and reopen this panel.");
      }
      return result;
    },
    staleTime: 0,
  });
  const data = context.data;
  // Company searches change the query key. Keep the account's notes editor
  // mounted while those lookups load, so an unsaved staff draft is not lost.
  const [notesContext, setNotesContext] = useState<Pick<AccountCompanyNotification, "accountId" | "certificateId" | "internalNotes"> | null>(null);
  useEffect(() => {
    if (data?.accountId === accountId && data.certificateId === certificateId) {
      setNotesContext({
        accountId: data.accountId,
        certificateId: data.certificateId,
        internalNotes: data.internalNotes,
      });
    }
  }, [data?.accountId, data?.certificateId, data?.internalNotes, accountId, certificateId]);
  const selectedCompany = data?.company ?? data?.suggestions.find((item) => item.id === companyId) ?? null;
  const notice = data?.notice;
  const isTerminal = !!notice && (terminalStatus(notice.status) || notice.id === sentNoticeId);
  const noticeStatus = notice?.id === sentNoticeId ? "sent" : notice?.status;
  const canPrepareEmail = !context.isError && !!data?.deathRecordVerified && !!selectedCompany?.canEmail && !!selectedCompany.recipient;

  useEffect(() => {
    if (!open) {
      setError("");
      setReviewedNoticeId("");
    }
  }, [open]);

  const updateContext = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/accounts", accountId, "company-notification"] });
    return context.refetch();
  };

  const createDraft = useMutation({
    mutationFn: async (selection: { accountId: string; companyId: string }) => {
      const response = await apiRequest("POST", "/api/company-notices", selection);
      return response.json();
    },
  });
  const refreshRouting = useMutation({
    mutationFn: async (noticeId: string) => {
      const response = await apiRequest("POST", `/api/company-notices/${encodeURIComponent(noticeId)}/refresh-routing`, {});
      return response.json();
    },
  });
  const sendNotice = useMutation({
    mutationFn: async ({ noticeId, recipient }: { noticeId: string; recipient: string }) => {
      const response = await apiRequest("POST", `/api/company-notices/${encodeURIComponent(noticeId)}/send`, { expectedRecipient: recipient });
      return response.json();
    },
  });
  const busy = createDraft.isPending || refreshRouting.isPending || sendNotice.isPending || companyEmailPending;
  const canCreateDraft = canPrepareEmail && !isTerminal && !busy && !companyEmailDirty && (!data?.linked || !companyId || companyId === data.company?.id);
  const searchLink = `/admin/companies?q=${encodeURIComponent(search.trim() || accountName)}`;

  const reviewRouting = async () => {
    if (!data || !selectedCompany || !canPrepareEmail || isTerminal || busy || companyEmailDirtyRef.current || companyEmailPendingRef.current || context.isFetching || search.trim() !== searchQuery) return;
    setError("");
    setReviewedNoticeId("");
    try {
      let noticeId = data.notice?.id;
      if (!noticeId) {
        const created = await createDraft.mutateAsync({ accountId, companyId: selectedCompany.id });
        noticeId = created.id || created.notice?.id;
        if (!noticeId) throw new Error("The server did not return a saved notice reference.");
      }
      if (companyEmailDirtyRef.current || companyEmailPendingRef.current) {
        throw new Error("The company email changed while routing was being reviewed. Review the email and recipient again.");
      }
      await refreshRouting.mutateAsync(noticeId);
      if (companyEmailDirtyRef.current || companyEmailPendingRef.current) {
        throw new Error("The company email changed while routing was being reviewed. Review the email and recipient again.");
      }
      const latest = await updateContext();
      const current = latest.data;
      if (!current || current.accountId !== accountId || current.certificateId !== certificateId) {
        throw new Error("The account changed while routing was being reviewed. Reopen this account to continue.");
      }
      if (companyEmailDirtyRef.current || companyEmailPendingRef.current) {
        throw new Error("The company email changed while routing was being reviewed. Review the email and recipient again.");
      }
      if (current.notice?.id === noticeId && current.notice.status.toLowerCase() === "draft" && current.company?.canEmail && current.company.recipient) {
        setReviewedNoticeId(noticeId);
        setReviewedRecipient(current.company.recipient);
      } else {
        setReviewedNoticeId("");
        throw new Error("Routing is not ready to send. Review the latest company and recipient, then try again.");
      }
    } catch (caught) {
      setReviewedNoticeId("");
      setError(caught instanceof Error ? caught.message : "Could not review routing. Try again.");
      await updateContext().catch(() => undefined);
    }
  };

  const sendAfterConfirmation = async () => {
    if (!notice || reviewedNoticeId !== notice.id || !reviewedRecipient || !canPrepareEmail || notice.status.toLowerCase() !== "draft" || busy || companyEmailDirtyRef.current || companyEmailPendingRef.current || context.isFetching) return;
    setError("");
    setReviewedNoticeId("");
    try {
      await sendNotice.mutateAsync({ noticeId: notice.id, recipient: reviewedRecipient });
      setSentNoticeId(notice.id);
    } catch (caught) {
      setReviewedNoticeId("");
      setError(caught instanceof Error ? caught.message : "The notice was not sent. Review routing again before retrying.");
      await updateContext().catch(() => undefined);
      return;
    }
    try {
      await updateContext();
    } catch {
      setError("The email provider accepted this notice, but account status could not refresh. Check again; do not send another notice.");
    }
  };

  const selectCompany = (company: NotificationCompany) => {
    if (data?.linked) return;
    setReviewedNoticeId("");
    setReviewedRecipient("");
    setError("");
    setCompanyId(company.id);
  };
  const portalUrl = safeHttpUrl(data?.reporting?.staffPortal?.url);
  const canUseDirectory = !!search.trim() || !!accountName;
  const retryContext = () => {
    setError("");
    setReviewedNoticeId("");
    return context.refetch();
  };
  const companyDirectoryPicker = data && (
    <section className="space-y-3" aria-label="Company directory selection">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Company directory</h3>
          <p className="text-sm text-muted-foreground">Select the correct company entry. A name match is only a suggestion.</p>
        </div>
        {data.linked && <Badge variant="secondary">Linked company · fixed</Badge>}
      </div>
      <label className="relative block">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          disabled={busy || data.linked}
          onChange={(event) => { setSearch(event.target.value); setCompanyId(""); setReviewedNoticeId(""); setReviewedRecipient(""); setError(""); }}
          placeholder="Search company directory"
          aria-label="Search company directory"
          className="pl-9"
          data-testid="input-company-directory-search"
        />
      </label>
      {!data.linked && !showCompanyCreate && (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 sm:w-auto"
          onClick={() => setShowCompanyCreate(true)}
          data-testid="button-add-company-from-account"
        >
          <Plus className="h-4 w-4" /> Add missing company
        </Button>
      )}
      {!data.linked && showCompanyCreate && (
        <CompanyCreateForm
          initialName={accountName || search.trim()}
          accountId={accountId}
          onCancel={() => setShowCompanyCreate(false)}
          onCreated={(company) => {
            setCompanyId(company.id);
            setSearch("");
            setSearchQuery("");
            setReviewedNoticeId("");
            setReviewedRecipient("");
            setError("");
            setShowCompanyCreate(false);
          }}
        />
      )}
      {data.linked && <p className="text-xs text-muted-foreground">This account already has a persisted company link. It cannot be changed from this screen.</p>}
      {!data.company && data.suggestions.length > 0 && (
        <div className="space-y-2" aria-label="Company suggestions">
          {data.suggestions.map((company) => (
            <button
              key={company.id}
              type="button"
              disabled={busy || data.linked}
              onClick={() => selectCompany(company)}
              aria-pressed={companyId === company.id}
              className={`flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-70 ${companyId === company.id ? "border-primary bg-primary/[.04]" : "bg-card"}`}
            >
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{company.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{company.canEmail && company.recipient ? `Verified recipient · ${company.recipient}` : "No verified email recipient"}</span>
              </span>
              {companyId === company.id && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
      {!data.company && data.suggestions.length === 0 && (
        <div className="rounded-xl border border-dashed p-3">
          <p className="font-medium">{search.trim() ? "No matching company found" : "No company linked yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Search the directory or add a legitimate company entry. No account link is saved until the existing review workflow.</p>
          {canUseDirectory && <a className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4" href={searchLink} target="_blank" rel="noopener noreferrer">Open company directory <ArrowUpRight className="h-4 w-4" /></a>}
        </div>
      )}
    </section>
  );
  const reviewedForCurrentNotice = !!reviewedNoticeId
    && reviewedNoticeId === notice?.id
    && notice?.status.toLowerCase() === "draft";
  const footerMessage = isTerminal
    ? "This notice is already sent or otherwise complete; it cannot be sent again."
    : context.isLoading
      ? "Loading the account and company context."
      : context.isError
        ? "Company context is unavailable. Use Check again before continuing."
        : companyEmailPending
          ? "Saving the company email or checking routing…"
          : companyEmailDirty
            ? "Save or cancel the unsaved company email change before reviewing."
            : !data?.deathRecordVerified
              ? "Death record verification is required. Complete it on the case, then check again."
              : !selectedCompany
                ? "Select or add a company above to continue."
                : !selectedCompany.canEmail || !selectedCompany.recipient
                  ? "Save the company email above and explicitly verify routing, or open company setup."
                  : context.isFetching
                    ? "Refreshing the company and recipient details…"
                    : reviewedForCurrentNotice
                      ? `Reviewed recipient · ${reviewedRecipient}`
                      : data?.routingIssue || "Review the email and verified recipient before sending.";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent
        className="grid h-[92dvh] max-h-[92dvh] min-h-0 w-[calc(100%-1rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden break-words p-0 [overflow-wrap:anywhere] [&_button]:min-h-11 sm:w-full"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="min-w-0 border-b bg-muted/35 px-4 py-3 pr-12 sm:px-6">
          <DialogTitle className="text-lg">Send link to company</DialogTitle>
          <DialogDescription>Enter the company recipient, review the message, then confirm sending.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto px-4 py-3 sm:px-6">
          {data && !context.isError && (
            <section className="min-w-0 rounded-lg border bg-card px-3 py-2.5" aria-label="Selected case account and company">
              <p className="text-xs text-muted-foreground">Account · {data.accountName || accountName}</p>
              {data.company && <p className="mt-1 break-words text-sm font-semibold">Company · {data.company.name}</p>}
            </section>
          )}

          {context.isLoading && (
            <div aria-label="Loading account company context" className="space-y-3">
              <div className="h-11 animate-pulse rounded-lg bg-muted" />
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
              <div className="h-32 animate-pulse rounded-lg bg-muted" />
            </div>
          )}
          {context.isError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="font-medium">Company context unavailable</p>
                <p className="mt-1 text-sm text-muted-foreground">{context.error instanceof Error ? context.error.message : "Could not load the saved account and company details."}</p>
                <Button className="mt-3" type="button" size="sm" variant="outline" onClick={retryContext} disabled={context.isFetching}>
                  <RotateCw className="mr-2 h-4 w-4" /> Try again
                </Button>
              </div>
            </div>
          )}

          {data && !context.isError && (
            <>
              {!data.company && companyDirectoryPicker}

              {data.company && (
                <CompanyEmailEditor
                  key={`${certificateId}:${accountId}:${data.company.id}`}
                  company={data.company}
                  accountId={accountId}
                  disabled={createDraft.isPending || refreshRouting.isPending || sendNotice.isPending}
                  onDirtyChange={handleCompanyEmailDirtyChange}
                  onPendingChange={handleCompanyEmailPendingChange}
                />
              )}

              {selectedCompany?.canEmail && selectedCompany.recipient && data.preview ? (
                <section className="min-w-0 rounded-lg border bg-muted/20 p-3" aria-label="Secure-link message preview" data-testid="secure-link-message-preview">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">Message preview</h3>
                    <p className="break-all text-xs text-muted-foreground">To: {selectedCompany.recipient}</p>
                  </div>
                  <p className="mt-2 break-words text-sm"><span className="font-medium">Subject:</span> {data.preview.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{data.preview.text}</pre>
                </section>
              ) : selectedCompany ? (
                <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Message preview appears after the company recipient is verified.</p>
              ) : null}

              <p className="text-xs leading-relaxed text-muted-foreground">
                Certificate and signed-LPOA requests stay in the portal and require staff approval. No documents are attached.
              </p>

              {data.company && (
                <details className="rounded-lg border bg-card">
                  <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">Company directory and setup</summary>
                  <div className="border-t p-3">{companyDirectoryPicker}</div>
                </details>
              )}

              <details className="rounded-lg border bg-card">
                <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">Case, reporting and staff details</summary>
                <div className="space-y-4 border-t p-3">
                  <section className="text-sm">
                    <p className="font-medium">Case account</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">Internal case reference · {certificateId}</p>
                    {data.company && <p className="mt-1 text-xs text-muted-foreground">Company · {data.company.name} · {data.company.status}</p>}
                  </section>
                  {!data.deathRecordVerified && (
                    <p role="status" className="rounded-md border border-amber-500/30 bg-amber-50/60 p-2.5 text-sm text-amber-950">
                      <ShieldOff className="mr-1 inline h-4 w-4" /> Death record not verified. Email review and sending are blocked.
                    </p>
                  )}
                  {data.routingIssue && (
                    <div role="status" className="rounded-md border border-amber-500/35 bg-amber-50/70 p-3 text-sm text-amber-950">
                      <p className="font-semibold">Email routing needs attention</p>
                      <p className="mt-1">{data.routingIssue}</p>
                      <a className="mt-2 inline-flex min-h-10 items-center gap-2 font-medium underline underline-offset-4" href={`/admin/companies?q=${encodeURIComponent(selectedCompany?.name || accountName)}`}>
                        Open company setup <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                  {data.reporting && (
                    <section className="space-y-2 text-sm">
                      <h3 className="font-semibold">Reporting information <Badge variant="outline">Research · not verified</Badge></h3>
                      {data.reporting.staffPortal && portalUrl ? (
                        <>
                          <a className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4" href={portalUrl} target="_blank" rel="noopener noreferrer">
                            Open reporting portal <ExternalLink className="h-4 w-4" />
                          </a>
                          <p className="text-muted-foreground">{data.reporting.staffPortal.note}</p>
                        </>
                      ) : (
                        <>
                          {data.reporting.portal && <p><span className="font-medium">Portal:</span> {data.reporting.portal}</p>}
                          {data.reporting.phone && <p><span className="font-medium">Reported phone:</span> {data.reporting.phone}</p>}
                          {data.reporting.notes && <p className="whitespace-pre-wrap">{data.reporting.notes}</p>}
                          {data.reporting.emailAcceptance && <p className="whitespace-pre-wrap text-muted-foreground"><span className="font-medium text-foreground">Email instructions:</span> {data.reporting.emailAcceptance}</p>}
                          {safeHttpUrl(data.reporting.sourceUrl) && <a className="inline-flex min-h-10 items-center gap-2 text-primary underline underline-offset-4" href={safeHttpUrl(data.reporting.sourceUrl)!} target="_blank" rel="noopener noreferrer">Open research source <ArrowUpRight className="h-4 w-4" /></a>}
                        </>
                      )}
                    </section>
                  )}
                  {notice && (
                    <section className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Secure record · {notice.secureRecordId}</p>
                        <Badge variant={isTerminal ? "default" : "secondary"}>{statusLabel(noticeStatus || notice.status)}</Badge>
                      </div>
                      {(notice.sentAt || notice.id === sentNoticeId) && <p className="mt-2 text-xs text-muted-foreground">Accepted by email provider{notice.sentAt ? ` · ${new Date(notice.sentAt).toLocaleString()}` : ""}</p>}
                      {notice.acknowledgedAt && <p className="mt-1 text-xs text-muted-foreground">Acknowledged · {new Date(notice.acknowledgedAt).toLocaleString()}</p>}
                    </section>
                  )}
                </div>
              </details>

              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
            </>
          )}

          {notesContext?.accountId === accountId && notesContext.certificateId === certificateId && (
            <details className="rounded-lg border bg-card">
              <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">Private SAL team notes</summary>
              <div className="border-t p-3">
                <PrivateAccountNotes
                  key={`${certificateId}:${accountId}`}
                  certificateId={certificateId}
                  accountId={accountId}
                  savedNotes={notesContext.internalNotes}
                />
              </div>
            </details>
          )}
        </div>

        <footer className="flex min-w-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6" data-testid="secure-link-dialog-footer">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground" aria-live="polite">{footerMessage}</p>
          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
            {reviewedForCurrentNotice && !isTerminal ? (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => { setReviewedNoticeId(""); setReviewedRecipient(""); }} data-testid="button-cancel-secure-link-review">Cancel review</Button>
                <Button
                  type="button"
                  disabled={busy || companyEmailDirty || companyEmailPending || isTerminal || context.isFetching || !canPrepareEmail}
                  onClick={sendAfterConfirmation}
                  data-testid="button-confirm-send-secure-link"
                >
                  <Mail className="mr-2 h-4 w-4" />{sendNotice.isPending ? "Sending…" : "Confirm send secure link"}
                </Button>
              </>
            ) : isTerminal ? (
              <Button type="button" disabled data-testid="button-secure-link-already-sent">Notice complete</Button>
            ) : (
              <Button
                type="button"
                disabled={!canCreateDraft || context.isFetching || search.trim() !== searchQuery}
                onClick={reviewRouting}
                data-testid="button-review-secure-link-email"
              >
                {busy ? "Reviewing email…" : "Review email"}
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
