import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Landmark, Loader2, Plus, Trash2 } from "lucide-react";
import { PLAN_ASSET_CATEGORIES, PLAN_ASSET_TYPES } from "@shared/schema";
import { SectionNavigation, useHeartPlanAdvance, useSectionPageFocus } from "./section-navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";

interface PlanAsset {
  id: string;
  name: string;
  assetType: string | null;
  category: string;
  institution: string | null;
  accountNumberHint: string | null;
  vehicleOwnershipStatus: "owned_outright" | "financed" | "leased" | null;
  estimatedValue: string | null;
  desiredAction: string | null;
  beneficiaryName: string | null;
  notes: string | null;
}

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  PLAN_ASSET_CATEGORIES.map((c) => [c.value, c.label])
);
CATEGORY_LABELS.financial = "Financial (needs review)";
CATEGORY_LABELS.property = "Real Estate";

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(PLAN_ASSET_TYPES).flat().map((type) => [type.value, type.label])
);

type AssetCategory = keyof typeof PLAN_ASSET_TYPES;

const CATEGORY_EXAMPLES: Record<AssetCategory, string> = {
  banking: "e.g. Chase checking account",
  investments: "e.g. Fidelity 401(k)",
  insurance: "e.g. Guardian life insurance policy",
  real_estate: "e.g. Primary home on Oak Street",
  vehicles: "e.g. 2022 Honda Accord, motorhome, ATV, or boat",
  business: "e.g. Ownership in Smith Consulting LLC",
  valuables: "e.g. Family jewelry collection",
  digital: "e.g. Primary Google account",
  subscription: "e.g. Electric utility account, SunPass, or storage unit",
  membership: "e.g. Veterans association membership",
  debt: "e.g. Home mortgage",
  other: "e.g. Important item or account",
};

const ACTION_OPTIONS = [
  { value: "close", label: "Close the account" },
  { value: "transfer", label: "Transfer to someone" },
  { value: "notify", label: "Notify the provider" },
  { value: "cancel", label: "Cancel the service" },
  { value: "other", label: "Other (see notes)" },
];

const VEHICLE_STATUS_OPTIONS = [
  { value: "owned_outright", label: "Owned outright / paid off" },
  { value: "financed", label: "Financed with a loan" },
  { value: "leased", label: "Leased" },
] as const;

const EMPTY_FORM = {
  name: "", category: "banking" as AssetCategory, assetType: "", institution: "",
  accountNumberHint: "", vehicleOwnershipStatus: "", estimatedValue: "", desiredAction: "", beneficiaryName: "", notes: "",
};

export default function HeartPlanAssets() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [addAnother, setAddAnother] = useState(false);
  const { headingRef, firstControlRef } = useSectionPageFocus<HTMLButtonElement>();
  const advance = useHeartPlanAdvance("assets");

  const { data: plan } = useQuery<{ plan: { status: string; hasVehicles: boolean | null } }>({ queryKey: ["/api/heartplan"] });
  const { data: assets, isLoading } = useQuery<PlanAsset[]>({ queryKey: ["/api/heartplan/assets"] });
  const isActivated = plan?.plan?.status === "activated";
  const selectedCategory = PLAN_ASSET_CATEGORIES.find(category => category.value === form.category);
  const selectedTypes = PLAN_ASSET_TYPES[form.category] || PLAN_ASSET_TYPES.other;
  const categoryOrder = [
    ...PLAN_ASSET_CATEGORIES.map(category => category.value),
    "financial",
    "property",
  ];
  const assetsByCategory = (assets || []).reduce<Record<string, PlanAsset[]>>((groups, asset) => {
    const category = asset.category === "property" ? "real_estate" : asset.category;
    (groups[category] ||= []).push(asset);
    return groups;
  }, {});

  const createMutation = useMutation({
    mutationFn: async (keepAdding: boolean) => {
      const body: Record<string, string> = { name: form.name.trim(), category: form.category };
      for (const key of ["assetType", "institution", "accountNumberHint", "vehicleOwnershipStatus", "estimatedValue", "desiredAction", "beneficiaryName", "notes"] as const) {
        if (form[key].trim()) body[key] = form[key].trim();
      }
      const res = await apiRequest("POST", "/api/heartplan/assets", body);
      return res.json();
    },
    onSuccess: async (_asset, keepAdding) => {
      trackAnalyticsEvent("heartplan_content_saved", {
        section: "assets",
        asset_category: form.category,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      if (keepAdding) {
        setForm({ ...EMPTY_FORM, category: form.category });
        setAddAnother(false);
        toast({ title: "Item added", description: `Add another ${CATEGORY_LABELS[form.category]?.toLowerCase() || "item"} when ready.` });
      } else {
        setDialogOpen(false);
        setForm(EMPTY_FORM);
        toast({ title: "Asset added" });
        await advance.advanceAfterSave();
      }
    },
    onError: (error: any) => {
      toast({ title: "Could not add asset", description: error.message, variant: "destructive" });
    },
  });

  const openForCategory = (category?: AssetCategory) => {
    setForm({ ...EMPTY_FORM, category: category || "banking" });
    setAddAnother(false);
    setDialogOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/heartplan/assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Asset removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove asset", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" />
            <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold scroll-mt-6 outline-none" data-testid="text-assets-title">Assets & accounts</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Make a simple list to help your family understand property and ongoing obligations. Do not enter full account numbers, passwords, or crypto recovery phrases. The last four digits are enough.
          </p>
        </div>
        {!isActivated && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setForm(EMPTY_FORM);
              setAddAnother(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button ref={firstControlRef} onClick={() => openForCategory()} data-testid="button-add-asset">
                <Plus className="h-4 w-4 mr-2" /> Add asset
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add an asset or account</DialogTitle>
                <DialogDescription>Choose the category and specific type first so the people helping you can quickly understand what it is.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="assetName">Name *</Label>
                  <Input id="assetName" placeholder={CATEGORY_EXAMPLES[form.category]} value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-asset-name" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Category *</Label>
                    <Select value={form.category} onValueChange={(v: AssetCategory) => setForm({ ...form, category: v, assetType: "", vehicleOwnershipStatus: "" })}>
                      <SelectTrigger data-testid="select-asset-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLAN_ASSET_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Specific type *</Label>
                    <Select value={form.assetType} onValueChange={(value) => setForm({ ...form, assetType: value })}>
                      <SelectTrigger data-testid="select-asset-type"><SelectValue placeholder="Choose a type..." /></SelectTrigger>
                      <SelectContent>
                        {selectedTypes.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">{selectedCategory?.description}</p>
                </div>
                {form.category === "vehicles" && (
                  <div className="space-y-1.5">
                    <Label>Ownership or lease status *</Label>
                    <Select value={form.vehicleOwnershipStatus} onValueChange={(value) => setForm({ ...form, vehicleOwnershipStatus: value })}>
                      <SelectTrigger data-testid="select-vehicle-ownership-status"><SelectValue placeholder="Choose a status..." /></SelectTrigger>
                      <SelectContent>
                        {VEHICLE_STATUS_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="institution">
                      {form.category === "vehicles" && form.vehicleOwnershipStatus === "financed" ? "Vehicle lender" :
                        form.category === "vehicles" && form.vehicleOwnershipStatus === "leased" ? "Lease company" :
                        form.category === "vehicles" ? "Dealer, storage location, or other organization" :
                        form.category === "insurance" ? "Insurance company" :
                        form.category === "banking" || form.category === "investments" || form.category === "debt" ? "Institution or lender" :
                          "Provider, organization, or location"}
                    </Label>
                    <Input id="institution" value={form.institution}
                      onChange={(e) => setForm({ ...form, institution: e.target.value })} data-testid="input-asset-institution" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="accountNumberHint">Last 4 digits</Label>
                    <Input id="accountNumberHint" maxLength={4} value={form.accountNumberHint}
                      onChange={(e) => setForm({ ...form, accountNumberHint: e.target.value.replace(/\D/g, "") })}
                      data-testid="input-asset-hint" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>What should happen to it?</Label>
                    <Select value={form.desiredAction} onValueChange={(v) => setForm({ ...form, desiredAction: v })}>
                      <SelectTrigger data-testid="select-asset-action"><SelectValue placeholder="Choose..." /></SelectTrigger>
                      <SelectContent>
                        {ACTION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="estimatedValue">{form.category === "debt" ? "Estimated amount owed" : "Estimated value or balance"}</Label>
                    <Input id="estimatedValue" placeholder="e.g. $25,000" value={form.estimatedValue}
                      onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} data-testid="input-asset-value" />
                  </div>
                </div>
                {form.desiredAction === "transfer" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="beneficiaryName">Transfer to (name)</Label>
                    <Input id="beneficiaryName" value={form.beneficiaryName}
                      onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })} data-testid="input-asset-beneficiary" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="assetNotes">Notes</Label>
                  <Textarea id="assetNotes" rows={2} value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-asset-notes" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline"
                  onClick={() => {
                    if (!form.name.trim()) {
                      toast({ title: "Name is required", variant: "destructive" });
                      return;
                    }
                    if (!form.assetType) {
                      toast({ title: "Choose a specific type", description: "This keeps your assets and accounts organized.", variant: "destructive" });
                      return;
                    }
                    if (form.category === "vehicles" && !form.vehicleOwnershipStatus) {
                      toast({ title: "Choose the vehicle’s ownership or lease status", variant: "destructive" });
                      return;
                    }
                    setAddAnother(true);
                    createMutation.mutate(true);
                  }}
                  disabled={createMutation.isPending}
                  data-testid="button-save-and-add-another"
                >
                  {createMutation.isPending && addAnother && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save & add another
                </Button>
                <Button
                  onClick={() => {
                    if (!form.name.trim()) {
                      toast({ title: "Name is required", variant: "destructive" });
                      return;
                    }
                    if (!form.assetType) {
                      toast({ title: "Choose a specific type", description: "This keeps your assets and accounts organized.", variant: "destructive" });
                      return;
                    }
                    if (form.category === "vehicles" && !form.vehicleOwnershipStatus) {
                      toast({ title: "Choose the vehicle’s ownership or lease status", variant: "destructive" });
                      return;
                    }
                    setAddAnother(false);
                    createMutation.mutate(false);
                  }}
                  disabled={createMutation.isPending}
                  data-testid="button-save-asset"
                >
                  {createMutation.isPending && !addAnother && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save item
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {plan?.plan.hasVehicles === false && (
        <Card className="border-primary/30" data-testid="card-no-vehicles">
          <CardContent className="pt-6">
            <p className="font-medium">You indicated that you do not currently have a vehicle.</p>
            <p className="mt-1 text-sm text-muted-foreground">There is no missing vehicle item to complete. You can update your answer in Personal information if that changes.</p>
          </CardContent>
        </Card>
      )}
      {plan?.plan.hasVehicles === true && !assetsByCategory.vehicles?.length && (
        <Card className="border-primary/30" data-testid="card-add-vehicles-prompt">
          <CardContent className="pt-6">
            <p className="font-medium">Add each vehicle you currently have.</p>
            <p className="mt-1 text-sm text-muted-foreground">Use a separate entry for every car, truck, motorcycle, boat, or other vehicle so ownership and loan or lease details stay clear.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your list</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !assets || assets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-assets">
              Nothing recorded yet. Add an account, property, subscription, or other item when you are ready.
            </p>
          ) : (
            <div className="space-y-6">
              {categoryOrder.filter(category => assetsByCategory[category]?.length).map(category => (
                <section key={category} className="space-y-2" data-testid={`asset-category-${category}`}>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{CATEGORY_LABELS[category] || category}</h3>
                    <Badge variant="outline">{assetsByCategory[category].length}</Badge>
                    {!isActivated && category in PLAN_ASSET_TYPES && (
                      <Button type="button" variant="ghost" size="sm" className="ml-auto h-7"
                        onClick={() => openForCategory(category as AssetCategory)}
                        data-testid={`button-add-another-${category}`}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add another
                      </Button>
                    )}
                  </div>
                  {assetsByCategory[category].map((asset) => (
                    <div key={asset.id} className="flex items-center gap-3 rounded-md border p-3" data-testid={`asset-row-${asset.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{asset.name}</p>
                          {asset.assetType && <Badge variant="secondary">{TYPE_LABELS[asset.assetType] || asset.assetType}</Badge>}
                           {asset.vehicleOwnershipStatus && <Badge variant="outline">{VEHICLE_STATUS_OPTIONS.find(option => option.value === asset.vehicleOwnershipStatus)?.label || asset.vehicleOwnershipStatus}</Badge>}
                          {asset.accountNumberHint && <span className="text-xs text-muted-foreground">•••• {asset.accountNumberHint}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {[asset.institution, asset.estimatedValue && `${category === "debt" ? "Owed" : "Value"}: ${asset.estimatedValue}`, asset.desiredAction && `Wish: ${ACTION_OPTIONS.find(o => o.value === asset.desiredAction)?.label || asset.desiredAction}`, asset.beneficiaryName && `→ ${asset.beneficiaryName}`]
                            .filter(Boolean).join(" · ") || asset.notes || ""}
                        </p>
                      </div>
                      {!isActivated && (
                        <Button variant="ghost" size="icon" aria-label={`Remove ${asset.name}`}
                          onClick={() => {
                            if (window.confirm(`Remove "${asset.name}" from your list? This cannot be undone.`)) deleteMutation.mutate(asset.id);
                          }}
                          disabled={deleteMutation.isPending} data-testid={`button-delete-asset-${asset.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {!isActivated && <SectionNavigation section="assets"
        onSave={assets && assets.length > 0 ? advance.advanceAfterSave : undefined}
        saveLabel="Save and continue" onDefer={advance.deferSection}
        saved={advance.saved} isAdvancing={advance.isAdvancing} />}
    </div>
  );
}
