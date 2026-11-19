import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatSsnInput } from "@/lib/utils";
import { 
  Search, 
  Shield, 
  FileText, 
  Calendar, 
  Building2, 
  User,
  Hash,
  Loader2,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
interface SearchResult {
  id: string;
  userId: string | null;
  deceasedName: string;
  deceasedSsn: string | null;
  dateOfDeath: string;
  dateOfBirth: string;
  certificateNumber: string;
  issuingAuthority: string;
  status: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  blockchainHash: string | null;
}

const statusLabels: Record<string, string> = {
  pending: "Pending",
  verified: "Verified",
  processing: "Processing",
  completed: "Completed",
};

const statusVariants: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  verified: "bg-green-500/10 text-green-700 dark:text-green-400",
  processing: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"ssn" | "name" | "certificate_number">("ssn");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeType, setActiveType] = useState("");

  const { data: results, isLoading, isFetched } = useQuery<SearchResult[]>({
    queryKey: [`/api/search?q=${encodeURIComponent(activeQuery)}&type=${encodeURIComponent(activeType)}`],
    enabled: !!activeQuery && !!activeType,
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setActiveQuery(searchQuery.trim());
    setActiveType(searchType);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const searchTypeLabels: Record<string, string> = {
    ssn: "Social Security Number",
    name: "Deceased Name",
    certificate_number: "Certificate Number",
  };

  const searchPlaceholders: Record<string, string> = {
    ssn: "111-11-1111",
    name: "Enter deceased person's name",
    certificate_number: "Enter certificate number",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold" data-testid="text-search-title">Search Information</h1>
        <p className="text-muted-foreground mt-1">
          Search death certificate records by Social Security Number, name, or certificate number.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5" />
            Search Records
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select 
              value={searchType} 
              onValueChange={(v) => setSearchType(v as typeof searchType)}
            >
              <SelectTrigger className="sm:w-[220px]" data-testid="select-search-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ssn">Social Security Number</SelectItem>
                <SelectItem value="name">Deceased Name</SelectItem>
                <SelectItem value="certificate_number">Certificate Number</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 flex gap-2">
              <Input
                placeholder={searchPlaceholders[searchType]}
                value={searchQuery}
                onChange={(e) => setSearchQuery(searchType === "ssn" ? formatSsnInput(e.target.value) : e.target.value)}
                maxLength={searchType === "ssn" ? 11 : undefined}
                onKeyDown={handleKeyDown}
                data-testid="input-search-query"
              />
              <Button 
                onClick={handleSearch} 
                disabled={!searchQuery.trim() || isLoading}
                data-testid="button-search"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">Search</span>
              </Button>
            </div>
          </div>

          {searchType === "ssn" && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground p-3 rounded-md bg-muted/50">
              <Shield className="h-4 w-4 mt-0.5 shrink-0" />
              <span>For security, only the last 4 digits of the SSN are displayed in search results. Enter at least the last 4 digits to search.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {isFetched && !isLoading && activeQuery && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground" data-testid="text-results-count">
              {results?.length || 0} result{results?.length !== 1 ? "s" : ""} found for "{activeQuery}" in {searchTypeLabels[activeType]}
            </p>
          </div>

          {results && results.length > 0 ? (
            <div className="grid gap-4">
              {results.map((cert) => (
                <Card key={cert.id} className="hover-elevate" data-testid={`card-result-${cert.id}`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-lg" data-testid={`text-name-${cert.id}`}>
                            {cert.deceasedName}
                          </h3>
                          <Badge className={statusVariants[cert.status] || ""}>
                            {statusLabels[cert.status] || cert.status}
                          </Badge>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4 shrink-0" />
                            <span>SSN: {cert.deceasedSsn || "Not provided"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Hash className="h-4 w-4 shrink-0" />
                            <span>Certificate: {cert.certificateNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4 shrink-0" />
                            <span>DOB: {cert.dateOfBirth}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4 shrink-0" />
                            <span>Date of Death: {cert.dateOfDeath}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Building2 className="h-4 w-4 shrink-0" />
                            <span>{cert.issuingAuthority}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span>Submitted: {cert.submittedAt ? new Date(cert.submittedAt).toLocaleDateString() : "—"}</span>
                          </div>
                        </div>
                      </div>
                      {cert.blockchainHash && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md shrink-0">
                          <Shield className="h-3 w-3" />
                          <span className="font-mono truncate max-w-[140px]">{cert.blockchainHash}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <h3 className="font-medium mb-1">No results found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  No death certificate records match your search criteria. Please verify the information and try again.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!isFetched && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-medium mb-1 text-muted-foreground">Search for Records</h3>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              Enter a Social Security Number, deceased person's name, or certificate number above to search for death certificate records.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
