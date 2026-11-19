import { useState } from "react";
import { useLocation, useRoute, useSearch, Link } from "wouter";
import { adminHeartPlansHref } from "@/lib/heartplan-routes";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Heart, Loader2, ArrowLeft, ExternalLink, AlertTriangle, Trash2, RefreshCw, Check, Minus,
} from "lucide-react";

interface PlanDetail {
  plan: {
    id: string;
    status: string;
    tier: string;
    fullName: string | null;
    certificateId: string | null;
    activatedAt: string | null;
    activatedByName: string | null;
    createdAt: string;
    upgradedAt: string | null;
  };
  owner: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
  progress: {
    sections: { profile: boolean; wishes: boolean; documents: boolean; assets: boolean; contacts: boolean; letters: boolean };
    counts: { documents: number; assets: number; contacts: number; letters: number };
    completed: number;
    total: number;
    percent: number;
  };
  payment: { tier: string; paid: boolean; paidAt: string | null };
  contactDelivery: { failedCount: number; primaryStatus: string };
  annualReview: { lastReviewedAt: string | null; nextReviewAt: string; due: boolean };
  consent: {
    requiredPoliciesAccepted: boolean;
    communicationsConsent: boolean | null;
    records: { consentType: string; decision: boolean; documentVersion: string; sourceUrl: string; contentHash: string; signupSource: string; recordedAt: string }[];
  };
  activationRequests: {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string | null;
    relationship: string | null;
    message: string | null;
    status: string;
    emailVerifiedAt: string | null;
    reviewedByName: string | null;
    reviewedAt: string | null;
    createdAt: string;
  }[];
}

export default function AdminHeartPlanDetailPage() {
  const [, params] = useRoute("/admin/heartplan/:planId");
  const [, navigate] = useLocation();
  const planId = params?.planId;
  const search = useSearch();
  const backHref = adminHeartPlansHref(new URLSearchParams(search).get("q") ?? "");
  const { toast } = useToast();
  const [activateOpen, setActivateOpen] = useState(false);
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [notifyContacts, setNotifyContacts] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PlanDetail>({
    queryKey: [`/api/admin/heartplans/${planId}`],
    enabled: !!planId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/heartplans/${planId}/activate`, {
        dateOfDeath,
        notifyContacts,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/heartplans/${planId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heartplans"] });
      setActivateOpen(false);
      toast({
        title: "HeartPlan converted",
        description: `Case ${result.certificate?.certificateNumber || ""} has been created.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Conversion failed", description: error.message, variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/admin/activation-requests/${requestId}/dismiss`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/heartplans/${planId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heartplans"] });
      toast({ title: "Request dismissed" });
    },
    onError: (error: any) => {
      toast({ title: "Could not dismiss request", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/admin/heartplans/${planId}`, {
        confirmation: deleteConfirmation,
        reason: deleteReason.trim(),
      });
      return response.json();
    },
    onSuccess: (result: { cleanupPending?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heartplans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heartplans/progress-summary"] });
      toast({
        title: "HeartPlan deleted",
        description: result.cleanupPending
          ? "Private-file cleanup is queued and will retry automatically."
          : "Private documents and messages were removed.",
      });
      navigate("/heartplans");
    },
    onError: (error: any) => {
      toast({ title: "Could not delete HeartPlan", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl min-w-0 space-y-5 p-4 sm:p-6" aria-label="Loading HeartPlan">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
        <div className="h-56 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-4xl min-w-0 p-4 sm:p-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-lg">HeartPlan details could not be loaded</CardTitle>
            <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "The latest plan details are unavailable."}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Retry
            </Button>
            <Button asChild variant="outline"><Link href={backHref}>Back to HeartPlans</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { plan, owner, progress, activationRequests, payment, contactDelivery, annualReview, consent } = data;
  const plannerName = plan.fullName || `${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() || "Unknown";
  const isActivated = plan.status === "activated";
  const planningStage = progress.percent >= 100 ? "Complete"
    : progress.percent >= 75 ? "75%+ planned"
    : progress.percent >= 50 ? "50%+ planned"
    : progress.percent >= 30 ? "30%+ planned"
    : "Started";
  const pendingRequests = (activationRequests || []).filter(r => r.status === "pending");
  const otherRequests = (activationRequests || []).filter(r => r.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl min-w-0 space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2" data-testid="link-back-heartplans">
            <ArrowLeft className="h-4 w-4" /> All HeartPlans
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="font-serif text-2xl font-semibold" data-testid="text-plan-detail-title">{plannerName}</h1>
            {isActivated ? <Badge>Converted after death</Badge> : <Badge variant="secondary">Living plan</Badge>}
            {!isActivated && <Badge variant="outline">{planningStage} · {progress.percent}%</Badge>}
            <Badge variant="outline" className="capitalize">{plan.tier}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {owner?.email} · Plan created {new Date(plan.createdAt).toLocaleDateString()}
          </p>
          <p className="mt-2 max-w-2xl text-sm font-medium text-primary">
            Admins see completion and counts, not private plan contents.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh HeartPlan details">
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {isActivated ? (
          plan.certificateId && (
            <Button asChild variant="outline" data-testid="button-view-case">
              <Link href={`/admin/case/${plan.certificateId}`}>
                View case <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          )
        ) : (
          <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" data-testid="button-activate-plan">
                <AlertTriangle className="h-4 w-4 mr-2" /> Member has passed
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm this member has passed?</DialogTitle>
                <DialogDescription>
                  This converts {plannerName}'s plan into a Steps After Life case: assets become connected accounts,
                  contacts become known relatives, vault documents are carried over, and sealed Legacy Messages are released.
                  This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dateOfDeath">Date of death *</Label>
                  <Input id="dateOfDeath" type="date" value={dateOfDeath}
                    onChange={(e) => setDateOfDeath(e.target.value)} data-testid="input-date-of-death" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="notifyContacts" checked={notifyContacts}
                    onCheckedChange={(v) => setNotifyContacts(v === true)} data-testid="checkbox-notify-contacts" />
                  <Label htmlFor="notifyContacts" className="text-sm font-normal">
                    Email trusted contacts and deliver sealed Legacy Messages
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActivateOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!dateOfDeath) {
                      toast({ title: "Date of death is required", variant: "destructive" });
                      return;
                    }
                    activateMutation.mutate();
                  }}
                  disabled={activateMutation.isPending}
                  data-testid="button-confirm-activate"
                >
                  {activateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirm passing & create case
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {!isActivated && (
          <Dialog open={deleteOpen} onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) {
              setDeleteConfirmation("");
              setDeleteReason("");
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" data-testid="button-delete-plan">
                <Trash2 className="mr-2 h-4 w-4" /> Delete plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Permanently delete this HeartPlan?</DialogTitle>
                <DialogDescription>
                  This permanently removes {plannerName}'s wishes, private documents, assets, contacts, and messages. Registration consent records are retained for compliance. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="delete-plan-reason">Reason for deletion</Label>
                <Input id="delete-plan-reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Required for the audit record" maxLength={500} data-testid="input-delete-plan-reason" />
                <Label htmlFor="delete-plan-confirmation">Type DELETE to confirm</Label>
                <Input id="delete-plan-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" data-testid="input-delete-plan-confirmation" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="destructive" disabled={deleteConfirmation !== "DELETE" || deleteReason.trim().length < 10 || deleteMutation.isPending} onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete-plan">
                  {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Permanently delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <Card data-testid="card-heartplan-completion">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg" data-testid="text-heartplan-completion-title">Completion checklist</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                This measures checklist recording, not legal validity or verification.
              </p>
            </div>
            <span className="text-sm font-medium tabular-nums">{progress.completed} of {progress.total} complete · {progress.percent}%</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress.percent} aria-label={`${progress.percent}% of plan checklist completed`} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["profile", "Profile", null],
              ["wishes", "Wishes", null],
              ["documents", "Documents", progress.counts.documents],
              ["assets", "Assets", progress.counts.assets],
              ["contacts", "Trusted contacts", progress.counts.contacts],
              ["letters", "Legacy Messages", progress.counts.letters],
            ] as const).map(([key, label, count]) => {
              const complete = progress.sections[key];
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-3 ${complete ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}
                  data-testid={`completion-section-${key}`}
                >
                  <div className="flex items-center gap-2">
                    {complete
                      ? <Check aria-hidden="true" className="h-4 w-4 text-primary" />
                      : <Minus aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <div className="text-right">
                    {count !== null && <p className="text-sm tabular-nums">{count} recorded</p>}
                    <Badge variant={complete ? "secondary" : "outline"} className="mt-1">
                      {complete ? "Complete" : "Incomplete"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {isActivated && (
        <Card className="border-primary/40">
          <CardContent className="pt-6 text-sm">
            Converted after death {plan.activatedAt ? new Date(plan.activatedAt).toLocaleString() : ""} by {plan.activatedByName || "concierge"}.
          </CardContent>
        </Card>
      )}

      {!isActivated && (
        <Card className={annualReview.due ? "border-destructive/50" : ""} data-testid="card-heartplan-annual-review">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
            <div>
              <p className="font-medium">{annualReview.due ? "Annual review follow-up is due" : "Annual review is upcoming"}</p>
              <p className="mt-1 text-muted-foreground">
                Next review: {new Date(annualReview.nextReviewAt).toLocaleDateString()}
                {annualReview.lastReviewedAt ? ` · Last completed: ${new Date(annualReview.lastReviewedAt).toLocaleDateString()}` : " · No completed review yet"}
              </p>
            </div>
            <Badge variant={annualReview.due ? "destructive" : "outline"}>{annualReview.due ? "Follow up due" : "Scheduled"}</Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-heartplan-consent">
          <CardHeader><CardTitle className="text-base">Registration consent</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><span className="text-muted-foreground">Required policies:</span> {consent.requiredPoliciesAccepted ? "Accepted" : "No registration record"}</p>
            <p><span className="text-muted-foreground">Optional communications:</span> {consent.communicationsConsent === true ? "Accepted" : consent.communicationsConsent === false ? "Declined" : "No registration record"}</p>
            {consent.records.map((record) => (
              <p key={`${record.consentType}-${record.recordedAt}`} className="text-xs text-muted-foreground">
                <span className="capitalize">{record.consentType}</span> · v{record.documentVersion} · {new Date(record.recordedAt).toLocaleString()} · {record.signupSource.replace(/_/g, " ")} · hash {record.contentHash.slice(0, 12)}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card data-testid="card-heartplan-payment">
          <CardHeader><CardTitle className="text-base">Payment</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Tier:</span> <span className="capitalize">{payment.tier}</span></p>
            <p><span className="text-muted-foreground">State:</span> {payment.paid ? "Paid" : "Not paid"}</p>
            <p><span className="text-muted-foreground">Paid date:</span> {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "—"}</p>
          </CardContent>
        </Card>
        <Card data-testid="card-heartplan-contact-delivery">
          <CardHeader><CardTitle className="text-base">Contact delivery</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Primary contact:</span> {contactDelivery.primaryStatus.replace(/_/g, " ")}</p>
            <p><span className="text-muted-foreground">Failed deliveries:</span> {contactDelivery.failedCount}</p>
          </CardContent>
        </Card>
      </div>

      {(pendingRequests.length > 0 || otherRequests.length > 0) && (
        <Card className={pendingRequests.length > 0 ? "border-destructive/50" : undefined}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${pendingRequests.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              Passing reports ({(activationRequests || []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingRequests.length > 0 && (
              <p className="text-sm text-muted-foreground">
                A trusted contact has reported this planner's passing and confirmed the report
                by email. Review and either convert the plan into a case or dismiss the report.
              </p>
            )}
            {[...pendingRequests, ...otherRequests].map((request) => (
              <div key={request.id} className="border rounded-md p-3 space-y-2" data-testid={`activation-request-${request.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="text-sm">
                    <p className="font-medium">
                      {request.requesterName}
                      {request.relationship ? <span className="text-muted-foreground font-normal"> · {request.relationship}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[request.requesterEmail, request.requesterPhone].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reported {new Date(request.createdAt).toLocaleString()}
                      {request.emailVerifiedAt ? ` · Email confirmed ${new Date(request.emailVerifiedAt).toLocaleString()}` : ""}
                    </p>
                    {request.message && (
                      <p className="text-sm mt-1 bg-muted/50 rounded p-2 whitespace-pre-wrap">{request.message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {request.status === "pending" ? (
                      <>
                        <Badge variant="destructive">Awaiting review</Badge>
                        {!isActivated && (
                          <>
                            <Button size="sm" variant="destructive"
                              onClick={() => setActivateOpen(true)}
                              data-testid={`button-approve-request-${request.id}`}>
                              Confirm passing & convert
                            </Button>
                            <Button size="sm" variant="outline"
                              onClick={() => dismissMutation.mutate(request.id)}
                              disabled={dismissMutation.isPending}
                              data-testid={`button-dismiss-request-${request.id}`}>
                              {dismissMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                              Dismiss
                            </Button>
                          </>
                        )}
                      </>
                    ) : request.status === "approved" ? (
                      <Badge>Approved{request.reviewedByName ? ` by ${request.reviewedByName}` : ""}</Badge>
                    ) : request.status === "dismissed" ? (
                      <Badge variant="outline">Dismissed{request.reviewedByName ? ` by ${request.reviewedByName}` : ""}</Badge>
                    ) : (
                      <Badge variant="secondary">Awaiting email confirmation</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
