import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FileCheck,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Shield,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  UserCircle,
  UserPlus,
  Mail,
  RefreshCw,
  RotateCw,
  FileUp,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import type { Certificate, ConnectedAccount } from "@shared/schema";

interface FamilySummary {
  userId: string;
  familyName: string;
  email: string;
  certificates: Certificate[];
  totalAccounts: number;
  totalNotifications: number;
  pendingActions: number;
  completedActions: number;
  idVerificationStatus?: string;
  idVerifiedAt?: string | null;
  idOverrideAt?: string | null;
  idVerified?: boolean;
}

interface InvitationSummary {
  id: string;
  status: string;
  recipientName: string;
  email: string;
  sentAt: string;
}

const inviteBadgeConfig: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "Invite Sent" },
  accepted: { color: "bg-green-500/10 text-green-700 dark:text-green-400", label: "Invite Accepted" },
  expired: { color: "bg-red-500/10 text-red-700 dark:text-red-400", label: "Invite Expired" },
};

function InviteBadge({
  certId,
  invite,
  onResend,
  resending,
}: {
  certId: string;
  invite?: InvitationSummary;
  onResend: (certId: string, inviteId: string) => void;
  resending: boolean;
}) {
  if (!invite) {
    return (
      <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground" data-testid={`badge-invite-${certId}`}>
        <Mail className="h-3 w-3 mr-1" />
        No Invite
      </Badge>
    );
  }
  const cfg = inviteBadgeConfig[invite.status] || inviteBadgeConfig.pending;
  return (
    <span className="flex items-center gap-1 shrink-0">
      <Badge className={`${cfg.color} text-xs`} data-testid={`badge-invite-${certId}`}>
        <Mail className="h-3 w-3 mr-1" />
        {cfg.label}
      </Badge>
      {(invite.status === "pending" || invite.status === "expired") && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Re-send invitation"
          disabled={resending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResend(certId, invite.id);
          }}
          data-testid={`button-resend-invite-${certId}`}
        >
          {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      )}
    </span>
  );
}

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", label: "Pending" },
  verified: { icon: CheckCircle2, color: "bg-green-500/10 text-green-700 dark:text-green-400", label: "Verified" },
  processing: { icon: AlertCircle, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "Processing" },
  completed: { icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", label: "Completed" },
};

function IdentityBadge({ family }: { family?: FamilySummary }) {
  const override = Boolean(family?.idOverrideAt);
  const status = family?.idVerificationStatus;
  let label = "ID status unknown";
  let color = "bg-muted text-muted-foreground border-border";
  let Icon = Shield;

  if (override && status === "verified") {
    label = "Staff-approved identity";
    color = "bg-amber-500/10 text-amber-800 border-amber-500/25 dark:text-amber-300";
    Icon = Shield;
  } else if (family?.idVerified === true || status === "verified") {
    label = "ID verified";
    color = "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400";
    Icon = CheckCircle2;
  } else if (status === "pending") {
    label = "ID check pending";
    color = "bg-yellow-500/10 text-yellow-800 border-yellow-500/20 dark:text-yellow-300";
    Icon = Clock;
  } else if (status === "failed") {
    label = "ID check failed";
    color = "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400";
    Icon = AlertCircle;
  } else if (status === "not_started") {
    label = "ID not started";
    color = "bg-muted text-muted-foreground border-border";
    Icon = Shield;
  }

  return (
    <Badge variant="outline" className={`${color} text-[11px] shrink-0`} title={status === "verified" && family?.idVerifiedAt ? `Verified ${formatSubmittedDate(family.idVerifiedAt)}` : undefined}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

function formatSubmittedDate(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function CasesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const {
    data: families,
    isLoading: loadingFamilies,
    isError: familiesError,
    error: familiesQueryError,
    refetch: refetchFamilies,
  } = useQuery<FamilySummary[]>({
    queryKey: ["/api/admin/families"],
    enabled: isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: () => document.visibilityState === "visible" ? 30_000 : false,
  });

  const {
    data: allCertificates,
    isLoading: loadingCerts,
    isError: certificatesError,
    error: certificatesQueryError,
    refetch: refetchCertificates,
  } = useQuery<Certificate[]>({
    queryKey: ["/api/admin/all-certificates"],
    enabled: isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: () => document.visibilityState === "visible" ? 30_000 : false,
  });

  const { data: allAccounts, refetch: refetchAccounts } = useQuery<ConnectedAccount[]>({
    queryKey: ["/api/admin/all-accounts"],
    enabled: isAdmin,
  });

  const { data: inviteSummary, refetch: refetchInvitations } = useQuery<Record<string, InvitationSummary>>({
    queryKey: ["/api/admin/invitations-summary"],
    enabled: isAdmin,
  });

  const { toast } = useToast();
  const [resendingCert, setResendingCert] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const resendInvite = useMutation({
    mutationFn: async ({ certId, inviteId }: { certId: string; inviteId: string }) => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/resend-invite/${inviteId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Invitation re-sent", description: data.message || "The family invitation was sent again." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invitations-summary"] });
    },
    onError: (error: any) => {
      toast({ title: "Could not re-send invitation", description: error.message, variant: "destructive" });
    },
    onSettled: () => setResendingCert(null),
  });
  const handleResend = (certId: string, inviteId: string) => {
    setResendingCert(certId);
    resendInvite.mutate({ certId, inviteId });
  };
  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchCertificates(),
        refetchFamilies(),
        refetchAccounts(),
        refetchInvitations(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const familyLookup = useMemo(() => {
    if (!families) return {};
    const map: Record<string, FamilySummary> = {};
    families.forEach(f => {
      f.certificates.forEach(c => { map[c.id] = f; });
    });
    return map;
  }, [families]);

  const accountsByCert = useMemo(() => {
    if (!allAccounts) return {};
    const map: Record<string, ConnectedAccount[]> = {};
    allAccounts.forEach(a => {
      if (!map[a.certificateId]) map[a.certificateId] = [];
      map[a.certificateId].push(a);
    });
    return map;
  }, [allAccounts]);

  const filteredCerts = useMemo(() => {
    if (!allCertificates) return [];
    const query = searchQuery.trim().toLocaleLowerCase();
    return allCertificates
      .filter(c => {
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (query) {
          const family = familyLookup[c.id];
          const familyName = family?.familyName?.toLocaleLowerCase() || "";
          const familyEmail = family?.email?.toLocaleLowerCase() || "";
          return (
            c.deceasedName.toLocaleLowerCase().includes(query) ||
            c.certificateNumber?.toLocaleLowerCase().includes(query) ||
            familyName.includes(query) ||
            familyEmail.includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [allCertificates, statusFilter, searchQuery, familyLookup]);

  const stats = useMemo(() => {
    if (!allCertificates) return { total: 0, pending: 0, verified: 0, processing: 0, completed: 0 };
    return {
      total: allCertificates.length,
      pending: allCertificates.filter(c => c.status === "pending").length,
      verified: allCertificates.filter(c => c.status === "verified").length,
      processing: allCertificates.filter(c => c.status === "processing").length,
      completed: allCertificates.filter(c => c.status === "completed").length,
    };
  }, [allCertificates]);

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">This page is only available to concierge team members.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight" data-testid="text-page-title">All Cases</h1>
          <p className="text-muted-foreground mt-1">
            Death certificate cases and the family accounts supporting them
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refreshAll} disabled={refreshing} data-testid="button-refresh-cases">
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          <Link
            href="/add-deceased"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="button-add-deceased"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Deceased
          </Link>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mb-6">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Pending", value: stats.pending, color: "text-yellow-600" },
          { label: "Verified", value: stats.verified, color: "text-green-600" },
          { label: "Processing", value: stats.processing, color: "text-blue-600" },
          { label: "Completed", value: stats.completed, color: "text-emerald-600" },
        ].map(s => (
          <Card key={s.label} className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setStatusFilter(s.label === "Total" ? "all" : s.label.toLowerCase())}
            data-testid={`stat-${s.label.toLowerCase()}`}
          >
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{loadingCerts ? "—" : s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search family, email, deceased, or certificate number..."
            className="pl-9"
            data-testid="input-search-cases"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        {(searchQuery.trim() || statusFilter !== "all") && (
          <Button variant="ghost" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }} data-testid="button-clear-filters">
            Clear filters
          </Button>
        )}
        <div className="flex border rounded-md">
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-r-none"
            onClick={() => setViewMode("list")} data-testid="button-view-list">
            <List className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-l-none"
            onClick={() => setViewMode("grid")} data-testid="button-view-grid">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" data-testid="text-case-result-count">
          {loadingCerts ? "Loading cases…" : `${filteredCerts.length} of ${allCertificates?.length ?? 0} cases`}
        </p>
        <p className="text-muted-foreground" data-testid="text-case-current-status">
          Certificate status: <span className="font-medium text-foreground">{statusFilter === "all" ? "All statuses" : statusConfig[statusFilter]?.label || statusFilter}</span>
        </p>
      </div>

      {familiesError && !searchQuery.trim() && (
        <div className="mb-4 flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            Family account and identity details are temporarily unavailable. Identity status may appear unknown until refreshed.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchFamilies()}>Retry family data</Button>
        </div>
      )}

      {certificatesError ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-9 w-9 text-destructive mx-auto mb-3" />
            <p className="font-medium">Cases could not be loaded</p>
            <p className="text-sm text-muted-foreground mt-1">{(certificatesQueryError as Error)?.message || "Please try again."}</p>
            <Button variant="outline" className="mt-4" onClick={() => refetchCertificates()}>Retry cases</Button>
          </CardContent>
        </Card>
      ) : loadingCerts ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : searchQuery.trim() && loadingFamilies ? (
        <div className="space-y-3" aria-label="Loading family search data">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : searchQuery.trim() && familiesError ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-9 w-9 text-destructive mx-auto mb-3" />
            <p className="font-medium">Family search data could not be loaded</p>
            <p className="text-sm text-muted-foreground mt-1">{(familiesQueryError as Error)?.message || "Retry to search by family name or email."}</p>
            <Button variant="outline" className="mt-4" onClick={() => refetchFamilies()}>Retry family data</Button>
          </CardContent>
        </Card>
      ) : filteredCerts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery.trim() || statusFilter !== "all" ? "No cases match your filters." : "No cases found."}
            </p>
            {(searchQuery.trim() || statusFilter !== "all") && (
              <Button variant="ghost" className="mt-2 underline" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}>Reset filters</Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredCerts.map(cert => {
                const family = familyLookup[cert.id];
                const accts = accountsByCert[cert.id] || [];
                const closed = accts.filter(a => a.status === "closed" || a.status === "suspended").length;
                const progress = accts.length > 0 ? Math.round((closed / accts.length) * 100) : 0;
                const sc = statusConfig[cert.status] || statusConfig.pending;
                const StatusIcon = sc.icon;

                return (
                  <Link key={cert.id} href={`/admin/case/${cert.id}`}>
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                      data-testid={`case-row-${cert.id}`}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                        <FileCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold truncate" data-testid={`text-deceased-${cert.id}`}>Deceased: {cert.deceasedName}</p>
                          <Badge className={`${sc.color} text-xs shrink-0`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {sc.label}
                          </Badge>
                          <InviteBadge
                            certId={cert.id}
                            invite={inviteSummary?.[cert.id]}
                            onResend={handleResend}
                            resending={resendingCert === cert.id}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                          <span>Certificate #{cert.certificateNumber}</span>
                          {family && <span className="flex items-center gap-1"><UserCircle className="h-3 w-3" />Family account: {family.familyName || family.email}</span>}
                          {cert.dateOfDeath && <span>Date of death: {cert.dateOfDeath}</span>}
                          <span>Submitted: {formatSubmittedDate(cert.submittedAt)}</span>
                          <span className="flex items-center gap-1">{cert.documentUrl ? <FileUp className="h-3 w-3" /> : <FileCheck className="h-3 w-3" />}{cert.documentUrl ? "Document uploaded" : "Document not uploaded"}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <IdentityBadge family={family} />
                          {family?.idVerifiedAt && !family.idOverrideAt && (
                            <span className="text-[11px] text-muted-foreground">Verified {formatSubmittedDate(family.idVerifiedAt)}</span>
                          )}
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-4 shrink-0">
                        <div className="text-center w-16">
                          <p className="text-sm font-medium">{accts.length}</p>
                          <p className="text-[10px] text-muted-foreground">Accounts</p>
                        </div>
                        <div className="w-24">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCerts.map(cert => {
            const family = familyLookup[cert.id];
            const accts = accountsByCert[cert.id] || [];
            const closed = accts.filter(a => a.status === "closed" || a.status === "suspended").length;
            const progress = accts.length > 0 ? Math.round((closed / accts.length) * 100) : 0;
            const sc = statusConfig[cert.status] || statusConfig.pending;
            const StatusIcon = sc.icon;

            return (
              <Link key={cert.id} href={`/admin/case/${cert.id}`}>
                <Card className="hover:border-primary/50 transition-all cursor-pointer h-full" data-testid={`case-card-${cert.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate">Deceased: {cert.deceasedName}</CardTitle>
                      <Badge className={`${sc.color} text-xs shrink-0`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {sc.label}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Certificate #{cert.certificateNumber}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      {family ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                          <UserCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Family account: {family.familyName || family.email}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Family account unavailable</span>}
                      <InviteBadge
                        certId={cert.id}
                        invite={inviteSummary?.[cert.id]}
                        onResend={handleResend}
                        resending={resendingCert === cert.id}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <IdentityBadge family={family} />
                      <Badge variant="outline" className="text-[11px]">
                        {cert.documentUrl ? "Document uploaded" : "Document not uploaded"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Submitted: {formatSubmittedDate(cert.submittedAt)}</span>
                      {cert.dateOfDeath && <span>Date of death: {cert.dateOfDeath}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-sm font-medium">{accts.length}</p>
                        <p className="text-[10px] text-muted-foreground">Accounts</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-sm font-medium">{closed}</p>
                        <p className="text-[10px] text-muted-foreground">Closed</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <p className="text-sm font-medium">{progress}%</p>
                        <p className="text-[10px] text-muted-foreground">Progress</p>
                      </div>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
