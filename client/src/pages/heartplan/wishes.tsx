import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";
import { SectionNavigation, useHeartPlanAdvance, useSectionPageFocus } from "./section-navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";

const RESTING_OPTIONS = [
  { value: "burial", label: "Burial" },
  { value: "cremation", label: "Cremation" },
  { value: "green_burial", label: "Green / natural burial" },
  { value: "donation", label: "Body donation" },
  { value: "other", label: "Other" },
  { value: "undecided", label: "Still deciding" },
];

const SERVICE_OPTIONS = [
  { value: "traditional", label: "Traditional funeral" },
  { value: "celebration_of_life", label: "Celebration of life" },
  { value: "memorial", label: "Memorial service" },
  { value: "private", label: "Private / family only" },
  { value: "none", label: "No service" },
  { value: "undecided", label: "Still deciding" },
];

interface WishesForm {
  restingPreference: string;
  restingDetails: string;
  serviceType: string;
  serviceLocation: string;
  officiant: string;
  music: string;
  readings: string;
  flowersOrDonations: string;
  obituaryWishes: string;
  additionalWishes: string;
}

const EMPTY: WishesForm = {
  restingPreference: "", restingDetails: "", serviceType: "", serviceLocation: "",
  officiant: "", music: "", readings: "", flowersOrDonations: "", obituaryWishes: "", additionalWishes: "",
};

export default function HeartPlanWishes() {
  const { toast } = useToast();
  const { data: plan } = useQuery<{ plan: { status: string } }>({ queryKey: ["/api/heartplan"] });
  const { data: wishes, isLoading } = useQuery<Partial<WishesForm> | null>({ queryKey: ["/api/heartplan/wishes"] });
  const [form, setForm] = useState<WishesForm>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const { headingRef, firstControlRef } = useSectionPageFocus<HTMLButtonElement>(!isLoading);
  const advance = useHeartPlanAdvance("wishes");

  const isActivated = plan?.plan?.status === "activated";

  useEffect(() => {
    if (wishes !== undefined && !loaded) {
      setForm({
        ...EMPTY,
        ...(Object.fromEntries(
          Object.entries(wishes || {}).filter(([k, v]) => k in EMPTY && v != null)
        ) as Partial<WishesForm>),
      });
      setLoaded(true);
    }
  }, [wishes, loaded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) {
        body[k] = v.trim() ? v.trim() : null;
      }
      const res = await apiRequest("PUT", "/api/heartplan/wishes", body);
      return res.json();
    },
    onSuccess: async () => {
      trackAnalyticsEvent("heartplan_content_saved", { section: "wishes" });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/wishes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Wishes saved", description: "Your end-of-life wishes have been recorded." });
      await advance.advanceAfterSave();
    },
    onError: (error: any) => {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const set = (key: keyof WishesForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7 sm:p-6">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold scroll-mt-6 outline-none" data-testid="text-wishes-title">End-of-life wishes</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Share what matters to you. You can change these wishes at any time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resting preference</CardTitle>
          <CardDescription>Tell your family what feels right to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Preference</Label>
              <Select value={form.restingPreference} onValueChange={set("restingPreference")} disabled={isActivated}>
                <SelectTrigger ref={firstControlRef} data-testid="select-resting-preference">
                  <SelectValue placeholder="Choose..." />
                </SelectTrigger>
                <SelectContent>
                  {RESTING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restingDetails">Helpful details</Label>
            <p className="text-sm text-muted-foreground">For example, a cemetery, plot, provider, or another request.</p>
            <Textarea id="restingDetails" rows={3} value={form.restingDetails} disabled={isActivated}
              onChange={(e) => set("restingDetails")(e.target.value)} data-testid="input-resting-details" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gathering or service</CardTitle>
          <CardDescription>Choose what you would like people to know.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type of service</Label>
              <Select value={form.serviceType} onValueChange={set("serviceType")} disabled={isActivated}>
                <SelectTrigger data-testid="select-service-type">
                  <SelectValue placeholder="Choose..." />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serviceLocation">Preferred location</Label>
              <Input id="serviceLocation" value={form.serviceLocation} disabled={isActivated}
                onChange={(e) => set("serviceLocation")(e.target.value)} data-testid="input-service-location" />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="officiant">Person to lead or speak</Label>
              <Input id="officiant" value={form.officiant} disabled={isActivated}
                onChange={(e) => set("officiant")(e.target.value)} data-testid="input-officiant" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="music">Music</Label>
            <Textarea id="music" rows={2} value={form.music} disabled={isActivated}
              placeholder="Songs, hymns, or artists you'd like played"
              onChange={(e) => set("music")(e.target.value)} data-testid="input-music" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="readings">Readings</Label>
            <Textarea id="readings" rows={2} value={form.readings} disabled={isActivated}
              placeholder="Poems, scripture, or passages"
              onChange={(e) => set("readings")(e.target.value)} data-testid="input-readings" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="flowersOrDonations">Flowers or donations</Label>
            <Textarea id="flowersOrDonations" rows={2} value={form.flowersOrDonations} disabled={isActivated}
              placeholder="e.g. In lieu of flowers, donate to..."
              onChange={(e) => set("flowersOrDonations")(e.target.value)} data-testid="input-flowers" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your story</CardTitle>
          <CardDescription>Share how you would like to be remembered.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="obituaryWishes">Obituary wishes</Label>
            <Textarea id="obituaryWishes" rows={4} value={form.obituaryWishes} disabled={isActivated}
              placeholder="What should be mentioned — or left out"
              onChange={(e) => set("obituaryWishes")(e.target.value)} data-testid="input-obituary" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="additionalWishes">Anything else</Label>
            <Textarea id="additionalWishes" rows={4} value={form.additionalWishes} disabled={isActivated}
              onChange={(e) => set("additionalWishes")(e.target.value)} data-testid="input-additional-wishes" />
          </div>
        </CardContent>
      </Card>

      {!isActivated && <SectionNavigation section="wishes" onSave={() => saveMutation.mutate()}
        saveLabel="Save wishes and continue" isSaving={saveMutation.isPending} saved={advance.saved}
        isAdvancing={advance.isAdvancing} onDefer={advance.deferSection} />}
    </div>
  );
}
