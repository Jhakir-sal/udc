import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { familyRefreshOptions } from "@/lib/family-refresh";
import { FileText, Loader2, Upload } from "lucide-react";
import type { Certificate } from "@shared/schema";
import { FAMILY_DOCUMENT_TYPES } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const acceptedTypes = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
const categories = [
  { value: "financial", label: "Financial" },
  { value: "memberships", label: "Memberships" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "real_estate", label: "Phone & utilities" },
  { value: "protected_information", label: "Protected information" },
  { value: "miscellaneous", label: "Miscellaneous" },
];

type Suggestion = {
  id: string;
  merchantName: string;
  description: string;
  amountCents: number | null;
  frequency: string | null;
  category: string;
  confidence: string | null;
  status: string;
};
type Document = {
  id: string;
  certificateId: string | null;
  fileName: string;
  label: string;
  documentType: string;
  objectPath: string;
  analysis: { status: string; suggestions: Suggestion[] } | null;
};

export function AccountDocumentsPanel({
  certificates,
  certificateIdFilter,
}: {
  certificates: Certificate[];
  certificateIdFilter: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [documentType, setDocumentType] = useState("financial_statement");
  const [uploading, setUploading] = useState(false);
  const caseId = certificateIdFilter || selectedCaseId || certificates[0]?.id || "";
  const accessibleCases = new Set(certificates.map((certificate) => certificate.id));
  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ["/api/family-documents"],
    ...familyRefreshOptions,
  });
  const visibleDocuments = (documents || []).filter((doc) =>
    doc.certificateId && accessibleCases.has(doc.certificateId) &&
    (!certificateIdFilter || doc.certificateId === certificateIdFilter)
  );

  const updateSuggestion = useMutation({
    mutationFn: ({ id, category, status }: { id: string; category?: string; status?: "dismissed" }) =>
      apiRequest("PATCH", `/api/family-document-suggestions/${id}`, { category, status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] }),
    onError: (error: Error) => toast({ title: "Could not update suggestion", description: error.message, variant: "destructive" }),
  });
  const confirmSuggestion = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/family-document-suggestions/${id}/confirm`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Account added for review", description: "Your concierge team will review it before any action is taken." });
    },
    onError: (error: Error) => toast({ title: "Could not add account", description: error.message, variant: "destructive" }),
  });
  const retryScan = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/family-documents/${id}/analyze`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] }),
    onError: (error: Error) => toast({ title: "Could not retry scan", description: error.message, variant: "destructive" }),
  });

  const upload = async (files: File[]) => {
    if (!caseId || !accessibleCases.has(caseId)) {
      toast({ title: "Choose a case first", variant: "destructive" });
      return;
    }
    if (files.length > 5 || files.some((file) => !acceptedTypes.includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)) {
      toast({ title: "Choose up to 5 non-empty PDFs or images, 10 MB each", variant: "destructive" });
      return;
    }
    setUploading(true);
    let uploaded = 0;
    const failed: string[] = [];
    try {
      for (const file of files) {
        try {
          const response = await apiRequest("POST", "/api/uploads/request-url", {
            name: file.name, size: file.size, contentType: file.type, certificateId: caseId,
          });
          const { uploadURL, objectPath } = await response.json();
          const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type, "x-ms-blob-type": "BlockBlob" } });
          if (!put.ok) throw new Error("File transfer failed");
          await apiRequest("POST", "/api/family-documents", {
            certificateId: caseId,
            label: file.name.replace(/\.[^.]+$/, ""),
            documentType,
            fileName: file.name,
            objectPath,
            contentType: file.type,
          });
          uploaded++;
        } catch {
          failed.push(file.name);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] });
      if (uploaded) toast({ title: `${uploaded} document${uploaded === 1 ? "" : "s"} uploaded`, description: "Review any account suggestions below. Nothing is added automatically." });
      if (failed.length) toast({ title: "Some documents could not be uploaded", description: failed.join(", "), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="mb-6" data-testid="account-documents-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Statements & documents</CardTitle>
        <CardDescription>Upload a bank statement, bill, insurance document, or other record. We may identify accounts or recurring payments for you to categorize and review. Nothing is added or cancelled automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {certificates.length ? (
          <div className="flex flex-wrap items-end gap-3">
            {certificates.length > 1 && !certificateIdFilter && (
              <div className="space-y-1">
                <Label htmlFor="account-document-case">Loved one’s case</Label>
                <Select value={caseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger id="account-document-case" className="w-[220px]"><SelectValue placeholder="Choose case" /></SelectTrigger>
                  <SelectContent>{certificates.map((cert) => <SelectItem key={cert.id} value={cert.id}>{cert.deceasedName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="account-document-type">Document type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger id="account-document-type" className="w-[220px]" data-testid="select-account-document-type"><SelectValue /></SelectTrigger>
                <SelectContent>{FAMILY_DOCUMENT_TYPES.map((type) =>
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                )}</SelectContent>
              </Select>
            </div>
            <label className="inline-flex">
              <input
                type="file" multiple className="sr-only" disabled={uploading || !caseId}
                accept={acceptedTypes.join(",")}
                data-testid="input-account-documents"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length) void upload(files);
                  event.target.value = "";
                }}
              />
              <span className="inline-flex h-10 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload documents"}
              </span>
            </label>
          </div>
        ) : <p className="text-sm text-muted-foreground">Add a loved one’s case before uploading documents.</p>}
        <p className="text-xs text-muted-foreground">PDF or image, up to 5 files at a time and 10 MB per file. Documents are visible to you and your Steps After Life team.</p>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading documents…</p> :
          visibleDocuments.length ? (
            <div className="space-y-3">
              {visibleDocuments.map((doc) => (
                <div key={doc.id} className="rounded-md border p-3" data-testid={`account-document-${doc.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <a href={doc.objectPath} target="_blank" rel="noopener noreferrer" className="break-all font-medium underline underline-offset-2">{doc.label || doc.fileName}</a>
                      <Badge variant="secondary" className="ml-2">{FAMILY_DOCUMENT_TYPES.find((type) => type.value === doc.documentType)?.label || "Other"}</Badge>
                    </div>
                    {doc.analysis?.status === "pending" && <span className="text-xs text-muted-foreground">Scanning for accounts…</span>}
                    {doc.analysis?.status === "failed" && <Button size="sm" variant="outline" disabled={retryScan.isPending} onClick={() => retryScan.mutate(doc.id)}>Retry scan</Button>}
                  </div>
                  {doc.analysis?.status === "completed" && doc.analysis.suggestions.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">No recurring accounts were found in this document.</p>
                  )}
                  {!!doc.analysis?.suggestions.some((suggestion) => suggestion.status === "pending") && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-muted-foreground">Review each suggested account and its category before adding it for concierge review.</p>
                      {doc.analysis.suggestions.filter((suggestion) => suggestion.status === "pending").map((suggestion) => (
                        <div key={suggestion.id} className="space-y-2 rounded-md bg-muted/40 p-3">
                          <p className="text-sm font-medium">{suggestion.merchantName}</p>
                          <p className="text-xs text-muted-foreground">{suggestion.description}{suggestion.amountCents != null ? ` · $${(suggestion.amountCents / 100).toFixed(2)}` : ""}{suggestion.frequency ? ` · ${suggestion.frequency}` : ""} · {suggestion.confidence || "low"} confidence</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Select value={suggestion.category} onValueChange={(category) => updateSuggestion.mutate({ id: suggestion.id, category })}>
                              <SelectTrigger className="w-[185px]" aria-label={`Category for ${suggestion.merchantName}`}><SelectValue /></SelectTrigger>
                              <SelectContent>{categories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button size="sm" disabled={confirmSuggestion.isPending || updateSuggestion.isPending} onClick={() => confirmSuggestion.mutate(suggestion.id)}>Add for review</Button>
                            <Button size="sm" variant="ghost" disabled={updateSuggestion.isPending} onClick={() => updateSuggestion.mutate({ id: suggestion.id, status: "dismissed" })}>Dismiss</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No documents for this case yet.</p>}
      </CardContent>
    </Card>
  );
}