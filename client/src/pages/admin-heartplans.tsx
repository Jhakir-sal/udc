import { useEffect, useState } from "react";
import { adminHeartPlanDetailHref } from "@/lib/heartplan-routes";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Heart, AlertTriangle, X, RefreshCw, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trackAnalyticsEvent } from "@/lib/analytics";

interface AdminHeartPlan {
  id: string;
  status: string;
  tier: string;
  fullName: string | null;
  createdAt: string;
  activatedAt: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  progress: { completed: number; total: number; percent: number };
  pendingActivationRequests: number;
  upgradedAt: string | null;
  lastActivityAt: string;
  primaryContactStatus: "ready" | "missing" | "no_email" | "delivery_failed";
  failedContactDeliveries: number;
  annualReview: { lastReviewedAt: string | null; nextReviewAt: string; due: boolean };
}

interface LivingProgressSummary {
  started: number;
  thirtyPlus: number;
  fiftyPlus: number;
  seventyFivePlus: number;
  complete: number;
}

const livingStages = [
  { label: "Started", summaryKey: "started", value: "started", testKey: "started", analyticsBand: "started" },
  { label: "30%+", summaryKey: "thirtyPlus", value: "thirtyPlus", testKey: "30", analyticsBand: "30_percent" },
  { label: "50%+", summaryKey: "fiftyPlus", value: "fiftyPlus", testKey: "50", analyticsBand: "50_percent" },
  { label: "75%+", summaryKey: "seventyFivePlus", value: "seventyFivePlus", testKey: "75", analyticsBand: "75_percent" },
  { label: "Complete", summaryKey: "complete", value: "complete", testKey: "complete", analyticsBand: "complete" },
] as const;

const defaultFilters = {
  q: "",
  signupFrom: "",
  signupTo: "",
  progress: "all",
  stage: "",
  payment: "all",
  activation: "all",
  warnings: "all",
  annualReview: "all",
};

type HeartPlanFilters = typeof defaultFilters;
type HeartPlanFilterKey = keyof HeartPlanFilters;

const filterValues: Partial<Record<HeartPlanFilterKey, readonly string[]>> = {
  progress: ["not_started", "started", "complete"],
  stage: livingStages.map((stage) => stage.value),
  payment: ["free", "paid"],
  activation: ["active", "activated"],
  warnings: ["yes", "no"],
  annualReview: ["due", "upcoming"],
};

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function filtersFromUrl(): HeartPlanFilters {
  const params = new URLSearchParams(window.location.search);
  const filters = { ...defaultFilters };
  filters.q = params.get("q") ?? "";

  for (const key of ["signupFrom", "signupTo"] as const) {
    const value = params.get(key);
    if (value && isValidDate(value)) filters[key] = value;
  }

  for (const key of Object.keys(filterValues) as HeartPlanFilterKey[]) {
    const value = params.get(key);
    if (value && filterValues[key]?.includes(value)) filters[key] = value;
  }

  return filters;
}

function planningStageLabel(percent: number): string {
  if (percent >= 100) return "Complete";
  if (percent >= 75) return "75%+ planned";
  if (percent >= 50) return "50%+ planned";
  if (percent >= 30) return "30%+ planned";
  return "Started";
}

export default function AdminHeartPlansPage() {
  const [filters, setFilters] = useState<HeartPlanFilters>(filtersFromUrl);
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== "all")).toString();
  const queryUrl = `/api/admin/heartplans${params ? `?${params}` : ""}`;
  const {
    data: plans,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<AdminHeartPlan[]>({
    queryKey: [queryUrl],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const {
    data: progressSummary,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useQuery<LivingProgressSummary>({
    queryKey: ["/api/admin/heartplans/progress-summary"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const syncFiltersFromUrl = () => setFilters(filtersFromUrl());
    window.addEventListener("popstate", syncFiltersFromUrl);
    return () => window.removeEventListener("popstate", syncFiltersFromUrl);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const key of Object.keys(defaultFilters) as HeartPlanFilterKey[]) {
      const value = filters[key];
      if (value && value !== "all") url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [filters]);

  const setFilter = (key: HeartPlanFilterKey, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const selectedStage = livingStages.find((stage) => stage.value === filters.stage);
  const selectStage = (stage: (typeof livingStages)[number]) => {
    if (filters.stage === stage.value) {
      trackAnalyticsEvent("admin_heartplan_stage_cleared", { stage_band: stage.analyticsBand });
      setFilter("stage", "");
      return;
    }
    trackAnalyticsEvent("admin_heartplan_stage_selected", { stage_band: stage.analyticsBand });
    setFilter("stage", stage.value);
  };
  const clearStage = () => {
    if (!selectedStage) return;
    trackAnalyticsEvent("admin_heartplan_stage_cleared", { stage_band: selectedStage.analyticsBand });
    setFilter("stage", "");
  };
  const clearFilters = () => {
    if (selectedStage) {
      trackAnalyticsEvent("admin_heartplan_stage_cleared", { stage_band: selectedStage.analyticsBand });
    }
    setFilters({ ...defaultFilters });
  };

  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Heart className="h-6 w-6 text-primary" />
          <h1 className="font-serif text-2xl font-semibold" data-testid="text-admin-heartplans-title">HeartPlans</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Living planners and their current planning progress. Convert a plan only after a confirmed death.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void refetch();
            void refetchSummary();
          }}
          disabled={isFetching}
          aria-label="Refresh HeartPlans"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Living plans by current stage</h2>
        {isSummaryError && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span>Stage totals could not be loaded.</span>
            <Button size="sm" variant="outline" onClick={() => refetchSummary()}>Retry stage totals</Button>
          </div>
        )}
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 md:grid-cols-5">
          {livingStages.map((stage) => (
            <Card key={stage.value} className={filters.stage === stage.value ? "border-primary ring-2 ring-primary/20" : ""}>
              <CardContent className="p-0">
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-4 sm:px-6 sm:py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-pressed={filters.stage === stage.value}
                  aria-label={`Filter by ${stage.label} living plans`}
                  onClick={() => selectStage(stage)}
                  data-testid={`button-living-progress-${stage.testKey}`}
                >
                  <p className="text-2xl font-semibold" data-testid={`text-living-progress-${stage.testKey}`}>{progressSummary?.[stage.summaryKey] ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{stage.label}</p>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
        {selectedStage && (
          <div className="mt-3 flex items-center gap-2" data-testid="active-heartplan-stage-filter">
            <Badge variant="secondary">Stage: {selectedStage.label}</Badge>
            <Button variant="ghost" size="sm" onClick={clearStage} data-testid="button-clear-heartplan-stage">
              <X className="mr-1 h-3.5 w-3.5" />
              Clear stage
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">Each living HeartPlan appears in one stage only. Plans converted after a death are excluded.</p>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Search planner name or email" value={filters.q} onChange={(e) => setFilter("q", e.target.value)} data-testid="input-heartplan-search" />
          <Input type="date" aria-label="Signup from" value={filters.signupFrom} onChange={(e) => setFilter("signupFrom", e.target.value)} />
          <Input type="date" aria-label="Signup to" value={filters.signupTo} onChange={(e) => setFilter("signupTo", e.target.value)} />
          {([
            ["progress", "Progress", [["all", "All progress"], ["not_started", "Not started"], ["started", "In progress"], ["complete", "Complete"]]],
            ["payment", "Payment", [["all", "All tiers"], ["free", "Free"], ["paid", "Paid Legacy"]]],
            ["activation", "Lifecycle", [["all", "All lifecycle states"], ["active", "Living plans"], ["activated", "Converted after death"]]],
            ["warnings", "Warnings", [["all", "All contacts"], ["yes", "Has warning"], ["no", "No warnings"]]],
            ["annualReview", "Annual review", [["all", "All review dates"], ["due", "Review due"], ["upcoming", "Review upcoming"]]],
          ] as const).map(([key, label, options]) => (
            <Select key={key} value={filters[key]} onValueChange={(value) => setFilter(key, value)}>
              <SelectTrigger aria-label={label} data-testid={`select-heartplan-${key}`}><SelectValue /></SelectTrigger>
              <SelectContent>{options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3 py-2" aria-label="Loading HeartPlans">
              {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded bg-muted" />)}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
              <p className="font-medium">HeartPlans could not be loaded</p>
              <p className="max-w-xl text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "The list is temporarily unavailable. Try again."}
              </p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </div>
          ) : plans?.length === 0 ? (
            <div className="py-8 text-center" data-testid="text-no-heartplans">
              <p className="font-medium">No HeartPlans match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Adjust or clear the filters to see more plans.</p>
              <Button className="mt-3" variant="outline" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : !plans ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No plan data is available.</p>
          ) : (
            <div className="w-full overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Planner</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="w-[180px]">Progress</TableHead>
                  <TableHead>Primary contact</TableHead>
                  <TableHead>Annual review</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id} data-testid={`heartplan-row-${plan.id}`}>
                    <TableCell className="font-medium">
                      <div className="min-w-[170px] space-y-1">
                        <Link
                          href={adminHeartPlanDetailHref(plan.id, filters.q)}
                          className="inline-flex min-h-8 items-center rounded-sm text-foreground underline decoration-primary/50 underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          data-testid={`link-heartplan-name-${plan.id}`}
                        >
                          {plan.fullName || plan.ownerName || "Unknown planner"}
                        </Link>
                        <Link
                          href={adminHeartPlanDetailHref(plan.id, filters.q)}
                          className="block w-fit rounded-sm text-xs font-medium text-primary underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          data-testid={`link-heartplan-completion-${plan.id}`}
                        >
                          View completion · {plan.progress?.percent ?? 0}% ({plan.progress?.completed ?? 0}/{plan.progress?.total ?? 6})
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{plan.ownerEmail || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {plan.status === "activated" ? (
                          <Badge>Converted after death</Badge>
                        ) : (
                          <Badge variant="secondary">Living plan</Badge>
                        )}
                        {plan.pendingActivationRequests > 0 && (
                          <Badge variant="destructive" data-testid={`badge-activation-requested-${plan.id}`}>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Passing reported
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{plan.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.upgradedAt ? "default" : "outline"}>{plan.upgradedAt ? "Paid" : "Not paid"}</Badge>
                      {plan.upgradedAt && <p className="text-xs text-muted-foreground mt-1">{new Date(plan.upgradedAt).toLocaleDateString()}</p>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          href={adminHeartPlanDetailHref(plan.id, filters.q)}
                          className="flex min-h-10 min-w-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-label={`View completion for ${plan.fullName || plan.ownerName || "planner"}: ${plan.progress?.percent ?? 0}%`}
                          data-testid={`link-heartplan-progress-${plan.id}`}
                        >
                          <Progress value={plan.progress?.percent ?? 0} className="h-2" />
                          <div className="text-xs whitespace-nowrap">
                          <p>{planningStageLabel(plan.progress?.percent ?? 0)}</p>
                          <p className="text-muted-foreground">
                            {plan.progress?.percent ?? 0}% · {plan.progress?.completed ?? 0}/{plan.progress?.total ?? 6}
                          </p>
                          </div>
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.primaryContactStatus === "ready" ? "secondary" : "destructive"}>
                        {plan.primaryContactStatus.replace(/_/g, " ")}
                      </Badge>
                      {plan.failedContactDeliveries > 0 && <p className="text-xs text-destructive mt-1">{plan.failedContactDeliveries} failed delivery</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {plan.status === "activated" ? (
                        <span className="text-sm text-muted-foreground">Not applicable</span>
                      ) : (
                        <>
                          <Badge variant={plan.annualReview.due ? "destructive" : "outline"}>
                            {plan.annualReview.due ? "Follow up due" : "Upcoming"}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(plan.annualReview.nextReviewAt).toLocaleDateString()}
                          </p>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(plan.lastActivityAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={adminHeartPlanDetailHref(plan.id, filters.q)}
                        className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md border border-primary/40 px-3 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        data-testid={`link-heartplan-${plan.id}`}
                      >
                        View completion <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
