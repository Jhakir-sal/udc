import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Shield, 
  FileCheck, 
  Users, 
  Bell, 
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  UserCircle,
  ChevronDown,
  Search,
  X,
  Loader2,
  Hash,
  User,
  CreditCard,
  Heart,
  Eye,
  Download,
  FileAudio,
  FileVideo,
  MessageSquareText,
  Info,
  ScanLine,
  FileSignature,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { familyRefreshOptions } from "@/lib/family-refresh";
import { FamilyUpdateStatus } from "@/components/family-update-status";
import { SERVICE_PLANS } from "@shared/schema";
import type { Certificate, ConnectedAccount, Notification } from "@shared/schema";
import { LegacyMessage } from "@/lib/legacy-messages-api";
import { isHeartPlanInvitationLateStage } from "@/lib/heartplan-invitation";
import { trackLivingHeartPlanMilestones } from "@/lib/analytics";
import { FamilyAuthorizations } from "@/components/family-authorizations";
import { FamilySharingPanel } from "@/components/family-sharing-panel";
import { accountActionIsComplete, aggregateCaseProgress } from "@shared/caseProgress";
import type { CaseProgress } from "@shared/caseProgress";

const conciergeRefreshOptions = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchInterval: 10000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;

interface OverdueItem {
  kind: string;
  id: string;
  certificateId: string;
  deceasedName: string;
  label: string;
  ageDays: number;
  severity: "yellow" | "red";
}

interface OverdueResponse {
  totalItems: number;
  totalCases: number;
  items: OverdueItem[];
}

interface ReportsSummary {
  cases: { total: number; byStatus: Record<string, number> };
  accounts: {
    total: number;
    byStatus: Record<string, number>;
    byTaskCompletion: Record<string, number>;
    avgDaysToCloseAccount: number | null;
  };
  governmentNotifications: { total: number; byStatus: Record<string, number> };
  creditProtection: { total: number; byStatus: Record<string, number> };
  payments: { paidCases: number; totalCollectedCents: number };
}

interface PlanStatus {
  eligible: boolean;
  hasPlan: boolean;
}

interface FamilyOnboardingStatus {
  complete: boolean;
  certificateId?: string | null;
  sharedMember?: boolean;
  idVerificationStatus: "not_started" | "pending" | "verified" | "failed";
  identitySource?: "stripe_verified" | "self_attested_provider_unavailable" | null;
  idVerificationFallbackAvailable?: boolean;
  lpoaSigned: boolean;
  lpoaReplacementRequired?: boolean;
  lpoa?: {
    signedAt: string;
    validUntil: string;
    principalName: string;
  } | null;
}

interface PlanOverview {
  plan: { id: string; status: string };
  progress: {
    completed: number;
    total: number;
    percent: number;
  };
}

interface OrsaMembership {
  orsaVerified: boolean;
  membershipType: "primary" | "shared" | "sponsored" | null;
  caseServiceExempt: boolean;
}

interface FamilySummary {
  userId: string;
  familyName: string;
  email: string;
  idVerified: boolean;
  lpoaSigned: boolean;
  certificates: Certificate[];
  totalAccounts: number;
  totalNotifications: number;
  pendingActions: number;
  completedActions: number;
  progress?: CaseProgress;
  progressByCase?: Record<string, CaseProgress>;
}

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend,
  loading,
  testId
}: { 
  title: string; 
  value: string | number; 
  description: string; 
  icon: React.ElementType;
  trend?: string;
  loading?: boolean;
  testId?: string;
}) {
  if (loading) {
    return (
      <Card data-testid={testId ? `${testId}-loading` : undefined}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={testId ? `${testId}-value` : undefined}>{value}</div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">{description}</p>
          {trend && (
            <Badge variant="secondary" className="text-xs" data-testid={testId ? `${testId}-trend` : undefined}>
              <TrendingUp className="h-3 w-3 mr-1" />
              {trend}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentCertificateCard({ certificate, showFamily, isAdmin }: { certificate: Certificate; showFamily?: string; isAdmin?: boolean }) {
  const statusColors = {
    pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    verified: "bg-green-500/10 text-green-700 dark:text-green-400",
    processing: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  };

  const statusIcons = {
    pending: Clock,
    verified: CheckCircle2,
    processing: AlertCircle,
    completed: CheckCircle2
  };

  const StatusIcon = statusIcons[certificate.status];

  return (
    <div 
      className="flex flex-col items-stretch justify-between gap-3 p-4 rounded-lg bg-muted/50 hover-elevate transition-all duration-200 sm:flex-row sm:items-center"
      data-testid={`certificate-card-${certificate.id}`}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <FileCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium" data-testid={`text-deceased-name-${certificate.id}`}>{certificate.deceasedName}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground" data-testid={`text-certificate-number-${certificate.id}`}>
              Certificate #{certificate.certificateNumber}
            </p>
            {showFamily && (
              <Badge variant="outline" className="text-xs">
                <UserCircle className="h-3 w-3 mr-1" />
                {showFamily}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge className={statusColors[certificate.status]} data-testid={`badge-status-${certificate.id}`}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {certificate.status.charAt(0).toUpperCase() + certificate.status.slice(1)}
        </Badge>
        {!isAdmin && certificate.documentUrl && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => window.open(certificate.documentUrl!, "_blank")}
              data-testid={`button-view-document-${certificate.id}`}
            >
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={() => {
                const a = document.createElement("a");
                a.href = certificate.documentUrl!;
                a.download = `death-certificate-${certificate.certificateNumber || certificate.id}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              data-testid={`button-download-document-${certificate.id}`}
              aria-label="Download certificate"
            >
              <Download className="h-4 w-4" />
            </Button>
          </>
        )}
        <Link href={isAdmin ? `/admin/case/${certificate.id}` : `/accounts?certificate=${certificate.id}`}>
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11" data-testid={`button-view-certificate-${certificate.id}`}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function RecentActivityItem({ notification }: { notification: Notification }) {
  const typeIcons = {
    certificate_uploaded: FileCheck,
    account_notified: Bell,
    action_taken: CheckCircle2,
    verification_complete: Shield
  };

  const Icon = typeIcons[notification.type as keyof typeof typeIcons] || Bell;

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
        <Icon className="h-4 w-4 text-accent-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(notification.sentAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </div>
    </div>
  );
}

interface FamilyLegacyMessage extends LegacyMessage {
  deceasedName: string;
  certificateId: string;
}

interface FamilyLegacyMessageGroup {
  certificateId: string;
  deceasedName: string;
  messages: LegacyMessage[];
}

function FamilyLegacyMessagesInbox() {
  const endpoint = "/api/family/legacy-messages";
  const { data: messages, isLoading } = useQuery<FamilyLegacyMessage[]>({
    queryKey: [endpoint],
    queryFn: async () => {
      const response = await fetch(endpoint, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load Legacy Messages");
      const groups = await response.json() as FamilyLegacyMessageGroup[];
      return groups.flatMap((group) => group.messages.map((message) => ({
        ...message,
        certificateId: group.certificateId,
        deceasedName: group.deceasedName,
      })));
    },
  });

  if (isLoading) {
    return <Card data-testid="card-legacy-messages"><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>;
  }
  if (!messages?.length) return null;

  const messagesByDeceased = messages.reduce((groups, message) => {
    const deceasedName = message.deceasedName || "Your loved one";
    (groups[deceasedName] ||= []).push(message);
    return groups;
  }, {} as Record<string, FamilyLegacyMessage[]>);

  return (
    <Card data-testid="card-legacy-messages">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          Legacy Messages
        </CardTitle>
        <CardDescription>Private messages shared with you after plan activation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(messagesByDeceased).map(([deceasedName, deceasedMessages]) => (
          <section key={deceasedName} className="space-y-3" aria-label={`Legacy Messages from ${deceasedName}`}>
            <h3 className="font-medium text-sm">From {deceasedName}</h3>
            {deceasedMessages.map((message) => {
              const mediaType = message.messageType === "audio" || message.messageType === "video" ? message.messageType : null;
              const streamUrl = `/api/family/legacy-messages/${message.id}/stream`;
              return (
                <article key={message.id} className="rounded-md border p-4 space-y-3" data-testid={`family-legacy-message-${message.id}`}>
                  <div className="flex items-center gap-2">
                    {mediaType === "video" ? <FileVideo className="h-4 w-4 text-muted-foreground" /> : mediaType === "audio" ? <FileAudio className="h-4 w-4 text-muted-foreground" /> : <MessageSquareText className="h-4 w-4 text-muted-foreground" />}
                    <p className="font-medium text-sm">{message.subject || `A message for ${message.recipientName}`}</p>
                  </div>
                  {message.body && <p className="text-sm whitespace-pre-wrap">{message.body}</p>}
                  {mediaType === "audio" && (
                    <audio controls preload="metadata" className="w-full" src={streamUrl} aria-label={`Audio Legacy Message from ${deceasedName}: ${message.subject || `for ${message.recipientName}`}`} data-testid={`family-audio-message-${message.id}`} />
                  )}
                  {mediaType === "video" && (
                    <video controls preload="metadata" className="w-full max-h-96 rounded-md bg-black" src={streamUrl} aria-label={`Video Legacy Message from ${deceasedName}: ${message.subject || `for ${message.recipientName}`}`} data-testid={`family-video-message-${message.id}`} />
                  )}
                  {message.transcript && (
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Transcript</p>
                      <p className="text-sm whitespace-pre-wrap">{message.transcript}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function FamilyCard({ family, isSelected, onSelect }: { family: FamilySummary; isSelected: boolean; onSelect: () => void }) {
  const progress = family.progress;
  const deceasedNames = family.certificates.map(c => c.deceasedName).join(', ');
  const relationship = family.certificates.map(c => c.submitterRelationship).find(Boolean);

  return (
    <Card 
      className={`cursor-pointer transition-all duration-200 hover-elevate ${isSelected ? 'ring-2 ring-primary border-primary' : ''}`}
      onClick={onSelect}
      data-testid={`family-card-${family.userId}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate" data-testid={`text-family-name-${family.userId}`}>
              {deceasedNames || 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {family.familyName || family.email}
              {relationship ? ` (${relationship})` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <Badge
            variant={family.idVerified ? 'default' : 'secondary'}
            className="text-xs"
            data-testid={`badge-id-verified-${family.userId}`}
          >
            {family.idVerified ? 'ID Verified' : 'ID Not Verified'}
          </Badge>
          <Badge
            variant={family.lpoaSigned ? 'default' : 'secondary'}
            className="text-xs"
            data-testid={`badge-lpoa-${family.userId}`}
          >
            {family.lpoaSigned ? 'LPOA Signed' : 'LPOA Pending'}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Family contact</span>
            <span className="font-medium truncate max-w-[60%]">{family.familyName || family.email}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Accounts</span>
            <span className="font-medium">{family.totalAccounts}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Case progress</span>
            <span className="font-medium">{progress ? `${progress.percent}%` : "Unavailable"}</span>
          </div>
          {progress ? (
            <>
              <Progress value={progress.percent} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                Workflow {progress.workflowCompleted}/{progress.workflowTotal}
                {" · "}Account actions {progress.accountsCompleted}/{progress.accountsTotal}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Case progress data unavailable</p>
          )}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {family.certificates.map(c => (
            <Link key={c.id} href={`/admin/case/${c.id}`} onClick={(e: any) => e.stopPropagation()}>
              <Badge 
                variant={c.status === 'verified' ? 'default' : 'secondary'}
                className="text-xs cursor-pointer hover:opacity-80"
                data-testid={`link-case-${c.id}`}
              >
                {c.deceasedName} — {c.status}
              </Badge>
            </Link>
          ))}
          {family.pendingActions > 0 && (
            <Badge variant="destructive" className="text-xs">
              {family.pendingActions} pending
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminSearchBar() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"name" | "certificate_number" | "ssn" | "registration_reference">("name");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Certificate[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setIsOpen(false);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&type=${searchType}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch {
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, searchType]);

  const typeLabels = { name: "Deceased Name", certificate_number: "Certificate #", ssn: "SSN (Last 4)", registration_reference: "Account registration" };
  const typeIcons = { name: User, certificate_number: Hash, ssn: Shield, registration_reference: Hash };
  const TypeIcon = typeIcons[searchType];

  return (
    <div ref={searchRef} className="relative w-full" data-testid="admin-search-container">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results && results.length > 0 && setIsOpen(true)}
            placeholder={`Search by ${typeLabels[searchType].toLowerCase()}...`}
            className="pl-9 pr-10"
            data-testid="input-admin-search"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults(null); setIsOpen(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={searchType} onValueChange={(v) => setSearchType(v as typeof searchType)}>
          <SelectTrigger className="w-[180px]" data-testid="select-search-type">
            <TypeIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name" data-testid="search-type-name">Deceased Name</SelectItem>
            <SelectItem value="certificate_number" data-testid="search-type-cert">Certificate #</SelectItem>
            <SelectItem value="registration_reference" data-testid="search-type-registration">Account registration</SelectItem>
            <SelectItem value="ssn" data-testid="search-type-ssn">SSN (Last 4)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto" data-testid="search-results-dropdown">
          {isSearching ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : results && results.length > 0 ? (
            <div>
              <div className="px-3 py-2 text-xs text-muted-foreground border-b">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </div>
              {results.map((cert) => (
                <button
                  key={cert.id}
                  className="w-full text-left px-3 py-3 hover:bg-muted/50 border-b last:border-0 flex items-center gap-3 transition-colors"
                  onClick={() => { navigate(`/admin/case/${cert.id}`); setIsOpen(false); }}
                  data-testid={`search-result-${cert.id}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <FileCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cert.deceasedName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Cert #{cert.certificateNumber}</span>
                      {cert.placeOfDeathState && <span>· {cert.placeOfDeathState}</span>}
                      {cert.dateOfDeath && <span>· DOD: {cert.dateOfDeath}</span>}
                    </div>
                  </div>
                  <Badge
                    variant={cert.status === "verified" ? "default" : "secondary"}
                    className="text-xs shrink-0"
                  >
                    {cert.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          ) : results && results.length === 0 ? (
            <div className="p-6 text-center">
              <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No results found for "{query}"</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search term or type</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const FIRST_VISIT_GREETING = {
  title: (name?: string | null) => name ? `Welcome, ${name}` : "Welcome",
  subtitle: "We are sorry for your loss. We will guide you through the next steps, one at a time.",
};

const RETURNING_GREETING = {
  title: (name?: string | null) => name ? `Welcome back, ${name}` : "Welcome back",
  subtitle: "Here is the latest on your case.",
};

function useFamilyGreeting(userId?: string) {
  return useMemo(() => {
    const key = userId ? `sal-visits-${userId}` : "sal-visits";
    let visits = 0;
    try {
      visits = parseInt(sessionStorage.getItem("sal-greet-lock") || "") || 0;
      if (!visits) {
        visits = (parseInt(localStorage.getItem(key) || "0") || 0) + 1;
        localStorage.setItem(key, String(visits));
        sessionStorage.setItem("sal-greet-lock", String(visits));
      }
    } catch {
      visits = 1;
    }
    if (visits <= 1) return FIRST_VISIT_GREETING;
    return RETURNING_GREETING;
  }, [userId]);
}

export default function Dashboard() {
  const [selectedFamily, setSelectedFamily] = useState<string>("all");
  const [selectedCase, setSelectedCase] = useState<string>(() => {
    try { return localStorage.getItem("sal-selected-case") || "all"; } catch { return "all"; }
  });
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  // Only family accounts get the plan-ahead invitation — never admins or funeral homes
  const isFamilyUser = user?.role === "user";
  const greeting = useFamilyGreeting(user?.id);

  const [planCardDismissed] = useState(() => {
    try {
      return user?.id ? localStorage.getItem(`sal-plan-ahead-dismissed-${user.id}`) === "1" : false;
    } catch {
      return false;
    }
  });

  const { data: planStatus } = useQuery<PlanStatus>({
    queryKey: ["/api/heartplan/status"],
    enabled: isFamilyUser,
  });

  const { data: familyOnboardingStatus, isLoading: loadingFamilyOnboardingStatus } = useQuery<FamilyOnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    enabled: isFamilyUser,
    ...familyRefreshOptions,
  });

  const { data: planOverview } = useQuery<PlanOverview>({
    queryKey: ["/api/heartplan"],
    enabled: isFamilyUser && !!planStatus?.hasPlan,
  });

  useEffect(() => {
    if (!planOverview) return;
    trackLivingHeartPlanMilestones(
      planOverview.plan.id,
      planOverview.plan.status,
      planOverview.progress.percent,
    );
  }, [
    planOverview?.plan.id,
    planOverview?.plan.status,
    planOverview?.progress.percent,
  ]);

  const {
    data: orsaMembership,
    isPending: isOrsaMembershipPending,
  } = useQuery<OrsaMembership>({
    queryKey: ["/api/orsa/membership"],
    enabled: isFamilyUser,
    retry: 1,
  });

  const selectCase = (id: string) => {
    setSelectedCase(id);
    try { localStorage.setItem("sal-selected-case", id); } catch {}
  };

  const { data: overdueData } = useQuery<OverdueResponse>({
    queryKey: ["/api/admin/overdue"],
    enabled: isAdmin,
  });

  const { data: reportsSummary } = useQuery<ReportsSummary>({
    queryKey: ["/api/admin/reports/summary"],
    enabled: isAdmin,
  });

  const { data: families, isLoading: loadingFamilies } = useQuery<FamilySummary[]>({
    queryKey: ["/api/admin/families"],
    enabled: isAdmin,
    ...conciergeRefreshOptions,
  });

  const certsEndpoint = isAdmin
    ? selectedFamily === "all"
      ? "/api/admin/all-certificates"
      : `/api/admin/family/${selectedFamily}/certificates`
    : "/api/certificates";

  const acctsEndpoint = isAdmin
    ? selectedFamily === "all"
      ? "/api/admin/all-accounts"
      : `/api/admin/family/${selectedFamily}/accounts`
    : "/api/accounts";

  const notifsEndpoint = isAdmin
    ? selectedFamily === "all"
      ? "/api/admin/all-notifications"
      : `/api/admin/family/${selectedFamily}/notifications`
    : "/api/notifications";

  const certificateQuery = useQuery<Certificate[]>({
    queryKey: [certsEndpoint, selectedFamily],
    ...(!isAdmin ? familyRefreshOptions : conciergeRefreshOptions),
    queryFn: async () => {
      const res = await fetch(certsEndpoint, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const accountQuery = useQuery<ConnectedAccount[]>({
    queryKey: [acctsEndpoint, selectedFamily],
    ...(!isAdmin ? familyRefreshOptions : conciergeRefreshOptions),
    queryFn: async () => {
      const res = await fetch(acctsEndpoint, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const notificationQuery = useQuery<Notification[]>({
    queryKey: [notifsEndpoint, selectedFamily],
    ...(!isAdmin ? familyRefreshOptions : {}),
    queryFn: async () => {
      const res = await fetch(notifsEndpoint, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const { data: certificates, isLoading: loadingCerts } = certificateQuery;
  const { data: accounts, isLoading: loadingAccounts } = accountQuery;
  const { data: notifications, isLoading: loadingNotifications } = notificationQuery;

  const hasMultipleCases = !isAdmin && (certificates?.length || 0) > 1;
  const caseFilterActive = !isAdmin && selectedCase !== "all" && certificates?.some(c => c.id === selectedCase);
  const visibleCertificates = caseFilterActive
    ? (certificates || []).filter(c => c.id === selectedCase)
    : (certificates || []);
  const visibleCertIds = new Set(visibleCertificates.map(c => c.id));
  const visibleAccounts = !isAdmin
    ? (accounts || []).filter(a => visibleCertIds.has(a.certificateId))
    : (accounts || []);
  const visibleNotifications = !isAdmin
    ? (notifications || []).filter(n => !n.certificateId || visibleCertIds.has(n.certificateId))
    : (notifications || []);

  const pendingActions = visibleAccounts.filter(a => a.status === "pending_action").length || 0;
  const completedActions = visibleAccounts.filter(accountActionIsComplete).length || 0;
  const totalAccounts = visibleAccounts.length || 0;
  const progressPercent = totalAccounts > 0 ? Math.round((completedActions / totalAccounts) * 100) : 0;
  const visibleAdminProgress = isAdmin && families
    ? visibleCertificates.map(c => families.find(f => f.certificates.some(fc => fc.id === c.id))?.progressByCase?.[c.id])
    : [];
  const adminProgressAvailable = isAdmin && !!families && visibleAdminProgress.length > 0
    && visibleAdminProgress.every((progress): progress is CaseProgress => !!progress);
  const adminCaseProgress = adminProgressAvailable
    ? aggregateCaseProgress(visibleAdminProgress as CaseProgress[])
    : undefined;
  const showQuietHeartPlanInvitation =
    isFamilyUser &&
    !!planStatus?.eligible &&
    !planStatus.hasPlan &&
    !planCardDismissed &&
    isHeartPlanInvitationLateStage(certificates || [], accounts || []);

  const sortedCertificates = [...visibleCertificates].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
  const recentCertificates = sortedCertificates.slice(0, 5);
  const recentNotifications = visibleNotifications.slice(0, 5) || [];

  const checkoutMutation = useMutation({
    mutationFn: async (certificateId: string) => {
      const res = await apiRequest("POST", "/api/payment/checkout", { certificateId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      toast({ title: "Unable to start payment", description: err?.message, variant: "destructive" });
    },
  });

  const certsAwaitingPayment = !isAdmin
    ? visibleCertificates.filter(
        c => c.servicePlan && c.paymentStatus !== "paid"
      )
    : [];

  const selectedFamilyData = families?.find(f => f.userId === selectedFamily);
  const familyLookup = families?.reduce((acc, f) => {
    f.certificates.forEach(c => { acc[c.id] = f.familyName; });
    return acc;
  }, {} as Record<string, string>);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {!isAdmin && isFamilyUser && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4" data-testid="family-access-dashboard-link">
        <div><p className="font-medium">Case member access checks</p><p className="text-sm text-muted-foreground">Review ID verification and sharing-grant status for each case you’ve been invited to.</p></div>
        <Link href="/family-access" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="link-family-access-checklist">View checklist</Link>
      </div>}
      {!isAdmin && visibleCertificates.filter(c => c.userId === user?.id).map(c => <div key={c.id} className="mb-5 space-y-4"><FamilySharingPanel certificateId={c.id} /><FamilyAuthorizations certificateId={c.id} mode="owner" /></div>)}
      <div className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-serif font-semibold tracking-tight" data-testid="text-dashboard-greeting">
              {isAdmin ? "Concierge Dashboard" : greeting.title(user?.firstName)}
            </h1>
            {!isAdmin && (
              <FamilyUpdateStatus
                className="mt-3"
                queries={[certificateQuery, accountQuery, notificationQuery]}
              />
            )}
            <p className="text-muted-foreground mt-1" data-testid="text-dashboard-subtitle">
              {isAdmin
                ? selectedFamily === "all"
                  ? `Managing ${families?.length || 0} families across the platform`
                  : `Viewing ${selectedFamilyData?.certificates.map(c => c.deceasedName).join(', ') || 'case'} — contact: ${selectedFamilyData?.familyName || selectedFamilyData?.email || 'family'}`
                : visibleCertificates.length > 0
                  ? `${greeting.subtitle} We're taking care of ${visibleCertificates.length === 1 ? `${visibleCertificates[0].deceasedName}'s` : "your loved ones'"} affairs.`
                  : `${greeting.subtitle} When you're ready, upload a death certificate and we'll handle the rest.`}
            </p>
          </div>
          <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
            {showQuietHeartPlanInvitation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-muted-foreground hover:text-primary"
                    aria-label="Learn about planning ahead with HeartPlan"
                    data-testid="button-heartplan-info"
                    asChild
                  >
                    <Link href="/heartplan">
                      <Heart className="h-4 w-4" />
                      <Info className="-ml-1 -mt-3 h-2.5 w-2.5 fill-background" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Learn about planning ahead with HeartPlan</p>
                </TooltipContent>
              </Tooltip>
            )}
            {hasMultipleCases && (
              <Select value={caseFilterActive ? selectedCase : "all"} onValueChange={selectCase} data-testid="select-case">
                <SelectTrigger className="w-[calc(100vw-6.5rem)] sm:w-[260px]" data-testid="select-case-trigger">
                  <Heart className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Select a loved one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-case-all">
                    All loved ones ({certificates?.length || 0})
                  </SelectItem>
                  {certificates?.map(c => (
                    <SelectItem key={c.id} value={c.id} data-testid={`select-case-${c.id}`}>
                      {c.deceasedName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isAdmin && families && families.length > 0 && (
              <Select value={selectedFamily} onValueChange={setSelectedFamily} data-testid="select-family">
                <SelectTrigger className="w-[260px]" data-testid="select-family-trigger">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Select family" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-family-all">
                    All Families ({families.length})
                  </SelectItem>
                  {families.map(f => (
                    <SelectItem key={f.userId} value={f.userId} data-testid={`select-family-${f.userId}`}>
                      {f.certificates[0]?.deceasedName || f.familyName || f.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="mt-4">
            <AdminSearchBar />
          </div>
        )}
      </div>

      {!isAdmin && !loadingCerts && visibleCertificates.length === 0 && (
        <Card className="mb-6 border-primary/30 bg-primary/5" data-testid="card-certificate-first-step">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <ScanLine className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <Badge variant="secondary" className="mb-2">First step</Badge>
                  <h2 className="text-lg font-semibold">Upload the death certificate</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We’ll securely read the certificate and fill in the official details with OCR, so you can review instead of retyping them.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    If our team already started your case, ask them for a case invitation instead of creating a duplicate.
                  </p>
                </div>
              </div>
              <Button asChild className="w-full shrink-0 sm:w-auto" data-testid="button-start-certificate-upload">
                <Link href="/upload">
                  <FileCheck className="mr-2 h-4 w-4" />
                  Upload certificate
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isFamilyUser &&
        !loadingFamilyOnboardingStatus &&
        !familyOnboardingStatus?.sharedMember &&
        !!familyOnboardingStatus?.certificateId &&
        (!familyOnboardingStatus?.lpoaSigned || familyOnboardingStatus?.lpoaReplacementRequired) && (
          <Card className="mb-6 border-amber-300 bg-amber-50" data-testid="card-lpoa-action-required">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                    <FileSignature className="h-6 w-6" />
                  </div>
                  <div>
                    <Badge variant="outline" className="mb-2 border-amber-400 bg-white text-amber-900">
                      Action required
                    </Badge>
                    <h2 className="text-lg font-semibold text-amber-950">
                      {familyOnboardingStatus?.lpoaReplacementRequired
                        ? "Correct your Limited Power of Attorney"
                        : "Complete your Limited Power of Attorney"}
                    </h2>
                    <p className="mt-1 text-sm text-amber-900">
                      Your authorization is not complete. Review your legal name and sign so the concierge team can act on your behalf.
                    </p>
                  </div>
                </div>
                <Button asChild className="w-full shrink-0 sm:w-auto" data-testid="button-complete-lpoa">
                  <Link href="/onboarding">
                    Complete authorization
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      {isFamilyUser && (
        <Card className="mb-6" data-testid="card-family-identity-status">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Identity & authorization</CardTitle>
            <CardDescription>Your verification and Limited Power of Attorney status.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingFamilyOnboardingStatus ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : familyOnboardingStatus?.sharedMember ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-4"><p className="font-medium">Shared family access</p><p className="mt-1 text-sm text-muted-foreground">Your access to this case is active.</p></div>
                <div className="rounded-lg border p-4"><p className="font-medium">Case owner authorization complete</p><p className="mt-1 text-sm text-muted-foreground">The case owner manages identity verification and legal authorization.</p></div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-lg border p-4" data-testid="status-family-id-verification">
                  <div className={`rounded-full p-2 ${familyOnboardingStatus?.idVerificationStatus === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Identity verification</p>
                      <Badge variant={familyOnboardingStatus?.idVerificationStatus === "verified" ? "secondary" : "outline"}>
                        {familyOnboardingStatus?.idVerificationStatus === "verified"
                          ? "ID verified"
                          : familyOnboardingStatus?.identitySource === "self_attested_provider_unavailable"
                            ? "Identity attested"
                            : familyOnboardingStatus?.idVerificationStatus === "failed"
                              ? "ID check unsuccessful"
                              : familyOnboardingStatus?.idVerificationFallbackAvailable
                                ? "Alternate review available"
                            : familyOnboardingStatus?.idVerificationStatus === "pending"
                              ? "Checking"
                              : "Not verified"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {familyOnboardingStatus?.idVerificationStatus === "verified"
                        ? "Your government ID check is complete."
                        : familyOnboardingStatus?.identitySource === "self_attested_provider_unavailable"
                          ? "Your identity was recorded through the approved fallback process."
                          : familyOnboardingStatus?.idVerificationStatus === "failed"
                            ? "Your government ID was not verified. Continue with legal-name attestation for concierge review."
                            : familyOnboardingStatus?.idVerificationFallbackAvailable
                              ? "The ID check is unavailable. Continue with legal-name attestation."
                          : "Your government ID check is not complete."}
                    </p>
                    {!!familyOnboardingStatus?.certificateId && familyOnboardingStatus?.idVerificationFallbackAvailable &&
                      familyOnboardingStatus?.identitySource !== "self_attested_provider_unavailable" && (
                        <Button asChild size="sm" className="mt-3" data-testid="button-continue-identity-attestation">
                          <Link href="/onboarding">Continue authorization</Link>
                        </Button>
                      )}
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-4" data-testid="status-family-lpoa">
                  <div className={`rounded-full p-2 ${familyOnboardingStatus?.lpoaSigned && !familyOnboardingStatus?.lpoaReplacementRequired ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                    <FileSignature className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Limited Power of Attorney</p>
                      <Badge variant={familyOnboardingStatus?.lpoaSigned && !familyOnboardingStatus?.lpoaReplacementRequired ? "secondary" : "outline"}>
                        {!familyOnboardingStatus?.certificateId ? "After case setup" : familyOnboardingStatus?.lpoaSigned && !familyOnboardingStatus?.lpoaReplacementRequired ? "Completed" : "Action needed"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {!familyOnboardingStatus?.certificateId
                        ? "Upload a death certificate or accept your team's case invitation first. Then you can sign this case-specific authorization."
                        : familyOnboardingStatus?.lpoaSigned && familyOnboardingStatus.lpoa
                        ? `Signed ${new Date(familyOnboardingStatus.lpoa.signedAt).toLocaleDateString()} · Valid through ${new Date(familyOnboardingStatus.lpoa.validUntil).toLocaleDateString()}`
                        : familyOnboardingStatus?.lpoaReplacementRequired
                          ? "A corrected authorization is required."
                          : "Your authorization has not been completed."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isAdmin && certsAwaitingPayment.length > 0 && !isOrsaMembershipPending && (
        <div className="mb-6 space-y-3">
          {certsAwaitingPayment.map(cert => {
            const plan = SERVICE_PLANS.find(p => p.value === cert.servicePlan);
            if (!plan) return null;
            if (orsaMembership?.caseServiceExempt === true) {
              return (
                <Card key={cert.id} className="border-primary/30 bg-primary/5" data-testid={`banner-orsa-covered-${cert.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid={`text-orsa-covered-title-${cert.id}`}>
                          Service plan covered by ORSA
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your active ORSA membership includes concierge services for {cert.deceasedName}. No service-plan payment is due.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return (
              <Card key={cert.id} className="border-primary/30 bg-primary/5" data-testid={`banner-payment-${cert.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid={`text-payment-title-${cert.id}`}>
                          Payment due — {plan.label} Service Plan ({plan.display})
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Concierge services for {cert.deceasedName}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => checkoutMutation.mutate(cert.id)}
                      disabled={checkoutMutation.isPending}
                      data-testid={`button-pay-${cert.id}`}
                    >
                      {checkoutMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                      )}
                      Pay {plan.display}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isFamilyUser && planStatus?.hasPlan && (
        <Card className="mb-6" data-testid="card-heartplan-progress">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  <Heart className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium" data-testid="text-heartplan-progress-title">Your HeartPlan</p>
                  {planOverview ? (
                    <div className="flex items-center gap-3 mt-1.5">
                      <Progress value={planOverview.progress.percent} className="h-1.5 w-40" />
                      <p className="text-xs text-muted-foreground" data-testid="text-heartplan-progress-summary">
                        {planOverview.progress.completed} of {planOverview.progress.total} sections complete
                      </p>
                    </div>
                  ) : (
                    <Skeleton className="h-3 w-48 mt-1.5" />
                  )}
                </div>
              </div>
              <Link href="/heartplan">
                <Button variant="outline" size="sm" data-testid="button-continue-heartplan">
                  Continue planning
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {isFamilyUser && (
        <section className="mb-8 space-y-4" aria-label="Legacy Messages">
          <FamilyLegacyMessagesInbox />
        </section>
      )}

      {isAdmin && selectedFamily === "all" && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Families</h2>
            <Badge variant="secondary" data-testid="badge-family-count">
              {families?.length || 0} active families
            </Badge>
          </div>
          {loadingFamilies ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {families?.map(fam => (
                <FamilyCard
                  key={fam.userId}
                  family={fam}
                  isSelected={selectedFamily === fam.userId}
                  onSelect={() => setSelectedFamily(fam.userId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {isAdmin && selectedFamily !== "all" && selectedFamilyData && (
        <div className="mb-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <UserCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">
                      {selectedFamilyData.certificates.map(c => c.deceasedName).join(', ') || selectedFamilyData.familyName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Contact: {selectedFamilyData.familyName || selectedFamilyData.email} — {selectedFamilyData.email}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant={selectedFamilyData.idVerified ? 'default' : 'secondary'} className="text-xs">
                      {selectedFamilyData.idVerified ? 'ID Verified' : 'ID Not Verified'}
                    </Badge>
                    <Badge variant={selectedFamilyData.lpoaSigned ? 'default' : 'secondary'} className="text-xs">
                      {selectedFamilyData.lpoaSigned ? 'LPOA Signed' : 'LPOA Pending'}
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedFamily("all")} data-testid="button-back-to-all">
                  Back to All Families
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title={isAdmin && selectedFamily === "all" ? "Total Certificates" : "Certificates"}
          value={visibleCertificates.length || 0}
          description="Death certificates processed"
          icon={FileCheck}
          loading={loadingCerts}
          testId="stat-total-certificates"
        />
        <StatCard
          title="Connected Accounts"
          value={totalAccounts}
          description="Services being managed"
          icon={Users}
          loading={loadingAccounts}
          testId="stat-connected-accounts"
        />
        <StatCard
          title="Pending Actions"
          value={pendingActions}
          description="Accounts awaiting decision"
          icon={Clock}
          loading={loadingAccounts}
          testId="stat-pending-actions"
        />
        <StatCard
          title="Notifications Sent"
          value={visibleNotifications.length || 0}
          description="Service providers notified"
          icon={Bell}
          loading={loadingNotifications}
          testId="stat-notifications-sent"
        />
      </div>

      {isAdmin && selectedFamily === "all" && (
        <div className="grid gap-4 lg:grid-cols-2 mb-8">
          <Card data-testid="card-overdue">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  Needs Attention
                </CardTitle>
                {overdueData && overdueData.totalItems > 0 && (
                  <Badge variant="destructive" data-testid="badge-overdue-count">
                    {overdueData.totalItems} overdue
                  </Badge>
                )}
              </div>
              <CardDescription>
                Items pending more than 7 days {overdueData?.totalCases ? `across ${overdueData.totalCases} case${overdueData.totalCases > 1 ? "s" : ""}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!overdueData ? (
                <Skeleton className="h-24" />
              ) : overdueData.items.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-70" />
                  <p className="text-sm" data-testid="text-no-overdue">Nothing overdue — all cases are on track.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {overdueData.items.slice(0, 12).map(item => (
                    <Link key={`${item.kind}-${item.id}`} href={`/admin/case/${item.certificateId}`}>
                      <div className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer" data-testid={`overdue-item-${item.id}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.deceasedName}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                        </div>
                        <Badge className={`shrink-0 text-xs ${item.severity === "red" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"}`}>
                          {item.ageDays}d
                        </Badge>
                      </div>
                    </Link>
                  ))}
                  {overdueData.items.length > 12 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      +{overdueData.items.length - 12} more overdue items
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-ops-report">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Operations Report
              </CardTitle>
              <CardDescription>Platform-wide performance summary</CardDescription>
            </CardHeader>
            <CardContent>
              {!reportsSummary ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xl font-bold" data-testid="text-report-open-cases">
                      {(reportsSummary.cases.byStatus.pending || 0) + (reportsSummary.cases.byStatus.verified || 0) + (reportsSummary.cases.byStatus.processing || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Open cases ({reportsSummary.cases.byStatus.completed || 0} completed)</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xl font-bold" data-testid="text-report-avg-close">
                      {reportsSummary.accounts.avgDaysToCloseAccount !== null ? `${reportsSummary.accounts.avgDaysToCloseAccount}d` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg. days to close an account</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xl font-bold" data-testid="text-report-accounts-closed">
                      {(reportsSummary.accounts.byStatus.closed || 0) + (reportsSummary.accounts.byStatus.suspended || 0)}
                      <span className="text-sm font-normal text-muted-foreground">/{reportsSummary.accounts.total}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Accounts closed or suspended</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xl font-bold" data-testid="text-report-collected">
                      ${(reportsSummary.payments.totalCollectedCents / 100).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Collected from {reportsSummary.payments.paidCases} paid case{reportsSummary.payments.paidCases === 1 ? "" : "s"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Recent Certificates</CardTitle>
              <CardDescription>
                {isAdmin && selectedFamily === "all"
                  ? "All certificates across families"
                  : "Latest death certificates uploaded to the platform"}
              </CardDescription>
            </div>
            {!isAdmin && (certificates?.length || 0) === 0 && (
              <Link href="/upload">
                <Button data-testid="button-upload-new">
                  <FileCheck className="h-4 w-4 mr-2" />
                  Upload New
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {loadingCerts ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : recentCertificates.length > 0 ? (
              <div className="space-y-3">
                {recentCertificates.map(cert => (
                  <RecentCertificateCard 
                    key={cert.id} 
                    certificate={cert}
                    showFamily={isAdmin && selectedFamily === "all" ? familyLookup?.[cert.id] : undefined}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
                  <FileCheck className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">No certificates uploaded yet</p>
                {!isAdmin && (
                  <Link href="/upload">
                    <Button data-testid="button-upload-first">
                      Upload Your First Certificate
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isAdmin ? "Case Progress" : "Progress Overview"}</CardTitle>
            <CardDescription>{isAdmin ? "Workflow and account-action completion across visible cases" : "Account management completion"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{isAdmin ? "Overall case progress" : "Overall Progress"}</span>
                  <span className="text-sm text-muted-foreground">
                    {isAdmin ? adminCaseProgress ? `${adminCaseProgress.percent}%` : loadingFamilies ? "Loading…" : "Unavailable" : `${progressPercent}%`}
                  </span>
                </div>
                {(!isAdmin || adminCaseProgress) && (
                  <Progress value={isAdmin ? adminCaseProgress!.percent : progressPercent} className="h-2" />
                )}
              </div>

              {isAdmin ? (
                <div className="space-y-2 text-sm" data-testid="dashboard-case-progress-breakdown">
                  {adminCaseProgress ? (
                    <>
                      <div className="flex items-center justify-between border-b py-2">
                        <span className="text-muted-foreground">Workflow steps</span>
                        <span className="font-medium">{adminCaseProgress.workflowCompleted}/{adminCaseProgress.workflowTotal}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground">Account actions</span>
                        <span className="font-medium">{adminCaseProgress.accountsCompleted}/{adminCaseProgress.accountsTotal}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {loadingFamilies ? "Loading case progress…" : visibleCertificates.length === 0 ? "No visible cases" : "Case progress metadata unavailable"}
                    </p>
                  )}
                </div>
              ) : <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm">Completed</span>
                  </div>
                  <span className="font-medium">{completedActions}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    <span className="text-sm">Pending</span>
                  </div>
                  <span className="font-medium">{pendingActions}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-sm">Active</span>
                  </div>
                  <span className="font-medium">{visibleAccounts.filter(a => a.status === "active").length || 0}</span>
                </div>
              </div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest notifications and updates</CardDescription>
          </div>
          <Link href="/notifications">
            <Button variant="outline" data-testid="button-view-all-notifications">
              View All
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loadingNotifications ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentNotifications.length > 0 ? (
            <div>
              {recentNotifications.map(notification => (
                <RecentActivityItem key={notification.id} notification={notification} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
