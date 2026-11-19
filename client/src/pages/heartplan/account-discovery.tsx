import { useEffect, useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  GitMerge,
  Loader2,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type DiscoveryStatus = {
  enabled: boolean;
  isActivated: boolean;
};

type DiscoveryItem = {
  id: string;
  name: string;
  source: string;
  category: string | null;
  classification: string;
  institution: string | null;
  maskedHint?: string | null;
  accountNumberHint?: string | null;
  value?: string | number | null;
  estimatedValue?: string | number | null;
  monthlyAmount?: string | number | null;
  status?: string;
  reviewStatus?: string;
  duplicateOfKey?: string | null;
};

type EditableItem = {
  category: string;
  classification: string;
  maskedHint: string;
  value: string;
  monthlyAmount: string;
};

const FICTIONAL_BANKS = [
  "Northstar Community Bank (Demo)",
  "Juniper Federal Credit Union (Demo)",
  "Harbor & Pine Bank (Demo)",
];

const CLASSIFICATIONS = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "account", label: "Financial account" },
  { value: "recurring_obligation", label: "Recurring obligation" },
];

const CATEGORIES = [
  "financial",
  "insurance",
  "subscription",
  "membership",
  "property",
  "digital",
  "other",
];

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function editableFromItem(item: DiscoveryItem): EditableItem {
  return {
    category: item.category || "",
    classification: item.classification || "account",
    maskedHint: item.maskedHint || item.accountNumberHint || "",
    value: stringValue(item.value ?? item.estimatedValue),
    monthlyAmount: stringValue(item.monthlyAmount),
  };
}

function labelize(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AccountDiscovery() {
  const { toast } = useToast();
  const [creditConsent, setCreditConsent] = useState(false);
  const [selectedBank, setSelectedBank] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, EditableItem>>({});

  const statusQuery = useQuery<DiscoveryStatus>({
    queryKey: ["/api/heartplan/discovery/status"],
  });
  const itemsQuery = useQuery<DiscoveryItem[]>({
    queryKey: ["/api/heartplan/discovery/items"],
    enabled: statusQuery.data?.enabled === true,
  });

  useEffect(() => {
    if (!itemsQuery.data) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const item of itemsQuery.data) {
        if (!next[item.id]) next[item.id] = editableFromItem(item);
      }
      return next;
    });
  }, [itemsQuery.data]);

  const refreshDiscovery = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/heartplan/discovery/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/heartplan/discovery/status"] });
  };

  const creditMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/heartplan/discovery/credit", { consent: true });
      return response.json();
    },
    onSuccess: () => {
      refreshDiscovery();
      toast({ title: "Demo credit search complete", description: "Synthetic cards and loans are ready for review." });
    },
    onError: (error: Error) => toast({ title: "Credit demo could not run", description: error.message, variant: "destructive" }),
  });

  const bankMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/heartplan/discovery/bank", { demoInstitution: selectedBank });
      return response.json();
    },
    onSuccess: () => {
      refreshDiscovery();
      toast({ title: "Demo bank connected", description: "Synthetic accounts and recurring payments are ready for review." });
    },
    onError: (error: Error) => toast({ title: "Bank demo could not run", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: Partial<EditableItem> & { status?: string } }) => {
      const response = await apiRequest("PATCH", `/api/heartplan/discovery/items/${id}`, fields);
      return response.json();
    },
    onSuccess: () => {
      refreshDiscovery();
      toast({ title: "Discovery item updated" });
    },
    onError: (error: Error) => toast({ title: "Item could not be updated", description: error.message, variant: "destructive" }),
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const response = await apiRequest("POST", `/api/heartplan/discovery/items/${sourceId}/merge`, { targetId });
      return response.json();
    },
    onSuccess: () => {
      refreshDiscovery();
      toast({ title: "Duplicate merged", description: "The duplicate was removed and the original discovery was kept." });
    },
    onError: (error: Error) => toast({ title: "Items could not be merged", description: error.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest("POST", "/api/heartplan/discovery/save", { ids });
      return response.json();
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      refreshDiscovery();
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Selected items saved", description: "Confirmed discoveries were added to your HeartPlan inventory." });
    },
    onError: (error: Error) => toast({ title: "Items could not be saved", description: error.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/heartplan/discovery/reset");
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setDrafts({});
      setCreditConsent(false);
      setSelectedBank("");
      refreshDiscovery();
      toast({ title: "Demo discovery reset", description: "Only synthetic discovery data was cleared." });
    },
    onError: (error: Error) => toast({ title: "Demo could not be reset", description: error.message, variant: "destructive" }),
  });

  const itemStatus = (item: DiscoveryItem) => item.status || item.reviewStatus || "pending";
  const reviewItems = (itemsQuery.data || []).filter((item) => itemStatus(item) !== "dismissed");
  const selectableItems = reviewItems.filter((item) => itemStatus(item) !== "saved");
  const normalizedNameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of reviewItems) {
      const name = item.name.trim().toLocaleLowerCase();
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }, [reviewItems]);

  if (statusQuery.isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!statusQuery.data?.enabled) return <Redirect to="/heartplan" />;

  const isReadOnly = statusQuery.data.isActivated;
  const allSelected = selectableItems.length > 0 && selectableItems.every((item) => selectedIds.has(item.id));

  const setDraftField = (item: DiscoveryItem, field: keyof EditableItem, value: string) => {
    setDrafts((current) => ({
      ...current,
      [item.id]: { ...(current[item.id] || editableFromItem(item)), [field]: value },
    }));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-6 sm:p-6">
      <Alert className="sticky top-[65px] z-30 border-amber-400 bg-amber-50 text-amber-950 shadow-sm dark:bg-amber-950 dark:text-amber-50" data-testid="alert-discovery-demo">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle>Demo data only</AlertTitle>
        <AlertDescription>
          This page uses made-up information for demonstration only. It is not connected to a bank or credit bureau. It never checks your real credit.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            <h1 className="font-serif text-2xl font-semibold" data-testid="text-discovery-title">Account Discovery</h1>
          </div>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            See how HeartPlan can help you organize accounts, debts, and regular payments.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={resetMutation.isPending || isReadOnly} data-testid="button-reset-discovery">
              {resetMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Reset demo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Account Discovery?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes only the made-up demo results on this page. It does not remove items already saved to your HeartPlan list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetMutation.mutate()} data-testid="button-confirm-reset">Reset demo data</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isReadOnly && (
        <Alert data-testid="alert-discovery-activated">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>HeartPlan activated</AlertTitle>
          <AlertDescription>You can review this page, but you cannot make changes because this HeartPlan is already active.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Simulated credit discovery</CardTitle>
            </div>
            <CardDescription>See made-up credit cards and loans. A soft credit inquiry does not affect a credit score; this demo does not make a real inquiry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted/60 p-3 text-sm">
              <p className="font-medium">No identity details required</p>
              <p className="mt-1 text-muted-foreground">We use your HeartPlan profile for this demo. Do not enter a Social Security number, account number, or other private information.</p>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="credit-consent" checked={creditConsent} onCheckedChange={(checked) => setCreditConsent(checked === true)}
                disabled={creditMutation.isPending || isReadOnly} data-testid="checkbox-credit-consent" />
              <Label htmlFor="credit-consent" className="font-normal leading-5">
                I agree to a simulated soft credit inquiry using made-up demo data. I understand that we will not request a real credit report.
              </Label>
            </div>
            <Button className="w-full sm:w-auto" onClick={() => creditMutation.mutate()}
              disabled={!creditConsent || creditMutation.isPending || isReadOnly} data-testid="button-run-credit-demo">
              {creditMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {creditMutation.isPending ? "Searching demo records…" : "Run demo credit search"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Connect a fictional bank</CardTitle>
            </div>
            <CardDescription>See example accounts and regular payments. You do not need to sign in to a real bank.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="demo-bank">Choose a demo institution</Label>
              <Select value={selectedBank} onValueChange={setSelectedBank} disabled={bankMutation.isPending || isReadOnly}>
                <SelectTrigger id="demo-bank" data-testid="select-demo-bank"><SelectValue placeholder="Select a fictional bank" /></SelectTrigger>
                <SelectContent>
                  {FICTIONAL_BANKS.map((bank) => <SelectItem key={bank} value={bank}>{bank}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              We do not collect a username, password, security answer, or account number. This is only a visual demonstration.
            </p>
            <Button className="w-full sm:w-auto" onClick={() => bankMutation.mutate()}
              disabled={!selectedBank || bankMutation.isPending || isReadOnly} data-testid="button-connect-demo-bank">
              {bankMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              {bankMutation.isPending ? "Connecting demo bank…" : "Connect demo bank"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Review discoveries</CardTitle>
              <CardDescription className="mt-1">Review each item. Save only the ones you want to add to your HeartPlan list.</CardDescription>
            </div>
            {selectableItems.length > 0 && !isReadOnly && (
              <div className="flex items-center gap-2">
                <Checkbox id="select-all-discoveries" checked={allSelected} onCheckedChange={(checked) => {
                  setSelectedIds(checked === true ? new Set(selectableItems.map((item) => item.id)) : new Set());
                }} data-testid="checkbox-select-all-discoveries" />
                <Label htmlFor="select-all-discoveries" className="font-normal">Select all</Label>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {itemsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : itemsQuery.isError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">Discovery items could not be loaded.</p>
              <Button variant="outline" className="mt-3" onClick={() => itemsQuery.refetch()}>Try again</Button>
            </div>
          ) : reviewItems.length === 0 ? (
            <div className="py-10 text-center" data-testid="text-no-discoveries">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 font-medium">No discoveries to review</p>
              <p className="mt-1 text-sm text-muted-foreground">Run either safe demo above to create a fictional review queue.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviewItems.map((item) => {
                const draft = drafts[item.id] || editableFromItem(item);
                const sameNameDuplicate = normalizedNameCounts[item.name.trim().toLocaleLowerCase()] > 1;
                const duplicate = !!item.duplicateOfKey || sameNameDuplicate;
                const duplicateTarget = sameNameDuplicate
                  ? reviewItems.find((candidate) =>
                      candidate.id !== item.id &&
                      candidate.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase())
                  : undefined;
                const isMergeSource = duplicateTarget &&
                  reviewItems.find((candidate) =>
                    candidate.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase())?.id !== item.id;
                const saved = itemStatus(item) === "saved";
                return (
                  <div key={item.id} className="rounded-lg border p-4" data-testid={`discovery-item-${item.id}`}>
                    <div className="flex items-start gap-3">
                      {!saved && !isReadOnly ? (
                        <Checkbox className="mt-1" checked={selectedIds.has(item.id)} aria-label={`Select ${item.name}`}
                          onCheckedChange={(checked) => setSelectedIds((current) => {
                            const next = new Set(current);
                            checked === true ? next.add(item.id) : next.delete(item.id);
                            return next;
                          })} data-testid={`checkbox-discovery-${item.id}`} />
                      ) : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.name}</p>
                          <Badge variant="outline" data-testid={`badge-source-${item.id}`}>{labelize(item.source)}</Badge>
                          <Badge variant="secondary" data-testid={`badge-classification-${item.id}`}>{labelize(item.classification)}</Badge>
                          {saved && <Badge>Saved</Badge>}
                        </div>
                        {item.institution && <p className="mt-1 text-sm text-muted-foreground">{item.institution}</p>}
                        {duplicate && (
                          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-50"
                            data-testid={`warning-duplicate-${item.id}`}>
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>Possible duplicate{item.duplicateOfKey ? ` of ${item.duplicateOfKey}` : " based on its name"}. Review before saving.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor={`category-${item.id}`}>Category</Label>
                        <Select value={draft.category} onValueChange={(value) => setDraftField(item, "category", value)} disabled={saved || isReadOnly}>
                          <SelectTrigger id={`category-${item.id}`} data-testid={`select-discovery-category-${item.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((category) => <SelectItem key={category} value={category}>{labelize(category)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`classification-${item.id}`}>Classification</Label>
                        <Select value={draft.classification} onValueChange={(value) => setDraftField(item, "classification", value)} disabled={saved || isReadOnly}>
                          <SelectTrigger id={`classification-${item.id}`} data-testid={`select-discovery-classification-${item.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CLASSIFICATIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <EditField label="Last 4 digits" value={draft.maskedHint} disabled={saved || isReadOnly}
                        onChange={(value) => setDraftField(item, "maskedHint", value.replace(/\D/g, "").slice(0, 4))}
                        testId={`input-discovery-hint-${item.id}`} placeholder="e.g. 0042" inputMode="numeric" maxLength={4} />
                      <EditField label="Estimated value / balance" value={draft.value} disabled={saved || isReadOnly}
                        onChange={(value) => setDraftField(item, "value", value)} testId={`input-discovery-value-${item.id}`} inputMode="decimal" />
                      <EditField label="Monthly amount" value={draft.monthlyAmount} disabled={saved || isReadOnly}
                        onChange={(value) => setDraftField(item, "monthlyAmount", value)} testId={`input-discovery-monthly-${item.id}`} inputMode="decimal" />
                    </div>
                    {!saved && !isReadOnly && (
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        {isMergeSource && duplicateTarget && (
                          <Button variant="secondary" size="sm"
                            onClick={() => mergeMutation.mutate({ sourceId: item.id, targetId: duplicateTarget.id })}
                            disabled={mergeMutation.isPending} data-testid={`button-merge-discovery-${item.id}`}>
                            {mergeMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <GitMerge className="mr-1 h-4 w-4" />}
                            Merge duplicate
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: item.id, fields: { status: "dismissed" } })}
                          disabled={updateMutation.isPending} data-testid={`button-dismiss-discovery-${item.id}`}>
                          <X className="mr-1 h-4 w-4" /> Dismiss
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => updateMutation.mutate({ id: item.id, fields: draft })}
                          disabled={updateMutation.isPending} data-testid={`button-update-discovery-${item.id}`}>
                          {updateMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                          Update
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isReadOnly && selectableItems.length > 0 && (
            <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
              <p className="text-sm text-muted-foreground">{selectedIds.size} selected</p>
              <Button onClick={() => saveMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || saveMutation.isPending}
                data-testid="button-save-selected-discoveries">
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saveMutation.isPending ? "Saving selected items" : "Save selected items"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  disabled,
  testId,
  placeholder,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  testId: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  maxLength?: number;
}) {
  const id = `${testId}-field`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}
        placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} data-testid={testId} />
    </div>
  );
}