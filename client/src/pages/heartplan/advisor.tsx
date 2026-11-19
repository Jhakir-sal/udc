import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CalendarCheck, CheckCircle2, FileText, Landmark, Loader2, Mail, ShieldCheck, Users } from "lucide-react";

type AdvisorResponse = {
  planId: string;
  access: { level: "full" | "limited"; permission: "view" | "edit" };
  summary: {
    plannerName: string;
    status: string;
    restingPreference: string | null;
    serviceType: string | null;
    additionalWishes: string | null;
    counts: { documents: number; assets: number; trustedContacts: number; legacyMessages: number };
  };
  annualReview: { lastReviewedAt: string | null; nextReviewAt: string; due: boolean };
  details?: {
    profile: Record<string, string | boolean | null>;
    wishes: Record<string, string | null> | null;
    assets: Array<Record<string, unknown>>;
    documents: Array<Record<string, unknown>>;
    contacts: Array<Record<string, unknown>>;
    legacyMessages: Array<Record<string, unknown>>;
  };
};

const PROFILE_FIELDS = [
  ["fullName", "Full name"], ["dateOfBirth", "Date of birth"], ["phone", "Phone"],
  ["street", "Street"], ["city", "City"], ["state", "State"], ["zip", "ZIP code"],
] as const;

export default function HeartPlanAdvisorPage() {
  const routeParams = useParams<{ planId: string }>();
  const planId = routeParams?.planId || decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "");
  const { toast } = useToast();
  const queryKey = ["/api/heartplan/advisor", planId];
  const advisor = useQuery<AdvisorResponse>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", `/api/heartplan/advisor/${encodeURIComponent(planId)}`)).json(),
    enabled: Boolean(planId),
  });
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [homeOccupancyStatus, setHomeOccupancyStatus] = useState("not_answered");
  const [hasVehicles, setHasVehicles] = useState("not_answered");
  const [wishes, setWishes] = useState({ restingPreference: "", serviceType: "", additionalWishes: "" });

  useEffect(() => {
    if (!advisor.data) return;
    const detailProfile = advisor.data.details?.profile || {};
    setProfile(Object.fromEntries(PROFILE_FIELDS.map(([key]) => [key, String(detailProfile[key] ?? "")])));
    setHomeOccupancyStatus(String(detailProfile.homeOccupancyStatus ?? "not_answered"));
    setHasVehicles(detailProfile.hasVehicles === true ? "yes" : detailProfile.hasVehicles === false ? "no" : "not_answered");
    setWishes({
      restingPreference: String(advisor.data.details?.wishes?.restingPreference ?? advisor.data.summary.restingPreference ?? ""),
      serviceType: String(advisor.data.details?.wishes?.serviceType ?? advisor.data.summary.serviceType ?? ""),
      additionalWishes: String(advisor.data.details?.wishes?.additionalWishes ?? advisor.data.summary.additionalWishes ?? ""),
    });
  }, [advisor.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const profileMutation = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/heartplan/advisor/${planId}/profile`, {
      ...profile,
      homeOccupancyStatus: homeOccupancyStatus === "not_answered" ? null : homeOccupancyStatus,
      hasVehicles: hasVehicles === "not_answered" ? null : hasVehicles === "yes",
    })).json(),
    onSuccess: () => { refresh(); toast({ title: "Planner information updated" }); },
    onError: (error: any) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });
  const wishesMutation = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/heartplan/advisor/${planId}/wishes`, wishes)).json(),
    onSuccess: () => { refresh(); toast({ title: "Shared wishes updated" }); },
    onError: (error: any) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });
  const reviewMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/heartplan/advisor/${planId}/annual-review`)).json(),
    onSuccess: () => { refresh(); toast({ title: "Annual review completed" }); },
    onError: (error: any) => toast({ title: "Could not complete review", description: error.message, variant: "destructive" }),
  });

  if (advisor.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (advisor.isError || !advisor.data) return <div className="mx-auto flex min-h-screen max-w-xl items-center px-4"><Card className="w-full"><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 font-serif text-2xl">Advisor access unavailable</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with the verified email address that received the advisor invitation. The planner may also need to review your access.</p><Button className="mt-5" onClick={() => window.location.href = "/login"}>Sign in again</Button></CardContent></Card></div>;

  const data = advisor.data;
  const canEdit = data.access.permission === "edit";
  const isFull = data.access.level === "full";
  const humanize = (value: unknown) => String(value ?? "Not provided").replace(/_/g, " ");

  return <div className="min-h-screen bg-muted/30">
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-9">
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => window.location.href = "/api/logout"}>Sign out</Button></div>
      <section className="rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
        <div className="flex flex-wrap gap-2"><Badge className="bg-white/15 text-white">Trusted advisor</Badge><Badge className="bg-white/15 text-white">{isFull ? "Full access" : "Limited summary"}</Badge><Badge className="bg-white/15 text-white">{canEdit ? "Can edit" : "View only"}</Badge></div>
        <h1 className="mt-4 font-serif text-3xl">{data.summary.plannerName}’s Heart Plan</h1>
        <p className="mt-2 max-w-2xl text-primary-foreground/80">{isFull ? "You can review the broader plan information shared with trusted advisors." : "Your access is limited to the fixed summary below."} {canEdit ? "You may edit information inside your assigned scope." : "You cannot make changes."}</p>
      </section>

      <Card className={data.annualReview.due ? "border-amber-500/60" : ""}>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><CalendarCheck className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">{data.annualReview.due ? "Annual review is due" : "Annual review"}</p><p className="text-sm text-muted-foreground">Next review: {new Date(data.annualReview.nextReviewAt).toLocaleDateString()}</p></div></div>
          {canEdit && <Button variant={data.annualReview.due ? "default" : "outline"} onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}>Mark review complete</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fixed plan summary</CardTitle><CardDescription>This summary is available to every trusted advisor.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Summary label="Resting preference" value={humanize(data.summary.restingPreference)} />
          <Summary label="Service type" value={humanize(data.summary.serviceType)} />
          <div className="sm:col-span-2"><Summary label="Additional wishes" value={humanize(data.summary.additionalWishes)} /></div>
          {[["Documents", data.summary.counts.documents, FileText], ["Assets", data.summary.counts.assets, Landmark], ["Trusted contacts", data.summary.counts.trustedContacts, Users], ["Legacy Messages", data.summary.counts.legacyMessages, Mail]].map(([label, count, Icon]: any) => <div key={label} className="flex items-center gap-3 rounded-lg border p-3"><Icon className="h-4 w-4 text-primary" /><span className="text-sm">{label}</span><strong className="ml-auto">{count}</strong></div>)}
        </CardContent>
      </Card>

      {canEdit && <Card>
        <CardHeader><CardTitle>Edit shared wishes</CardTitle><CardDescription>{isFull ? "Update the planner’s wishes within your full advisor access." : "Limited editing applies only to these fixed-summary fields."}</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="advisor-resting">Resting preference</Label><Input id="advisor-resting" className="mt-1.5" value={wishes.restingPreference} onChange={event => setWishes({ ...wishes, restingPreference: event.target.value })} /></div>
          <div><Label htmlFor="advisor-service">Service type</Label><Input id="advisor-service" className="mt-1.5" value={wishes.serviceType} onChange={event => setWishes({ ...wishes, serviceType: event.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="advisor-additional">Additional wishes</Label><Textarea id="advisor-additional" className="mt-1.5" value={wishes.additionalWishes} onChange={event => setWishes({ ...wishes, additionalWishes: event.target.value })} /></div>
          <Button className="sm:col-span-2 sm:w-fit" onClick={() => wishesMutation.mutate()} disabled={wishesMutation.isPending}>{wishesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save shared wishes</Button>
        </CardContent>
      </Card>}

      {isFull && data.details && <>
        <Card><CardHeader><CardTitle>Planner information</CardTitle><CardDescription>Housing and vehicle details help family understand property and ongoing obligations.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{PROFILE_FIELDS.map(([key, label]) => <div key={key}><Label htmlFor={`advisor-${key}`}>{label}</Label><Input id={`advisor-${key}`} className="mt-1.5" value={profile[key] || ""} disabled={!canEdit} onChange={event => setProfile({ ...profile, [key]: event.target.value })} /></div>)}<div><Label>Current home occupancy</Label><Select value={homeOccupancyStatus} disabled={!canEdit} onValueChange={setHomeOccupancyStatus}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_answered">Not answered</SelectItem><SelectItem value="owns_home">Owns home</SelectItem><SelectItem value="rents_home">Rents home</SelectItem><SelectItem value="lives_with_family_or_others">Lives with family or others</SelectItem><SelectItem value="prefer_not_to_say_or_not_sure">Not sure or prefers not to say</SelectItem></SelectContent></Select></div><div><Label>Currently has a vehicle</Label><Select value={hasVehicles} disabled={!canEdit} onValueChange={setHasVehicles}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_answered">Not answered</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>{canEdit && <Button className="sm:col-span-2 sm:w-fit" onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending}>Save planner information</Button>}</CardContent></Card>
        <FullList title="Assets and accounts" rows={data.details.assets} primary="name" secondary="institution" empty="No assets listed." />
        <FullList title="Documents" rows={data.details.documents} primary="label" secondary="documentType" empty="No documents listed." />
        <FullList title="Trusted contacts" rows={data.details.contacts} primary="fullName" secondary="relationship" empty="No contacts listed." />
        <FullList title="Legacy Messages" rows={data.details.legacyMessages} primary="subject" secondary="recipientName" empty="No messages listed." />
      </>}
      {!canEdit && <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Your access is view only. Contact the planner if your role should change.</p>}
    </main>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm">{value}</p></div>;
}

function FullList({ title, rows, primary, secondary, empty }: { title: string; rows: Array<Record<string, unknown>>; primary: string; secondary: string; empty: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{rows.length ? <div className="divide-y">{rows.map((row, index) => <div key={String(row.id || index)} className="py-3"><p className="font-medium">{String(row[primary] || "Untitled")}</p><p className="text-sm text-muted-foreground">{row.category === "vehicles" && row.vehicleOwnershipStatus ? `${humanizeValue(row.vehicleOwnershipStatus)}${row[secondary] ? ` · ${humanizeValue(row[secondary])}` : ""}` : humanizeValue(row[secondary])}</p></div>)}</div> : <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

function humanizeValue(value: unknown) {
  return String(value || "Not provided").replace(/_/g, " ");
}