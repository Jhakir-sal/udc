import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Activity, Building2, ExternalLink, Plus, Search, Store } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { trackAnalyticsEvent } from "@/lib/analytics";

type ActivityLevel = "Active" | "Quiet" | "Inactive" | "No activity";

interface PartnerActivityRow {
  id: string;
  type: "funeral_home" | "orsa" | "marketplace_provider" | "referral_company";
  displayName: string;
  sourceType: "linked_organization" | "partner_roster" | "catalog_listing" | "referral_registry";
  enrollmentLabel: string;
  status: string;
  createdAt: string | null;
  linkedCount: number | null;
  activityCount: number;
  lastActivityAt: string | null;
  activityLevel: ActivityLevel;
  managementPath: string | null;
}

const typeLabels: Record<PartnerActivityRow["type"], string> = {
  funeral_home: "Funeral home",
  orsa: "ORSA",
  marketplace_provider: "Marketplace",
  referral_company: "Referral company",
};

const levelClasses: Record<ActivityLevel, string> = {
  Active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  Quiet: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  Inactive: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  "No activity": "bg-muted text-muted-foreground",
};

type FuneralHomeForm = {
  name: string;
  licenseNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
};

const blankFuneralHome: FuneralHomeForm = {
  name: "",
  licenseNumber: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  phone: "",
  email: "",
};
type ReferralCompanyForm = {
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notificationEmail: string;
};
const blankReferralCompany: ReferralCompanyForm = {
  name: "", contactName: "", contactEmail: "", contactPhone: "", notificationEmail: "",
};

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
    : "No recorded activity";
}

export function PartnersBusinesses() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [level, setLevel] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"choose" | "funeral_home" | "referral_company">("choose");
  const [funeralHome, setFuneralHome] = useState<FuneralHomeForm>({ ...blankFuneralHome });
  const [referralCompany, setReferralCompany] = useState<ReferralCompanyForm>({ ...blankReferralCompany });
  const query = useQuery<{ rows: PartnerActivityRow[] }>({
    queryKey: ["/api/admin/partners-businesses"],
  });
  const createFuneralHome = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/funeral-homes", funeralHome),
    onSuccess: () => {
      trackAnalyticsEvent("admin_partner_created", { partner_type: "funeral_home" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners-businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/funeral-homes"] });
      setAddOpen(false);
      setAddType("choose");
      setFuneralHome({ ...blankFuneralHome });
      toast({
        title: "Funeral home added",
        description: "The organization is ready. Add its approved team account separately in User Management.",
      });
    },
    onError: (error) => toast({
      title: "Funeral home could not be added",
      description: error instanceof Error ? error.message : "Please check the information and try again.",
      variant: "destructive",
    }),
  });
  const createReferralCompany = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/referral-companies", {
      ...referralCompany,
      contactName: referralCompany.contactName || null,
      contactEmail: referralCompany.contactEmail || null,
      contactPhone: referralCompany.contactPhone || null,
    }),
    onSuccess: () => {
      trackAnalyticsEvent("admin_partner_created", { partner_type: "referral_company" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners-businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-companies?active=true"] });
      setAddOpen(false);
      setAddType("choose");
      setReferralCompany({ ...blankReferralCompany });
      toast({ title: "Referral company added", description: "It can now be selected for family-confirmed referral attribution." });
    },
    onError: (error) => toast({
      title: "Referral company could not be added",
      description: error instanceof Error ? error.message : "Please check the information and try again.",
      variant: "destructive",
    }),
  });
  const toggleReferralCompany = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/referral-companies/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners-businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-companies?active=true"] });
    },
  });

  const rows = query.data?.rows || [];
  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return rows.filter((row) =>
      (!term || `${row.displayName} ${row.enrollmentLabel} ${row.status}`.toLocaleLowerCase().includes(term))
      && (type === "all" || row.type === type)
      && (level === "all" || row.activityLevel === level));
  }, [rows, search, type, level]);

  const activeCount = rows.filter((row) => row.activityLevel === "Active").length;
  const totalActivity = rows.reduce((sum, row) => sum + row.activityCount, 0);

  if (query.isLoading) {
    return <div className="space-y-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div>;
  }

  if (query.isError) {
    const sessionEnded = query.error instanceof Error && query.error.message.startsWith("401:");
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">{sessionEnded ? "Please sign in to view partners and businesses." : "Partners and businesses could not be loaded."}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {sessionEnded ? "Your admin session has ended. Sign in again to continue." : query.error.message}
          </p>
          {sessionEnded
            ? <Button className="mt-4" onClick={() => window.location.assign("/login")}>Sign in again</Button>
            : <Button className="mt-4" variant="outline" onClick={() => query.refetch()}>Try again</Button>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations & listings</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active in 30 days</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recorded events</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalActivity}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Partners & Businesses</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Activity is based on recorded operational events, not login tracking. Active: 30 days or less; Quiet: 31–90 days; Inactive: over 90 days.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-partner">
            <Plus className="mr-2 h-4 w-4" />
            Add partner
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search businesses"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search partners and businesses"
              />
            </div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger aria-label="Filter by type"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="funeral_home">Funeral homes</SelectItem>
                <SelectItem value="orsa">ORSA</SelectItem>
                <SelectItem value="marketplace_provider">Marketplace</SelectItem>
                <SelectItem value="referral_company">Referral companies</SelectItem>
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger aria-label="Filter by activity level"><SelectValue placeholder="All activity levels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity levels</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Quiet">Quiet</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="No activity">No activity</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredRows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {rows.length === 0 ? "No partner or business records are available." : "No records match these filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Type / source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Members / accounts</TableHead>
                    <TableHead className="text-right">Activity</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead>Level</TableHead>
                     <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-48 font-medium">
                        <div className="flex items-center gap-2">
                          {row.displayName}
                          {row.managementPath && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => navigate(row.managementPath!)}
                              aria-label={`Manage ${row.displayName}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <div>{typeLabels[row.type]}</div>
                        <div className="text-xs text-muted-foreground">{row.enrollmentLabel}</div>
                      </TableCell>
                      <TableCell className="capitalize">{row.status.replaceAll("_", " ")}</TableCell>
                      <TableCell className="text-right">{row.linkedCount ?? "—"}</TableCell>
                      <TableCell className="text-right">{row.activityCount}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(row.lastActivityAt)}</TableCell>
                      <TableCell><Badge className={levelClasses[row.activityLevel]}>{row.activityLevel}</Badge></TableCell>
                      <TableCell>
                        {row.type === "referral_company" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={toggleReferralCompany.isPending}
                            onClick={() => toggleReferralCompany.mutate({
                              id: row.id.replace("referral_company:", ""),
                              isActive: row.status !== "Active",
                            })}
                          >
                            {row.status === "Active" ? "Deactivate" : "Activate"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setAddType("choose");
            setFuneralHome({ ...blankFuneralHome });
            setReferralCompany({ ...blankReferralCompany });
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{addType === "choose" ? "Add a partner or business" : addType === "funeral_home" ? "Add a funeral home" : "Add a referral company"}</DialogTitle>
            <DialogDescription>
              {addType === "choose"
                ? "Choose the kind of partner you are onboarding."
                : addType === "funeral_home"
                  ? "Create the organization record first. Approved team accounts are added separately in User Management."
                  : "Create a referral contact. This does not create a portal account or enable a marketplace listing."}
            </DialogDescription>
          </DialogHeader>
          {addType === "choose" ? (
            <div className="grid gap-3 py-2 sm:grid-cols-3">
              <PartnerChoice
                icon={Building2}
                title="Funeral home"
                description="Create an organization that can use the certificate workflow."
                onClick={() => setAddType("funeral_home")}
              />
              <PartnerChoice
                icon={Activity}
                title="Referral company"
                description="Add an operational referral contact for family-approved milestone updates."
                onClick={() => setAddType("referral_company")}
              />
              <PartnerChoice
                icon={Store}
                title="Marketplace business"
                description="Add and review a business listing for the public directory."
                onClick={() => {
                  setAddOpen(false);
                  navigate("/admin/marketplace");
                }}
              />
              <PartnerChoice
                icon={Activity}
                title="ORSA member"
                description="Add individual members or import an approved ORSA roster."
                onClick={() => {
                  setAddOpen(false);
                  navigate("/admin/orsa");
                }}
              />
            </div>
          ) : addType === "funeral_home" ? (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <FuneralHomeField label="Business name" value={funeralHome.name} onChange={(name) => setFuneralHome({ ...funeralHome, name })} />
              <FuneralHomeField label="License number" value={funeralHome.licenseNumber} onChange={(licenseNumber) => setFuneralHome({ ...funeralHome, licenseNumber })} />
              <div className="sm:col-span-2">
                <FuneralHomeField label="Street address" value={funeralHome.address} onChange={(address) => setFuneralHome({ ...funeralHome, address })} />
              </div>
              <FuneralHomeField label="City" value={funeralHome.city} onChange={(city) => setFuneralHome({ ...funeralHome, city })} />
              <FuneralHomeField label="State" value={funeralHome.state} onChange={(state) => setFuneralHome({ ...funeralHome, state })} />
              <FuneralHomeField label="ZIP code" value={funeralHome.zipCode} onChange={(zipCode) => setFuneralHome({ ...funeralHome, zipCode })} />
              <FuneralHomeField label="Phone" value={funeralHome.phone} onChange={(phone) => setFuneralHome({ ...funeralHome, phone })} />
              <div className="sm:col-span-2">
                <FuneralHomeField label="Business email" type="email" value={funeralHome.email} onChange={(email) => setFuneralHome({ ...funeralHome, email })} />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <FuneralHomeField label="Business name" value={referralCompany.name} onChange={(name) => setReferralCompany({ ...referralCompany, name })} />
              <FuneralHomeField label="Contact name" value={referralCompany.contactName} onChange={(contactName) => setReferralCompany({ ...referralCompany, contactName })} />
              <FuneralHomeField label="Contact email" type="email" value={referralCompany.contactEmail} onChange={(contactEmail) => setReferralCompany({ ...referralCompany, contactEmail })} />
              <FuneralHomeField label="Contact phone" value={referralCompany.contactPhone} onChange={(contactPhone) => setReferralCompany({ ...referralCompany, contactPhone })} />
              <div className="sm:col-span-2">
                <FuneralHomeField label="Referral notification email" type="email" value={referralCompany.notificationEmail} onChange={(notificationEmail) => setReferralCompany({ ...referralCompany, notificationEmail })} />
                <p className="mt-1 text-xs text-muted-foreground">Family-approved progress emails are sent only to this configured address.</p>
              </div>
            </div>
          )}
          {addType === "funeral_home" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddType("choose")}>Back</Button>
              <Button
                onClick={() => createFuneralHome.mutate()}
                disabled={createFuneralHome.isPending || Object.values(funeralHome).some((value) => !value.trim())}
                data-testid="button-save-funeral-home-partner"
              >
                {createFuneralHome.isPending ? "Adding…" : "Add funeral home"}
              </Button>
            </DialogFooter>
          )}
          {addType === "referral_company" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddType("choose")}>Back</Button>
              <Button
                onClick={() => createReferralCompany.mutate()}
                disabled={createReferralCompany.isPending || !referralCompany.name.trim() || !referralCompany.notificationEmail.trim()}
              >
                {createReferralCompany.isPending ? "Adding…" : "Add referral company"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PartnerChoice({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      <Icon className="mb-3 h-5 w-5 text-accent" />
      <span className="font-medium">{title}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
    </button>
  );
}

function FuneralHomeField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = `partner-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required />
    </div>
  );
}