import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, Trash2, Upload, ExternalLink, Crown, HardDrive } from "lucide-react";
import { PLAN_DOCUMENT_TYPES } from "@shared/schema";
import { SectionNavigation, useHeartPlanAdvance, useSectionPageFocus } from "./section-navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { Link } from "wouter";

interface PlanDoc {
  id: string;
  label: string;
  documentType: string;
  fileName: string;
  objectPath: string;
  fileSize: number | null;
  uploadedAt: string;
}

interface VaultStorage {
  usedBytes: number;
  limitBytes: number;
  storageTier: "free" | "legacy";
  canUpgrade: boolean;
  orsaOfferAvailable: boolean;
  orsaOfferPriceCents: number;
  orsaIncluded: boolean;
}

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_DOCUMENT_TYPES.map((t) => [t.value, t.label])
);

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(bytes ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HeartPlanVault() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("other");
  const [isUploading, setIsUploading] = useState(false);
  const { headingRef, firstControlRef } = useSectionPageFocus<HTMLButtonElement>();
  const advance = useHeartPlanAdvance("documents");

  const { data: plan } = useQuery<{ plan: { status: string } }>({ queryKey: ["/api/heartplan"] });
  const { data: documents, isLoading } = useQuery<PlanDoc[]>({ queryKey: ["/api/heartplan/documents"] });
  const { data: vaultStorage } = useQuery<VaultStorage>({ queryKey: ["/api/heartplan/storage"] });
  const isActivated = plan?.plan?.status === "activated";

  const upgradeMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/heartplan/upgrade/checkout", { tier: "legacy" })).json(),
    onSuccess: (data: { url?: string }) => {
      if (data.url) {
        trackAnalyticsEvent("legacy_checkout_started", { surface: "vault" });
        window.location.href = data.url;
      }
      else toast({ title: "Could not start upgrade", description: "No checkout link was returned. Please try again.", variant: "destructive" });
    },
    onError: (error: any) => toast({ title: "Could not start upgrade", description: error.message, variant: "destructive" }),
  });

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    if (files.length > 10) {
      toast({ title: "Too many files", description: "You can upload up to 10 documents at a time.", variant: "destructive" });
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    const invalid = files.find((f) => !validTypes.includes(f.type));
    if (invalid) {
      toast({ title: "Invalid file type", description: `${invalid.name} is not a PDF or image file.`, variant: "destructive" });
      return;
    }
    const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) {
      toast({ title: "File too large", description: `${tooBig.name} exceeds the 10MB limit.`, variant: "destructive" });
      return;
    }
    const selectedBytes = files.reduce((total, file) => total + file.size, 0);
    if (vaultStorage && vaultStorage.usedBytes + selectedBytes > vaultStorage.limitBytes) {
      toast({
        title: "Not enough vault storage",
        description: vaultStorage.canUpgrade
          ? "Upgrade storage to 1 GB with HeartPlan Legacy, or choose fewer files."
          : "Remove an existing document or choose fewer files.",
        variant: "destructive",
      });
      return;
    }
    setIsUploading(true);
    let uploaded = 0;
    const failed: string[] = [];
    for (const file of files) {
      try {
        const metaRes = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type,
          fileSize: file.size,
        });
        const { uploadURL, objectPath } = await metaRes.json();
        const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!uploadRes.ok) throw new Error("Upload failed");
        await apiRequest("POST", "/api/heartplan/documents", {
          label: file.name.replace(/\.[^.]+$/, ""),
          documentType: docType,
          fileName: file.name,
          objectPath,
          contentType: file.type,
        });
        uploaded++;
      } catch {
        failed.push(file.name);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/heartplan/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
    queryClient.invalidateQueries({ queryKey: ["/api/heartplan/storage"] });
    if (failed.length === 0) {
      toast({ title: uploaded === 1 ? "Document stored" : `${uploaded} documents stored`, description: "Kept safe in your private vault." });
      await advance.advanceAfterSave();
    } else {
      toast({ title: `${uploaded} uploaded, ${failed.length} failed`, description: `Failed: ${failed.join(", ")}`, variant: "destructive" });
    }
    setIsUploading(false);
  };

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      await apiRequest("DELETE", `/api/heartplan/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/storage"] });
      toast({ title: "Document removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove document", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7 sm:p-6">
      <div>
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold scroll-mt-6 outline-none" data-testid="text-vault-title">Document vault</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Keep important papers in one private place. Only you can see them now. Our concierge team can see them after your plan is activated.
        </p>
      </div>

      {vaultStorage && (
        <Card data-testid="card-vault-storage">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">Document Vault storage</p>
                    <Badge variant={vaultStorage.storageTier === "legacy" ? "default" : "secondary"}>
                      {vaultStorage.storageTier === "legacy" ? "1 GB" : "100 MB"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBytes(vaultStorage.usedBytes)} of {formatBytes(vaultStorage.limitBytes)} used
                    {vaultStorage.orsaIncluded ? " · Expanded storage included with ORSA" : ""}
                  </p>
                </div>
              </div>
              {vaultStorage.canUpgrade && !isActivated && (
                <Button variant="outline" onClick={() => upgradeMutation.mutate()} disabled={upgradeMutation.isPending} data-testid="button-upgrade-storage">
                  {upgradeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
                  Upgrade storage
                </Button>
              )}
              {vaultStorage.orsaOfferAvailable && !isActivated && (
                <Button asChild variant="outline"><Link href="/orsa">Get lifetime Legacy — ${(vaultStorage.orsaOfferPriceCents / 100).toFixed(0)}</Link></Button>
              )}
            </div>
            <Progress value={Math.min(100, (vaultStorage.usedBytes / vaultStorage.limitBytes) * 100)} data-testid="progress-vault-storage" />
            {vaultStorage.canUpgrade && (
              <p className="text-xs text-muted-foreground">
                Upgrade to HeartPlan Legacy for 1 GB of Vault storage plus priority concierge support. One-time payment of $149; no subscription.
              </p>
            )}
            {vaultStorage.orsaOfferAvailable && <p className="text-xs text-muted-foreground">Your ORSA membership remains active. One-time lifetime Legacy for ${(vaultStorage.orsaOfferPriceCents / 100).toFixed(0)} is available from your membership page; NER is separate.</p>}
          </CardContent>
        </Card>
      )}

      {!isActivated && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add a document</CardTitle>
            <CardDescription>Choose a PDF or image file. Each file can be up to 10 MB.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 min-w-[220px]">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger ref={firstControlRef} data-testid="select-doc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleFiles}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} data-testid="button-upload-doc">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
               {isUploading ? "Adding documents" : "Choose files"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your documents</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !documents || documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-documents">
              Your vault is empty. Add a document when you are ready.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 rounded-md border p-3" data-testid={`doc-row-${doc.id}`}>
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                  </div>
                  <Badge variant="secondary">{TYPE_LABELS[doc.documentType] || "Other"}</Badge>
                  <Button variant="ghost" size="icon" asChild data-testid={`button-view-doc-${doc.id}`}>
                    <a href={doc.objectPath} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  {!isActivated && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (window.confirm(`Remove "${doc.label}" from your private vault? This cannot be undone.`)) deleteMutation.mutate(doc.id);
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-doc-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {!isActivated && <SectionNavigation section="documents"
        onSave={documents && documents.length > 0 ? advance.advanceAfterSave : undefined}
        saveLabel="Save and continue" onDefer={advance.deferSection}
        saved={advance.saved} isAdvancing={advance.isAdvancing} />}
    </div>
  );
}
