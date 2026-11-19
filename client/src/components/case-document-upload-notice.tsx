import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Clock3, FileUp, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { CaseDocumentAlerts } from "@shared/caseDocumentAlerts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const caseDocumentAlertsQueryKey = (certId: string) =>
  ["/api/admin/case", certId, "document-alerts"] as const;

export function useCaseDocumentAlerts(certId: string) {
  return useQuery<CaseDocumentAlerts>({
    queryKey: caseDocumentAlertsQueryKey(certId),
    enabled: !!certId,
    queryFn: async () => {
      const response = await fetch(`/api/admin/case/${encodeURIComponent(certId)}/document-alerts`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not check for new family documents.");
      return response.json();
    },
    staleTime: 3_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

type SeenVariables = { certificateId: string; documentIds: string[] };

export function useMarkCaseDocumentsSeen() {
  return useMutation({
    mutationFn: async ({ certificateId, documentIds }: SeenVariables) => {
      await apiRequest(
        "POST",
        `/api/admin/case/${encodeURIComponent(certificateId)}/document-alerts/seen`,
        { documentIds: documentIds.slice(0, 100) },
      );
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: caseDocumentAlertsQueryKey(variables.certificateId) });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", variables.certificateId, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", variables.certificateId, "family-documents"] });
    },
    onError: (_error, variables) => {
      // The server may have recorded the acknowledgement even if the response was lost.
      // Refresh the shared state, but never retry or clear it optimistically.
      queryClient.invalidateQueries({ queryKey: caseDocumentAlertsQueryKey(variables.certificateId) });
    },
  });
}

export function MarkCaseDocumentsSeenButton({
  certId,
  documentIds,
  label,
  className,
  testId = "button-mark-documents-seen",
}: {
  certId: string;
  documentIds: string[];
  label: string;
  className?: string;
  testId?: string;
}) {
  const mutation = useMarkCaseDocumentsSeen();
  const [error, setError] = useState(false);
  const ids = documentIds.slice(0, 100);

  return (
    <div className="flex min-w-0 max-w-full flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={`${className ?? ""} h-auto min-h-11 min-w-0 max-w-full whitespace-normal break-words`}
        disabled={!ids.length || mutation.isPending}
        onClick={() => {
          setError(false);
          mutation.mutate({ certificateId: certId, documentIds: [...ids] }, {
            onError: () => setError(true),
          });
        }}
        data-testid={testId}
      >
        {mutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 break-words">{label}</span>
      </Button>
      {error && (
        <p className="max-w-full break-words text-xs text-destructive" role="alert" data-testid="case-document-seen-error">
          Could not confirm these documents as seen. Their status will refresh; try again only if they remain new.
        </p>
      )}
    </div>
  );
}

export function CaseDocumentUploadNotice({
  certId,
  onReview,
}: {
  certId: string;
  onReview: () => void;
}) {
  const alerts = useCaseDocumentAlerts(certId);
  const count = alerts.data?.unseenCount ?? 0;
  const hasNotices = count > 0;

  if (!hasNotices && alerts.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking for new family documents…
      </div>
    );
  }

  if (!hasNotices && alerts.isError) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/70 bg-amber-50/70 px-4 py-3 text-sm dark:bg-amber-950/20" data-testid="case-document-alert-error" role="status">
        <span className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          New document status is unavailable. No documents were marked as seen.
        </span>
        <Button size="sm" variant="outline" onClick={() => alerts.refetch()} data-testid="button-retry-document-alerts">
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!hasNotices) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-amber-300/80 bg-amber-50/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-800/70 dark:bg-amber-950/20"
      aria-label="New family document uploads"
      aria-live="polite"
      data-testid="case-document-upload-notice"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
          <FileUp className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">
              {count} new document{count === 1 ? "" : "s"} uploaded
            </p>
            <Badge variant="outline" className="border-amber-400/70 bg-background/70 text-amber-900 dark:text-amber-200">
              Not marked seen
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Available in the case library. New means not yet marked seen—not approved or verified.
          </p>
          {alerts.data?.latestUploadedAt && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              Latest upload {new Date(alerts.data.latestUploadedAt).toLocaleString()}
            </p>
          )}
          {alerts.isError && (
            <p className="mt-1 text-xs text-amber-900 dark:text-amber-200" data-testid="case-document-alert-stale-warning" role="status">
              Could not refresh just now; this count may be out of date and is being kept visible.
            </p>
          )}
        </div>
      </div>
      <Button type="button" onClick={onReview} className="shrink-0" data-testid="button-review-new-documents">
        Review uploads
      </Button>
    </section>
  );
}
