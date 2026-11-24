import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Heart, Loader2, Check, CheckCircle2, Circle, FileText, Landmark, Users, Mail, Sparkles, UserRound, ChevronRight, Crown, MailWarning, RotateCw, HandHeart, CalendarCheck,
} from "lucide-react";
import { useHeartPlanAdvance, useSectionPageFocus } from "./section-navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { OrsaLegacyOfferCard } from "@/components/orsa-legacy-offer";
import { PrudentialLifeInsuranceSuggestion } from "@/components/prudential-life-insurance-suggestion";
import { shouldSuggestPrudentialLifeInsurance } from "@shared/heartPlanLifeInsurance";

interface PlanProgress {
  sections: Record<string, boolean>;
  completed: number;
  total: number;
  percent: number;
  counts: { documents: number; assets: number; contacts: number; letters: number };
}

interface PlanOverview {
  plan: {
    id: string;
    status: string;
    tier: string;
    fullName: string | null;
    dateOfBirth: string | null;
    phone: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    homeOccupancyStatus: "owns_home" | "rents_home" | "lives_with_family_or_others" | "prefer_not_to_say_or_not_sure" | null;
    hasVehicles: boolean | null;
    activatedAt: string | null;
  };
  progress: PlanProgress;
  intake: Record<string, string | number | null> | null;
  annualReview: { lastReviewedAt: string | null; nextReviewAt: string; due: boolean };
}

interface PlanContact {
  id: string;
  fullName: string;
  infoEmailFailedAt: string | null;
}

const CHECKLIST = [
  { key: "profile", title: "Personal information", description: "Your name, birth date, and contact details", url: "/", icon: UserRound },
  { key: "wishes", title: "End-of-life wishes", description: "Resting preferences, service, music, and more", url: "/heartplan/wishes", icon: Sparkles },
  { key: "documents", title: "Document vault", description: "Will, insurance, deeds, and other key papers", url: "/heartplan/vault", icon: FileText },
  { key: "assets", title: "Assets & accounts", description: "What you have and what should happen to it", url: "/heartplan/assets", icon: Landmark },
  { key: "contacts", title: "Trusted contacts", description: "The people we should work with when the time comes", url: "/heartplan/contacts", icon: Users },
  { key: "letters", title: "Legacy Messages", description: "Private text, audio, and video delivered after activation", url: "/heartplan/letters", icon: Mail },
];

export default function HeartPlanDashboard() {
  const { toast } = useToast();
  // The dashboard is served at "/" for planner accounts and at "/heartplan"
  // for family accounts planning ahead — self-links must use the current path.
  const [location] = useLocation();
  const { data, isLoading } = useQuery<PlanOverview>({ queryKey: ["/api/heartplan"] });
  const { data: orsaMembership } = useQuery<{ orsaVerified: boolean; heartPlanLegacyIncluded: boolean }>({ queryKey: ["/api/orsa/membership"] });
  const { data: contacts } = useQuery<PlanContact[]>({ queryKey: ["/api/heartplan/contacts"] });
  const { headingRef } = useSectionPageFocus(!isLoading);

  const [profile, setProfile] = useState({
    fullName: "", dateOfBirth: "", phone: "", street: "", city: "", state: "", zip: "",
    homeOccupancyStatus: null as PlanOverview["plan"]["homeOccupancyStatus"],
    hasVehicles: null as boolean | null,
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [verifyingUpgrade, setVerifyingUpgrade] = useState(false);
  const [zipLookupStatus, setZipLookupStatus] = useState<"idle" | "loading" | "found" | "not_found">("idle");
  const zipLookup = useRef<{ zip: string } | null>(null);
  const advance = useHeartPlanAdvance("profile");

  const lookUpZip = async (rawZip: string) => {
    const zip = rawZip.trim().match(/^\d{5}/)?.[0];
    if (!zip) {
      zipLookup.current = null;
      setZipLookupStatus("idle");
      return;
    }
    if (zipLookup.current?.zip === zip) return;
    const lookup = { zip };
    zipLookup.current = lookup;
    setZipLookupStatus("loading");
    try {
      const response = await apiRequest("GET", `/api/locations/us-zip/${zip}`);
      const location = await response.json() as { city: string; state: string };
      if (zipLookup.current !== lookup) return;
      setProfile(current => current.zip.trim().startsWith(zip)
        ? {
            ...current,
            city: current.city === profile.city ? location.city : current.city,
            state: current.state === profile.state ? location.state : current.state,
          }
        : current);
      setZipLookupStatus("found");
    } catch {
      if (zipLookup.current === lookup) {
        zipLookup.current = null;
        setZipLookupStatus("not_found");
      }
    }
  };

  // Handle returning from Stripe Checkout: verify the payment so the badge
  // updates immediately (the webhook is the backstop if the user never returns)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get("upgrade");
    if (!upgrade) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (upgrade === "cancelled") {
      toast({ title: "Upgrade cancelled", description: "You have not been charged. You can upgrade any time." });
      return;
    }
    const sessionId = params.get("session_id");
    if (upgrade === "success" && sessionId) {
      setVerifyingUpgrade(true);
      apiRequest("GET", `/api/heartplan/upgrade/verify?session_id=${encodeURIComponent(sessionId)}`)
        .then((res) => res.json())
        .then((result) => {
          if (result.upgraded) {
            trackAnalyticsEvent("legacy_checkout_success", { surface: "dashboard" });
            queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
            toast({ title: "Welcome to HeartPlan Legacy", description: "Your upgrade is complete. Thank you for trusting us." });
          } else {
            toast({ title: "Payment pending", description: "Your payment hasn't been confirmed yet. Your plan will upgrade automatically once it clears.", });
          }
        })
        .catch((error: any) => {
          toast({ title: "Could not confirm upgrade", description: error.message, variant: "destructive" });
        })
        .finally(() => setVerifyingUpgrade(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/heartplan/upgrade/checkout", { tier: "legacy" });
      return res.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data.url) {
        trackAnalyticsEvent("legacy_checkout_started", { surface: "dashboard" });
        window.location.href = data.url;
      } else {
        toast({ title: "Could not start upgrade", description: "No checkout link was returned. Please try again.", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Could not start upgrade", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (data?.plan && !profileLoaded) {
      setProfile({
        fullName: data.plan.fullName || "",
        dateOfBirth: data.plan.dateOfBirth || "",
        phone: data.plan.phone || "",
        street: data.plan.street || "",
        city: data.plan.city || "",
        state: data.plan.state || "",
        zip: data.plan.zip || "",
        homeOccupancyStatus: data.plan.homeOccupancyStatus,
        hasVehicles: data.plan.hasVehicles,
      });
      setProfileLoaded(true);
    }
  }, [data, profileLoaded]);

  // Same retry action as the contacts page: for when the address was actually
  // correct and the failure was transient — resets the undeliverable marker
  // server-side and re-attempts the send.
  const retryInfoEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/heartplan/contacts/${id}/retry-info-email`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/contacts"] });
      toast({
        title: "Re-sending the email",
        description: "We're trying this address again. The warning will come back if delivery keeps failing.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not retry", description: error.message, variant: "destructive" });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | boolean | null> = {
        homeOccupancyStatus: profile.homeOccupancyStatus,
        hasVehicles: profile.hasVehicles,
      };
      for (const key of ["fullName", "dateOfBirth", "phone", "street", "city", "state", "zip"] as const) {
        body[key] = profile[key].trim() || null;
      }
      const res = await apiRequest("PATCH", "/api/heartplan", body);
      return res.json();
    },
    onSuccess: async () => {
      trackAnalyticsEvent("heartplan_content_saved", { section: "profile" });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Saved", description: "Your personal information has been updated." });
      await advance.advanceAfterSave();
    },
    onError: (error: any) => {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    },
  });
  const annualReviewMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/heartplan/annual-review")).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Annual review complete", description: "Your next Heart Plan review is scheduled for one year from today." });
    },
    onError: (error: any) => toast({ title: "Could not complete the review", description: error.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const plan = data?.plan;
  const progress = data?.progress;
  const isActivated = plan?.status === "activated";
  const undeliverableContacts = contacts?.filter((c) => c.infoEmailFailedAt) ?? [];
  const undeliverableCount = undeliverableContacts.length;
  const intake = data?.intake;
  const lifeInsuranceCoverage = typeof intake?.hasLifeInsurance === "string" ? intake.hasLifeInsurance : undefined;
  const intakeFinished = !!(intake?.completedAt || intake?.skippedAt);
  const priorities = CHECKLIST.map((item) => {
    const answerKeys: Record<string, string[]> = {
      wishes: ["hasFinalArrangementPlans", "hasPrepaidFuneralPlan"],
      documents: ["hasWillOrTrust", "hasPowerOfAttorney", "hasHealthcareDirective", "hasLifeInsurance"],
      assets: ["hasInvestmentAccounts", "hasLifeInsurance"],
      contacts: ["hasChildrenOrDependents", "hasPowerOfAttorney"],
    };
    const sectionAnswers = (answerKeys[item.key] || []).map(key => intake?.[key]).filter(Boolean);
    const score = sectionAnswers.includes("no") ? 0 : sectionAnswers.includes("not_sure") ? 1 : 2;
    return { ...item, score, reason: score === 0 ? "Based on your welcome answers, this may need attention" : score === 1 ? "A good place to review what you have" : null };
  }).sort((a, b) => a.score - b.score);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-7 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary" />
            <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold outline-none" data-testid="text-heartplan-title">Your HeartPlan</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Your plan is private. Our concierge team will follow it and share only the information you have approved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={plan?.tier === "free" ? "secondary" : "default"}
            data-testid="badge-plan-tier"
          >
            {plan?.tier !== "free" && <Crown className="h-3 w-3 mr-1" />}
            {TIER_LABELS[plan?.tier ?? "free"] ?? `${plan?.tier} plan`}
          </Badge>
          {isActivated && <Badge data-testid="badge-plan-activated">Activated</Badge>}
        </div>
      </div>

      {undeliverableCount > 0 && (
        <Card className="border-destructive/50" data-testid="alert-undeliverable-contacts">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-3">
              <MailWarning className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {undeliverableCount === 1
                    ? "1 trusted contact's email couldn't be delivered"
                    : `${undeliverableCount} trusted contacts' emails couldn't be delivered`}
                </p>
                <p className="text-sm text-muted-foreground">
                  Try again if the address is right, or review your contacts to correct it.
                </p>
              </div>
              <Link
                href="/heartplan/contacts"
                className="flex items-center gap-1 text-sm text-muted-foreground shrink-0 hover:text-foreground"
                data-testid="link-review-contacts"
              >
                Review contacts
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-2 pl-8">
              {undeliverableContacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm">{contact.fullName}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => retryInfoEmailMutation.mutate(contact.id)}
                    disabled={retryInfoEmailMutation.isPending}
                    data-testid={`button-retry-info-email-${contact.id}`}
                  >
                    {retryInfoEmailMutation.isPending
                      ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      : <RotateCw className="h-3 w-3 mr-1" />}
                    Try again
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isActivated && (
        <Card className="border-primary/40">
          <CardContent className="pt-6">
            <p className="text-sm">
              This HeartPlan was converted after a reported death. Our concierge team is following the wishes recorded in the plan, and it can no longer be changed.
            </p>
          </CardContent>
        </Card>
      )}

      {!isActivated && data?.annualReview && (
        <Card className={data.annualReview.due ? "border-amber-500/60 bg-amber-50/40 dark:bg-amber-950/10" : "border-primary/20"} data-testid="card-annual-review">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">{data.annualReview.due ? "Your annual Heart Plan review is due" : "Annual Heart Plan review"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.annualReview.lastReviewedAt
                    ? `Last reviewed ${new Date(data.annualReview.lastReviewedAt).toLocaleDateString()}. `
                    : "No annual review has been completed yet. "}
                  Next review: {new Date(data.annualReview.nextReviewAt).toLocaleDateString()}.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Confirm that your wishes, documents, assets, and trusted people are still current.</p>
              </div>
            </div>
            <Button variant={data.annualReview.due ? "default" : "outline"} onClick={() => annualReviewMutation.mutate()} disabled={annualReviewMutation.isPending} data-testid="button-complete-annual-review">
              {annualReviewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete annual review
            </Button>
          </CardContent>
        </Card>
      )}

      {!isActivated && !intakeFinished && (
        <Card className="border-primary/40" data-testid="card-welcome-invitation">
          <CardContent className="pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Make your HeartPlan feel more personal</p>
              <p className="text-sm text-muted-foreground">Answer a few optional questions so we can put the most useful next steps first.</p>
            </div>
            <Button asChild><Link href="/heartplan/welcome">Get started</Link></Button>
          </CardContent>
        </Card>
      )}

      {!isActivated && intakeFinished && (
        <div className="flex justify-end">
          <Button variant="outline" asChild data-testid="button-review-welcome">
            <Link href="/heartplan/welcome">Review welcome answers</Link>
          </Button>
        </div>
      )}

      {!isActivated && shouldSuggestPrudentialLifeInsurance(lifeInsuranceCoverage) && (
        <PrudentialLifeInsuranceSuggestion coverage={lifeInsuranceCoverage} />
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg">Your plan, at a glance</CardTitle>
              <span className="text-sm font-medium text-muted-foreground" data-testid="text-progress-percent">
               {progress?.completed ?? 0} of {progress?.total ?? 6} steps finished
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress?.percent ?? 0} />
          <div className="grid gap-2 sm:grid-cols-2">
            {priorities.map((item) => {
              const done = progress?.sections?.[item.key];
              return (
                <Link key={item.key} href={item.url === "/" ? location : item.url}>
                  <div
                    className="flex items-center gap-3 rounded-md border p-3 hover-elevate cursor-pointer"
                    data-testid={`checklist-${item.key}`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      {item.reason && <p className="text-xs text-primary mt-1">{item.reason}</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card className="border-primary/20 bg-secondary/25">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><HandHeart className="mt-0.5 h-6 w-6 shrink-0 text-accent" /><div><p className="font-serif text-lg font-semibold">Support for the practical details</p><p className="text-sm text-muted-foreground">Explore providers reviewed for families and planners. Your HeartPlan remains private.</p></div></div>
          <Link href="/marketplace" className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">Browse providers</Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Personal information</CardTitle>
          <CardDescription>We use this to identify your plan and help your family understand important property and ongoing obligations when it is carried out.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full legal name</Label>
              <Input id="fullName" value={profile.fullName} disabled={isActivated}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} data-testid="input-full-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input id="dateOfBirth" type="date" value={profile.dateOfBirth} disabled={isActivated}
                onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })} data-testid="input-date-of-birth" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={profile.phone} disabled={isActivated}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })} data-testid="input-phone" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="street">Current home street address</Label>
              <Input id="street" value={profile.street} disabled={isActivated}
                onChange={(e) => setProfile({ ...profile, street: e.target.value })} data-testid="input-street" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={profile.city} disabled={isActivated}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })} data-testid="input-city" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={profile.state} disabled={isActivated}
                  onChange={(e) => setProfile({ ...profile, state: e.target.value })} data-testid="input-state" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">ZIP</Label>
                <Input id="zip" value={profile.zip} disabled={isActivated}
                  inputMode="numeric" autoComplete="postal-code" maxLength={10}
                  onChange={(e) => {
                    const zip = e.target.value;
                    setProfile({ ...profile, zip });
                    if (!zipLookup.current || !zip.trim().startsWith(zipLookup.current.zip)) {
                      zipLookup.current = null;
                      setZipLookupStatus("idle");
                    }
                    if (/^\d{5}$/.test(zip.trim())) void lookUpZip(zip);
                  }}
                  onBlur={(e) => void lookUpZip(e.target.value)}
                  aria-describedby="zip-lookup-status"
                  data-testid="input-zip" />
                <p id="zip-lookup-status" className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
                  {zipLookupStatus === "loading" && "Finding city and state…"}
                  {zipLookupStatus === "found" && "ZIP lookup complete. Review city and state."}
                  {zipLookupStatus === "not_found" && "ZIP not found. Enter city and state manually."}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Current home occupancy</Label>
              <Select
                value={profile.homeOccupancyStatus || "not_answered"}
                disabled={isActivated}
                onValueChange={(value) => setProfile({
                  ...profile,
                  homeOccupancyStatus: value === "not_answered" ? null : value as PlanOverview["plan"]["homeOccupancyStatus"],
                })}
              >
                <SelectTrigger data-testid="select-home-occupancy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_answered">Not answered</SelectItem>
                  <SelectItem value="owns_home">I own my home</SelectItem>
                  <SelectItem value="rents_home">I rent my home</SelectItem>
                  <SelectItem value="lives_with_family_or_others">I live with family or others</SelectItem>
                  <SelectItem value="prefer_not_to_say_or_not_sure">I’m not sure or prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Do you currently have a car or other vehicle?</Label>
              <Select
                value={profile.hasVehicles === null ? "not_answered" : profile.hasVehicles ? "yes" : "no"}
                disabled={isActivated}
                onValueChange={(value) => setProfile({ ...profile, hasVehicles: value === "not_answered" ? null : value === "yes" })}
              >
                <SelectTrigger data-testid="select-has-vehicles"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_answered">Not answered</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!isActivated && (
            <Button
              onClick={() => saveProfileMutation.mutate()}
              disabled={saveProfileMutation.isPending || advance.isAdvancing}
              data-testid="button-save-profile"
            >
              {(saveProfileMutation.isPending || advance.isAdvancing) && !advance.saved && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {advance.saved && <Check className="h-4 w-4 mr-2" />}
              {advance.saved ? "Saved" : "Save and continue"}
            </Button>
          )}
        </CardContent>
      </Card>

      {orsaMembership?.orsaVerified ? (
        <Card className="border-accent/30 bg-accent/5" data-testid="card-orsa-benefit">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3"><HandHeart className="mt-0.5 h-6 w-6 shrink-0 text-accent" /><div><p className="font-serif text-lg font-semibold">Your ORSA benefits are active</p><p className="text-sm text-muted-foreground">{orsaMembership.heartPlanLegacyIncluded ? "Complimentary HeartPlan Legacy is included through December 1, 2026. Concierge case service remains covered." : "Complimentary HeartPlan Legacy has ended. Concierge case service remains covered; see your paid Legacy status below."}</p></div></div>
            <Link href="/orsa" className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">View membership</Link>
          </CardContent>
        </Card>
      ) : plan?.tier === "free" ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Upgrade to HeartPlan Legacy</CardTitle>
            </div>
            <CardDescription>
              A one-time payment of $149 — no subscription, yours for life.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-4 flex-wrap">
            <ul className="space-y-1.5">
              {LEGACY_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  {benefit}
                </li>
              ))}
            </ul>
            {!isActivated && (
              <Button
                onClick={() => upgradeMutation.mutate()}
                disabled={upgradeMutation.isPending || verifyingUpgrade}
                data-testid="button-upgrade"
              >
                {(upgradeMutation.isPending || verifyingUpgrade) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {verifyingUpgrade ? "Confirming payment…" : "Upgrade — $149"}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/40">
          <CardContent className="pt-6 flex items-center gap-3">
            <Crown className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-medium" data-testid="text-paid-tier">You're on HeartPlan Legacy</p>
              <p className="text-sm text-muted-foreground">
                Your family will receive priority concierge activation and a dedicated coordinator when the time comes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <OrsaLegacyOfferCard />
    </div>
  );
}

const TIER_LABELS: Record<string, string> = { free: "Free plan", legacy: "Legacy plan" };

const LEGACY_BENEFITS = [
  "Expanded 1 GB document vault storage",
  "Priority concierge activation when the time comes",
  "A dedicated coordinator working with your family",
  "White-glove estate coordination, start to finish",
];
