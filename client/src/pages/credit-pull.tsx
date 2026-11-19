import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CreditCard,
  Search,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  Tv,
  Users,
  MoreHorizontal,
  Loader2,
  FileSearch,
  ArrowRight,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Certificate, AccountCategory, CreditPullResult, CreditPull } from "@shared/schema";

type CreditPullWithResults = CreditPull & { results: CreditPullResult[] };

const categoryIcons: Record<AccountCategory, React.ElementType> = {
  financial: CreditCard,
  memberships: Users,
  subscriptions: Tv,
  real_estate: Building2,
  protected_information: Shield,
  miscellaneous: MoreHorizontal,
};

const categoryLabels: Record<AccountCategory, string> = {
  financial: "Financial Accounts",
  memberships: "Memberships",
  subscriptions: "Subscriptions",
  real_estate: "Real Estate",
  protected_information: "Protected Information",
  miscellaneous: "Miscellaneous Items",
};

const bureaus = ["Experian", "Equifax", "TransUnion"];

export default function CreditPullPage() {
  const { toast } = useToast();
  const [selectedCertificate, setSelectedCertificate] = useState<string>("");
  const [selectedBureau, setSelectedBureau] = useState<string>("");
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());

  const { data: certificates, isLoading: loadingCerts } = useQuery<Certificate[]>({
    queryKey: ["/api/certificates"],
  });

  const { data: pullData, isLoading: loadingPulls } = useQuery<CreditPullWithResults[]>({
    queryKey: ["/api/credit-pull", selectedCertificate],
    enabled: !!selectedCertificate,
  });

  const pullMutation = useMutation({
    mutationFn: async ({ certificateId, bureau }: { certificateId: string; bureau: string }) => {
      const res = await apiRequest("POST", "/api/credit-pull", { certificateId, bureau });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-pull", selectedCertificate] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
          title: "Account search complete",
          description: `We found ${data.results?.length || 0} possible accounts through ${selectedBureau}.`,
      });
    },
    onError: (error: any) => {
      toast({
          title: "We could not complete the account search",
          description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ pullId, resultIds }: { pullId: string; resultIds: string[] }) => {
      const res = await apiRequest("POST", `/api/credit-pull/${pullId}/import`, { resultIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-pull", selectedCertificate] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setSelectedResults(new Set());
      toast({
          title: "Accounts added",
          description: `${data.imported} account(s) were added to Accounts and services.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import accounts.",
        variant: "destructive",
      });
    },
  });

  const importAllMutation = useMutation({
    mutationFn: async ({ pullId }: { pullId: string }) => {
      const res = await apiRequest("POST", `/api/credit-pull/${pullId}/import-all`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-pull", selectedCertificate] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
          title: "Accounts added",
          description: `${data.imported} account(s) were added to Accounts and services.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import accounts.",
        variant: "destructive",
      });
    },
  });

  const handlePull = () => {
    if (!selectedCertificate || !selectedBureau) {
      toast({
        title: "Missing Selection",
        description: "Please select a certificate and credit bureau.",
        variant: "destructive",
      });
      return;
    }
    pullMutation.mutate({ certificateId: selectedCertificate, bureau: selectedBureau });
  };

  const handleImportSelected = (pullId: string) => {
    if (selectedResults.size === 0) return;
    importMutation.mutate({ pullId, resultIds: Array.from(selectedResults) });
  };

  const handleImportAll = (pullId: string) => {
    importAllMutation.mutate({ pullId });
  };

  const toggleResult = (resultId: string) => {
    setSelectedResults(prev => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  const toggleAllResults = (results: CreditPullResult[]) => {
    const unimported = results.filter(r => !r.isImported);
    if (selectedResults.size === unimported.length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(unimported.map(r => r.id)));
    }
  };

  const selectedCert = certificates?.find(c => c.id === selectedCertificate);
  const completedBureaus = pullData?.filter(p => p.status === "completed").map(p => p.bureau) || [];

  if (loadingCerts) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-serif font-bold" data-testid="text-page-title">Find accounts</h1>
        <p className="text-muted-foreground mt-1">
          Search credit bureau records for accounts and subscriptions connected to your loved one. A credit bureau is a company that keeps credit records.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
             Search credit records
          </CardTitle>
          <CardDescription>
             Choose a death certificate and one credit bureau. We will look for possible accounts and subscriptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
               <label className="text-sm font-medium">Death certificate</label>
              <Select value={selectedCertificate} onValueChange={setSelectedCertificate} data-testid="select-certificate">
                <SelectTrigger data-testid="select-certificate-trigger">
                  <SelectValue placeholder="Select a certificate" />
                </SelectTrigger>
                <SelectContent>
                  {certificates?.map(cert => (
                    <SelectItem key={cert.id} value={cert.id} data-testid={`option-cert-${cert.id}`}>
                      {cert.deceasedName} - {cert.certificateNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
               <label className="text-sm font-medium">Credit bureau</label>
              <Select value={selectedBureau} onValueChange={setSelectedBureau}>
                <SelectTrigger data-testid="select-bureau-trigger">
                  <SelectValue placeholder="Select bureau" />
                </SelectTrigger>
                <SelectContent>
                  {bureaus.map(bureau => (
                    <SelectItem
                      key={bureau}
                      value={bureau}
                      disabled={completedBureaus.includes(bureau)}
                      data-testid={`option-bureau-${bureau.toLowerCase()}`}
                    >
                      {bureau} {completedBureaus.includes(bureau) ? "(Already Pulled)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedCert && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Certificate Details</AlertTitle>
              <AlertDescription>
                 You are searching credit records for <strong>{selectedCert.deceasedName}</strong> (certificate {selectedCert.certificateNumber}).
                {selectedCert.deceasedSsn && (
                  <> SSN: ***-**-{selectedCert.deceasedSsn.slice(-4)}</>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handlePull}
            disabled={!selectedCertificate || !selectedBureau || pullMutation.isPending}
            data-testid="button-pull-credit"
          >
            {pullMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                 Searching records...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                 Search credit records
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {loadingPulls && selectedCertificate && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {pullData && pullData.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-serif font-semibold" data-testid="text-results-heading">
             Account search results
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pullData.map(pull => {
              const imported = pull.results.filter(r => r.isImported).length;
              const total = pull.results.length;
              return (
                <Card key={pull.id} className="relative">
                  <CardContent className="pt-6 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{pull.bureau}</h3>
                      <Badge variant={pull.status === "completed" ? "default" : "secondary"}>
                        {pull.status === "completed" ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" /> Complete</>
                        ) : pull.status === "processing" ? (
                          <><Clock className="h-3 w-3 mr-1" /> Processing</>
                        ) : (
                          <><AlertCircle className="h-3 w-3 mr-1" /> {pull.status}</>
                        )}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                       {total} possible accounts found
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {imported} / {total} imported
                    </p>
                    {pull.externalReference && (
                      <p className="text-xs text-muted-foreground font-mono">
                        Ref: {pull.externalReference}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {pullData.map(pull => {
            if (pull.results.length === 0) return null;
            const unimportedCount = pull.results.filter(r => !r.isImported).length;
            return (
              <Card key={`results-${pull.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      {pull.bureau} - Discovered Accounts ({pull.results.length})
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      {unimportedCount > 0 && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleImportSelected(pull.id)}
                            disabled={selectedResults.size === 0 || importMutation.isPending}
                            data-testid={`button-import-selected-${pull.bureau.toLowerCase()}`}
                          >
                            {importMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Download className="h-4 w-4 mr-1" />
                            )}
                            Import Selected ({selectedResults.size})
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleImportAll(pull.id)}
                            disabled={importAllMutation.isPending}
                            data-testid={`button-import-all-${pull.bureau.toLowerCase()}`}
                          >
                            {importAllMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <ArrowRight className="h-4 w-4 mr-1" />
                            )}
                            Import All ({unimportedCount})
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <CardDescription>
                     Choose accounts to add to Accounts and services. Review each one before taking action.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">
                            <Checkbox
                              checked={
                                pull.results.filter(r => !r.isImported).length > 0 &&
                                selectedResults.size === pull.results.filter(r => !r.isImported).length
                              }
                              onCheckedChange={() => toggleAllResults(pull.results)}
                              data-testid="checkbox-select-all"
                            />
                          </TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Account #</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead className="text-right">Monthly</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Opened</TableHead>
                          <TableHead>Last Activity</TableHead>
                          <TableHead>Imported</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pull.results.map(result => {
                          const CategoryIcon = categoryIcons[result.category as AccountCategory] || MoreHorizontal;
                          return (
                            <TableRow key={result.id} data-testid={`row-result-${result.id}`}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedResults.has(result.id)}
                                  onCheckedChange={() => toggleResult(result.id)}
                                  disabled={result.isImported}
                                  data-testid={`checkbox-result-${result.id}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium" data-testid={`text-account-name-${result.id}`}>
                                {result.accountName}
                              </TableCell>
                              <TableCell>{result.accountType}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm">{categoryLabels[result.category as AccountCategory]}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-sm">{result.accountNumber}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{result.balance}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{result.monthlyPayment}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {result.accountStatus}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{result.dateOpened}</TableCell>
                              <TableCell className="text-sm">{result.lastActivity}</TableCell>
                              <TableCell>
                                {result.isImported ? (
                                  <Badge variant="default" className="text-xs" data-testid={`badge-imported-${result.id}`}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Imported
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    Pending
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {pullData && pullData.length === 0 && selectedCertificate && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <FileSearch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
             <h3 className="text-lg font-medium mb-2">No account searches yet</h3>
            <p className="text-muted-foreground">
               Choose a credit bureau above, then search for possible accounts.
            </p>
          </CardContent>
        </Card>
      )}

      {!selectedCertificate && certificates && certificates.length > 0 && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
             <h3 className="text-lg font-medium mb-2">Choose a death certificate</h3>
            <p className="text-muted-foreground">
               Choose a death certificate above to search for possible accounts.
            </p>
          </CardContent>
        </Card>
      )}

      {certificates && certificates.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
           <AlertTitle>No death certificate found</AlertTitle>
          <AlertDescription>
             Add a death certificate before you search credit records.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
