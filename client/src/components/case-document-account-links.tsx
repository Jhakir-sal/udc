import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, RotateCw, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConnectedAccount } from "@shared/schema";
import type { DocumentAccountLink as CaseDocumentAccountLink } from "@shared/documentAccountLinks";

export interface FamilyDocumentForAccountLink {
  id: string;
  label?: string | null;
  fileName?: string | null;
  objectPath?: string | null;
}

const linksQueryKey = (certId: string) => [
  "/api/admin/case",
  certId,
  "document-account-links",
];

export function useCaseDocumentAccountLinks(certId: string) {
  return useQuery<CaseDocumentAccountLink[]>({
    queryKey: linksQueryKey(certId),
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/admin/case/${certId}/document-account-links`,
      );
      return response.json();
    },
    enabled: !!certId,
    staleTime: 3_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

function accountLabel(account: ConnectedAccount) {
  const lastFour = account.accountNumber
    ? ` · ****${String(account.accountNumber).slice(-4)}`
    : "";
  return `${account.accountName}${lastFour}`;
}

export function FamilyDocumentAccountAssigner({
  certId,
  document,
  accounts,
}: {
  certId: string;
  document: FamilyDocumentForAccountLink;
  accounts: ConnectedAccount[];
}) {
  const { toast } = useToast();
  const linksQuery = useCaseDocumentAccountLinks(certId);
  const [editing, setEditing] = useState(false);
  const [draftAccountIds, setDraftAccountIds] = useState<string[]>([]);

  const updateLinks = useMutation({
    mutationFn: async (accountIds: string[]) => {
      const response = await apiRequest(
        "PUT",
        `/api/admin/case/${certId}/family-documents/${encodeURIComponent(String(document.id))}/accounts`,
        { accountIds },
      );
      return (await response.json()) as CaseDocumentAccountLink[];
    },
    onSuccess: (result) => {
      queryClient.setQueryData(linksQueryKey(certId), result);
      queryClient.invalidateQueries({ queryKey: linksQueryKey(certId) });
      setEditing(false);
      toast({ title: "Document account assignments saved" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save document assignments",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const assignedIds = (linksQuery.data || [])
    .filter((link) => String(link.documentId) === String(document.id))
    .map((link) => String(link.accountId));
  const assignedAccounts = accounts.filter((account) =>
    assignedIds.includes(String(account.id)),
  );
  const assignmentsReady = !linksQuery.isLoading && !linksQuery.isError;

  const beginEditing = () => {
    updateLinks.reset();
    setDraftAccountIds([...assignedIds]);
    setEditing(true);
  };

  const toggleAccount = (accountId: string) => {
    setDraftAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId],
    );
  };

  return (
    <section
      className="min-w-0 rounded-md border border-border/70 bg-muted/30 p-3"
      aria-label={`Account assignments for ${document.label || document.fileName || "uploaded document"}`}
      data-testid={`document-account-assignments-${document.id}`}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            Assigned accounts
          </p>
          {linksQuery.isLoading ? (
            <p className="mt-1 text-xs text-muted-foreground" role="status" data-testid={`document-account-loading-${document.id}`}>
              Loading assignments…
            </p>
          ) : linksQuery.isError ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs text-destructive" role="alert" data-testid={`document-account-error-${document.id}`}>
                Assignments could not be loaded.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => void linksQuery.refetch()}
                data-testid={`button-retry-document-assignments-${document.id}`}
              >
                <RotateCw className="mr-1 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : assignedAccounts.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={`document-assigned-account-list-${document.id}`}>
              {assignedAccounts.map((account) => (
                <Badge key={account.id} variant="secondary" className="max-w-full whitespace-normal break-words text-[11px]">
                  {accountLabel(account)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground" data-testid={`document-unassigned-${document.id}`}>
              No accounts assigned
            </p>
          )}
        </div>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-9 shrink-0 self-start"
            onClick={beginEditing}
            disabled={!assignmentsReady}
            aria-label={`Assign accounts to ${document.label || document.fileName || "document"}`}
            data-testid={`button-assign-document-accounts-${document.id}`}
          >
            {assignedIds.length ? "Edit assignments" : "Assign accounts"}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t pt-3" data-testid={`document-account-editor-${document.id}`}>
          {accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid={`document-account-no-accounts-${document.id}`}>
              No case accounts are available yet. Add an account before assigning this document.
            </p>
          ) : (
            <fieldset className="space-y-1.5" disabled={updateLinks.isPending}>
              <legend className="mb-2 text-xs font-medium">Select one or more case accounts</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {accounts.map((account) => {
                  const id = String(account.id);
                  return (
                    <label
                      key={id}
                      className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-xs leading-relaxed hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        checked={draftAccountIds.includes(id)}
                        onChange={() => toggleAccount(id)}
                        aria-label={`Assign to ${accountLabel(account)}`}
                        data-testid={`checkbox-document-account-${document.id}-${id}`}
                      />
                      <span className="min-w-0 break-words">{accountLabel(account)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          {updateLinks.isError && (
            <p className="text-xs text-destructive" role="alert" data-testid={`document-account-save-error-${document.id}`}>
              The last save failed. Your selections are still here; try again.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="min-h-9 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => {
                setDraftAccountIds([]);
                updateLinks.mutate([]);
              }}
              disabled={updateLinks.isPending || !assignmentsReady || assignedIds.length === 0}
              data-testid={`button-unassign-all-doc-accounts-${document.id}`}
            >
              Unassign all
            </Button>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="min-h-9"
                onClick={() => {
                  updateLinks.reset();
                  setEditing(false);
                }}
                disabled={updateLinks.isPending}
                data-testid={`button-cancel-document-accounts-${document.id}`}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="min-h-9"
                onClick={() => updateLinks.mutate(draftAccountIds)}
                disabled={updateLinks.isPending || !assignmentsReady || accounts.length === 0}
                data-testid={`button-save-document-accounts-${document.id}`}
              >
                {updateLinks.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {updateLinks.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function AccountFamilyDocuments({
  certId,
  account,
  documents,
  documentsLoading,
  documentsError,
  onRetryDocuments,
  onOpenLibrary,
}: {
  certId: string;
  account: ConnectedAccount;
  documents: FamilyDocumentForAccountLink[];
  documentsLoading: boolean;
  documentsError: boolean;
  onRetryDocuments: () => void;
  onOpenLibrary: () => void;
}) {
  const linksQuery = useCaseDocumentAccountLinks(certId);
  const assignedDocumentIds = new Set(
    (linksQuery.data || [])
      .filter((link) => String(link.accountId) === String(account.id))
      .map((link) => String(link.documentId)),
  );
  const assignedDocuments = documents.filter((document) =>
    assignedDocumentIds.has(String(document.id)),
  );

  return (
    <section className="space-y-3 rounded-lg border p-3 sm:p-4" aria-labelledby="account-family-documents-heading" data-testid={`account-family-documents-${account.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="account-family-documents-heading" className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Uploaded family documents
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff-only organization. Assignment does not approve, share, or send a document.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="min-h-9"
          onClick={onOpenLibrary}
          data-testid={`button-open-document-library-${account.id}`}
        >
          Go to library
        </Button>
      </div>
      {linksQuery.isLoading || documentsLoading ? (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-3 text-xs text-muted-foreground" role="status" data-testid={`account-documents-loading-${account.id}`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading associated documents…
        </div>
      ) : linksQuery.isError || documentsError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive" role="alert" data-testid={`account-documents-error-${account.id}`}>
          <span>Associated documents could not be loaded.</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => {
              void linksQuery.refetch();
              onRetryDocuments();
            }}
            data-testid={`button-retry-account-documents-${account.id}`}
          >
            <RotateCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </div>
      ) : assignedDocuments.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-center" data-testid={`account-documents-empty-${account.id}`}>
          <p className="text-xs font-medium">No uploaded documents assigned</p>
          <p className="mt-1 text-xs text-muted-foreground">Choose Assign accounts in the document library to organize a document here.</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid={`account-associated-document-list-${account.id}`}>
          {assignedDocuments.map((document) => (
            <li key={document.id} className="flex min-w-0 flex-col justify-between gap-2 rounded-md border bg-muted/20 p-2.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words text-sm font-medium">
                  {document.label || document.fileName || "Uploaded document"}
                </span>
              </div>
              {document.objectPath ? (
                <Button size="sm" variant="outline" className="min-h-9 self-start sm:self-auto" asChild data-testid={`button-open-account-document-${account.id}-${document.id}`}>
                  <a href={document.objectPath} target="_blank" rel="noopener noreferrer" aria-label={`Open ${document.label || document.fileName || "uploaded document"}`}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Secure link unavailable</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
