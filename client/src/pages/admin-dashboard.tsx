import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { 
  Shield, 
  FileCheck, 
  Users, 
  Bell, 
  Activity,
  Server,
  Database,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Webhook,
  BarChart3,
  Globe,
  Lock,
  UserPlus,
  Trash2,
  Heart
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PartnersBusinesses } from "@/components/admin/partners-businesses";
import AdminOutreachPage from "@/pages/admin-outreach";
import ConciergeInquiries from "@/components/admin/concierge-inquiries";

interface ManagedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string | null;
}

function UserManagement() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", password: "", role: "user" });

  const { data: users, isLoading } = useQuery<ManagedUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/users", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setAddOpen(false);
      setForm({ email: "", firstName: "", lastName: "", password: "", role: "user" });
      toast({ title: "User created", description: "The new user can now log in with the password you set." });
    },
    onError: (err: any) => {
      toast({ title: "Could not create user", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteTarget(null);
      toast({ title: "User deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete user", description: err.message, variant: "destructive" });
    },
  });

  const mfaToggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/mfa`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Could not update MFA", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });

  const enableAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/users/enable-mfa-all");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "MFA enabled for everyone", description: `${data.updated} user(s) updated.` });
    },
    onError: (err: any) => {
      toast({ title: "Could not enable MFA for all", description: err.message, variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await apiRequest("POST", `/api/admin/promote/${id}`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (err: any) => {
      toast({ title: "Could not update role", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });

  const roleLabels: Record<string, string> = {
    user: "Family (User)",
    admin: "Admin",
    funeral_home: "Funeral Home",
    planner: "Planner (HeartPlan)",
  };

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Add or remove platform users</CardDescription>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
          <Link
            href="/heartplans"
            className="inline-flex min-h-9 items-center rounded-md border border-primary/40 px-3 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            data-testid="link-admin-users-heartplan-completion"
          >
            HeartPlan completion
          </Link>
          <Button
            variant="outline"
            onClick={() => enableAllMutation.mutate()}
            disabled={enableAllMutation.isPending || !users?.some((u) => !u.twoFactorEnabled)}
            data-testid="button-enable-mfa-all"
          >
            <Lock className="h-4 w-4 mr-2" />
            {enableAllMutation.isPending ? "Enabling..." : "Enable MFA for All"}
          </Button>
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-user">
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : users && users.length > 0 ? (
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`row-managed-user-${u.id}`}>
                  <TableCell className="font-medium">
                    {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      onValueChange={(role) => roleMutation.mutate({ id: u.id, role })}
                      disabled={roleMutation.isPending}
                    >
                      <SelectTrigger className="w-[180px]" data-testid={`select-role-${u.id}`}>
                        <SelectValue>{roleLabels[u.role] ?? u.role}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Family (User)</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="funeral_home">Funeral Home</SelectItem>
                        <SelectItem value="planner">Planner (HeartPlan)</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.phoneNumber || "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={u.twoFactorEnabled}
                      onCheckedChange={(checked) => mfaToggleMutation.mutate({ id: u.id, enabled: checked })}
                      disabled={mfaToggleMutation.isPending}
                      data-testid={`switch-mfa-${u.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.role === "planner" && (
                        <Link
                          href={`/heartplans?q=${encodeURIComponent(u.email)}`}
                          className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-primary underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          data-testid={`link-user-heartplan-completion-${u.id}`}
                        >
                          View completion
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(u)}
                        data-testid={`button-delete-user-${u.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No users found</p>
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create an approved account and assign its role explicitly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-user-first">First Name</Label>
                <Input id="new-user-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} data-testid="input-new-user-first-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-user-last">Last Name</Label>
                <Input id="new-user-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} data-testid="input-new-user-last-name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email</Label>
              <Input id="new-user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-new-user-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-password">Temporary Password</Label>
              <Input id="new-user-password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 12 characters with a special character" data-testid="input-new-user-password" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="select-new-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Family (User)</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="funeral_home">Funeral Home</SelectItem>
                  <SelectItem value="planner">Planner (HeartPlan)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} data-testid="button-cancel-add-user">Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.email || form.password.length < 12}
              data-testid="button-confirm-add-user"
            >
              {createMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteTarget?.email}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-user"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface UserRole {
  role: "user" | "admin" | "funeral_home";
  funeralHomeId?: string;
}

interface AdminStats {
  totalUsers: number;
  totalCertificates: number;
  totalAccounts: number;
  totalNotifications: number;
  totalBeneficiaries: number;
  totalAppointments: number;
  totalGovernmentNotifications: number;
  totalEstateRegistry: number;
  certificatesByStatus: Record<string, number>;
  accountsByStatus: Record<string, number>;
  accountsByCategory: Record<string, number>;
  webhookStats: {
    total: number;
    successful: number;
    failed: number;
    pending: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    message: string;
    userId: string;
    createdAt: string;
  }>;
  topUsers: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    certificateCount: number;
  }>;
  heartPlanFunnel: {
    registered: number;
    emailVerified: number;
    startedProgress: number;
    paidLegacy: number;
    activated: number;
    contactDeliveryWarnings: number;
  };
}

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend,
  loading,
  testId,
  variant = "default"
}: { 
  title: string; 
  value: string | number; 
  description: string; 
  icon: React.ElementType;
  trend?: string;
  loading?: boolean;
  testId?: string;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantColors = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
    warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    danger: "bg-red-500/10 text-red-600 dark:text-red-400"
  };

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
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${variantColors[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={testId ? `${testId}-value` : undefined}>{value}</div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">{description}</p>
          {trend && (
            <Badge variant="secondary" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              {trend}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBreakdown({ 
  title, 
  data, 
  loading 
}: { 
  title: string; 
  data: Record<string, number> | undefined; 
  loading: boolean;
}) {
  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500",
    verified: "bg-green-500",
    processing: "bg-blue-500",
    completed: "bg-emerald-500",
    active: "bg-blue-500",
    pending_action: "bg-yellow-500",
    suspended: "bg-orange-500",
    closed: "bg-gray-500",
    financial: "bg-indigo-500",
    memberships: "bg-purple-500",
    subscriptions: "bg-rose-500",
    real_estate: "bg-cyan-500",
    protected_information: "bg-teal-500",
    miscellaneous: "bg-gray-400"
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  const total = Object.values(data || {}).reduce((sum, val) => sum + val, 0);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      {Object.entries(data || {}).map(([status, count]) => (
        <div key={status} className="flex items-center gap-3">
          <div className={`h-2 w-2 rounded-full ${statusColors[status] || "bg-gray-400"}`} />
          <span className="text-sm capitalize flex-1">{status.replace(/_/g, " ")}</span>
          <span className="text-sm font-medium">{count}</span>
          <span className="text-xs text-muted-foreground w-12 text-right">
            {total > 0 ? Math.round((count / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  
  const { data: roleData, isLoading: roleLoading } = useQuery<UserRole>({
    queryKey: ["/api/user/role"],
  });
  
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: roleData?.role === "admin",
  });

  const webhookSuccessRate = stats?.webhookStats?.total 
    ? Math.round((stats.webhookStats.successful / stats.webhookStats.total) * 100) 
    : 0;
    
  useEffect(() => {
    if (!roleLoading && roleData?.role !== "admin") {
      setLocation("/");
    }
  }, [roleData, roleLoading, setLocation]);
  
  if (roleLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto min-w-0">
        <div className="flex items-center justify-center h-64">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    );
  }
  
  if (roleData?.role !== "admin") {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto min-w-0">
        <Card className="max-w-md mx-auto mt-20">
          <CardContent className="pt-6 text-center">
            <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              You don't have permission to access the admin dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto min-w-0">
      <div className="mb-8">
        <div className="flex min-w-0 items-start gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Platform-wide statistics and system monitoring
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1" data-testid="admin-tabs">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="partners" data-testid="tab-partners-businesses">
            <Building2 className="h-4 w-4 mr-2" />
            Partners & Businesses
          </TabsTrigger>
          <TabsTrigger value="concierge-inquiries" data-testid="tab-concierge-inquiries">
            <Heart className="mr-2 h-4 w-4" />
            Concierge requests
          </TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="system" data-testid="tab-system">
            <Server className="h-4 w-4 mr-2" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card data-testid="card-heartplan-funnel">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /> HeartPlan funnel</CardTitle>
                <CardDescription>Planner registrations through activation, including contact delivery risks.</CardDescription>
              </div>
              <Link
                href="/heartplans"
                className="inline-flex min-h-9 items-center rounded-md border border-primary/40 px-3 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-testid="link-admin-overview-heartplan-completion"
              >
                HeartPlan completion
              </Link>
            </CardHeader>
            <CardContent className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {[
                ["Registered", stats?.heartPlanFunnel?.registered, "registered"],
                ["Email verified", stats?.heartPlanFunnel?.emailVerified, "verified"],
                ["Started", stats?.heartPlanFunnel?.startedProgress, "started"],
                ["Paid Legacy", stats?.heartPlanFunnel?.paidLegacy, "paid"],
                ["Converted after death", stats?.heartPlanFunnel?.activated, "activated"],
                ["Contact warnings", stats?.heartPlanFunnel?.contactDeliveryWarnings, "warnings"],
              ].map(([label, value, key]) => (
                <div key={key as string} className="rounded-md border p-3" data-testid={`heartplan-kpi-${key}`}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold mt-1">{isLoading ? "—" : value ?? 0}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Users"
              value={stats?.totalUsers || 0}
              description="Registered platform users"
              icon={Users}
              loading={isLoading}
              testId="stat-admin-users"
            />
            <StatCard
              title="Total Certificates"
              value={stats?.totalCertificates || 0}
              description="Death certificates processed"
              icon={FileCheck}
              loading={isLoading}
              testId="stat-admin-certificates"
            />
            <StatCard
              title="Connected Accounts"
              value={stats?.totalAccounts || 0}
              description="Service accounts managed"
              icon={Globe}
              loading={isLoading}
              testId="stat-admin-accounts"
            />
            <StatCard
              title="Notifications Sent"
              value={stats?.totalNotifications || 0}
              description="Platform notifications"
              icon={Bell}
              loading={isLoading}
              testId="stat-admin-notifications"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Beneficiaries"
              value={stats?.totalBeneficiaries || 0}
              description="Survivor benefits tracked"
              icon={Users}
              loading={isLoading}
              variant="success"
              testId="stat-admin-beneficiaries"
            />
            <StatCard
              title="Appointments"
              value={stats?.totalAppointments || 0}
              description="Scheduled consultations"
              icon={Clock}
              loading={isLoading}
              testId="stat-admin-appointments"
            />
            <StatCard
              title="Gov. Notifications"
              value={stats?.totalGovernmentNotifications || 0}
              description="SSA, VA, Medicare alerts"
              icon={Building2}
              loading={isLoading}
              testId="stat-admin-gov-notifications"
            />
            <StatCard
              title="Estate Registry"
              value={stats?.totalEstateRegistry || 0}
              description="Trusts/wills registered"
              icon={Database}
              loading={isLoading}
              testId="stat-admin-estate"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Certificate Status</CardTitle>
                <CardDescription>Breakdown by processing status</CardDescription>
              </CardHeader>
              <CardContent>
                <StatusBreakdown 
                  title="" 
                  data={stats?.certificatesByStatus} 
                  loading={isLoading} 
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Account Status</CardTitle>
                <CardDescription>Breakdown by action status</CardDescription>
              </CardHeader>
              <CardContent>
                <StatusBreakdown 
                  title="" 
                  data={stats?.accountsByStatus} 
                  loading={isLoading} 
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Account Categories</CardTitle>
                <CardDescription>Breakdown by service type</CardDescription>
              </CardHeader>
              <CardContent>
                <StatusBreakdown 
                  title="" 
                  data={stats?.accountsByCategory} 
                  loading={isLoading} 
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UserManagement />
          <Card>
            <CardHeader>
              <CardTitle>Top Users by Activity</CardTitle>
              <CardDescription>Users with the most certificates uploaded</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : stats?.topUsers && stats.topUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Certificates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topUsers.map((user) => (
                      <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                        <TableCell className="font-medium">
                          {user.firstName && user.lastName 
                            ? `${user.firstName} ${user.lastName}` 
                            : "Unknown"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{user.certificateCount}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No users registered yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partners" className="space-y-6">
          <Tabs defaultValue="outreach" className="space-y-6">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="outreach">Email contacts & templates</TabsTrigger>
              <TabsTrigger value="directory">Partner directory</TabsTrigger>
            </TabsList>
            <TabsContent value="outreach"><AdminOutreachPage embedded /></TabsContent>
            <TabsContent value="directory"><PartnersBusinesses /></TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="concierge-inquiries" className="space-y-6">
          <ConciergeInquiries />
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Total Webhooks"
              value={stats?.webhookStats?.total || 0}
              description="All webhook deliveries"
              icon={Webhook}
              loading={isLoading}
              testId="stat-webhook-total"
            />
            <StatCard
              title="Successful"
              value={stats?.webhookStats?.successful || 0}
              description="Delivered successfully"
              icon={CheckCircle2}
              loading={isLoading}
              variant="success"
              testId="stat-webhook-success"
            />
            <StatCard
              title="Pending"
              value={stats?.webhookStats?.pending || 0}
              description="Awaiting delivery"
              icon={Clock}
              loading={isLoading}
              variant="warning"
              testId="stat-webhook-pending"
            />
            <StatCard
              title="Failed"
              value={stats?.webhookStats?.failed || 0}
              description="Delivery failed"
              icon={AlertTriangle}
              loading={isLoading}
              variant="danger"
              testId="stat-webhook-failed"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Webhook Success Rate</CardTitle>
              <CardDescription>Overall delivery performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Success Rate</span>
                  <span className="text-2xl font-bold">{webhookSuccessRate}%</span>
                </div>
                <Progress value={webhookSuccessRate} className="h-3" />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{stats?.webhookStats?.successful || 0} successful</span>
                  <span>{stats?.webhookStats?.total || 0} total</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-green-500" />
                  System Status
                </CardTitle>
                <CardDescription>Current platform health</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm">API Server</span>
                    </div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600">Operational</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm">Database</span>
                    </div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600">Connected</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm">Object Storage</span>
                    </div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600">Available</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm">AI Services</span>
                    </div>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600">Ready</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  Database Statistics
                </CardTitle>
                <CardDescription>Data storage overview</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Users</span>
                    <span className="font-medium">{stats?.totalUsers || 0} records</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Certificates</span>
                    <span className="font-medium">{stats?.totalCertificates || 0} records</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Connected Accounts</span>
                    <span className="font-medium">{stats?.totalAccounts || 0} records</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Notifications</span>
                    <span className="font-medium">{stats?.totalNotifications || 0} records</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm">Estate Registry</span>
                    <span className="font-medium">{stats?.totalEstateRegistry || 0} records</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Platform Activity</CardTitle>
              <CardDescription>Latest system-wide notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentActivity.map((activity) => (
                    <div 
                      key={activity.id} 
                      className="flex items-start gap-3 py-3 border-b last:border-0"
                      data-testid={`activity-${activity.id}`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
                        <Bell className="h-4 w-4 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{activity.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(activity.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
