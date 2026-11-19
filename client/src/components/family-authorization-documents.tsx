import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileCheck2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface FamilyAuthorizationDocument {
  id: string;
  memberName: string;
  agreementVersion: string;
  scope: string;
  signedAt: string;
  memberAcceptedAt: string | null;
  reviewStatus: string;
  revokedAt: string | null;
  historical: boolean;
  historicalReasons: string[];
  documentUrl: string;
}

interface FamilyAuthorizationDocumentsResponse {
  documents: FamilyAuthorizationDocument[];
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

export function FamilyAuthorizationDocuments({ certificateId }: { certificateId: string }) {
  const endpoint = `/api/case/${certificateId}/family-authorization-documents`;
  const documents = useQuery<FamilyAuthorizationDocumentsResponse>({
    queryKey: [endpoint],
    enabled: Boolean(certificateId),
  });
  const records = documents.data?.documents || [];

  return (
    <Card data-testid={`family-authorization-documents-${certificateId}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="h-4 w-4" />
          Family authorization records
        </CardTitle>
        <CardDescription>
          Immutable copies of signed case-sharing agreements. These records document consent; they do not grant current access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.isLoading && (
          <div className="space-y-2" data-testid="family-authorization-documents-loading">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {documents.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-muted-foreground">Family authorization records could not be loaded.</p>
            <Button variant="outline" size="sm" onClick={() => documents.refetch()} data-testid="button-retry-family-authorization-documents">
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Try again
            </Button>
          </div>
        )}

        {!documents.isLoading && !documents.isError && records.length === 0 && (
          <div className="rounded-md border border-dashed p-5 text-center" data-testid="family-authorization-documents-empty">
            <FileCheck2 className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-medium">No signed authorization records</p>
            <p className="mt-1 text-xs text-muted-foreground">When a case-sharing agreement is signed, its immutable record will be available here.</p>
          </div>
        )}

        {records.map((record) => {
          const downloadUrl = `${record.documentUrl}?download=1`;
          const label = record.historical ? "Historical" : record.revokedAt ? "Revoked" : "Current";
          return (
            <article key={record.id} className="space-y-3 rounded-lg border p-3" data-testid={`family-authorization-document-${record.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{record.memberName || "Case member"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {record.agreementVersion} · {record.scope === "representative" ? "Representative" : record.scope === "helper" ? "Helper" : record.scope}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={record.historical || record.revokedAt ? "outline" : "secondary"}>{label}</Badge>
                  <Badge variant="outline" className="capitalize">{(record.reviewStatus || "not reviewed").replace(/_/g, " ")}</Badge>
                </div>
              </div>

              <div className="grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
                <p><span className="text-muted-foreground">Owner signed</span><br /><span className="font-medium">{formatDate(record.signedAt)}</span></p>
                <p><span className="text-muted-foreground">Member accepted</span><br /><span className="font-medium">{formatDate(record.memberAcceptedAt)}</span></p>
                {record.revokedAt && <p><span className="text-muted-foreground">Revoked</span><br /><span className="font-medium">{formatDate(record.revokedAt)}</span></p>}
              </div>

              {record.historicalReasons?.length > 0 && (
                <p className="text-xs text-muted-foreground">Historical record: {record.historicalReasons.join(" · ")}</p>
              )}
              <p className="text-xs text-muted-foreground">Older records do not confer access.</p>

              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="outline" asChild data-testid={`button-open-family-authorization-${record.id}`}>
                  <a href={record.documentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open / Print
                  </a>
                </Button>
                <Button size="sm" variant="ghost" asChild data-testid={`button-download-family-authorization-${record.id}`}>
                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                  </a>
                </Button>
              </div>
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}
