import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, FileText, Loader2, Search, Scale } from "lucide-react";
import { Link } from "wouter";
import { FAMILY_DOCUMENT_TYPES } from "@shared/schema";
import { NER_OUTCOME_LABELS, type NerSearchInput, type NerSearchResult } from "@shared/nerSearch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { NerSearchHistory } from "@/components/ner-search-history";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface NerInfo {
  guestSearchUrl: string;
  pricing: { searchFee: string; foundFee: string };
}

interface CertificateOption {
  id: string;
  deceasedName: string;
}

interface SavedDocument {
  id: string;
  label: string;
  fileName: string;
  documentType: string;
  objectPath: string;
  uploadedAt: string;
}

const UNLINKED = "__unlinked__";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EstatePlans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const initialName = params.get("name")?.trim() || "";
  const nameParts = initialName.split(/\s+/);
  const requestedCertificateId = params.get("certificateId") || "";
  const requestedCertificateIdIsValid = UUID_PATTERN.test(requestedCertificateId);
  const [tab, setTab] = useState(params.get("tab") === "registry" || params.get("tab") === "search" || params.get("tab") === "analysis" ? "saved" : "ner");
  const [firstName, setFirstName] = useState(nameParts.length > 1 ? nameParts[0] : "");
  const [lastName, setLastName] = useState(nameParts.length > 1 ? nameParts.slice(1).join(" ") : initialName);
  const [previousName, setPreviousName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [result, setResult] = useState<(NerSearchResult & { queriedName: string; queriedCaseId: string }) | null>(null);
  const selectionResolved = useRef(false);

  const info = useQuery<NerInfo>({ queryKey: ["/api/ner-external/info"], retry: false });
  const certificates = useQuery<CertificateOption[]>({ queryKey: ["/api/certificates"] });
  const requestedCertificate = useQuery<CertificateOption>({
    queryKey: ["/api/certificates", requestedCertificateId],
    queryFn: async () => {
      const certificate = await (await apiRequest("GET", `/api/certificates/${encodeURIComponent(requestedCertificateId)}`)).json() as CertificateOption;
      return { id: certificate.id, deceasedName: certificate.deceasedName };
    },
    enabled: requestedCertificateIdIsValid,
    retry: false,
  });
  const documents = useQuery<SavedDocument[]>({ queryKey: ["/api/family-documents"], enabled: tab === "saved" });
  const caseOptions = useMemo(() => {
    const options = certificates.data ? [...certificates.data] : [];
    const requested = requestedCertificate.data;
    if (requested?.id && requested.deceasedName && !options.some((certificate) => certificate.id === requested.id)) {
      options.push({ id: requested.id, deceasedName: requested.deceasedName });
    }
    return options;
  }, [certificates.data, requestedCertificate.data]);
  const caseOptionsResolved = !certificates.isLoading && (!requestedCertificateIdIsValid || !requestedCertificate.isLoading);

  useEffect(() => {
    if (!caseOptionsResolved || selectionResolved.current) return;
    selectionResolved.current = true;
    if (requestedCertificateId) {
      const accessible = caseOptions.find((certificate) => certificate.id === requestedCertificateId);
      if (accessible) {
        setSelectedCertificateId(accessible.id);
        if (!initialName) {
          const parts = accessible.deceasedName.trim().split(/\s+/);
          setFirstName(parts.length > 1 ? parts[0] : "");
          setLastName(parts.length > 1 ? parts.slice(1).join(" ") : accessible.deceasedName);
        }
      }
      return;
    }
    if (caseOptions.length === 1) setSelectedCertificateId(caseOptions[0].id);
  }, [caseOptionsResolved, caseOptions, requestedCertificateId, initialName]);

  const activeCertificate = caseOptions.find((certificate) => certificate.id === selectedCertificateId);
  const historyEndpoint = selectedCertificateId ? `/api/case/${encodeURIComponent(selectedCertificateId)}/ner-searches` : "";
  const search = useMutation({
    mutationFn: async (payload: NerSearchInput) => {
      const response = await apiRequest("POST", "/api/ner-external/search", payload);
      return response.json() as Promise<NerSearchResult>;
    },
    onSuccess: async (searchResult, input) => {
      setResult({ ...searchResult, queriedName: `${input.firstName} ${input.lastName}`, queriedCaseId: input.certificateId || "" });
      if (input.certificateId && searchResult.caseLinked) {
        await queryClient.invalidateQueries({ queryKey: [`/api/case/${encodeURIComponent(input.certificateId)}/ner-searches`] });
      }
    },
    onError: (error: Error) => toast({ title: "Registry search unavailable", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold" data-testid="text-page-title">Estate plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search the National Estate Registry or view documents saved with your cases.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-estate-registry">
          <TabsTrigger value="ner" data-testid="tab-ner">NER search</TabsTrigger>
          <TabsTrigger value="saved" data-testid="tab-saved-documents">Saved documents</TabsTrigger>
        </TabsList>

        <TabsContent value="ner" className="mt-5 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" />National Estate Registry</CardTitle>
              <CardDescription>
                Search this separate registry for a loved one’s estate plan.
                {info.data && ` A search costs ${info.data.pricing.searchFee}, plus ${info.data.pricing.foundFee}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {info.isError && (
                <Alert variant="destructive">
                  <AlertTitle>Registry search unavailable</AlertTitle>
                  <AlertDescription>The external registry connection is unavailable or not configured. Saved documents and search history remain available.</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="ner-case-select">Link this search to a case (optional)</Label>
                {!caseOptionsResolved ? <Skeleton className="h-10 w-full max-w-md" /> : (
                  <div className="space-y-2">
                    {certificates.isError && (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-destructive">Your cases could not be loaded. An unlinked search is still available.</p>
                        <Button variant="outline" size="sm" onClick={() => certificates.refetch()}>Try again</Button>
                      </div>
                    )}
                    <Select
                      value={activeCertificate?.id || UNLINKED}
                      disabled={!caseOptionsResolved}
                      onValueChange={(value) => {
                        setSelectedCertificateId(value === UNLINKED ? "" : value);
                        setResult(null);
                      }}
                    >
                      <SelectTrigger id="ner-case-select" className="max-w-md" data-testid="select-ner-case">
                        <SelectValue placeholder="Unlinked search" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNLINKED}>Unlinked search (not saved to a case)</SelectItem>
                        {caseOptions.map((certificate) => (
                          <SelectItem key={certificate.id} value={certificate.id}>{certificate.deceasedName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {requestedCertificateId && caseOptionsResolved && !caseOptions.some((certificate) => certificate.id === requestedCertificateId) && (
                  <p className="text-sm text-amber-700" data-testid="text-ner-invalid-case-link">The requested case is not available to this account. This search will remain unlinked.</p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="ner-first-name">First name *</Label>
                  <Input id="ner-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} data-testid="input-ner-firstname" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ner-last-name">Last name *</Label>
                  <Input id="ner-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} data-testid="input-ner-lastname" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ner-previous-name">Maiden or previous name</Label>
                  <Input id="ner-previous-name" value={previousName} onChange={(event) => setPreviousName(event.target.value)} data-testid="input-ner-previous-name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ner-birth-year">Year of birth</Label>
                  <Input id="ner-birth-year" inputMode="numeric" placeholder="e.g. 1945" value={birthYear} onChange={(event) => setBirthYear(event.target.value)} data-testid="input-ner-birth-year" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ner-zip">Last known ZIP code</Label>
                  <Input id="ner-zip" inputMode="numeric" value={zipCode} onChange={(event) => setZipCode(event.target.value)} data-testid="input-ner-zip" />
                </div>
              </div>
              <Button
                disabled={!info.data || !caseOptionsResolved || !firstName.trim() || !lastName.trim() || search.isPending}
                onClick={() => {
                  setResult(null);
                  search.mutate({
                    ...(activeCertificate ? { certificateId: activeCertificate.id } : {}),
                    firstName: firstName.trim(), lastName: lastName.trim(),
                    ...(previousName.trim() ? { maidenName: previousName.trim() } : {}),
                    ...(birthYear.trim() ? { yearOfBirth: birthYear.trim() } : {}),
                    ...(zipCode.trim() ? { zipCode: zipCode.trim() } : {}),
                  });
                }}
                data-testid="button-ner-search"
              >
                {search.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Search NER
              </Button>
              {result && result.queriedCaseId === (activeCertificate?.id || "") && (
                <Alert data-testid="ner-search-result">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="flex flex-wrap items-center gap-2">
                    {NER_OUTCOME_LABELS[result.outcome]}
                    {result.caseLinked && result.historyRecorded && <Badge variant="outline">Saved to case history</Badge>}
                    {result.caseLinked && !result.historyRecorded && <Badge variant="destructive">Case linked, history not recorded</Badge>}
                    {!result.caseLinked && <Badge variant="secondary">Unlinked</Badge>}
                  </AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p className="font-medium">Searched name: {result.queriedName}</p>
                    <p>{result.message}</p>
                    {result.source === "redirect" && result.searchUrl && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={result.searchUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Continue on NER</a>
                      </Button>
                    )}
                    {result.results?.length > 0 && (
                      <div className="space-y-2">
                        <p className="font-medium">Potential candidates — these are not verified legal identities.</p>
                        {result.results.map((entry, index) => (
                          <div key={`${entry.principalName || "candidate"}-${index}`} className="rounded-md border bg-background p-3">
                            <p className="font-medium">{entry.principalName || "Estate record"}</p>
                            <p>{entry.documentType || "Document"}{entry.jurisdiction ? ` · ${entry.jurisdiction}` : ""}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {search.isError && (
                <Alert variant="destructive" data-testid="ner-search-error">
                  <AlertTitle>Search could not be submitted</AlertTitle>
                  <AlertDescription>{(search.error as Error).message} Your search details are still here; please review and retry.</AlertDescription>
                </Alert>
              )}
              {info.data?.guestSearchUrl && (
                <a href={info.data.guestSearchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4">
                  Search directly on the National Estate Registry <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>
          {activeCertificate && (
            <NerSearchHistory
              key={activeCertificate.id}
              certId={activeCertificate.id}
              deceasedName={activeCertificate.deceasedName}
              variant="family"
            />
          )}
        </TabsContent>

        <TabsContent value="saved" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Saved documents</CardTitle>
              <CardDescription>Documents saved with your family cases. These are not the same as a National Estate Registry registration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {documents.isLoading ? <Skeleton className="h-20 w-full" /> :
                documents.isError ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-destructive">Documents could not be loaded. Please try again.</p><Button variant="outline" size="sm" onClick={() => documents.refetch()}>Try again</Button></div> :
                documents.data?.length ? (
                  <div className="divide-y rounded-md border">
                    {documents.data.map((document) => (
                      <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid={`saved-estate-document-${document.id}`}>
                        <div className="min-w-0">
                          <p className="break-all font-medium">{document.label || document.fileName}</p>
                          <Badge variant="outline">{FAMILY_DOCUMENT_TYPES.find((type) => type.value === document.documentType)?.label || "Other"}</Badge>
                          <span className="ml-2 text-xs text-muted-foreground">{new Date(document.uploadedAt).toLocaleDateString()}</span>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <a href={document.objectPath} target="_blank" rel="noopener noreferrer">Open document <ExternalLink className="ml-2 h-3 w-3" /></a>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No documents have been saved with your cases yet.</p>}
              <Button variant="outline" asChild><Link href="/settings">Manage saved documents</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
