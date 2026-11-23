import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { 
  CreditCard, 
  Tv,
  Building2,
  MoreHorizontal,
  XCircle,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Shield,
  Users,
  Zap,
  Droplets,
  Send,
  AlertCircle,
  HelpCircle,
  CheckCircle,
  XOctagon,
  UserPlus,
  ArrowRightLeft,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AccountCompanyPhone } from "@/components/account-company-phone";
import { FamilyUpdateStatus } from "@/components/family-update-status";
import { familyRefreshOptions } from "@/lib/family-refresh";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { Briefcase, UserCheck } from "lucide-react";
import type { ConnectedAccount, Certificate, AccountAction, AccountCategory } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { AccountDocumentsPanel } from "@/components/account-documents-panel";
import { FamilyAccountHandoff } from "@/components/family-account-handoff";

type TransferRelationship = "spouse" | "child" | "executor" | "beneficiary" | "next_of_kin" | "trustee";

const categoryIcons: Record<AccountCategory, React.ElementType> = {
  financial: CreditCard,
  memberships: Users,
  subscriptions: Tv,
  real_estate: Building2,
  protected_information: Shield,
  miscellaneous: MoreHorizontal,
};

const categoryLabels: Record<AccountCategory, string> = {
  financial: "Banks and financial accounts",
  memberships: "Memberships",
  subscriptions: "Subscriptions",
  real_estate: "Home and utilities",
  protected_information: "Protected information",
  miscellaneous: "Other accounts",
};

const statusColors = {
  active: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  pending_action: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  suspended: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  closed: "bg-green-500/10 text-green-700 dark:text-green-400",
};

const statusLabels = {
  active: "Active",
  pending_action: "Needs attention",
  suspended: "Suspended",
  closed: "Closed",
};

const taskCompletionColors = {
  pending: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  successful: "bg-green-500/10 text-green-700 dark:text-green-400",
  not_completed: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  unsuccessful: "bg-red-500/10 text-red-700 dark:text-red-400",
};

const taskCompletionLabels = {
  pending: "Awaiting Response",
  successful: "Completed",
  not_completed: "More information needed",
  unsuccessful: "Unsuccessful",
};

const taskCompletionIcons = {
  pending: Clock,
  successful: CheckCircle,
  not_completed: HelpCircle,
  unsuccessful: XOctagon,
};

function isEssentialUtility(account: ConnectedAccount): boolean {
  return account.category === "real_estate" && 
    (account.accountType.toLowerCase().includes("electric") || 
     account.accountType.toLowerCase().includes("water") ||
     account.accountType.toLowerCase().includes("gas"));
}

function isProtectedAccount(account: ConnectedAccount): boolean {
  return account.isJoint || isEssentialUtility(account);
}

function AccountCard({ 
  account, 
  onAction,
  onTransfer
}: { 
  account: ConnectedAccount;
  onAction: (account: ConnectedAccount, action: AccountAction) => void;
  onTransfer: (account: ConnectedAccount) => void;
}) {
  const Icon = categoryIcons[account.category as AccountCategory] || HelpCircle;
  const StatusIcon = account.status === "closed" ? CheckCircle2 : 
                     account.status === "suspended" ? PauseCircle :
                     account.status === "pending_action" ? Clock : PlayCircle;
  
  const isProtected = isProtectedAccount(account);
  const isJoint = account.isJoint;
  const isUtility = isEssentialUtility(account);

  return (
    <Card className={`min-w-0 max-w-full hover-elevate transition-all duration-200 ${isProtected ? 'border-l-4 border-l-amber-500' : ''}`} data-testid={`account-card-${account.id}`}>
      <CardContent className="min-w-0 p-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row">
            <div className="flex w-full items-start gap-3 min-w-0 flex-1">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${isProtected ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
                <Icon className={`h-5 w-5 ${isProtected ? 'text-amber-600' : 'text-primary'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium truncate" data-testid={`text-account-name-${account.id}`}>{account.accountName}</h3>
                <p className="text-sm text-muted-foreground truncate" data-testid={`text-account-category-${account.id}`}>
                  {categoryLabels[account.category as AccountCategory] || "Unrecognized category"}
                </p>
                <AccountCompanyPhone accountId={account.id} accountName={account.accountName} accountType={account.accountType} />
              </div>
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-1 sm:flex-shrink-0">
              <Badge className={statusColors[account.status]} data-testid={`badge-account-status-${account.id}`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusLabels[account.status]}
              </Badge>

              {account.status !== "closed" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="min-h-11 min-w-11" data-testid={`button-account-actions-${account.id}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isProtected ? (
                      <>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          <Shield className="h-3 w-3 inline mr-1" />
                           {isJoint ? "Joint account — it cannot be closed here" : "Essential utility — it cannot be closed here"}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onAction(account, "suspend")}
                          className="min-h-11"
                          data-testid={`action-suspend-${account.id}`}
                        >
                          <PauseCircle className="h-4 w-4 mr-2" />
                           Pause for now
                        </DropdownMenuItem>
                        {isUtility && (
                          <DropdownMenuItem
                            onClick={() => onTransfer(account)}
                            className="min-h-11"
                            data-testid={`action-transfer-${account.id}`}
                          >
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                             Transfer service to a family member
                          </DropdownMenuItem>
                        )}
                        {isJoint && account.survivorName && (
                          <DropdownMenuItem
                            onClick={() => onAction(account, "continue")}
                            className="min-h-11"
                            data-testid={`action-continue-${account.id}`}
                          >
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Continue for {account.survivorName}
                          </DropdownMenuItem>
                        )}
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() => onAction(account, "close")}
                          className="min-h-11 text-destructive focus:text-destructive"
                          data-testid={`action-close-${account.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                           Close this account
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onAction(account, "suspend")}
                          className="min-h-11"
                          data-testid={`action-suspend-${account.id}`}
                        >
                          <PauseCircle className="h-4 w-4 mr-2" />
                           Pause this account
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onAction(account, "continue")}
                          className="min-h-11"
                          data-testid={`action-continue-${account.id}`}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                           Keep this service
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs" data-testid={`badge-account-type-${account.id}`}>
              {account.accountType}
            </Badge>
            {isJoint && account.accountDesignation && (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs" data-testid={`badge-joint-${account.id}`}>
                <Users className="h-3 w-3 mr-1" />
                {account.accountDesignation}
              </Badge>
            )}
            {isProtected && (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs" data-testid={`badge-protected-${account.id}`}>
                <Shield className="h-3 w-3 mr-1" />
                Protected
              </Badge>
            )}
            {account.addedBy && (
              <Badge variant="outline" className={`text-xs ${account.addedBy === "sal_team" ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" : "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"}`} data-testid={`badge-added-by-${account.id}`}>
                {account.addedBy === "sal_team" ? <Briefcase className="h-3 w-3 mr-1" /> : <UserCheck className="h-3 w-3 mr-1" />}
                 {account.addedBy === "sal_team" ? "Steps After Life team" : "Added by family"}
              </Badge>
            )}
            {account.responsibleParty && (
              <Badge className={`text-xs ${account.responsibleParty === "family" ? "bg-purple-500/10 text-purple-700 dark:text-purple-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-400"}`} data-testid={`badge-responsible-${account.id}`}>
                 {account.responsibleParty === "family"
                   ? (account.status === "closed" || account.status === "suspended" || account.taskCompletionStatus === "successful"
                     ? "Assigned to your family" : "Your action is needed")
                   : "Steps After Life is handling this"}
              </Badge>
            )}
            {account.accountNumber && (
              <span className="text-xs text-muted-foreground" data-testid={`text-account-number-${account.id}`}>
                ****{account.accountNumber.slice(-4)}
              </span>
            )}
          </div>

          {isJoint && account.survivorName && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid={`text-survivor-${account.id}`}>
              <Shield className="h-3 w-3 flex-shrink-0" />
              Joint holder: {account.survivorName}
            </p>
          )}
        </div>

        {isProtected && (
          <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/10 -mx-4 -mb-4 px-4 py-3 rounded-b-lg">
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                 <span className="font-medium block">Protected for your family</span>
                <p className="text-xs mt-1 text-amber-600 dark:text-amber-500 leading-relaxed">
                  {isJoint 
                     ? `This joint account cannot be closed here. This protects the other account holder${account.survivorName ? `, ${account.survivorName}` : ''}.`
                     : "This essential utility cannot be closed here. This helps prevent an interruption in service."
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {!isProtected && account.selectedAction && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Action:</span>
              <Badge variant="outline">
                {account.selectedAction.charAt(0).toUpperCase() + account.selectedAction.slice(1)}
              </Badge>
              {account.actionDate && (
                <span className="text-xs text-muted-foreground">
                  {new Date(account.actionDate).toLocaleDateString()}
                </span>
              )}
              {account.taskCompletionStatus && (() => {
                const TaskIcon = taskCompletionIcons[account.taskCompletionStatus as keyof typeof taskCompletionIcons] || Clock;
                return (
                  <Badge className={taskCompletionColors[account.taskCompletionStatus as keyof typeof taskCompletionColors]} data-testid={`badge-task-status-${account.id}`}>
                    <TaskIcon className="h-3 w-3 mr-1" />
                    {taskCompletionLabels[account.taskCompletionStatus as keyof typeof taskCompletionLabels]}
                  </Badge>
                );
              })()}
            </div>
            {account.completedBy && (
              <Badge variant="outline" className={`text-xs ${account.completedBy === "sal_team" ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" : "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"}`} data-testid={`badge-completed-by-${account.id}`}>
                Completed by {account.completedBy === "sal_team" ? "SAL Team" : "Family"}
              </Badge>
            )}
            {account.taskCompletionMessage && account.taskCompletionStatus !== "pending" && (
              <p className="text-xs text-muted-foreground" data-testid={`text-task-message-${account.id}`}>
                {account.taskCompletionMessage}
              </p>
            )}
            {account.providerReference && (
              <p className="text-xs text-muted-foreground" data-testid={`text-provider-ref-${account.id}`}>
                Ref: {account.providerReference}
              </p>
            )}
          </div>
        )}
        {account.responsibleParty === "family" && (
          <FamilyAccountHandoff
            accountId={account.id}
            status={account.status}
            taskCompletionStatus={account.taskCompletionStatus}
            selectedAction={account.selectedAction}
            instructions={(account as ConnectedAccount & { familyActionInstructions?: string | null }).familyActionInstructions}
            contactPhone={(account as ConnectedAccount & { familyContactPhone?: string | null }).familyContactPhone}
            contactEmail={(account as ConnectedAccount & { familyContactEmail?: string | null }).familyContactEmail}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function ConnectedAccounts() {
  const { user } = useAuth();
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const certificateIdFilter = urlParams.get("certificate");
  
  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);
  const [selectedAction, setSelectedAction] = useState<AccountAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferToName, setTransferToName] = useState("");
  const [transferRelationship, setTransferRelationship] = useState<TransferRelationship | "">("");
  const [transferError, setTransferError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({
    accountName: "",
    accountType: "",
    category: "" as AccountCategory | "",
    accountNumber: "",
    certificateId: "",
  });
  const [accountFiles, setAccountFiles] = useState<File[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const accountQuery = useQuery<ConnectedAccount[]>({
    queryKey: ["/api/accounts"],
    ...(user?.role === "user" ? familyRefreshOptions : { refetchInterval: 900000 }),
  });

  const certificateQuery = useQuery<Certificate[]>({
    queryKey: ["/api/certificates"],
    ...(user?.role === "user" ? familyRefreshOptions : {}),
  });
  const { data: accounts, isLoading } = accountQuery;
  const { data: certificates } = certificateQuery;

  const updateAccount = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: AccountAction }) => {
      const response = await apiRequest("PATCH", `/api/accounts/${id}`, { 
        selectedAction: action,
        status: action === "close" ? "closed" : action === "suspend" ? "suspended" : "active"
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Action Applied",
        description: `The account has been successfully ${selectedAction === "close" ? "closed" : selectedAction === "suspend" ? "suspended" : "set to continue"}.`,
      });
      setDialogOpen(false);
      setSelectedAccount(null);
      setSelectedAction(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const transferAccount = useMutation({
    mutationFn: async ({ id, transferToName, transferToRelationship }: { 
      id: string; 
      transferToName: string; 
      transferToRelationship: TransferRelationship;
    }) => {
      const response = await apiRequest("POST", `/api/accounts/${id}/transfer`, { 
        transferToName,
        transferToRelationship
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || "Transfer verification failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Transfer Initiated",
        description: data.message || `Account transfer has been verified and initiated.`,
      });
      setTransferDialogOpen(false);
      setSelectedAccount(null);
      setTransferToName("");
      setTransferRelationship("");
      setTransferError(null);
    },
    onError: (error: Error) => {
      setTransferError(error.message);
    },
  });

  const addAccount = useMutation({
    mutationFn: async () => {
      const certId = newAccount.certificateId || certificateIdFilter || certificates?.[0]?.id;
      if (!certId) throw new Error("No death certificate on file yet.");
      const response = await apiRequest("POST", "/api/accounts", {
        certificateId: certId,
        accountName: newAccount.accountName.trim(),
        accountType: newAccount.accountType.trim(),
        category: newAccount.category,
        accountNumber: newAccount.accountNumber.trim() || undefined,
      });
      const account = await response.json();
      const failedDocs: string[] = [];
      for (const file of accountFiles) {
        try {
          const metaRes = await apiRequest("POST", "/api/uploads/request-url", {
            name: file.name,
            size: file.size,
            contentType: file.type,
          });
          const { uploadURL, objectPath } = await metaRes.json();
          const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type, "x-ms-blob-type": "BlockBlob" } });
          if (!uploadRes.ok) throw new Error("Upload failed");
          await apiRequest("POST", "/api/family-documents", {
            label: `${newAccount.accountName.trim()} — ${file.name.replace(/\.[^.]+$/, "")}`,
            documentType: newAccount.category === "financial" ? "financial_statement" : newAccount.category === "real_estate" ? "utility_bill" : "other",
            certificateId: certId,
            fileName: file.name,
            objectPath,
            contentType: file.type,
          });
        } catch {
          failedDocs.push(file.name);
        }
      }
      return { account, failedDocs };
    },
    onSuccess: ({ failedDocs }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] });
      if (failedDocs.length > 0) {
        toast({
          title: "Account added, but some documents failed",
          description: `Could not upload: ${failedDocs.join(", ")}. You can re-upload them from Settings → My Documents.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Account Added",
          description: accountFiles.length > 0
            ? "The account and supporting documents were added. The concierge team has been notified."
            : "The account has been added and the concierge team has been notified.",
        });
      }
      setAddDialogOpen(false);
      setNewAccount({ accountName: "", accountType: "", category: "", accountNumber: "", certificateId: "" });
      setAccountFiles([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAction = (account: ConnectedAccount, action: AccountAction) => {
    setSelectedAccount(account);
    setSelectedAction(action);
    setDialogOpen(true);
  };

  const handleTransfer = (account: ConnectedAccount) => {
    setSelectedAccount(account);
    setTransferToName("");
    setTransferRelationship("");
    setTransferError(null);
    setTransferDialogOpen(true);
  };

  const confirmTransfer = () => {
    if (selectedAccount && transferToName && transferRelationship) {
      transferAccount.mutate({ 
        id: selectedAccount.id, 
        transferToName, 
        transferToRelationship: transferRelationship 
      });
    }
  };

  const confirmAction = () => {
    if (selectedAccount && selectedAction) {
      updateAccount.mutate({ id: selectedAccount.id, action: selectedAction });
    }
  };

  const filteredAccounts = accounts?.filter(account => {
    const matchesSearch = account.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          account.accountType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || account.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || account.status === statusFilter;
    const matchesCertificate = !certificateIdFilter || account.certificateId === certificateIdFilter;
    return matchesSearch && matchesCategory && matchesStatus && matchesCertificate;
  }) || [];

  const selectedCertificate = certificateIdFilter 
    ? certificates?.find(c => c.id === certificateIdFilter)
    : null;

  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    const category = account.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(account);
    return groups;
  }, {} as Record<string, ConnectedAccount[]>);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight">Connected Accounts</h1>
          {user?.role === "user" && (
            <FamilyUpdateStatus className="mt-3" queries={[accountQuery, certificateQuery]} />
          )}
          <p className="text-muted-foreground mt-1">
             {selectedCertificate
               ? `Accounts and services connected to ${selectedCertificate.deceasedName}.`
               : "Review accounts and services. Choose what should happen to each one."
            }
          </p>
        </div>
        {certificates && certificates.length > 0 && (
          <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-account">
            <Plus className="h-4 w-4 mr-2" />
             Add an account
          </Button>
        )}
      </div>

      {user?.role === "user" && (
        <AccountDocumentsPanel
          certificates={certificates || []}
          certificateIdFilter={certificateIdFilter}
        />
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts or services"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-accounts"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full min-w-0 sm:w-[180px]" data-testid="select-category-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full min-w-0 sm:w-[160px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(j => (
                  <Skeleton key={j} className="h-32" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filteredAccounts.length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedAccounts).map(([category, categoryAccounts]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                {(() => {
                  const Icon = categoryIcons[category as AccountCategory] || HelpCircle;
                  return <Icon className="h-5 w-5 text-muted-foreground" />;
                })()}
                <h2 className="text-lg font-semibold">{categoryLabels[category as AccountCategory] || "Unrecognized category"}</h2>
                <Badge variant="secondary" className="ml-2">{categoryAccounts.length}</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categoryAccounts.map(account => (
                  <AccountCard 
                    key={account.id} 
                    account={account} 
                    onAction={handleAction}
                    onTransfer={handleTransfer}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-2">No accounts found</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              {searchQuery || categoryFilter !== "all" || statusFilter !== "all"
                  ? "Try changing your search or filters."
                : (certificates && certificates.length > 0)
                   ? "No accounts have been added yet. Add one above, or wait for the Steps After Life team to add accounts they find."
                   : "Add a death certificate first. Then you can manage accounts and services."
              }
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
             <DialogTitle>Add an account or service</DialogTitle>
            <DialogDescription>
               Add an account that belonged to your loved one. The Steps After Life team will review it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {certificates && certificates.length > 1 && (
              <div className="space-y-2">
                <Label>Loved One</Label>
                <Select
                  value={newAccount.certificateId || certificateIdFilter || certificates[0].id}
                  onValueChange={(v) => setNewAccount({ ...newAccount, certificateId: v })}
                >
                  <SelectTrigger data-testid="select-add-certificate">
                    <SelectValue placeholder="Select loved one" />
                  </SelectTrigger>
                  <SelectContent>
                    {certificates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.deceasedName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                placeholder="e.g., Chase Bank, Netflix, State Farm"
                value={newAccount.accountName}
                onChange={(e) => setNewAccount({ ...newAccount, accountName: e.target.value })}
                data-testid="input-add-account-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type *</Label>
              <Input
                placeholder="e.g., Checking, Streaming, Auto Insurance"
                value={newAccount.accountType}
                onChange={(e) => setNewAccount({ ...newAccount, accountType: e.target.value })}
                data-testid="input-add-account-type"
              />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={newAccount.category}
                onValueChange={(v) => setNewAccount({ ...newAccount, category: v as AccountCategory })}
              >
                <SelectTrigger data-testid="select-add-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Number (optional)</Label>
              <Input
                placeholder="Last 4 digits or full number"
                value={newAccount.accountNumber}
                onChange={(e) => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                data-testid="input-add-account-number"
              />
            </div>
            <div className="space-y-2">
              <Label>Bill or Account Statement (optional)</Label>
              <Input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 5) {
                    toast({ title: "Too many files", description: "You can attach up to 5 documents.", variant: "destructive" });
                    e.target.value = "";
                    return;
                  }
                  const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
                  if (tooBig) {
                    toast({ title: "File too large", description: `${tooBig.name} exceeds the 10MB limit.`, variant: "destructive" });
                    e.target.value = "";
                    return;
                  }
                  setAccountFiles(files);
                }}
                data-testid="input-add-account-files"
              />
              <p className="text-xs text-muted-foreground">
                Add a recent bill or statement to help the Steps After Life team verify this account. You can add up to 5 PDF or image files, 10MB each.
                {accountFiles.length > 0 && ` ${accountFiles.length} file${accountFiles.length > 1 ? "s" : ""} selected.`}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add-account">
              Cancel
            </Button>
            <Button
              onClick={() => addAccount.mutate()}
              disabled={addAccount.isPending || !newAccount.accountName.trim() || !newAccount.accountType.trim() || !newAccount.category}
              data-testid="button-confirm-add-account"
            >
              {addAccount.isPending ? "Adding..." : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
               {selectedAction === "close" && "Close this account"}
               {selectedAction === "suspend" && "Pause this account"}
               {selectedAction === "continue" && "Keep this service"}
            </DialogTitle>
            <DialogDescription>
              {selectedAction === "close" && 
                `You are asking ${selectedAccount?.accountName} to close this account. The provider will be notified. This can end service and may be difficult to undo.`
              }
              {selectedAction === "suspend" && 
                `You are asking ${selectedAccount?.accountName} to pause this account. The provider will be notified and service may stop until it is restored.`
              }
              {selectedAction === "continue" && 
                `This keeps the ${selectedAccount?.accountName} account active. You may still need to update the account holder information with the provider.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel-action"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmAction}
              disabled={updateAccount.isPending}
              variant={selectedAction === "close" ? "destructive" : "default"}
              data-testid="button-confirm-action"
            >
               {updateAccount.isPending ? "Saving..." : selectedAction === "close" ? "Close account" : selectedAction === "suspend" ? "Pause account" : "Keep service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferDialogOpen} onOpenChange={(open) => {
        setTransferDialogOpen(open);
        if (!open) {
          setTransferError(null);
          setTransferToName("");
          setTransferRelationship("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Utility Account
            </DialogTitle>
            <DialogDescription>
              Transfer {selectedAccount?.accountName} to a verified family member or estate representative.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Verification Required</AlertTitle>
              <AlertDescription>
                The recipient must be verified through an estate, trust, will, or registered as a beneficiary before the transfer can proceed.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="transferToName">Recipient Name</Label>
              <Input
                id="transferToName"
                placeholder="Enter full legal name"
                value={transferToName}
                onChange={(e) => setTransferToName(e.target.value)}
                data-testid="input-transfer-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transferRelationship">Relationship to Deceased</Label>
              <Select 
                value={transferRelationship} 
                onValueChange={(value) => setTransferRelationship(value as TransferRelationship)}
              >
                <SelectTrigger id="transferRelationship" data-testid="select-transfer-relationship">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="executor">Executor</SelectItem>
                  <SelectItem value="beneficiary">Beneficiary</SelectItem>
                  <SelectItem value="next_of_kin">Next of Kin</SelectItem>
                  <SelectItem value="trustee">Trustee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transferError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Verification Failed</AlertTitle>
                <AlertDescription>{transferError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              className="min-h-11"
              variant="outline" 
              onClick={() => setTransferDialogOpen(false)}
              data-testid="button-cancel-transfer"
            >
              Cancel
            </Button>
            <Button 
              className="min-h-11"
              onClick={confirmTransfer}
              disabled={transferAccount.isPending || !transferToName || !transferRelationship}
              data-testid="button-confirm-transfer"
            >
              {transferAccount.isPending ? "Verifying..." : "Transfer Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
