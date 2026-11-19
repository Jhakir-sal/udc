import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useRef, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhone, getPhoneMismatchWarnings } from "@/lib/utils";
import { PhoneActions } from "@/components/phone-actions";
import { CaseContactCard } from "@/components/case-contact-card";
import { buildCaseContactOptions, type CaseContactRole } from "@/lib/case-contact-options";
import { ConciergeAssistant } from "@/components/concierge-assistant";
import { useAuth } from "@/hooks/use-auth";
import { caseRegistrationReference } from "@shared/caseRegistrationReference";
import { calculateCaseProgress } from "@shared/caseProgress";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  User,
  Users,
  Phone,
  Mail,
  MapPin,
  Shield,
  FileCheck,
  MessageSquare,
  Send,
  RefreshCw,
  Heart,
  Building2,
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  X,
  Landmark,
  Lock,
  Search,
  UserSearch,
  Globe,
  Plus,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Settings,
  FileImage,
  FileText,
  FileSignature,
  FolderOpen,
  Download,
  ExternalLink,
  Trash2,
  Upload,
  ClipboardPaste,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  Certificate,
  ConnectedAccount,
  Beneficiary,
  Notification,
  CaseMessage,
  LifeInsurancePolicy,
  CreditProtectionRequest,
  GovernmentNotification,
  CaseTask,
} from "@shared/schema";
import { CASE_TASK_LABELS, REFERRAL_SOURCES, SERVICE_PLANS, FAMILY_DOCUMENT_TYPES } from "@shared/schema";
import { FamilyAuthorizations } from "@/components/family-authorizations";
import { FamilyAuthorizationDocuments } from "@/components/family-authorization-documents";
import { AccountEmailIntake } from "@/components/account-email-intake";
import { AccountCompanyPhone } from "@/components/account-company-phone";
import { AccountCompanyNotificationAction, AccountCompanyNotificationDialog } from "@/components/account-company-notification";
import { FamilySafeguardReminder } from "@/components/family-safeguard-reminder";
import { EstateReferralPanel } from "@/components/estate-referral-panel";
import { NerSearchHistory } from "@/components/ner-search-history";
import {
  CaseDocumentUploadNotice,
  caseDocumentAlertsQueryKey,
  MarkCaseDocumentsSeenButton,
  useCaseDocumentAlerts,
} from "@/components/case-document-upload-notice";
import {
  AccountFamilyDocuments,
  FamilyDocumentAccountAssigner,
} from "@/components/case-document-account-links";

interface CaseDetail {
  certificate: Certificate;
  user: any;
  relatives?: any[];
  accounts: ConnectedAccount[];
  beneficiaries: Beneficiary[];
  notifications: Notification[];
  lifeInsurance: LifeInsurancePolicy[];
  messages: CaseMessage[];
  creditProtection: CreditProtectionRequest[];
  governmentNotifications: GovernmentNotification[];
  caseTasks: CaseTask[];
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { color: string; icon: any }> = {
    verified: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
    completed: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
    successful: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
    benefits_active: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
    approved: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
    pending: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
    pending_action: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
    pending_approval: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
    benefits_pending: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
    identified: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
    discovered: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
    processing: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Loader2 },
    in_progress: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Loader2 },
    submitted: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: CheckCircle2 },
    active: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: CheckCircle2 },
    suspended: { color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", icon: AlertTriangle },
    not_completed: { color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", icon: AlertTriangle },
    closed: { color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: XCircle },
    failed: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
    rejected: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
    unsuccessful: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
    benefits_denied: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
    not_applicable: { color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: XCircle },
  };
  const v = variants[status] || variants.pending;
  const Icon = v.icon;
  return (
    <Badge className={`${v.color} gap-1`} data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3" />
      {status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </Badge>
  );
}

function InfoRow({ label, value, icon: Icon, isPhone, contactName }: { label: string; value?: string | null; icon?: any; isPhone?: boolean; contactName?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && !isPhone && <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isPhone ? (
          <PhoneActions phoneNumber={value} contactName={contactName} />
        ) : (
          <p className={`text-sm font-medium ${label.toLowerCase().includes("email") ? "break-all" : "break-words"}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

function AdminSectionControl({ section, value, onChange }: { section: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs w-[130px]" data-testid={`select-section-${section}`}>
          <Settings className="h-3 w-3 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="visible">
            <span className="flex items-center gap-1.5"><Eye className="h-3 w-3" /> Visible</span>
          </SelectItem>
          <SelectItem value="hidden">
            <span className="flex items-center gap-1.5"><EyeOff className="h-3 w-3" /> Hidden</span>
          </SelectItem>
          <SelectItem value="in_review">
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> In Review</span>
          </SelectItem>
          <SelectItem value="locked">
            <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> Locked</span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function CreditDiscoveryTab({ certificateId, deceasedName, accounts }: { certificateId: string; deceasedName: string; accounts: ConnectedAccount[] }) {
  const { toast } = useToast();
  const [selectedPullId, setSelectedPullId] = useState<string | null>(null);

  const { data: creditPullResults, isLoading: loadingPulls } = useQuery<any[]>({
    queryKey: ["/api/credit-pull", certificateId],
    queryFn: async () => {
      const res = await fetch(`/api/credit-pull/${certificateId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const pullMutation = useMutation({
    mutationFn: async (bureau: string) => {
      const res = await apiRequest("POST", "/api/credit-pull", { certificateId, bureau });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-pull", certificateId] });
      toast({ title: "Credit pull completed" });
    },
    onError: () => {
      toast({ title: "Credit pull failed", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ pullId, resultIds }: { pullId: string; resultIds: string[] }) => {
      const res = await apiRequest("POST", `/api/credit-pull/${pullId}/import`, { resultIds, certificateId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certificateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/credit-pull", certificateId] });
      toast({ title: `Imported ${data.imported || 0} accounts` });
    },
    onError: () => {
      toast({ title: "Import failed", variant: "destructive" });
    },
  });

  const bureaus = ["Experian", "Equifax", "TransUnion"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Credit Bureau Discovery
          </CardTitle>
          <CardDescription>
            Pull credit data from major bureaus to discover accounts, subscriptions, and financial obligations tied to {deceasedName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {bureaus.map(bureau => {
              const existing = creditPullResults?.find((p: any) => p.bureau?.toLowerCase() === bureau.toLowerCase());
              return (
                <Card key={bureau} className={`${existing ? "border-green-200 dark:border-green-900/50" : ""}`}>
                  <CardContent className="p-4 text-center">
                    <p className="font-medium text-sm">{bureau}</p>
                    {existing ? (
                      <>
                        <Badge variant="default" className="text-xs mt-2">Pulled</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {existing.results?.length || 0} accounts found
                        </p>
                        <Button size="sm" variant="outline" className="mt-2 text-xs w-full"
                          onClick={() => setSelectedPullId(selectedPullId === existing.id ? null : existing.id)}
                          data-testid={`button-view-${bureau.toLowerCase()}`}
                        >
                          {selectedPullId === existing.id ? "Hide Results" : "View Results"}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" className="mt-2 text-xs w-full"
                        onClick={() => pullMutation.mutate(bureau)}
                        disabled={pullMutation.isPending}
                        data-testid={`button-pull-${bureau.toLowerCase()}`}
                      >
                        {pullMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                        Pull Report
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedPullId && creditPullResults && (() => {
        const pull = creditPullResults.find((p: any) => p.id === selectedPullId);
        if (!pull || !pull.results?.length) return null;
        const existingAccountNames = new Set(accounts.map(a => a.accountName.toLowerCase()));
        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {pull.bureau} — {pull.results.length} Discovered Accounts
                </CardTitle>
                <Button size="sm" variant="default"
                  onClick={() => {
                    const importable = pull.results
                      .filter((r: any) => !existingAccountNames.has(r.accountName?.toLowerCase()) && r.id)
                      .map((r: any) => r.id);
                    if (importable.length > 0) importMutation.mutate({ pullId: pull.id, resultIds: importable });
                    else toast({ title: "All accounts already imported" });
                  }}
                  disabled={importMutation.isPending}
                  data-testid="button-import-all"
                >
                  {importMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Import All New
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pull.results.map((result: any, idx: number) => {
                  const alreadyImported = existingAccountNames.has(result.accountName?.toLowerCase());
                  return (
                    <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{result.accountName}</p>
                        <p className="text-xs text-muted-foreground">
                          {result.accountType} {result.balance ? `· $${result.balance}` : ""} {result.monthlyPayment ? `· $${result.monthlyPayment}/mo` : ""}
                        </p>
                      </div>
                      {alreadyImported ? (
                        <Badge variant="secondary" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Imported</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">New</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {loadingPulls ? (
        <Skeleton className="h-20" />
      ) : (!creditPullResults || creditPullResults.length === 0) ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No credit pulls have been run for this case yet.</p>
            <p className="text-xs mt-1">Select a bureau above to discover accounts automatically.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

interface CaseEventItem {
  id: string;
  eventType: string;
  description: string;
  actorName?: string | null;
  actorRole?: string | null;
  createdAt: string;
}

const eventTypeConfig: Record<string, { color: string; label: string }> = {
  case_created: { color: "bg-blue-500", label: "Case Created" },
  task_completed: { color: "bg-green-500", label: "Task Verified" },
  task_reopened: { color: "bg-yellow-500", label: "Task Reopened" },
  status_changed: { color: "bg-blue-500", label: "Status Change" },
  payment_received: { color: "bg-emerald-500", label: "Payment" },
  payment_recorded: { color: "bg-emerald-500", label: "Payment" },
  id_override: { color: "bg-purple-500", label: "ID Approval" },
  case_identity_override: { color: "bg-purple-500", label: "Identity Authorization" },
  lpoa_signature_requested: { color: "bg-blue-500", label: "LPOA Request" },
  lpoa_correction_requested: { color: "bg-amber-500", label: "LPOA Correction" },
  lpoa_signed: { color: "bg-green-500", label: "LPOA Signed" },
  lpoa_corrected: { color: "bg-green-500", label: "LPOA Corrected" },
  invitation_sent: { color: "bg-blue-400", label: "Invitation" },
  invitation_resent: { color: "bg-blue-400", label: "Invitation" },
  certificate_uploaded: { color: "bg-indigo-500", label: "Certificate" },
  account_status_changed: { color: "bg-orange-500", label: "Account Update" },
  account_handoff_updated: { color: "bg-blue-500", label: "Responsibility / Instructions" },
  more_info_needed: { color: "bg-red-500", label: "More Info Needed" },
  provider_successful: { color: "bg-green-500", label: "Provider" },
  provider_not_completed: { color: "bg-yellow-500", label: "Provider" },
  provider_unsuccessful: { color: "bg-red-500", label: "Provider" },
  notification_sent: { color: "bg-blue-500", label: "Notification" },
  notification_failed: { color: "bg-red-500", label: "Notification Failed" },
  family_safeguard_reminder_requested: { color: "bg-amber-500", label: "Family Reminder Requested" },
  family_safeguard_reminder_sent: { color: "bg-teal-500", label: "Family Reminder Accepted for Delivery" },
  family_safeguard_reminder_failed: { color: "bg-red-500", label: "Family Reminder Not Confirmed" },
};

function CaseTimelineTab({ certId }: { certId: string }) {
  const { data: events, isLoading } = useQuery<CaseEventItem[]>({
    queryKey: ["/api/admin/case", certId, "events"],
  });

  if (isLoading) {
    return <Skeleton className="h-64" data-testid="skeleton-timeline" />;
  }

  if (!events || events.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm" data-testid="text-timeline-empty">No activity recorded yet for this case.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Case Timeline
        </CardTitle>
        <CardDescription>Chronological history of everything that has happened on this case</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6 space-y-5 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-border">
          {events.map((ev) => {
            const cfg = eventTypeConfig[ev.eventType] || { color: "bg-gray-400", label: ev.eventType };
            return (
              <div key={ev.id} className="relative" data-testid={`timeline-event-${ev.id}`}>
                <span className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background ${cfg.color}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{cfg.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                  {ev.actorName && (
                    <span className="text-xs text-muted-foreground">
                      · {ev.actorName}{ev.actorRole ? ` (${ev.actorRole})` : ""}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1">{ev.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CaseDetailPage() {
  const [, params] = useRoute("/admin/case/:certId");
  const [, setLocation] = useLocation();
  const [activeCaseTab, setActiveCaseTab] = useState("overview");
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const certId = params?.certId;
  const documentAlertsQuery = useCaseDocumentAlerts(certId || "");
  const currentCertificateId = useRef(certId);
  currentCertificateId.current = certId;
  const [accountNotificationTarget, setAccountNotificationTarget] = useState<{ accountId: string; accountName: string; certificateId: string } | null>(null);

  const { data: caseData, isLoading, error, isError } = useQuery<CaseDetail>({
    queryKey: ["/api/admin/case", certId],
    enabled: !!certId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const updateCaseMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("PUT", `/api/admin/case/${certId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      toast({ title: "Case updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update case", variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/mark-paid`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      toast({ title: "Payment recorded" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to record payment", description: err?.message, variant: "destructive" });
    },
  });

  const [messageForm, setMessageForm] = useState({
    recipientName: "",
    body: "",
    accountId: "",
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: typeof messageForm) => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/messages`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      setMessageForm({ recipientName: "", body: "", accountId: "" });
      toast({ title: "Message sent successfully" });
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRecipientName, setInviteRecipientName] = useState("");
  const [inviteDeceasedRelationship, setInviteDeceasedRelationship] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [showOtherRecipient, setShowOtherRecipient] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<number[]>([]);

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const uploadCertificateDoc = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a PDF or image file.", variant: "destructive" });
      return;
    }
    setIsUploadingDoc(true);
    try {
      const metaRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await metaRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      const docUrl = objectPath;

      let verificationData: any = {};
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const ocrRes = await apiRequest("POST", "/api/ocr/certificate", { imageDataUrl: dataUrl });
        const ocrResult = await ocrRes.json();
        if (ocrResult.verification) {
          verificationData = {
            aiVerificationStatus: ocrResult.verification.verificationStatus || "pending",
            aiConfidenceScore: ocrResult.verification.confidenceScore || null,
            aiVerificationDetails: JSON.stringify(ocrResult.verification),
          };
        }
      } catch {
      }

      await apiRequest("PUT", `/api/admin/case/${certId}`, {
        documentUrl: docUrl,
        ...verificationData,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      toast({ title: "Certificate document uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload document", variant: "destructive" });
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const deleteCaseMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/case/${certId}`);
    },
    onSuccess: () => {
      toast({ title: "Case deleted", description: "The case and all related data have been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/families"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-certificates"] });
      setLocation("/cases");
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const inviteFamilyMutation = useMutation({
    mutationFn: async (recipients: Array<{ email: string; recipientName: string; phoneNumber?: string; deceasedRelationshipToRecipient?: string | null }>) => {
      const results = [];
      for (const data of recipients) {
        const res = await apiRequest("POST", `/api/admin/case/${certId}/invite-family`, data);
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: (results: any[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "invitations"] });
      setInviteEmail("");
      setInviteRecipientName("");
      setInvitePhone("");
      setInviteDeceasedRelationship("");
      setSelectedRecipients(new Set());
      setShowOtherRecipient(false);
      const count = results.length;
      toast({ title: `${count} invitation${count > 1 ? "s" : ""} sent`, description: results.map((r: any) => r.message).join("; ") });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send invitation", description: error.message, variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/resend-invite/${inviteId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "invitations"] });
      toast({ title: "Invitation resent", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Failed to resend invitation", description: error.message, variant: "destructive" });
    },
  });

  const invitationsQuery = useQuery({
    queryKey: ["/api/admin/case", certId, "invitations"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/case/${certId}/invitations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!certId,
  });

  const [funeralHomeName, setFuneralHomeName] = useState("");
  const [funeralHomeEmail, setFuneralHomeEmail] = useState("");
  const funeralHomeInvitationsQuery = useQuery({
    queryKey: ["/api/case", certId, "funeral-home-invitations"],
    queryFn: async () => {
      const res = await fetch(`/api/case/${certId}/funeral-home-invitations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch funeral home invitations");
      return res.json();
    },
    enabled: !!certId,
  });
  const inviteFuneralHomeMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/case/${certId}/funeral-home-invitations`, { funeralHomeName, inviteeEmail: funeralHomeEmail })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case", certId, "funeral-home-invitations"] });
      setFuneralHomeName(""); setFuneralHomeEmail("");
      toast({ title: "Invitation sent", description: "The funeral home can securely upload the certificate from its email." });
    },
    onError: (e: any) => toast({ title: "Could not send invitation", description: e.message, variant: "destructive" }),
  });
  const funeralHomeActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "resend" | "revoke" }) => {
      const endpoint = `/api/case/${certId}/funeral-home-invitations/${id}/${action}`;
      return (await apiRequest("POST", endpoint, {})).json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/case", certId, "funeral-home-invitations"] }),
    onError: (e: any) => toast({ title: "Invitation action failed", description: e.message, variant: "destructive" }),
  });

  const familyAccountsQuery = useQuery({
    queryKey: ["/api/admin/case", certId, "family-accounts"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/case/${certId}/family-accounts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!certId,
  });

  const [overrideUser, setOverrideUser] = useState<any | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [identityReviewUser, setIdentityReviewUser] = useState<any | null>(null);
  const [identityReviewReason, setIdentityReviewReason] = useState("");
  const [lpoaRequestUser, setLpoaRequestUser] = useState<any | null>(null);
  const [lpoaRequestReason, setLpoaRequestReason] = useState("");
  const [lpoaReplacementRequired, setLpoaReplacementRequired] = useState(false);
  const [uploadingDocFor, setUploadingDocFor] = useState<string | null>(null);

  const familyDocsQuery = useQuery({
    queryKey: ["/api/admin/case", certId, "family-documents"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/case/${certId}/family-documents`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!certId,
    staleTime: 3_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const lpoaDocumentsQuery = useQuery({
    queryKey: ["/api/admin/case", certId, "lpoa"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/case/${certId}/lpoa`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch LPOA documents");
      return res.json();
    },
    enabled: !!certId,
  });

  const overrideIdMutation = useMutation({
    mutationFn: async ({ userId, note }: { userId: string; note: string }) => {
      const res = await apiRequest("POST", `/api/admin/family-accounts/${userId}/override-id`, { note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "family-accounts"] });
      setOverrideUser(null);
      setOverrideNote("");
      toast({ title: "ID verification approved", description: "This family account is now marked as ID verified." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to approve", description: error.message, variant: "destructive" });
    },
  });

  const approveCaseIdentityMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/case/${certId}/family-accounts/${userId}/identity-override`,
        { reason },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "family-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "events"] });
      setIdentityReviewUser(null);
      setIdentityReviewReason("");
      toast({
        title: "Authorization documented",
        description: "This case-specific name or relationship difference is now approved.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not save authorization", description: error.message, variant: "destructive" });
    },
  });

  const sendLpoaRequestMutation = useMutation({
    mutationFn: async ({
      userId,
      reason,
      requireReplacement,
    }: {
      userId: string;
      reason: string;
      requireReplacement: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/case/${certId}/family-accounts/${userId}/lpoa-request`,
        { reason, requireReplacement },
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "family-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "lpoa"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "events"] });
      setLpoaRequestUser(null);
      setLpoaRequestReason("");
      toast({
        title: lpoaReplacementRequired ? "Correction request sent" : "Signature request sent",
        description: `Email ${data.request.emailSent ? "sent" : "failed"} · SMS ${
          data.request.smsSent ? "sent" : "not sent"
        } · In-app alert ${data.request.inAppSent ? "sent" : "failed"}.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not send request", description: error.message, variant: "destructive" });
    },
  });

  const uploadFamilyDoc = async (acctId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a PDF or image file.", variant: "destructive" });
      return;
    }
    setUploadingDocFor(acctId);
    try {
      const metaRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await metaRes.json();
      const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error("Upload failed");
      await apiRequest("POST", `/api/admin/family-accounts/${acctId}/documents`, {
        label: file.name.replace(/\.[^.]+$/, ""),
        fileName: file.name,
        objectPath,
        contentType: file.type,
        certificateId: certId,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "family-documents"] });
      queryClient.invalidateQueries({ queryKey: caseDocumentAlertsQueryKey(certId || "") });
      toast({ title: "Document uploaded" });
    } catch {
      toast({ title: "Failed to upload document", variant: "destructive" });
    } finally {
      setUploadingDocFor(null);
    }
  };

  const deleteFamilyDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      await apiRequest("DELETE", `/api/family-documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId, "family-documents"] });
      toast({ title: "Document removed" });
    },
  });

  const [sectionVisibility, setSectionVisibility] = useState<Record<string, string>>({
    accounts: "visible",
    beneficiaries: "visible",
    govNotifications: "visible",
    creditProtection: "visible",
    creditPull: "visible",
    insurance: "visible",
    relatives: "visible",
    messaging: "visible",
  });

  const toggleSectionVisibility = (section: string, value: string) => {
    setSectionVisibility((prev) => ({ ...prev, [section]: value }));
  };

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAccountEmailIntake, setShowAccountEmailIntake] = useState(false);
  const [accountForm, setAccountForm] = useState({
    accountName: "",
    accountType: "",
    category: "financial" as string,
    accountNumber: "",
    isJoint: false,
    survivorName: "",
    accountDesignation: "",
    responsibleParty: "sal_team" as string,
  });

  const createAccountMutation = useMutation({
    mutationFn: async (input: { data: typeof accountForm; certificateId: string }) => {
      const res = await apiRequest("POST", `/api/admin/case/${input.certificateId}/accounts`, input.data);
      return { result: await res.json(), ...input };
    },
    onSuccess: ({ result, data, certificateId: submittedCertificateId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", submittedCertificateId] });
      if (submittedCertificateId !== currentCertificateId.current) return;
      setAccountForm({ accountName: "", accountType: "", category: "financial", accountNumber: "", isJoint: false, survivorName: "", accountDesignation: "", responsibleParty: "sal_team" });
      setShowAddAccount(false);
      toast({ title: "Account added successfully" });
      const createdAccount = result?.account ?? result;
      const createdAccountId = createdAccount?.id ?? result?.accountId;
      if (createdAccountId && submittedCertificateId === currentCertificateId.current) {
        setAccountNotificationTarget({
          accountId: String(createdAccountId),
          accountName: createdAccount?.accountName || data.accountName,
          certificateId: submittedCertificateId,
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to add account", variant: "destructive" });
    },
  });

  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);
  const [accountEdit, setAccountEdit] = useState({
    status: "",
    notes: "",
    responsibleParty: "sal_team",
    selectedAction: "none",
    familyActionInstructions: "",
    familyContactPhone: "",
    familyContactEmail: "",
  });

  const openAccountDialog = (account: ConnectedAccount) => {
    setSelectedAccount(account);
    const handoffAccount = account as ConnectedAccount & {
      responsibleParty?: "sal_team" | "family" | null;
      selectedAction?: "close" | "suspend" | "continue" | "transfer" | null;
      familyActionInstructions?: string | null;
      familyContactPhone?: string | null;
      familyContactEmail?: string | null;
    };
    setAccountEdit({
      status: account.status,
      notes: account.notes || "",
      responsibleParty: handoffAccount.responsibleParty || "sal_team",
      selectedAction: handoffAccount.selectedAction || "none",
      familyActionInstructions: handoffAccount.familyActionInstructions || "",
      familyContactPhone: handoffAccount.familyContactPhone || "",
      familyContactEmail: handoffAccount.familyContactEmail || "",
    });
  };

  const updateAccountMutation = useMutation({
    mutationFn: async (data: {
      accountId: string;
      status: string;
      notes: string;
      responsibleParty: "sal_team" | "family";
      selectedAction: "close" | "suspend" | "continue" | "transfer" | null;
      familyActionInstructions: string;
      familyContactPhone: string;
      familyContactEmail: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/case/${certId}/accounts/${data.accountId}`, {
        status: data.status,
        notes: data.notes,
        responsibleParty: data.responsibleParty,
        selectedAction: data.selectedAction,
        familyActionInstructions: data.familyActionInstructions,
        familyContactPhone: data.familyContactPhone,
        familyContactEmail: data.familyContactEmail,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setSelectedAccount(null);
      toast({ title: "Account updated" });
    },
    onError: () => {
      toast({ title: "Failed to update account", variant: "destructive" });
    },
  });

  const [showAddRelative, setShowAddRelative] = useState(false);
  const [relativeForm, setRelativeForm] = useState({
    fullName: "",
    relationship: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    age: "",
  });

  const createRelativeMutation = useMutation({
    mutationFn: async (data: typeof relativeForm) => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/relatives`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      setRelativeForm({ fullName: "", relationship: "", phone: "", email: "", address: "", city: "", state: "", zipCode: "", age: "" });
      setShowAddRelative(false);
      toast({ title: "Relative added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add relative", variant: "destructive" });
    },
  });

  const [showAddInsurance, setShowAddInsurance] = useState(false);
  const [insuranceForm, setInsuranceForm] = useState({
    provider: "",
    policyNumber: "",
    policyType: "",
    faceValue: "",
    beneficiaryName: "",
    beneficiaryRelationship: "",
    contactPhone: "",
    contactEmail: "",
    notes: "",
  });

  const createInsuranceMutation = useMutation({
    mutationFn: async (data: typeof insuranceForm) => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/life-insurance`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      setInsuranceForm({ provider: "", policyNumber: "", policyType: "", faceValue: "", beneficiaryName: "", beneficiaryRelationship: "", contactPhone: "", contactEmail: "", notes: "" });
      setShowAddInsurance(false);
      toast({ title: "Insurance policy added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add insurance policy", variant: "destructive" });
    },
  });

  const [showAddGovNotification, setShowAddGovNotification] = useState(false);
  const [govForm, setGovForm] = useState({
    agency: "ssa" as string,
    notificationType: "Death Notification",
  });

  const createGovNotificationMutation = useMutation({
    mutationFn: async (data: typeof govForm) => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/gov-notifications`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      setGovForm({ agency: "ssa", notificationType: "Death Notification" });
      setShowAddGovNotification(false);
      toast({ title: "Government notification added" });
    },
    onError: () => {
      toast({ title: "Failed to add notification", variant: "destructive" });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/case/${certId}/tasks/${taskId}`, { completed });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/families"] });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const updateGovStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/case/${certId}/gov-notifications/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const [showAddBeneficiary, setShowAddBeneficiary] = useState(false);
  const [beneficiaryForm, setBeneficiaryForm] = useState({
    fullName: "",
    relationship: "spouse" as "spouse" | "child" | "dependent" | "other",
    phone: "",
    email: "",
    address: "",
    dateOfBirth: "",
    notes: "",
    isMinor: false,
    guardianName: "",
  });

  const createBeneficiaryMutation = useMutation({
    mutationFn: async (data: typeof beneficiaryForm) => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/beneficiaries`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      setBeneficiaryForm({ fullName: "", relationship: "spouse", phone: "", email: "", address: "", dateOfBirth: "", notes: "", isMinor: false, guardianName: "" });
      setShowAddBeneficiary(false);
      toast({ title: "Beneficiary added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add beneficiary", variant: "destructive" });
    },
  });

  const searchRelativesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/case/${certId}/relatives/search`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certId] });
      toast({ title: `Found ${data.resultsCount} relatives from public records` });
    },
    onError: () => {
      toast({ title: "Failed to search public records", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !caseData) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => setLocation("/admin")} data-testid="button-back-to-admin">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
        <div className="mt-8 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isError ? "Failed to load case details. Please try again." : "Case not found"}
          </p>
        </div>
      </div>
    );
  }

  const { certificate, user, accounts, beneficiaries, notifications, lifeInsurance, messages, creditProtection, governmentNotifications, relatives = [], caseTasks = [] } = caseData;
  const caseContactOptions = buildCaseContactOptions({
    certificate,
    owner: user,
    familyAccounts: Array.isArray(familyAccountsQuery.data) ? familyAccountsQuery.data : [],
    relatives,
  });

  const accountsByCategory = accounts.reduce((acc: Record<string, ConnectedAccount[]>, a) => {
    const cat = a.category || "miscellaneous";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  const totalAccounts = accounts.length;
  const closedAccounts = accounts.filter((a) => a.status === "closed").length;
  const pendingAccounts = accounts.filter((a) => a.status === "pending_action").length;
  const suspendedAccounts = accounts.filter((a) => a.status === "suspended").length;

  const taskHints: Record<string, string> = {
    case_created: certificate.submittedAt ? new Date(certificate.submittedAt).toLocaleDateString() : "",
    certificate_uploaded: certificate.documentUrl ? "Document on file" : "No document",
    verified_blockchain: certificate.blockchainHash ? `ID: ${certificate.blockchainHash.substring(0, 12)}...` : "No blockchain ID",
    accounts_added: accounts.length > 0 ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""} linked` : "No accounts",
    notifications_sent: accounts.length > 0 ? `${accounts.filter((a: any) => a.notificationSentAt).length}/${accounts.length} sent` : "No accounts",
    gov_agencies_notified: governmentNotifications.length > 0 ? `${governmentNotifications.filter(g => g.status === "successful").length}/${governmentNotifications.length} agencies` : "None added",
    credit_protection: creditProtection.length > 0 ? `${creditProtection.filter(c => c.status === "completed" || c.status === "submitted").length}/${creditProtection.length} bureaus` : "Not filed",
    insurance_benefits: lifeInsurance.length > 0 ? `${lifeInsurance.length} polic${lifeInsurance.length !== 1 ? "ies" : "y"}` : "None found",
    case_complete: accounts.length > 0 ? `${closedAccounts}/${totalAccounts} closed` : "In progress",
  };

  const caseProgress = calculateCaseProgress(caseTasks, accounts);
  const taskProgress = caseProgress.workflowTotal > 0
    ? Math.round((caseProgress.workflowCompleted / caseProgress.workflowTotal) * 100)
    : 0;

  const reviewNewDocuments = () => {
    setActiveCaseTab("overview");
    void familyDocsQuery.refetch();
    void documentAlertsQuery.refetch();
    requestAnimationFrame(() => {
      const library = document.getElementById("case-document-library");
      if (library) {
        library.scrollIntoView({ behavior: "smooth", block: "start" });
        library.focus({ preventScroll: true });
        return;
      }
      requestAnimationFrame(() => {
        const mountedLibrary = document.getElementById("case-document-library");
        mountedLibrary?.scrollIntoView({ behavior: "smooth", block: "start" });
        mountedLibrary?.focus({ preventScroll: true });
      });
    });
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/cases")} data-testid="button-back-dashboard">
          <ArrowLeft className="h-4 w-4 mr-2" /> Cases
        </Button>
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <h1 className="text-2xl font-bold break-words" data-testid="text-case-title">{certificate.deceasedName}</h1>
          <p className="break-all text-xs text-muted-foreground">Account registration: {caseRegistrationReference(certificate.id)} · Reference only, not proof of death</p>
          <p className="text-sm text-muted-foreground">
            Certificate #{certificate.certificateNumber} &middot; {certificate.dateOfDeath}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge status={certificate.status} />
          <Select
            value={certificate.status}
            onValueChange={(value) => updateCaseMutation.mutate({ status: value })}
          >
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-certificate-status">
              <SelectValue placeholder="Change status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ConciergeAssistant certId={certificate.id} deceasedName={certificate.deceasedName} />
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setShowDeleteConfirm(true)}
          data-testid="button-delete-case"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {certId && (
        <CaseDocumentUploadNotice certId={certId} onReview={reviewNewDocuments} />
      )}

      <section aria-label="Case contacts" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">People to contact</h2>
            <p className="text-xs text-muted-foreground">Keep case contacts distinct; verify details against the case record before reaching out.</p>
          </div>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {(["nextOfKin", "primaryContact", "informant"] as CaseContactRole[]).map((role) => (
            <CaseContactCard
              key={`${certificate.id}:${role}`}
              role={role}
              certificate={certificate}
              options={caseContactOptions}
              isSaving={updateCaseMutation.isPending}
              onSave={(payload) => updateCaseMutation.mutateAsync(payload)}
            />
          ))}
        </div>
      </section>

      {showDeleteConfirm && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-destructive">Delete this case?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This will permanently remove the case for <strong>{certificate.deceasedName}</strong> (certificate #{certificate.certificateNumber}, status: {certificate.status}) and its related records, including connected accounts, notifications, beneficiaries, messages, signed LPOAs, and uploaded-document records. Family user accounts will not be deleted. Cases linked to a converted HeartPlan cannot be deleted here. This action cannot be undone.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteCaseMutation.mutate()}
                    disabled={deleteCaseMutation.isPending}
                    data-testid="button-confirm-delete-case"
                  >
                    {deleteCaseMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
                    ) : (
                      "Yes, Delete Case"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleteCaseMutation.isPending}
                    data-testid="button-cancel-delete-case"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!overrideUser} onOpenChange={(open) => { if (!open) setOverrideUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve ID Manually</DialogTitle>
            <DialogDescription>
              Mark {overrideUser?.accountName || overrideUser?.email} as ID verified. Use this after you have confirmed their identity (e.g., reviewed their driver's license or spoken with them directly). This action is recorded with your name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="override-note">Reason / note (recommended)</Label>
              <Textarea
                id="override-note"
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="e.g., Reviewed driver's license in person — name matches, goes by middle name"
                className="mt-1"
                data-testid="input-override-note"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOverrideUser(null)} data-testid="button-cancel-override">Cancel</Button>
              <Button
                onClick={() => overrideIdMutation.mutate({ userId: overrideUser.id, note: overrideNote })}
                disabled={overrideIdMutation.isPending}
                data-testid="button-confirm-override"
              >
                {overrideIdMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                Approve ID
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!identityReviewUser}
        onOpenChange={(open) => {
          if (!open) {
            setIdentityReviewUser(null);
            setIdentityReviewReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Document case authorization</DialogTitle>
            <DialogDescription>
              Approve this person for this case after confirming the legal-name variation or their authority to
              act even though the certificate names someone else. This does not change their verified identity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="identity-review-reason">Required reason</Label>
              <Textarea
                id="identity-review-reason"
                value={identityReviewReason}
                onChange={(event) => setIdentityReviewReason(event.target.value)}
                placeholder="Example: Confirmed by phone that the account holder is the court-appointed executor; certificate lists the decedent's sibling as informant."
                className="mt-1"
                data-testid="input-case-identity-reason"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIdentityReviewUser(null)}>Cancel</Button>
              <Button
                onClick={() => approveCaseIdentityMutation.mutate({
                  userId: identityReviewUser.id,
                  reason: identityReviewReason,
                })}
                disabled={approveCaseIdentityMutation.isPending || identityReviewReason.trim().length < 10}
                data-testid="button-confirm-case-identity"
              >
                {approveCaseIdentityMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Shield className="mr-2 h-4 w-4" />}
                Approve for this case
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!lpoaRequestUser}
        onOpenChange={(open) => {
          if (!open) {
            setLpoaRequestUser(null);
            setLpoaRequestReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {lpoaReplacementRequired ? "Require a corrected signature" : "Send LPOA signature request"}
            </DialogTitle>
            <DialogDescription>
              {lpoaReplacementRequired
                ? "The current signed document will remain in the audit history and will be superseded only after the corrected document is signed."
                : "Send an email, SMS when a phone number is available, and an in-app alert."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="lpoa-request-reason">Reason shown to the family member</Label>
              <Textarea
                id="lpoa-request-reason"
                value={lpoaRequestReason}
                onChange={(event) => setLpoaRequestReason(event.target.value)}
                placeholder={lpoaReplacementRequired
                  ? "The signer name does not match the legal name verified on your ID."
                  : "We need your authorization before the concierge team can act on your behalf."}
                className="mt-1"
                data-testid="input-lpoa-request-reason"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLpoaRequestUser(null)}>Cancel</Button>
              <Button
                onClick={() => sendLpoaRequestMutation.mutate({
                  userId: lpoaRequestUser.id,
                  reason: lpoaRequestReason,
                  requireReplacement: lpoaReplacementRequired,
                })}
                disabled={sendLpoaRequestMutation.isPending || lpoaRequestReason.trim().length < 5}
                data-testid="button-confirm-lpoa-request"
              >
                {sendLpoaRequestMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Send className="mr-2 h-4 w-4" />}
                Send request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="mb-3" data-testid="card-overall-case-progress">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Overall Case Progress</CardTitle>
              <CardDescription className="mt-1">Staff-marked workflow and completed account actions</CardDescription>
            </div>
            <span className="text-lg font-semibold tabular-nums" data-testid="text-overall-case-progress-percent">
              {caseProgress.percent}%
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={caseProgress.percent} className="h-2" data-testid="progress-overall-case-progress" />
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span data-testid="text-overall-workflow-progress">
              Workflow {caseProgress.workflowCompleted}/{caseProgress.workflowTotal}
            </span>
            <span data-testid="text-overall-account-progress">
              Account actions {caseProgress.accountsCompleted}/{caseProgress.accountsTotal}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-workflow-pipeline">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Case Workflow
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={taskProgress === 100 ? "default" : "secondary"} className="text-xs" title="Staff-marked workflow steps only" data-testid="badge-task-progress">
                {caseProgress.workflowCompleted}/{caseProgress.workflowTotal} staff-marked · {taskProgress}%
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setExpandedTasks(prev => prev.length === caseTasks.length ? [] : caseTasks.map(t => t.id))}
                data-testid="button-toggle-all-tasks"
              >
                {expandedTasks.length === caseTasks.length ? "Collapse All" : "Expand All"}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            {caseTasks.map((task, i) => {
              const isExpanded = expandedTasks.includes(task.id);
              return (
                <div
                  key={task.id}
                  className={`rounded-lg border transition-colors ${
                    task.completed
                      ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900"
                      : "bg-background border-border"
                  }`}
                  data-testid={`task-${task.taskKey}`}
                >
                  <div
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer group"
                    onClick={() => setExpandedTasks(prev =>
                      prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id]
                    )}
                    data-testid={`task-header-${task.taskKey}`}
                  >
                    <div
                      className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                        task.completed
                          ? "bg-green-600 border-green-600 text-white"
                          : "border-muted-foreground/40 group-hover:border-primary"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTaskMutation.mutate({ taskId: task.id, completed: !task.completed });
                      }}
                      data-testid={`task-checkbox-${task.taskKey}`}
                    >
                      {task.completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${task.completed ? "text-green-700 dark:text-green-400" : ""}`}>
                        {i + 1}. {CASE_TASK_LABELS[task.taskKey] || task.taskKey}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      {taskHints[task.taskKey] || ""}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-200 ease-in-out ${
                      isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="px-3 pb-3 pt-1 ml-8 border-t border-border/50 mt-0.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground/70">Status: </span>
                          {taskHints[task.taskKey] || "Pending"}
                        </div>
                        {task.completed && task.completedByName && (
                          <div>
                            <span className="font-medium text-foreground/70">Verified by: </span>
                            {task.completedByName}
                          </div>
                        )}
                        {task.completed && task.completedAt && (
                          <div>
                            <span className="font-medium text-foreground/70">Verified on: </span>
                            {new Date(task.completedAt).toLocaleDateString()}
                          </div>
                        )}
                        {!task.completed && (
                          <div>
                            <span className="font-medium text-foreground/70">Action: </span>
                            <button
                              className="text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTaskMutation.mutate({ taskId: task.id, completed: true });
                              }}
                              data-testid={`button-verify-${task.taskKey}`}
                            >
                              Mark as verified
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold" data-testid="text-total-accounts">{totalAccounts}</p>
            <p className="text-xs text-muted-foreground">Total Accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600" data-testid="text-closed-accounts">{closedAccounts}</p>
            <p className="text-xs text-muted-foreground">Closed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600" data-testid="text-pending-accounts">{pendingAccounts}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600" data-testid="text-suspended-accounts">{suspendedAccounts}</p>
            <p className="text-xs text-muted-foreground">Suspended</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeCaseTab} onValueChange={setActiveCaseTab} className="space-y-4">
        <TabsList className="flex h-auto max-w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="overview" data-testid="tab-overview" className="min-h-10 text-xs">Overview</TabsTrigger>
          <TabsTrigger value="accounts" data-testid="tab-accounts" className="min-h-10 text-xs">Accounts ({totalAccounts})</TabsTrigger>
          <TabsTrigger value="credit-discovery" data-testid="tab-credit-discovery" className="min-h-10 text-xs">Credit Discovery</TabsTrigger>
          <TabsTrigger value="relatives" data-testid="tab-relatives" className="min-h-10 text-xs">Relatives ({relatives.length})</TabsTrigger>
          <TabsTrigger value="beneficiaries" data-testid="tab-beneficiaries" className="min-h-10 text-xs">Beneficiaries ({beneficiaries.length})</TabsTrigger>
          <TabsTrigger value="insurance" data-testid="tab-insurance" className="min-h-10 text-xs">Insurance ({lifeInsurance.length})</TabsTrigger>
          <TabsTrigger value="messaging" data-testid="tab-messaging" className="min-h-10 text-xs">Messages ({messages.length})</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline" className="min-h-10 text-xs">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <FamilyAuthorizations certificateId={certId || ""} mode="admin" />
          <EstateReferralPanel certId={certId || ""} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-4 [&>*]:min-w-0">
            <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  Deceased Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoRow label="Full Name" value={certificate.deceasedName} icon={User} />
                <InfoRow label="Date of Birth" value={certificate.dateOfBirth} icon={Clock} />
                <InfoRow label="Date of Death" value={certificate.dateOfDeath} icon={Clock} />
                <InfoRow label="SSN" value={certificate.deceasedSsn ? `***-**-${certificate.deceasedSsn.slice(-4)}` : undefined} icon={Shield} />
                <InfoRow label="Father's Name" value={certificate.fatherName ?? undefined} icon={User} />
                <InfoRow label="Mother's Name" value={certificate.motherName ?? undefined} icon={User} />
                <InfoRow label="Certificate #" value={certificate.certificateNumber} icon={FileCheck} />
                <InfoRow label="Issuing Authority" value={certificate.issuingAuthority} icon={Landmark} />
                {certificate.blockchainHash && (
                  <InfoRow label="Blockchain ID" value={certificate.blockchainHash} icon={Lock} />
                )}
              </CardContent>
            </Card>

            {!certificate.documentUrl && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileImage className="h-4 w-4" />
                    Upload Death Certificate
                  </CardTitle>
                  <CardDescription>Upload a scan or photo of the death certificate for AI verification and blockchain storage.</CardDescription>
                </CardHeader>
                <CardContent>
                  <label
                    className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors"
                    data-testid="dropzone-certificate-upload"
                  >
                    {isUploadingDoc ? (
                      <>
                        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">Uploading and verifying...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium">Click to upload or drag and drop</p>
                        <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (max 10MB)</p>
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      disabled={isUploadingDoc}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadCertificateDoc(file);
                      }}
                      data-testid="input-certificate-file"
                    />
                  </label>
                </CardContent>
              </Card>
            )}

            {certificate.documentUrl && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileImage className="h-4 w-4" />
                      Death Certificate Document
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {certificate.aiVerificationStatus && (
                        <Badge
                          variant={
                            certificate.aiVerificationStatus === "verified" ? "default" :
                            certificate.aiVerificationStatus === "rejected" ? "destructive" : "secondary"
                          }
                          className="text-xs"
                          data-testid="badge-ai-verification"
                        >
                          {certificate.aiVerificationStatus === "verified" && <><CheckCircle2 className="h-3 w-3 mr-1" />AI Verified</>}
                          {certificate.aiVerificationStatus === "needs_review" && <><AlertTriangle className="h-3 w-3 mr-1" />Needs Review</>}
                          {certificate.aiVerificationStatus === "rejected" && <><XCircle className="h-3 w-3 mr-1" />Rejected</>}
                          {certificate.aiVerificationStatus === "pending" && <><Clock className="h-3 w-3 mr-1" />Pending</>}
                        </Badge>
                      )}
                      {certificate.aiVerificationStatus !== "verified" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={updateCaseMutation.isPending}
                          onClick={() => updateCaseMutation.mutate({ aiVerificationStatus: "verified", status: "verified" })}
                          data-testid="button-mark-doc-verified"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Mark as Verified
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="border rounded-lg overflow-hidden bg-muted/30">
                    <a href={certificate.documentUrl} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={certificate.documentUrl}
                        alt="Death Certificate Scan"
                        className="w-full max-h-[500px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
                        data-testid="img-certificate-document"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement?.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'p-8 text-center text-muted-foreground';
                            fallback.innerHTML = '<p class="text-sm">Document preview unavailable</p><p class="text-xs mt-1">Click the button below to open the document</p>';
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid="button-view-document"
                    >
                      <a href={certificate.documentUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open Full Document
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid="button-download-document"
                    >
                      <a href={certificate.documentUrl} download>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Download
                      </a>
                    </Button>
                  </div>

                  {(certificate.aiConfidenceScore != null || certificate.aiVerificationDetails) && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Verification Details</p>
                      {certificate.aiConfidenceScore != null && (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">Confidence:</span>
                          <Progress value={certificate.aiConfidenceScore} className="h-2 flex-1 max-w-[200px]" />
                          <span className="text-sm font-medium">{certificate.aiConfidenceScore}%</span>
                        </div>
                      )}
                      {certificate.aiVerificationDetails && (() => {
                        try {
                          const details = JSON.parse(certificate.aiVerificationDetails);
                          return (
                            <div className="space-y-2">
                              {details.overallAssessment && (
                                <p className="text-sm text-muted-foreground">{details.overallAssessment}</p>
                              )}
                              {details.concerns && details.concerns.length > 0 && (
                                <div className="p-2.5 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-400 mb-1">Concerns:</p>
                                  <ul className="text-xs text-yellow-700 dark:text-yellow-500 space-y-0.5">
                                    {details.concerns.map((c: string, i: number) => (
                                      <li key={i}>• {c}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {details.recommendations && details.recommendations.length > 0 && (
                                <div className="p-2.5 rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                                  <p className="text-xs font-medium text-blue-800 dark:text-blue-400 mb-1">Recommendations:</p>
                                  <ul className="text-xs text-blue-700 dark:text-blue-500 space-y-0.5">
                                    {details.recommendations.map((r: string, i: number) => (
                                      <li key={i}>• {r}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            </div>
            <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-4 w-4" />
                  Estate plan
                </CardTitle>
                <CardDescription>
                  Did the deceased have an estate? If captured here, the family won't be asked again during onboarding.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label className="mb-1 block text-xs text-muted-foreground">Estate status</Label>
                <Select
                  value={certificate.estateStatus || "unanswered"}
                  onValueChange={(value) =>
                    updateCaseMutation.mutate({ estateStatus: value === "unanswered" ? null : value } as any)
                  }
                  disabled={updateCaseMutation.isPending}
                >
                  <SelectTrigger data-testid="select-estate-status">
                    <SelectValue placeholder="Not answered yet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unanswered">Not answered yet</SelectItem>
                    <SelectItem value="yes">Yes — has an estate</SelectItem>
                    <SelectItem value="no">No estate</SelectItem>
                    <SelectItem value="unsure">Unsure</SelectItem>
                  </SelectContent>
                </Select>
                {(certificate.estateStatus === "no" || certificate.estateStatus === "unsure") && (
                  <p className="text-xs text-muted-foreground mt-2" data-testid="text-estate-ner-hint">
                    A registry search may help locate an estate plan. If no plan is found, use the{" "}
                    <a className="font-medium underline" href="#estate-referral-tracker">Estate attorney referral tracker above</a>{" "}
                    to record the referral and the next follow-up. A missing search match is not proof that no plan exists.
                  </p>
                )}
                {certificate.estateStatus === "yes" && (
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground">Family member is the authorized executor?</Label>
                    <Select
                      value={(certificate as any).isAuthorizedExecutor || "unanswered"}
                      onValueChange={(value) =>
                        updateCaseMutation.mutate({ isAuthorizedExecutor: value === "unanswered" ? null : value } as any)
                      }
                      disabled={updateCaseMutation.isPending}
                    >
                      <SelectTrigger data-testid="select-authorized-executor">
                        <SelectValue placeholder="Not answered yet" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unanswered">Not answered yet</SelectItem>
                        <SelectItem value="yes">Yes — authorized executor</SelectItem>
                        <SelectItem value="no">No — someone else is</SelectItem>
                        <SelectItem value="unsure">Unsure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(certificate as any).submitterRelationship && (
                  <p className="text-xs text-muted-foreground mt-2" data-testid="text-submitter-relationship">
                    Submitted by family member — relationship: {(certificate as any).submitterRelationship}
                  </p>
                )}
                <div className="mt-5 border-t pt-4" data-testid="sal-service-payment">
                  <div className="mb-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <CreditCard className="h-4 w-4" />
                      SAL service & payment
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose the SAL service tier. The family sees payment on their dashboard.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Referral Source</Label>
                      <Select
                        value={certificate.referralSource || "unset"}
                        onValueChange={(value) =>
                          updateCaseMutation.mutate({ referralSource: value === "unset" ? null : value } as any)
                        }
                        disabled={updateCaseMutation.isPending}
                      >
                        <SelectTrigger data-testid="select-case-referral-source">
                          <SelectValue placeholder="How did they find us?" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">Not set</SelectItem>
                          {REFERRAL_SOURCES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {certificate.referralSource && certificate.referralDetail && (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          Referral details: {certificate.referralDetail}
                        </p>
                      )}
                    </div>
                    {certificate.referralSource === "orsa" ? (
                      <div className="rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-3 flex items-center gap-2" data-testid="badge-payment-exempt">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                        <p className="text-sm text-green-800 dark:text-green-300">
                          ORSA / CFCU referral recorded. Current coverage is verified at secure checkout.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label className="text-xs text-muted-foreground">Service Plan</Label>
                          <Select
                            value={certificate.servicePlan || "unset"}
                            onValueChange={(value) =>
                              updateCaseMutation.mutate({ servicePlan: value === "unset" ? null : value } as any)
                            }
                            disabled={updateCaseMutation.isPending || certificate.paymentStatus === "paid"}
                          >
                            <SelectTrigger data-testid="select-service-plan">
                              <SelectValue placeholder="Select a plan" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unset">No plan selected</SelectItem>
                              {SERVICE_PLANS.map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label} — {p.display}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {certificate.paymentStatus === "paid" ? (
                          <div className="rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-3" data-testid="badge-payment-paid">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                              <p className="text-sm font-medium text-green-800 dark:text-green-300">Paid</p>
                            </div>
                            <p className="text-xs text-green-800 dark:text-green-300 mt-1">
                              {certificate.paymentAmount ? `$${(certificate.paymentAmount / 100).toLocaleString()}` : ""}
                              {certificate.paidAt ? ` on ${new Date(certificate.paidAt).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                        ) : certificate.servicePlan ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge variant="secondary" data-testid="badge-payment-unpaid">
                              <Clock className="h-3 w-3 mr-1" />
                              Awaiting payment
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markPaidMutation.mutate()}
                              disabled={markPaidMutation.isPending}
                              data-testid="button-mark-paid"
                            >
                              {markPaidMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <DollarSign className="h-3 w-3 mr-1" />}
                              Mark as Paid
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground" data-testid="text-no-plan-hint">
                            No plan assigned — the family won't see a payment prompt yet.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            </div>
          </div>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Family access & invitations
                  </CardTitle>
                </div>
                <CardDescription>
                  Review the family account and access status, or invite someone to join this case.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {user && (
                    <section
                      className="flex flex-wrap items-start gap-x-5 gap-y-2 rounded-lg border bg-muted/25 p-3"
                      aria-labelledby="family-account-holder-heading"
                      data-testid="family-account-holder"
                    >
                      <div className="min-w-0 flex-[1_1_18rem]">
                        <p id="family-account-holder-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Family account holder
                        </p>
                        <p className="mt-1 break-words text-sm font-medium">
                          {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Account holder is not necessarily the Next of Kin or a legally authorized representative.
                        </p>
                      </div>
                      <div className="min-w-0 max-w-full flex-[1_1_14rem] space-y-1">
                        {user.email && (
                          <a
                            className="block break-all text-sm underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            href={`mailto:${user.email}`}
                            aria-label={`Email family account holder ${user.email}`}
                          >
                            {user.email}
                          </a>
                        )}
                        {user.phoneNumber && (
                          <div className="text-sm">
                            <PhoneActions
                              phoneNumber={user.phoneNumber}
                              contactName={[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                            />
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                  {(() => {
                    const phoneWarnings = getPhoneMismatchWarnings([
                      { label: "Next of Kin", name: certificate.nextOfKinName, phone: certificate.nextOfKinPhone },
                      { label: "Informant", name: certificate.informantName, phone: certificate.informantPhone },
                      { label: "Primary Contact", name: certificate.contactName, phone: certificate.contactPhone },
                      ...(showOtherRecipient && invitePhone
                        ? [{ label: "Other Recipient", name: inviteRecipientName || null, phone: invitePhone }]
                        : []),
                    ]);
                    if (phoneWarnings.length === 0) return null;
                    return (
                      <div
                        className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2"
                        data-testid="alert-phone-mismatch"
                      >
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          Phone number mismatch detected
                        </div>
                        {phoneWarnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-800 dark:text-amber-300" data-testid={`text-phone-mismatch-${i}`}>
                            {w}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground">Select who should receive an invitation:</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { key: "nok", label: "Next of Kin", name: certificate.nextOfKinName, email: certificate.nextOfKinEmail, phone: certificate.nextOfKinPhone, relation: certificate.nextOfKinRelationship },
                      { key: "informant", label: "Informant", name: certificate.informantName, email: certificate.informantEmail, phone: certificate.informantPhone, relation: certificate.informantRelationship },
                      { key: "contact", label: "Primary Contact", name: certificate.contactName, email: certificate.contactEmail, phone: certificate.contactPhone, relation: null },
                    ]
                      .filter((r) => r.name && r.email)
                      .map((r) => (
                        <label
                          key={r.key}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedRecipients.has(r.key) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                          }`}
                          data-testid={`checkbox-recipient-${r.key}`}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 shrink-0"
                            checked={selectedRecipients.has(r.key)}
                            onChange={(e) => {
                              const next = new Set(selectedRecipients);
                              if (e.target.checked) next.add(r.key);
                              else next.delete(r.key);
                              setSelectedRecipients(next);
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{r.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{r.label}</Badge>
                            </div>
                            {r.relation && <span className="text-xs text-muted-foreground">({r.relation})</span>}
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {r.email}
                            </div>
                            {r.phone && <div className="text-xs"><PhoneActions phoneNumber={r.phone} contactName={r.name || undefined} /></div>}
                          </div>
                        </label>
                      ))}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        showOtherRecipient ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      data-testid="checkbox-recipient-other"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 shrink-0"
                        checked={showOtherRecipient}
                        onChange={(e) => {
                          setShowOtherRecipient(e.target.checked);
                          if (!e.target.checked) {
                            setInviteRecipientName("");
                            setInviteEmail("");
                            setInvitePhone("");
                          }
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">Other Recipient</span>
                        <p className="text-xs text-muted-foreground mt-0.5">Enter details manually</p>
                      </div>
                    </label>
                  </div>
                  {showOtherRecipient && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30 border border-dashed">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Recipient Name</label>
                        <Input
                          placeholder="Full name"
                          value={inviteRecipientName}
                          onChange={(e) => setInviteRecipientName(e.target.value)}
                          data-testid="input-invite-recipient-name"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Email Address</label>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          data-testid="input-invite-email"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Phone Number</label>
                        <Input
                          type="tel"
                          placeholder="555-123-4567"
                          value={formatPhone(invitePhone)}
                          onChange={(e) => setInvitePhone(formatPhone(e.target.value))}
                          data-testid="input-invite-phone"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Relationship to you</label>
                        <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={inviteDeceasedRelationship} onChange={(e) => setInviteDeceasedRelationship(e.target.value)} data-testid="select-invite-deceased-relationship">
                          <option value="">Loved one</option>
                          <option value="father">Father</option>
                          <option value="mother">Mother</option>
                           <option value="parent">Parent</option>
                          <option value="spouse">Spouse</option>
                           <option value="partner">Partner</option>
                          <option value="sibling">Sibling</option>
                           <option value="brother">Brother</option>
                           <option value="sister">Sister</option>
                           <option value="son">Son</option>
                           <option value="daughter">Daughter</option>
                           <option value="child">Child</option>
                           <option value="grandparent">Grandparent</option>
                           <option value="relative">Relative</option>
                           <option value="friend">Friend</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        const recipients: Array<{ email: string; recipientName: string; phoneNumber?: string; deceasedRelationshipToRecipient?: string | null }> = [];
                        const recipientMap: Record<string, { name: string | null; email: string | null; phone: string | null }> = {
                          nok: { name: certificate.nextOfKinName, email: certificate.nextOfKinEmail, phone: certificate.nextOfKinPhone },
                          informant: { name: certificate.informantName, email: certificate.informantEmail, phone: certificate.informantPhone },
                          contact: { name: certificate.contactName, email: certificate.contactEmail, phone: certificate.contactPhone },
                        };
                        for (const key of Array.from(selectedRecipients)) {
                          const r = recipientMap[key];
                          if (r?.name && r?.email) {
                             recipients.push({ email: r.email, recipientName: r.name, phoneNumber: r.phone || undefined, deceasedRelationshipToRecipient: key === "nok" && /^spouse$/i.test(String(certificate.nextOfKinRelationship || "")) ? "spouse" : null });
                          }
                        }
                        if (showOtherRecipient && inviteEmail && inviteRecipientName) {
                          recipients.push({ email: inviteEmail, recipientName: inviteRecipientName, phoneNumber: invitePhone || undefined, deceasedRelationshipToRecipient: inviteDeceasedRelationship || null });
                        }
                        if (recipients.length === 0) {
                          toast({ title: "Please select at least one recipient or fill in the other recipient details", variant: "destructive" });
                          return;
                        }
                        inviteFamilyMutation.mutate(recipients);
                      }}
                      disabled={inviteFamilyMutation.isPending || (selectedRecipients.size === 0 && !(showOtherRecipient && inviteEmail && inviteRecipientName))}
                      data-testid="button-send-family-invite"
                    >
                      {inviteFamilyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      Send {selectedRecipients.size + (showOtherRecipient && inviteEmail && inviteRecipientName ? 1 : 0) > 1
                        ? `${selectedRecipients.size + (showOtherRecipient && inviteEmail && inviteRecipientName ? 1 : 0)} Invitations`
                        : "Invitation"}
                    </Button>
                  </div>
                  {familyAccountsQuery.data && familyAccountsQuery.data.length > 0 && (
                    <div className="border-t pt-3 mt-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Registered Family Accounts</p>
                      <div className="space-y-2">
                        {familyAccountsQuery.data.map((acct: any) => (
                          <div key={acct.id} className="text-sm p-2.5 rounded-lg bg-muted/50" data-testid={`row-family-account-${acct.id}`}>
                            <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium truncate">{acct.accountName || acct.email}</span>
                                <span className="text-muted-foreground text-xs truncate hidden sm:inline">{acct.email}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {acct.identity?.complete ? (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" data-testid={`badge-identity-complete-${acct.id}`}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" />Identity & LPOA aligned
                                  </Badge>
                                ) : acct.identity?.reviewRequired ? (
                                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" data-testid={`badge-identity-review-${acct.id}`}>
                                    <AlertTriangle className="h-3 w-3 mr-1" />Authorization needed
                                  </Badge>
                                ) : acct.idVerificationStatus === "verified" ? (
                                  <Badge variant="outline" data-testid={`badge-lpoa-pending-${acct.id}`}>
                                    <Clock className="h-3 w-3 mr-1" />LPOA action needed
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-id-status-${acct.id}`}>
                                    ID: {acct.idVerificationStatus === "pending" ? "Pending" : acct.idVerificationStatus === "failed" ? "Failed" : "Not started"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 grid gap-1 rounded-md border bg-background/70 p-2 text-xs sm:grid-cols-2" data-testid={`identity-names-${acct.id}`}>
                              <p><span className="text-muted-foreground">Account:</span> <span className="font-medium">{acct.accountName || "—"}</span></p>
                              <p><span className="text-muted-foreground">Verified ID:</span> <span className="font-medium">{acct.idVerifiedName || "—"}</span></p>
                              <p><span className="text-muted-foreground">Certificate next of kin:</span> <span className="font-medium">{acct.certificateNames?.nextOfKin || "—"}</span></p>
                              <p><span className="text-muted-foreground">Certificate informant:</span> <span className="font-medium">{acct.certificateNames?.informant || "—"}</span></p>
                              <p className="sm:col-span-2"><span className="text-muted-foreground">Active LPOA principal:</span> <span className="font-medium">{acct.identity?.activeLpoa?.principalName || "None"}</span></p>
                            </div>
                            {acct.identity?.reviewRequired && (
                              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
                                The account or certificate name does not exactly match the verified legal name.
                                Confirm the variation or this person's authority before approving the case.
                              </p>
                            )}
                            {acct.identityReview?.status === "approved" && (
                              <p className="text-xs text-blue-700 dark:text-blue-400 mt-1.5" data-testid={`text-case-identity-review-${acct.id}`}>
                                Case authorization documented by {acct.identityReview.reviewedByName} on{" "}
                                {new Date(acct.identityReview.reviewedAt).toLocaleDateString()} — "{acct.identityReview.reason}"
                              </p>
                            )}
                            {acct.idOverrideAt && (
                              <p className="text-xs text-blue-700 dark:text-blue-400 mt-1.5" data-testid={`text-override-info-${acct.id}`}>
                                ID manually approved by {acct.idOverrideByName || "Admin"} on {new Date(acct.idOverrideAt).toLocaleDateString()}
                                {acct.idOverrideNote ? <> — "{acct.idOverrideNote}"</> : null}
                              </p>
                            )}
                            {acct.latestLpoaRequest?.status === "pending" && (
                              <p className="mt-1.5 text-xs text-muted-foreground" data-testid={`text-lpoa-request-${acct.id}`}>
                                Signature request last sent{" "}
                                {acct.latestLpoaRequest.lastSentAt
                                  ? new Date(acct.latestLpoaRequest.lastSentAt).toLocaleString()
                                  : "not yet"}
                                {" "}· {acct.latestLpoaRequest.sendAttemptCount} attempt(s)
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {!acct.idOverrideAt && acct.idVerificationStatus !== "verified" && acct.email && (
                                <FamilySafeguardReminder
                                  certificateId={certId || ""}
                                  userId={acct.id}
                                  recipientName={acct.accountName}
                                  recipientEmail={acct.email}
                                  kind="id"
                                />
                              )}
                              {!acct.idOverrideAt && (acct.idVerificationStatus !== "verified" || !acct.idVerifiedName) && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setOverrideUser(acct); setOverrideNote(""); }} data-testid={`button-override-id-${acct.id}`}>
                                  <Shield className="h-3.5 w-3.5 mr-1" />
                                  {acct.idVerificationStatus === "verified" ? "Confirm legal name" : "Approve ID Manually"}
                                </Button>
                              )}
                              {acct.canManageIdentity && acct.identity?.reviewRequired && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setIdentityReviewUser(acct);
                                    setIdentityReviewReason("");
                                  }}
                                  data-testid={`button-case-identity-override-${acct.id}`}
                                >
                                  <Shield className="h-3.5 w-3.5 mr-1" />Document Authorization
                                </Button>
                              )}
                              {acct.canManageIdentity && !acct.identity?.activeLpoa && !acct.identity?.lpoaNeedsReplacement && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setLpoaRequestUser(acct);
                                    setLpoaReplacementRequired(false);
                                    setLpoaRequestReason("We need your authorization before the concierge team can act on your behalf.");
                                  }}
                                  data-testid={`button-send-lpoa-${acct.id}`}
                                >
                                  <Send className="h-3.5 w-3.5 mr-1" />
                                  {acct.latestLpoaRequest?.status === "pending" ? "Resend LPOA request" : "Send LPOA request"}
                                </Button>
                              )}
                              {acct.canManageIdentity && acct.identity?.activeLpoa && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setLpoaRequestUser(acct);
                                    setLpoaReplacementRequired(true);
                                    setLpoaRequestReason("The signer name must match the legal name verified on your ID.");
                                  }}
                                  data-testid={`button-require-corrected-lpoa-${acct.id}`}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" />Require corrected signature
                                </Button>
                              )}
                              {acct.canManageIdentity && acct.identity?.lpoaNeedsReplacement && !acct.identity?.activeLpoa && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setLpoaRequestUser(acct);
                                    setLpoaReplacementRequired(false);
                                    setLpoaRequestReason("Please sign the corrected Limited Power of Attorney requested by your concierge.");
                                  }}
                                  data-testid={`button-resend-corrected-lpoa-${acct.id}`}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" />Resend correction request
                                </Button>
                              )}
                              <label className="inline-flex">
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) uploadFamilyDoc(acct.id, f);
                                    e.target.value = "";
                                  }}
                                  data-testid={`input-upload-doc-${acct.id}`}
                                />
                                <Button size="sm" variant="outline" className="h-7 text-xs" asChild disabled={uploadingDocFor === acct.id}>
                                  <span className="cursor-pointer">
                                    {uploadingDocFor === acct.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                                    Upload Document
                                  </span>
                                </Button>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {invitationsQuery.data && invitationsQuery.data.length > 0 && (
                    <div className="border-t pt-3 mt-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Sent Invitations</p>
                      <div className="space-y-2">
                        {invitationsQuery.data.map((inv: any) => (
                          <div key={inv.id} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/50 gap-3 flex-wrap sm:flex-nowrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium truncate">{inv.recipientName}</span>
                              <span className="text-muted-foreground text-xs truncate hidden sm:inline">
                                {inv.email}
                              </span>
                              {inv.phoneNumber && (
                                <PhoneActions phoneNumber={inv.phoneNumber} contactName={inv.recipientName} />
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {inv.emailSent && (
                                <Badge variant="outline" className="text-xs gap-1 px-1.5 py-0">
                                  <Mail className="h-2.5 w-2.5" />
                                </Badge>
                              )}
                              {inv.smsSent && (
                                <Badge variant="outline" className="text-xs gap-1 px-1.5 py-0">
                                  <Phone className="h-2.5 w-2.5" />
                                </Badge>
                              )}
                              <Badge
                                className={
                                  inv.status === "accepted"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                    : inv.status === "pending"
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                    : "bg-gray-100 text-gray-800"
                                }
                                data-testid={`badge-invite-status-${inv.id}`}
                              >
                                {inv.status === "accepted" ? (
                                  <><CheckCircle2 className="h-3 w-3 mr-1" />Accepted</>
                                ) : inv.status === "pending" ? (
                                  <><Clock className="h-3 w-3 mr-1" />Pending</>
                                ) : (
                                  inv.status
                                )}
                              </Badge>
                              {inv.status !== "accepted" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => resendInviteMutation.mutate(inv.id)}
                                  disabled={resendInviteMutation.isPending}
                                  data-testid={`button-resend-invite-${inv.id}`}
                                >
                                  {resendInviteMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><RefreshCw className="h-3 w-3 mr-1" />Resend</>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-start gap-4 [&>*]:min-w-0">
            <Card id="case-document-library" tabIndex={-1} className="scroll-mt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="card-document-library">
              <CardHeader>
                <div className="flex min-w-0 max-w-full flex-col items-start gap-3">
                  <CardTitle className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
                    <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 break-words">Document Library</span>
                    {(documentAlertsQuery.data?.unseenCount ?? 0) > 0 && (
                      <Badge variant="secondary" className="max-w-full shrink-0 border-amber-300 bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100" data-testid="case-document-library-new-badge">
                        {documentAlertsQuery.data?.unseenCount} new
                      </Badge>
                    )}
                  </CardTitle>
                  {certId && (documentAlertsQuery.data?.unseenDocumentIds.length ?? 0) > 0 && (
                    <MarkCaseDocumentsSeenButton
                      key={certId}
                      certId={certId}
                      documentIds={documentAlertsQuery.data!.unseenDocumentIds}
                      label="Mark new uploads as seen"
                      className="w-fit max-w-full self-start"
                      testId="button-mark-current-documents-seen"
                    />
                  )}
                </div>
                <CardDescription>
                  Signed authorizations and documents associated with this case.
                </CardDescription>
                {documentAlertsQuery.isError && documentAlertsQuery.data && (
                  <p className="text-xs text-amber-800 dark:text-amber-200" role="status" data-testid="case-document-library-stale-warning">
                    The latest status could not be refreshed. Existing new-document notices remain visible.
                  </p>
                )}
                {documentAlertsQuery.isError && !documentAlertsQuery.data && (
                  <p className="text-xs text-destructive" role="alert" data-testid="case-document-library-alert-error">
                    New document status is unavailable. No uploads have been marked as seen.
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {(familyDocsQuery.isLoading || lpoaDocumentsQuery.isLoading) && (
                  <div className="space-y-2" data-testid="document-library-loading">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                )}
                {(familyDocsQuery.isError || lpoaDocumentsQuery.isError) && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" data-testid="document-library-error">
                    Some case documents could not be loaded. Refresh the page to try again.
                  </div>
                )}
                {!familyDocsQuery.isLoading && !lpoaDocumentsQuery.isLoading &&
                  !familyDocsQuery.isError && !lpoaDocumentsQuery.isError &&
                  (familyDocsQuery.data?.length || 0) === 0 && (lpoaDocumentsQuery.data?.length || 0) === 0 && (
                    <div className="rounded-lg border border-dashed p-8 text-center" data-testid="document-library-empty">
                      <FileText className="mx-auto h-9 w-9 text-muted-foreground/60" />
                      <p className="mt-3 font-medium">No case documents yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        No uploaded family documents or signed LPOAs are available yet. Signed sharing agreements are listed separately below.
                      </p>
                    </div>
                  )}
                <div className="space-y-2">
                  {(lpoaDocumentsQuery.data || []).map((doc: any) => (
                    <div key={`lpoa-${doc.id}`} className="flex min-w-0 max-w-full flex-col items-stretch justify-between gap-3 rounded-lg border p-3" data-testid={`row-lpoa-document-${doc.id}`}>
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-md bg-primary/10 p-2 text-primary">
                          <FileSignature className="h-5 w-5 shrink-0" />
                        </div>
                        <div className="min-w-0 break-words">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">Limited Power of Attorney</p>
                            <Badge
                              variant={doc.status === "active" || !doc.status ? "secondary" : "outline"}
                              className="shrink-0 capitalize"
                            >
                              {(doc.status || "active").replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">
                            {doc.principalName} · Signed {new Date(doc.signedAt).toLocaleDateString()} · Valid until {doc.validUntil}
                          </p>
                          {doc.replacementReason && (
                            <p className="mt-1 break-words text-xs text-amber-700 dark:text-amber-400">
                              Correction requested: {doc.replacementReason}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="min-h-11 max-w-full self-start whitespace-normal" asChild data-testid={`button-open-lpoa-${doc.id}`}>
                        <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                        </a>
                      </Button>
                    </div>
                  ))}
                  {(familyDocsQuery.data || []).map((doc: any) => (
                    <div key={`family-${doc.id}`} className="flex min-w-0 max-w-full flex-col items-stretch justify-between gap-3 rounded-lg border p-3" data-testid={`row-family-document-${doc.id}`}>
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-md bg-muted p-2 text-muted-foreground">
                          <FileText className="h-5 w-5 shrink-0" />
                        </div>
                        <div className="min-w-0 break-words">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="break-words text-sm font-medium">{doc.label || doc.fileName}</p>
                            <Badge variant="secondary" className="shrink-0">
                              {FAMILY_DOCUMENT_TYPES.find((type) => type.value === doc.documentType)?.label || "Other"}
                            </Badge>
                          </div>
                          <p className="mt-0.5 break-words text-xs text-muted-foreground">
                            {doc.uploaderName || "Uploader"} · {doc.uploadedByRole === "admin" ? "Concierge" : "Family"} uploader · Uploaded {new Date(doc.uploadedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {certId && (
                        <FamilyDocumentAccountAssigner
                          certId={certId}
                          document={doc}
                          accounts={accounts}
                        />
                      )}
                      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-start gap-2">
                        {documentAlertsQuery.data?.unseenDocumentIds.includes(String(doc.id)) && (
                          <>
                            <Badge variant="outline" className="shrink-0 border-amber-400/70 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" data-testid={`case-document-new-${doc.id}`}>
                              New
                            </Badge>
                            {certId && (
                              <MarkCaseDocumentsSeenButton
                                certId={certId}
                                documentIds={[String(doc.id)]}
                                label="Mark seen"
                                className="w-fit max-w-full"
                                testId={`button-mark-document-seen-${doc.id}`}
                              />
                            )}
                          </>
                        )}
                        <Button size="sm" variant="outline" className="min-h-11 max-w-full whitespace-normal" asChild data-testid={`button-view-doc-${doc.id}`}>
                          <a href={doc.objectPath} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                          </a>
                        </Button>
                        <Button size="icon" variant="ghost" className="min-h-11 min-w-11 shrink-0 text-destructive" onClick={() => deleteFamilyDocMutation.mutate(doc.id)} data-testid={`button-delete-doc-${doc.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <FamilyAuthorizationDocuments certificateId={certId || ""} />
                </div>
              </CardContent>
            </Card>

            <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="flex min-w-0 items-start gap-2 text-base">
                    <Landmark className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">Government Notifications ({governmentNotifications.length})</span>
                  </CardTitle>
                  <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                    <AdminSectionControl section="govNotifications" value={sectionVisibility.govNotifications} onChange={(v) => toggleSectionVisibility("govNotifications", v)} />
                    <Button size="sm" onClick={() => setShowAddGovNotification(!showAddGovNotification)} disabled={sectionVisibility.govNotifications === "locked" || sectionVisibility.govNotifications === "hidden"} data-testid="button-add-gov-notification">
                      {showAddGovNotification ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                      {showAddGovNotification ? "Cancel" : "Add"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sectionVisibility.govNotifications === "hidden" ? (
                  <div className="text-center text-muted-foreground py-4"><EyeOff className="h-6 w-6 mx-auto mb-1 opacity-50" /><p className="text-xs">Hidden</p></div>
                ) : sectionVisibility.govNotifications === "locked" ? (
                  <div className="text-center text-muted-foreground py-4"><Lock className="h-6 w-6 mx-auto mb-1 opacity-50" /><p className="text-xs">Locked</p></div>
                ) : (
                  <>
                    {sectionVisibility.govNotifications === "in_review" && (
                      <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 p-2 rounded-md border border-yellow-200 dark:border-yellow-900 mb-2">
                        <Clock className="h-3.5 w-3.5" /> Under review
                      </div>
                    )}

                    {showAddGovNotification && (
                      <div className="border rounded-lg p-3 mb-3 space-y-3 bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground">Add Government Agency Notification</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Agency</label>
                            <Select value={govForm.agency} onValueChange={(v) => setGovForm({ ...govForm, agency: v })}>
                              <SelectTrigger data-testid="select-gov-agency">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ssa">Social Security (SSA)</SelectItem>
                                <SelectItem value="va">Veterans Affairs (VA)</SelectItem>
                                <SelectItem value="medicare">Medicare</SelectItem>
                                <SelectItem value="medicaid">Medicaid</SelectItem>
                                <SelectItem value="irs">IRS</SelectItem>
                                <SelectItem value="state_benefits">State Benefits</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Notification Type</label>
                            <Input
                              value={govForm.notificationType}
                              onChange={(e) => setGovForm({ ...govForm, notificationType: e.target.value })}
                              placeholder="e.g. Death Notification"
                              data-testid="input-gov-notification-type"
                            />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => createGovNotificationMutation.mutate(govForm)}
                          disabled={!govForm.notificationType.trim() || createGovNotificationMutation.isPending}
                          data-testid="button-submit-gov-notification"
                        >
                          {createGovNotificationMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                          Add Notification
                        </Button>
                      </div>
                    )}

                    {governmentNotifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No government notifications yet. Click Add to get started.</p>
                    ) : (
                      <div className="space-y-2">
                        {governmentNotifications.map((gn) => (
                          <div key={gn.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-3" data-testid={`gov-notification-${gn.id}`}>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{gn.agency.toUpperCase()}</p>
                              <p className="text-xs text-muted-foreground">{gn.notificationType}</p>
                              {gn.referenceNumber && (
                                <p className="text-[10px] text-muted-foreground/70">Ref: {gn.referenceNumber}</p>
                              )}
                            </div>
                            <Select
                              value={gn.status}
                              onValueChange={(v) => updateGovStatusMutation.mutate({ id: gn.id, status: v })}
                            >
                              <SelectTrigger className="h-7 w-[140px] text-xs" data-testid={`select-gov-status-${gn.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="successful">Completed</SelectItem>
                                <SelectItem value="not_completed">Not Completed</SelectItem>
                                <SelectItem value="unsuccessful">Unsuccessful</SelectItem>
                                <SelectItem value="not_applicable">Not Applicable</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {creditProtection.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Credit Protection
                    </CardTitle>
                    <AdminSectionControl section="creditProtection" value={sectionVisibility.creditProtection} onChange={(v) => toggleSectionVisibility("creditProtection", v)} />
                  </div>
                </CardHeader>
                <CardContent>
                  {sectionVisibility.creditProtection === "hidden" ? (
                    <div className="text-center text-muted-foreground py-4"><EyeOff className="h-6 w-6 mx-auto mb-1 opacity-50" /><p className="text-xs">Hidden</p></div>
                  ) : sectionVisibility.creditProtection === "locked" ? (
                    <div className="text-center text-muted-foreground py-4"><Lock className="h-6 w-6 mx-auto mb-1 opacity-50" /><p className="text-xs">Locked</p></div>
                  ) : (
                    <>
                      {sectionVisibility.creditProtection === "in_review" && (
                        <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 p-2 rounded-md border border-yellow-200 dark:border-yellow-900 mb-2">
                          <Clock className="h-3.5 w-3.5" /> Under review
                        </div>
                      )}
                      <div className="space-y-2">
                        {creditProtection.map((cp) => (
                          <div key={cp.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                            <div>
                              <p className="text-sm font-medium">{cp.bureau}</p>
                              {cp.externalReference && <p className="text-xs text-muted-foreground">Ref: {cp.externalReference}</p>}
                            </div>
                            <StatusBadge status={cp.status} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
            </div>
          </div>
          <NerSearchHistory key={certId} certId={certId || ""} deceasedName={certificate.deceasedName} variant="admin" />
          <Card data-testid="card-funeral-home-invitation">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Invite funeral home</CardTitle>
              <CardDescription>Send a private, time-limited link for the funeral home to upload the certificate. They cannot access this case.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div><Label htmlFor="funeral-home-name">Funeral home name</Label><Input id="funeral-home-name" value={funeralHomeName} onChange={(e) => setFuneralHomeName(e.target.value)} placeholder="Evergreen Funeral Home" /></div>
                <div><Label htmlFor="funeral-home-email">Email address</Label><Input id="funeral-home-email" type="email" value={funeralHomeEmail} onChange={(e) => setFuneralHomeEmail(e.target.value)} placeholder="records@example.com" /></div>
                <Button className="self-end" disabled={!funeralHomeName.trim() || !funeralHomeEmail.includes("@") || inviteFuneralHomeMutation.isPending} onClick={() => inviteFuneralHomeMutation.mutate()}><Send className="mr-2 h-4 w-4" />{inviteFuneralHomeMutation.isPending ? "Sending…" : "Send invite"}</Button>
              </div>
              {Array.isArray(funeralHomeInvitationsQuery.data?.invitations || funeralHomeInvitationsQuery.data) && (funeralHomeInvitationsQuery.data?.invitations || funeralHomeInvitationsQuery.data).length > 0 && <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Funeral home invitations</p>
                {(funeralHomeInvitationsQuery.data?.invitations || funeralHomeInvitationsQuery.data).map((inv: any) => {
                  const state = String(inv.status || inv.invitationStatus || "pending").toLowerCase();
                  const label = state === "completed" || state === "accepted" ? "Completed" : state === "revoked" ? "Revoked" : state === "expired" ? "Expired" : "Pending";
                  const tone = label === "Completed" ? "bg-green-100 text-green-800" : label === "Pending" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-700";
                  return <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                    <div className="min-w-0"><p className="font-medium">{inv.funeralHomeName || inv.name || "Funeral home"}</p><p className="break-all text-xs text-muted-foreground">{inv.email || inv.funeralHomeEmail}</p></div>
                    <div className="flex items-center gap-2"><Badge className={tone}>{label}</Badge>{!["Completed", "Revoked"].includes(label) && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => funeralHomeActionMutation.mutate({ id: inv.id, action: "resend" })}><RefreshCw className="mr-1 h-3 w-3" />Resend</Button>}{!["Completed", "Revoked", "Expired"].includes(label) && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => funeralHomeActionMutation.mutate({ id: inv.id, action: "revoke" })}>Revoke</Button>}</div>
                  </div>;
                })}
              </div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          {accountNotificationTarget && accountNotificationTarget.certificateId === certId && (
            <AccountCompanyNotificationDialog
              key={`${accountNotificationTarget.certificateId}:${accountNotificationTarget.accountId}`}
              accountId={accountNotificationTarget.accountId}
              accountName={accountNotificationTarget.accountName}
              certificateId={accountNotificationTarget.certificateId}
              open
              onOpenChange={(open) => { if (!open) setAccountNotificationTarget(null); }}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Connected Accounts</h3>
            <div className="flex flex-wrap items-center gap-2">
              <AdminSectionControl section="accounts" value={sectionVisibility.accounts} onChange={(v) => toggleSectionVisibility("accounts", v)} />
              {authUser?.role === "admin" && (
                <Button size="sm" variant="outline" onClick={() => setShowAccountEmailIntake((current) => !current)} disabled={sectionVisibility.accounts === "locked" || sectionVisibility.accounts === "hidden"} data-testid="account-email-intake-entry">
                  <ClipboardPaste className="mr-1 h-4 w-4" />
                  {showAccountEmailIntake ? "Close intake" : "Paste email or account details"}
                </Button>
              )}
              <Button size="sm" onClick={() => setShowAddAccount(!showAddAccount)} disabled={sectionVisibility.accounts === "locked" || sectionVisibility.accounts === "hidden"} data-testid="button-add-account">
                {showAddAccount ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {showAddAccount ? "Cancel" : "Add Account"}
              </Button>
            </div>
          </div>
          {sectionVisibility.accounts === "hidden" ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Connected Accounts section is hidden from view.</p>
              </CardContent>
            </Card>
          ) : sectionVisibility.accounts === "locked" ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Connected Accounts section is locked. No changes can be made.</p>
              </CardContent>
            </Card>
          ) : (
          <>
          {sectionVisibility.accounts === "in_review" && (
            <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 p-2 rounded-md border border-yellow-200 dark:border-yellow-900">
              <Clock className="h-3.5 w-3.5" /> This section is currently under review by the concierge team.
            </div>
          )}

          {authUser?.role === "admin" && showAccountEmailIntake && sectionVisibility.accounts !== "locked" && sectionVisibility.accounts !== "hidden" && (
            <div data-testid="account-email-intake-panel">
              <AccountEmailIntake caseId={certId} caseName={caseData?.certificate.deceasedName} />
            </div>
          )}

          {showAddAccount && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Connected Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Category *</label>
                    <Select value={accountForm.category} onValueChange={(v) => setAccountForm({ ...accountForm, category: v })}>
                      <SelectTrigger data-testid="select-account-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="financial">Financial</SelectItem>
                        <SelectItem value="memberships">Memberships</SelectItem>
                        <SelectItem value="subscriptions">Subscriptions</SelectItem>
                        <SelectItem value="real_estate">Real Estate</SelectItem>
                        <SelectItem value="protected_information">Protected Information</SelectItem>
                        <SelectItem value="miscellaneous">Miscellaneous</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Account Name *</label>
                    <Input
                      value={accountForm.accountName}
                      onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })}
                      placeholder="e.g. Chase Bank, Netflix, AT&T"
                      data-testid="input-account-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Account Type *</label>
                    <Input
                      value={accountForm.accountType}
                      onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })}
                      placeholder="e.g. Checking, Savings, Streaming, Utility"
                      data-testid="input-account-type"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Account Number</label>
                    <Input
                      value={accountForm.accountNumber}
                      onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                      placeholder="Account number"
                      data-testid="input-account-number"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Designation</label>
                    <Input
                      value={accountForm.accountDesignation}
                      onChange={(e) => setAccountForm({ ...accountForm, accountDesignation: e.target.value })}
                      placeholder="e.g. Primary, Secondary"
                      data-testid="input-account-designation"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Responsible Party</label>
                    <Select value={accountForm.responsibleParty} onValueChange={(v) => setAccountForm({ ...accountForm, responsibleParty: v })}>
                      <SelectTrigger data-testid="select-responsible-party">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sal_team">SAL Team (We handle it)</SelectItem>
                        <SelectItem value="family">Family (Requires legal authority)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={accountForm.isJoint}
                      onChange={(e) => setAccountForm({ ...accountForm, isJoint: e.target.checked })}
                      data-testid="checkbox-account-joint"
                    />
                    Joint Account
                  </label>
                  {accountForm.isJoint && (
                    <div className="flex-1">
                      <Input
                        value={accountForm.survivorName}
                        onChange={(e) => setAccountForm({ ...accountForm, survivorName: e.target.value })}
                        placeholder="Surviving account holder name"
                        data-testid="input-account-survivor"
                      />
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => certId && createAccountMutation.mutate({ data: accountForm, certificateId: certId })}
                  disabled={!accountForm.accountName || !accountForm.accountType || createAccountMutation.isPending}
                  data-testid="button-submit-account"
                >
                  {createAccountMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {createAccountMutation.isPending ? "Adding..." : "Add Account"}
                </Button>
              </CardContent>
            </Card>
          )}

          {Object.entries(accountsByCategory).map(([category, catAccounts]) => (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  <Badge variant="secondary" className="ml-auto">{catAccounts.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-full overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Account Holder</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Account #</TableHead>
                      <TableHead>Joint</TableHead>
                      <TableHead>Added By</TableHead>
                      <TableHead>Responsible</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Task Status</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catAccounts.map((account) => (
                      <TableRow
                        key={account.id}
                        data-testid={`row-account-${account.id}`}
                        className="cursor-pointer"
                        onClick={() => openAccountDialog(account)}
                      >
                        <TableCell className="font-medium">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="break-words">{account.accountName}</span>
                              {account.notes && <FileText className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Has notes" />}
                            </div>
                            <AccountCompanyNotificationAction
                              accountId={String(account.id)}
                              accountName={account.accountName}
                              certificateId={certId || ""}
                            />
                            <AccountCompanyPhone accountId={account.id} accountName={account.accountName} accountType={account.accountType} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm" data-testid={`text-holder-${account.id}`}>{certificate.deceasedName}</span>
                          </div>
                          {account.isJoint && account.survivorName && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground">{account.survivorName}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{account.accountType}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {account.accountNumber ? `****${account.accountNumber.slice(-4)}` : "—"}
                        </TableCell>
                        <TableCell>
                          {account.isJoint ? (
                            <Badge variant="outline" className="text-xs">Joint</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {account.addedBy ? (
                            <Badge variant="outline" className={`text-xs ${account.addedBy === "sal_team" ? "border-blue-300 text-blue-700" : "border-green-300 text-green-700"}`}>
                              {account.addedBy === "sal_team" ? "SAL Team" : "Family"}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {account.responsibleParty ? (
                            <Badge className={`text-xs ${account.responsibleParty === "family" ? "bg-purple-500/10 text-purple-700" : "bg-blue-500/10 text-blue-700"}`}>
                              {account.responsibleParty === "family" ? "Family" : "SAL Team"}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {account.selectedAction ? (
                            <Badge variant="secondary" className="text-xs capitalize">{account.selectedAction}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {account.taskCompletionStatus && <StatusBadge status={account.taskCompletionStatus} />}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={account.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          ))}
          {accounts.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No connected accounts found for this case.
              </CardContent>
            </Card>
          )}
          </>
          )}

          <Dialog open={!!selectedAccount} onOpenChange={(open) => { if (!open) setSelectedAccount(null); }}>
            <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
              {selectedAccount && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {selectedAccount.accountName}
                    </DialogTitle>
                    <DialogDescription>
                      {selectedAccount.accountType} · {selectedAccount.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      {selectedAccount.accountNumber ? ` · ****${selectedAccount.accountNumber.slice(-4)}` : ""}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Button
                      type="button"
                      className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal py-3 text-left"
                      aria-label={`Send link to company for ${selectedAccount.accountName}`}
                      data-testid={`button-email-secure-link-details-${selectedAccount.id}`}
                      onClick={() => {
                        const target = {
                          accountId: String(selectedAccount.id),
                          accountName: selectedAccount.accountName,
                          certificateId: certId || "",
                        };
                        setSelectedAccount(null);
                        window.setTimeout(() => setAccountNotificationTarget(target), 150);
                      }}
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      <span>Send link to company</span>
                    </Button>
                    {certId && (
                      <AccountFamilyDocuments
                        certId={certId}
                        account={selectedAccount}
                        documents={familyDocsQuery.data || []}
                        documentsLoading={familyDocsQuery.isLoading}
                        documentsError={familyDocsQuery.isError}
                        onRetryDocuments={() => { void familyDocsQuery.refetch(); }}
                        onOpenLibrary={() => {
                          setSelectedAccount(null);
                          reviewNewDocuments();
                        }}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Current Status</p>
                        <StatusBadge status={selectedAccount.status} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Action</p>
                        <p className="capitalize">{selectedAccount.selectedAction || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Responsible</p>
                        <p>{selectedAccount.responsibleParty === "family" ? "Family" : "SAL Team"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Added By</p>
                        <p>{selectedAccount.addedBy === "sal_team" ? "SAL Team" : selectedAccount.addedBy === "family" ? "Family" : "—"}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="mb-1 block text-xs">Responsible party</Label>
                        <Select
                          value={accountEdit.responsibleParty}
                          onValueChange={(v) => setAccountEdit({ ...accountEdit, responsibleParty: v })}
                          disabled={updateAccountMutation.isPending}
                        >
                          <SelectTrigger data-testid="select-account-responsible-party">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sal_team">SAL Team</SelectItem>
                            <SelectItem value="family">Family</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs">Action</Label>
                        <Select
                          value={accountEdit.selectedAction}
                          onValueChange={(v) => setAccountEdit({ ...accountEdit, selectedAction: v })}
                          disabled={updateAccountMutation.isPending}
                        >
                          <SelectTrigger data-testid="select-account-action">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No action selected</SelectItem>
                            <SelectItem value="close">Close</SelectItem>
                            <SelectItem value="suspend">Suspend</SelectItem>
                            <SelectItem value="continue">Continue</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {accountEdit.responsibleParty === "family" && (
                      <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-4" aria-label="Family-visible handoff details">
                        <div>
                          <h3 className="text-sm font-semibold">Details for the family</h3>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            These details are visible to the family. Contact details are provided by staff and are not automatically verified.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="family-action-instructions">Family action instructions</Label>
                          <Textarea
                            id="family-action-instructions"
                            value={accountEdit.familyActionInstructions}
                            onChange={(e) => setAccountEdit({ ...accountEdit, familyActionInstructions: e.target.value })}
                            placeholder="Add clear next-step details for the family"
                            rows={4}
                            disabled={updateAccountMutation.isPending}
                            data-testid="input-family-action-instructions"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor="family-contact-phone">Family-visible phone</Label>
                            <Input
                              id="family-contact-phone"
                              type="tel"
                              value={accountEdit.familyContactPhone}
                              onChange={(e) => setAccountEdit({ ...accountEdit, familyContactPhone: e.target.value })}
                              placeholder="Optional"
                              disabled={updateAccountMutation.isPending}
                              data-testid="input-family-contact-phone"
                            />
                          </div>
                          <div>
                            <Label htmlFor="family-contact-email">Family-visible email</Label>
                            <Input
                              id="family-contact-email"
                              type="email"
                              value={accountEdit.familyContactEmail}
                              onChange={(e) => setAccountEdit({ ...accountEdit, familyContactEmail: e.target.value })}
                              placeholder="Optional"
                              disabled={updateAccountMutation.isPending}
                              data-testid="input-family-contact-email"
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Update Status</label>
                      <Select value={accountEdit.status} onValueChange={(v) => setAccountEdit({ ...accountEdit, status: v })} disabled={updateAccountMutation.isPending}>
                        <SelectTrigger data-testid="select-account-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending_action">Pending Action</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Internal notes · not shared with the family</label>
                      <Textarea
                        value={accountEdit.notes}
                        onChange={(e) => setAccountEdit({ ...accountEdit, notes: e.target.value })}
                        placeholder="Staff-only notes about calls, documents, or internal follow-up"
                        rows={4}
                        disabled={updateAccountMutation.isPending}
                        data-testid="input-account-notes"
                      />
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Saving updates the family workspace only. It does not notify the provider, send email or SMS, or grant anyone authority to act on the account.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setSelectedAccount(null)} disabled={updateAccountMutation.isPending} data-testid="button-cancel-account-edit">
                        Cancel
                      </Button>
                      <Button
                        onClick={() => updateAccountMutation.mutate({
                          accountId: selectedAccount.id,
                          status: accountEdit.status,
                          notes: accountEdit.notes,
                          responsibleParty: accountEdit.responsibleParty as "sal_team" | "family",
                          selectedAction: accountEdit.selectedAction === "none" ? null : accountEdit.selectedAction as "close" | "suspend" | "continue" | "transfer",
                          familyActionInstructions: accountEdit.familyActionInstructions,
                          familyContactPhone: accountEdit.familyContactPhone,
                          familyContactEmail: accountEdit.familyContactEmail,
                        })}
                        disabled={updateAccountMutation.isPending}
                        data-testid="button-save-account-edit"
                      >
                        {updateAccountMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="credit-discovery" className="space-y-4">
          <CreditDiscoveryTab certificateId={certificate.id} deceasedName={certificate.deceasedName} accounts={accounts} />
        </TabsContent>

        <TabsContent value="relatives" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Nearest Relatives</h3>
            <div className="flex items-center gap-2">
              <AdminSectionControl section="relatives" value={sectionVisibility.relatives} onChange={(v) => toggleSectionVisibility("relatives", v)} />
              <Button size="sm" onClick={() => setShowAddRelative(!showAddRelative)} disabled={sectionVisibility.relatives === "locked" || sectionVisibility.relatives === "hidden"} data-testid="button-add-relative">
                {showAddRelative ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {showAddRelative ? "Cancel" : "Add Relative"}
              </Button>
            </div>
          </div>
          {sectionVisibility.relatives === "hidden" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Relatives section is hidden.</p></CardContent></Card>
          ) : sectionVisibility.relatives === "locked" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><Lock className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Relatives section is locked.</p></CardContent></Card>
          ) : (
          <>
          {sectionVisibility.relatives === "in_review" && (
            <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 p-2 rounded-md border border-yellow-200 dark:border-yellow-900">
              <Clock className="h-3.5 w-3.5" /> This section is currently under review by the concierge team.
            </div>
          )}

          {showAddRelative && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Relative Manually
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Full Name *</label>
                    <Input
                      value={relativeForm.fullName}
                      onChange={(e) => setRelativeForm({ ...relativeForm, fullName: e.target.value })}
                      placeholder="Full name"
                      data-testid="input-relative-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Relationship</label>
                    <Input
                      value={relativeForm.relationship}
                      onChange={(e) => setRelativeForm({ ...relativeForm, relationship: e.target.value })}
                      placeholder="e.g. Sibling, Cousin, Aunt, Uncle"
                      data-testid="input-relative-relationship"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                    <Input
                      value={relativeForm.phone}
                      onChange={(e) => setRelativeForm({ ...relativeForm, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      data-testid="input-relative-phone"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                    <Input
                      value={relativeForm.email}
                      onChange={(e) => setRelativeForm({ ...relativeForm, email: e.target.value })}
                      placeholder="email@example.com"
                      data-testid="input-relative-email"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Age</label>
                    <Input
                      value={relativeForm.age}
                      onChange={(e) => setRelativeForm({ ...relativeForm, age: e.target.value })}
                      placeholder="Age"
                      data-testid="input-relative-age"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Address</label>
                    <Input
                      value={relativeForm.address}
                      onChange={(e) => setRelativeForm({ ...relativeForm, address: e.target.value })}
                      placeholder="Street address"
                      data-testid="input-relative-address"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">City</label>
                    <Input
                      value={relativeForm.city}
                      onChange={(e) => setRelativeForm({ ...relativeForm, city: e.target.value })}
                      placeholder="City"
                      data-testid="input-relative-city"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">State</label>
                    <Input
                      value={relativeForm.state}
                      onChange={(e) => setRelativeForm({ ...relativeForm, state: e.target.value })}
                      placeholder="State"
                      data-testid="input-relative-state"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Zip Code</label>
                    <Input
                      value={relativeForm.zipCode}
                      onChange={(e) => setRelativeForm({ ...relativeForm, zipCode: e.target.value })}
                      placeholder="Zip code"
                      data-testid="input-relative-zip"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => createRelativeMutation.mutate(relativeForm)}
                  disabled={!relativeForm.fullName || createRelativeMutation.isPending}
                  data-testid="button-submit-relative"
                >
                  {createRelativeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {createRelativeMutation.isPending ? "Adding..." : "Add Relative"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserSearch className="h-4 w-4" />
                    Nearest Relatives — Public Data Search
                  </CardTitle>
                  <CardDescription>
                    Search public records using the deceased's address and personal data to find nearest relatives and their contact information.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => searchRelativesMutation.mutate()}
                  disabled={searchRelativesMutation.isPending}
                  data-testid="button-search-relatives"
                >
                  {searchRelativesMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  {searchRelativesMutation.isPending ? "Searching..." : "Search Public Records"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {relatives.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <Globe className="h-3 w-3" />
                    {relatives.length} relative(s) found via public records search
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {relatives.map((rel: any) => (
                      <Card key={rel.id} className="border" data-testid={`card-relative-${rel.id}`}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-primary" />
                              <span className="font-semibold text-sm" data-testid={`text-relative-name-${rel.id}`}>{rel.fullName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {rel.confidence && (
                                <Badge
                                  variant={rel.confidence === "high" ? "default" : rel.confidence === "medium" ? "secondary" : "outline"}
                                  className="text-[10px]"
                                  data-testid={`badge-confidence-${rel.id}`}
                                >
                                  {rel.confidence}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {rel.relationship && (
                            <div className="flex items-center gap-2 text-xs">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Relationship:</span>
                              <span className="font-medium">{rel.relationship}</span>
                            </div>
                          )}
                          {rel.age && (
                            <div className="flex items-center gap-2 text-xs">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Age:</span>
                              <span>{rel.age}</span>
                            </div>
                          )}
                          {rel.phone && (
                            <div className="flex items-center gap-2 text-xs">
                              <PhoneActions phoneNumber={rel.phone} contactName={rel.fullName} />
                            </div>
                          )}
                          {rel.email && (
                            <div className="flex items-center gap-2 text-xs">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <a href={`mailto:${rel.email}`} className="text-primary hover:underline" data-testid={`link-email-${rel.id}`}>{rel.email}</a>
                            </div>
                          )}
                          {(rel.address || rel.city || rel.state) && (
                            <div className="flex items-center gap-2 text-xs">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span>{[rel.address, rel.city, rel.state, rel.zipCode].filter(Boolean).join(", ")}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t">
                            <Globe className="h-3 w-3" />
                            Source: {rel.dataSource?.replace("_", " ")} &middot; Found {new Date(rel.discoveredAt).toLocaleDateString()}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <UserSearch className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No relatives discovered yet.</p>
                  <p className="text-xs mt-1">Click "Search Public Records" to search using the deceased's address and personal data.</p>
                </div>
              )}
            </CardContent>
          </Card>
          </>
          )}
        </TabsContent>

        <TabsContent value="beneficiaries" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">{beneficiaries.length} beneficiar{beneficiaries.length === 1 ? "y" : "ies"} recorded</h3>
            <div className="flex items-center gap-2">
              <AdminSectionControl section="beneficiaries" value={sectionVisibility.beneficiaries} onChange={(v) => toggleSectionVisibility("beneficiaries", v)} />
              <Button size="sm" onClick={() => setShowAddBeneficiary(!showAddBeneficiary)} disabled={sectionVisibility.beneficiaries === "locked" || sectionVisibility.beneficiaries === "hidden"} data-testid="button-add-beneficiary">
                {showAddBeneficiary ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {showAddBeneficiary ? "Cancel" : "Add Beneficiary"}
              </Button>
            </div>
          </div>
          {sectionVisibility.beneficiaries === "hidden" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Beneficiaries section is hidden.</p></CardContent></Card>
          ) : sectionVisibility.beneficiaries === "locked" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><Lock className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Beneficiaries section is locked.</p></CardContent></Card>
          ) : (
          <>
          {sectionVisibility.beneficiaries === "in_review" && (
            <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 p-2 rounded-md border border-yellow-200 dark:border-yellow-900">
              <Clock className="h-3.5 w-3.5" /> This section is currently under review by the concierge team.
            </div>
          )}

          {showAddBeneficiary && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Beneficiary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Full Name *</label>
                    <Input
                      value={beneficiaryForm.fullName}
                      onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, fullName: e.target.value })}
                      placeholder="Full name"
                      data-testid="input-beneficiary-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Relationship *</label>
                    <Select value={beneficiaryForm.relationship} onValueChange={(v) => setBeneficiaryForm({ ...beneficiaryForm, relationship: v as any })}>
                      <SelectTrigger data-testid="select-beneficiary-relationship">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spouse">Spouse</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="dependent">Dependent</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                    <Input
                      value={beneficiaryForm.phone}
                      onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      data-testid="input-beneficiary-phone"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                    <Input
                      value={beneficiaryForm.email}
                      onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, email: e.target.value })}
                      placeholder="email@example.com"
                      data-testid="input-beneficiary-email"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Date of Birth</label>
                    <Input
                      value={beneficiaryForm.dateOfBirth}
                      onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, dateOfBirth: e.target.value })}
                      placeholder="MM/DD/YYYY"
                      data-testid="input-beneficiary-dob"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Address</label>
                    <Input
                      value={beneficiaryForm.address}
                      onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, address: e.target.value })}
                      placeholder="Full address"
                      data-testid="input-beneficiary-address"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={beneficiaryForm.isMinor}
                      onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, isMinor: e.target.checked })}
                      data-testid="checkbox-beneficiary-minor"
                    />
                    Is a minor
                  </label>
                  {beneficiaryForm.isMinor && (
                    <div className="flex-1">
                      <Input
                        value={beneficiaryForm.guardianName}
                        onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, guardianName: e.target.value })}
                        placeholder="Guardian name"
                        data-testid="input-beneficiary-guardian"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                  <Textarea
                    value={beneficiaryForm.notes}
                    onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={2}
                    data-testid="input-beneficiary-notes"
                  />
                </div>
                <Button
                  onClick={() => createBeneficiaryMutation.mutate(beneficiaryForm)}
                  disabled={!beneficiaryForm.fullName || createBeneficiaryMutation.isPending}
                  data-testid="button-submit-beneficiary"
                >
                  {createBeneficiaryMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {createBeneficiaryMutation.isPending ? "Adding..." : "Add Beneficiary"}
                </Button>
              </CardContent>
            </Card>
          )}

          {beneficiaries.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {beneficiaries.map((b) => (
                <Card key={b.id} data-testid={`card-beneficiary-${b.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{b.fullName}</CardTitle>
                      <StatusBadge status={b.status} />
                    </div>
                    <CardDescription className="capitalize">{b.relationship}{b.isMinor ? " (Minor)" : ""}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <InfoRow label="Date of Birth" value={b.dateOfBirth} icon={Clock} />
                    <InfoRow label="SSN" value={b.ssn ? `***-**-${b.ssn.slice(-4)}` : undefined} icon={Shield} />
                    <InfoRow label="Email" value={b.email} icon={Mail} />
                    <InfoRow label="Phone" value={b.phone} icon={Phone} isPhone contactName={b.fullName} />
                    <InfoRow label="Address" value={b.address} icon={MapPin} />
                    {b.guardianName && <InfoRow label="Guardian" value={b.guardianName} icon={Users} />}
                    {b.eligibleBenefits && b.eligibleBenefits.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs text-muted-foreground mb-1">Eligible Benefits</p>
                        <div className="flex flex-wrap gap-1">
                          {b.eligibleBenefits.map((benefit, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{benefit}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {b.notes && <InfoRow label="Notes" value={b.notes} />}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !showAddBeneficiary ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No beneficiaries recorded for this case.</p>
                <p className="text-xs mt-1">Click "Add Beneficiary" to register a new one.</p>
              </CardContent>
            </Card>
          ) : null}
          </>
          )}
        </TabsContent>

        <TabsContent value="insurance" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Life Insurance Policies</h3>
            <div className="flex items-center gap-2">
              <AdminSectionControl section="insurance" value={sectionVisibility.insurance} onChange={(v) => toggleSectionVisibility("insurance", v)} />
              <Button size="sm" onClick={() => setShowAddInsurance(!showAddInsurance)} disabled={sectionVisibility.insurance === "locked" || sectionVisibility.insurance === "hidden"} data-testid="button-add-insurance">
                {showAddInsurance ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {showAddInsurance ? "Cancel" : "Add Policy"}
              </Button>
            </div>
          </div>
          {sectionVisibility.insurance === "hidden" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Insurance section is hidden.</p></CardContent></Card>
          ) : sectionVisibility.insurance === "locked" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><Lock className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Insurance section is locked.</p></CardContent></Card>
          ) : (
          <>
          {sectionVisibility.insurance === "in_review" && (
            <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 p-2 rounded-md border border-yellow-200 dark:border-yellow-900">
              <Clock className="h-3.5 w-3.5" /> This section is currently under review by the concierge team.
            </div>
          )}

          {showAddInsurance && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Life Insurance Policy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Insurance Provider *</label>
                    <Input
                      value={insuranceForm.provider}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, provider: e.target.value })}
                      placeholder="e.g. MetLife, Prudential, New York Life"
                      data-testid="input-insurance-provider"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Policy Number</label>
                    <Input
                      value={insuranceForm.policyNumber}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, policyNumber: e.target.value })}
                      placeholder="Policy number"
                      data-testid="input-insurance-policy-number"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Policy Type</label>
                    <Select value={insuranceForm.policyType} onValueChange={(v) => setInsuranceForm({ ...insuranceForm, policyType: v })}>
                      <SelectTrigger data-testid="select-insurance-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Term Life">Term Life</SelectItem>
                        <SelectItem value="Whole Life">Whole Life</SelectItem>
                        <SelectItem value="Universal Life">Universal Life</SelectItem>
                        <SelectItem value="Variable Life">Variable Life</SelectItem>
                        <SelectItem value="Group Life">Group Life</SelectItem>
                        <SelectItem value="Final Expense">Final Expense</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Face Value ($)</label>
                    <Input
                      value={insuranceForm.faceValue}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, faceValue: e.target.value })}
                      placeholder="e.g. 250,000"
                      data-testid="input-insurance-face-value"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Beneficiary Name</label>
                    <Input
                      value={insuranceForm.beneficiaryName}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, beneficiaryName: e.target.value })}
                      placeholder="Primary beneficiary"
                      data-testid="input-insurance-beneficiary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Beneficiary Relationship</label>
                    <Input
                      value={insuranceForm.beneficiaryRelationship}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, beneficiaryRelationship: e.target.value })}
                      placeholder="e.g. Spouse, Child"
                      data-testid="input-insurance-beneficiary-rel"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Contact Phone</label>
                    <Input
                      value={insuranceForm.contactPhone}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contactPhone: e.target.value })}
                      placeholder="(555) 123-4567"
                      data-testid="input-insurance-phone"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Contact Email</label>
                    <Input
                      value={insuranceForm.contactEmail}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contactEmail: e.target.value })}
                      placeholder="claims@provider.com"
                      data-testid="input-insurance-email"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                  <Textarea
                    value={insuranceForm.notes}
                    onChange={(e) => setInsuranceForm({ ...insuranceForm, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={2}
                    data-testid="input-insurance-notes"
                  />
                </div>
                <Button
                  onClick={() => createInsuranceMutation.mutate(insuranceForm)}
                  disabled={!insuranceForm.provider || createInsuranceMutation.isPending}
                  data-testid="button-submit-insurance"
                >
                  {createInsuranceMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {createInsuranceMutation.isPending ? "Adding..." : "Add Policy"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 shrink-0" />
                    NAIC Life Insurance Policy Locator
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Disabled until a verified NAIC integration is connected. Previous sample pull results have been removed from this view; they were not verified policies. Manually entered policies remain available.
                  </CardDescription>
                </div>
                <Button
                  disabled
                  className="shrink-0 w-full sm:w-auto"
                  data-testid="button-naic-search"
                >
                  NAIC unavailable
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><User className="h-3 w-3" /> {certificate.deceasedName}</span>
                {certificate.deceasedSsn && <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> SSN: ***-**-{certificate.deceasedSsn.slice(-4)}</span>}
                {certificate.dateOfDeath && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> DOD: {certificate.dateOfDeath}</span>}
                {certificate.placeOfDeathState && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {certificate.placeOfDeathState}</span>}
              </div>
            </CardContent>
          </Card>

          {lifeInsurance.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {lifeInsurance.length} polic{lifeInsurance.length === 1 ? "y" : "ies"} on file
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {lifeInsurance.map((policy) => (
                  <Card key={policy.id} data-testid={`card-insurance-${policy.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Heart className="h-4 w-4" />
                          {policy.provider}
                        </CardTitle>
                        <StatusBadge status={policy.status} />
                      </div>
                      {policy.policyType && <CardDescription>{policy.policyType}</CardDescription>}
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <InfoRow label="Policy #" value={policy.policyNumber} icon={FileCheck} />
                      <InfoRow label="Face Value" value={policy.faceValue ? `$${policy.faceValue}` : undefined} icon={DollarSign} />
                      <InfoRow label="Beneficiary" value={policy.beneficiaryName} icon={Users} />
                      <InfoRow label="Relationship" value={policy.beneficiaryRelationship} icon={Users} />
                      <InfoRow label="Contact Phone" value={policy.contactPhone} icon={Phone} isPhone contactName={policy.provider} />
                      {policy.contactEmail && (
                        <div className="flex items-center justify-between">
                          <InfoRow label="Contact Email" value={policy.contactEmail} icon={Mail} />
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 ml-2 shrink-0"
                            onClick={() => {
                              setMessageForm({
                                ...messageForm,
                                recipientName: policy.provider,
                                body: `Re: Life Insurance Policy #${policy.policyNumber || "N/A"}\nInsured: ${certificate.deceasedName}\nFace Value: $${policy.faceValue || "N/A"}\nBeneficiary: ${policy.beneficiaryName || "N/A"}\n\nTo Whom It May Concern,\n\nThis is a secure notification regarding the above-referenced policy. The insured has passed away. Please process this death claim at your earliest convenience.\n\nPlease reply to this secure message with any required documentation or next steps.\n\nRegards,\nSteps After Life Concierge Team`,
                              });
                              const el = document.querySelector('[data-testid="tab-messaging"]');
                              if (el instanceof HTMLElement) el.click();
                            }}
                            data-testid={`button-send-secure-${policy.id}`}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Send Secure Update
                          </Button>
                        </div>
                      )}
                      {policy.claimNumber && <InfoRow label="Claim #" value={policy.claimNumber} icon={FileCheck} />}
                      {policy.notes && <InfoRow label="Notes" value={policy.notes} />}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Heart className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No life insurance policies recorded.</p>
                <p className="text-xs mt-1">NAIC search is currently unavailable. Add a policy manually only from reliable documentation.</p>
              </CardContent>
            </Card>
          )}
          </>
          )}
        </TabsContent>

        <TabsContent value="messaging" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Secure Messaging</h3>
            <AdminSectionControl section="messaging" value={sectionVisibility.messaging} onChange={(v) => toggleSectionVisibility("messaging", v)} />
          </div>
          {sectionVisibility.messaging === "hidden" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Messaging section is hidden.</p></CardContent></Card>
          ) : sectionVisibility.messaging === "locked" ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground"><Lock className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Messaging section is locked.</p></CardContent></Card>
          ) : (
          <>
          {sectionVisibility.messaging === "in_review" && (
            <div className="flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400 p-2 rounded-md border border-yellow-200 dark:border-yellow-900">
              <Clock className="h-3.5 w-3.5" /> This section is currently under review by the concierge team.
            </div>
          )}
          {certificate.blockchainHash ? (
            <>
              <Card className="border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                      <Lock className="h-5 w-5 text-green-700 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">Blockchain-Verified Identity</p>
                      <p className="text-xs text-green-600 dark:text-green-500">All messages are tied to this blockchain ID — the only way to identify parties in secure communications.</p>
                    </div>
                  </div>
                  <div className="mt-3 p-2 bg-white dark:bg-black/20 rounded border border-green-200 dark:border-green-800">
                    <p className="text-xs text-muted-foreground mb-1">Blockchain ID</p>
                    <p className="font-mono text-sm font-medium break-all" data-testid="text-blockchain-id">{certificate.blockchainHash}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Send Secure Message
                  </CardTitle>
                  <CardDescription>Messages are encrypted and identified solely by blockchain ID — no personal information is transmitted</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Recipient / Company (Optional Label)</label>
                        <Input
                          value={messageForm.recipientName}
                          onChange={(e) => setMessageForm({ ...messageForm, recipientName: e.target.value })}
                          placeholder="e.g. Chase Bank, AT&T"
                          data-testid="input-message-recipient"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Linked Account (Optional)</label>
                        <Select
                          value={messageForm.accountId}
                          onValueChange={(v) => setMessageForm({ ...messageForm, accountId: v })}
                        >
                          <SelectTrigger data-testid="select-message-account">
                            <SelectValue placeholder="Select an account..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.accountName} - {a.accountType}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Subject (Auto-set to Blockchain ID)</label>
                      <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/50">
                        <Lock className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="font-mono text-sm break-all" data-testid="text-message-subject">{certificate.blockchainHash}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Message</label>
                      <Textarea
                        value={messageForm.body}
                        onChange={(e) => setMessageForm({ ...messageForm, body: e.target.value })}
                        placeholder="Type your message..."
                        rows={4}
                        data-testid="input-message-body"
                      />
                    </div>
                    <Button
                      onClick={() => sendMessageMutation.mutate({
                        ...messageForm,
                        accountId: messageForm.accountId === "none" ? "" : messageForm.accountId,
                      })}
                      disabled={!messageForm.body || sendMessageMutation.isPending}
                      className="w-full md:w-auto"
                      data-testid="button-send-message"
                    >
                      {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      Send Secure Message
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {messages.length > 0 ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Message History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {messages
                        .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
                        .map((msg) => (
                        <div key={msg.id} className="border rounded-lg p-3 space-y-2" data-testid={`message-${msg.id}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={msg.senderType === "admin" ? "default" : "secondary"} className="text-xs">
                                {msg.senderType === "admin" ? "Sent" : "Received"}
                              </Badge>
                              {msg.recipientName && (
                                <span className="text-sm text-muted-foreground">to {msg.recipientName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Lock className="h-3 w-3 text-green-600" />
                              <span className="text-xs text-muted-foreground">
                                {new Date(msg.sentAt).toLocaleDateString()} {new Date(msg.sentAt).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Shield className="h-3 w-3 shrink-0" />
                            <span className="font-mono">Subject: {msg.subject || msg.blockchainId}</span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{msg.body}</p>
                          {msg.isRead && msg.readAt && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Read {new Date(msg.readAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No messages sent for this case yet.
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-yellow-200 dark:border-yellow-900/50">
              <CardContent className="p-8 text-center">
                <Lock className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                <p className="font-medium mb-2">Secure Messaging Unavailable</p>
                <p className="text-sm text-muted-foreground">
                  This certificate does not have a blockchain ID yet. Secure messaging requires a verified certificate with a blockchain ID to identify parties in communications. The certificate must be verified first.
                </p>
              </CardContent>
            </Card>
          )}
          </>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <CaseTimelineTab certId={certId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
