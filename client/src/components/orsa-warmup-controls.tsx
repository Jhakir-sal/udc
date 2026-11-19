import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ORSA_WARMUP_DEFAULTS,
  ORSA_WARMUP_WEEK_ONE_PRESET,
  ORSA_WARMUP_WEEK_TWO_PRESET,
  ORSA_WARMUP_EXPANDED_PRESET,
  ORSA_FULL_LIST_PRESET,
  ORSA_FAST_OUTREACH_PRESET,
} from "@shared/orsaWarmupDefaults";
import { Activity, Loader2, Pause, ShieldCheck } from "lucide-react";

type WarmupSettings = {
  dailyReviewRequired?: boolean;
  enabled: boolean;
  paused: boolean;
  hourlyLimit: number;
  dailyLimit: number;
  minIntervalSeconds: number;
  providerHourlyLimit: number;
  reservedHourly: number;
  pauseReason: string | null;
};

type WarmupStatus = {
  settings: WarmupSettings;
  usage: { hourly: number; daily: number; otherHourly: number; otherDaily: number };
  remaining: { hourly: number; daily: number };
  nextAllowedAt: string | null;
};

type WarmupDraft = Omit<WarmupSettings, "pauseReason" | "dailyReviewRequired">;

const DEFAULTS: WarmupDraft = ORSA_WARMUP_DEFAULTS;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function asDraft(settings: WarmupSettings): WarmupDraft {
  return {
    enabled: settings.enabled,
    paused: settings.paused,
    hourlyLimit: settings.hourlyLimit,
    dailyLimit: settings.dailyLimit,
    minIntervalSeconds: settings.minIntervalSeconds,
    providerHourlyLimit: settings.providerHourlyLimit,
    reservedHourly: settings.reservedHourly,
  };
}

export function OrsaWarmupControls() {
  const [draft, setDraft] = useState<WarmupDraft | null>(null);
  const [limitsAcknowledged, setLimitsAcknowledged] = useState(false);
  const [statsReviewed, setStatsReviewed] = useState(false);
  const [presetLoaded, setPresetLoaded] = useState<"week-one" | "week-two" | "expanded" | "full-list" | "fast" | null>(null);
  const status = useQuery<WarmupStatus>({ queryKey: ["/api/admin/orsa/email-warmup"], refetchInterval: 15_000 });

  const invalidateOutreach = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-warmup"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/email-campaign"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orsa/account-invitations"] }),
    ]);
  };

  const save = useMutation({
    mutationFn: async (values: WarmupDraft) => {
      if (!limitsAcknowledged || !statsReviewed) throw new Error("Review and acknowledge both delivery checks before saving.");
      await apiRequest("PUT", "/api/admin/orsa/email-warmup", {
        ...values,
        acknowledgeProviderLimits: true,
        reviewedDeliveryStats: true,
      });
    },
    onSuccess: async () => {
      setDraft(null);
      setLimitsAcknowledged(false);
      setStatsReviewed(false);
      setPresetLoaded(null);
      await invalidateOutreach();
    },
  });
  const pause = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/orsa/email-warmup/pause", {})).json(),
    onSuccess: async () => {
      setDraft(null);
      setLimitsAcknowledged(false);
      setStatsReviewed(false);
      setPresetLoaded(null);
      await invalidateOutreach();
    },
  });

  const settings = status.data?.settings;
  const value = draft ?? (settings ? asDraft(settings) : DEFAULTS);
  const update = (field: keyof WarmupDraft, next: boolean | number) => {
    setDraft((current) => ({ ...(current ?? (settings ? asDraft(settings) : DEFAULTS)), [field]: next }));
  };
  const loadPreset = (
    preset: typeof ORSA_WARMUP_WEEK_ONE_PRESET | typeof ORSA_WARMUP_WEEK_TWO_PRESET | typeof ORSA_WARMUP_EXPANDED_PRESET | typeof ORSA_FULL_LIST_PRESET | typeof ORSA_FAST_OUTREACH_PRESET,
    stage: "week-one" | "week-two" | "expanded" | "full-list" | "fast",
  ) => {
    setDraft((current) => ({
      ...(current ?? (settings ? asDraft(settings) : DEFAULTS)),
      ...preset,
    }));
    setLimitsAcknowledged(false);
    setStatsReviewed(false);
    setPresetLoaded(stage);
  };
  const invalidLimits =
    !Number.isInteger(value.hourlyLimit) || value.hourlyLimit < 1 || value.hourlyLimit > 1000 ||
    !Number.isInteger(value.dailyLimit) || value.dailyLimit < 1 || value.dailyLimit > 10000 ||
    !Number.isInteger(value.minIntervalSeconds) || value.minIntervalSeconds < 4 || value.minIntervalSeconds > 86400 ||
    !Number.isInteger(value.providerHourlyLimit) || value.providerHourlyLimit < 1 || value.providerHourlyLimit > 1000 ||
    !Number.isInteger(value.reservedHourly) || value.reservedHourly < 0 || value.reservedHourly > 999 ||
    value.hourlyLimit + value.reservedHourly > value.providerHourlyLimit;
  const dirty = Boolean(settings && JSON.stringify(value) !== JSON.stringify(asDraft(settings)));
  const readyToSave = limitsAcknowledged && statsReviewed && !invalidLimits &&
    (dirty || Boolean(settings?.dailyReviewRequired)) && !save.isPending;
  const capacity = settings
    ? Math.max(0, settings.providerHourlyLimit - settings.reservedHourly)
    : Math.max(0, value.providerHourlyLimit - value.reservedHourly);
  const nextAllowed = status.data?.nextAllowedAt ? new Date(status.data.nextAllowedAt).toLocaleTimeString() : null;

  return (
    <Card data-testid="card-orsa-warmup-controls" className="overflow-hidden border-teal-900/15">
      <CardHeader className="bg-teal-50/70 dark:bg-teal-950/20">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-teal-800 dark:text-teal-300" />
          Dedicated IP warm-up & link recovery
        </CardTitle>
        <CardDescription>
          Reviewed ORSA-only sending limits for the dedicated IP. Changing these settings never sends email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {status.isLoading && <div className="animate-pulse space-y-2 py-2" aria-label="Loading warm-up status" data-testid="orsa-warmup-loading">
          <div className="h-4 w-2/3 rounded bg-muted" /><div className="h-4 w-1/2 rounded bg-muted" />
        </div>}
        {status.isError && <Alert variant="destructive" data-testid="orsa-warmup-load-error">
          <AlertTitle>Warm-up settings unavailable</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{messageOf(status.error)}</p>
            <Button size="sm" variant="outline" onClick={() => void status.refetch()}>Retry loading</Button>
          </AlertDescription>
        </Alert>}
        {status.data && <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="orsa-warmup-usage">
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">ORSA this hour</p>
              <p className="mt-1 font-mono text-xl">{status.data.usage.hourly}<span className="text-sm text-muted-foreground"> / {settings?.hourlyLimit}</span></p>
              <p className="text-xs text-muted-foreground">{status.data.remaining.hourly} ORSA slots remain</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">ORSA last 24 hours</p>
              <p className="mt-1 font-mono text-xl">{status.data.usage.daily}<span className="text-sm text-muted-foreground"> / {settings?.dailyLimit}</span></p>
              <p className="text-xs text-muted-foreground">{status.data.remaining.daily} ORSA slots remain</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Other provider traffic</p>
              <p className="mt-1 font-mono text-xl">{status.data.usage.otherHourly}<span className="text-sm text-muted-foreground"> / hr</span></p>
              <p className="text-xs text-muted-foreground">{status.data.usage.otherDaily} today · counted, not delayed</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Provider headroom</p>
              <p className="mt-1 font-mono text-xl">{capacity}<span className="text-sm text-muted-foreground"> / hr</span></p>
              <p className="text-xs text-muted-foreground">after reserved traffic</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="font-medium">
                {settings?.paused ? "Outreach paused" : settings?.dailyReviewRequired ? "Daily delivery review required" : settings?.enabled ? "Warm-up controls active" : "Warm-up controls disabled"}
              </p>
              <p className="text-sm text-muted-foreground">
                {settings?.pauseReason || (settings?.dailyReviewRequired ? "Review delivery results and save the acknowledged controls before continuing. Tomorrow's capacity does not resume sending automatically." : nextAllowed ? `Next ORSA send window: ${nextAllowed}` : "No scheduled spacing wait.")}
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => pause.mutate()}
              disabled={pause.isPending}
              data-testid="button-orsa-global-pause"
            >
              {pause.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
              Pause all ORSA outreach
            </Button>
          </div>
          {pause.isError && <Alert variant="destructive" data-testid="orsa-warmup-pause-error">
            <AlertTitle>Global pause was not confirmed</AlertTitle><AlertDescription>{messageOf(pause.error)}</AlertDescription>
          </Alert>}
          <p className="text-xs text-muted-foreground">Usage conservatively counts reserved ORSA slots, including unused or uncertain attempts, plus other app email recipients. Editing limits does not reset usage. Traffic from other SendGrid tools is not visible here; include it when checking the provider's approved IP limit.</p>
          {settings?.paused && <p className="rounded-md border border-amber-700/20 bg-amber-50/70 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            The server reports outreach paused. Use this global control to stop active ORSA runs across tabs; local countdown cancellation alone does not stop another tab.
          </p>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-teal-900/15 bg-teal-50/40 p-3 dark:bg-teal-950/10">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Expanded outreach: 1,000/day, 120/hour, and 30-second spacing—about 8 hours 20 minutes for a full day’s budget. Its example provider limit is 130/hour with 10 reserved for other email. Confirm your actual SendGrid allowance before saving. Earlier Week 1 (250/day) and Week 2 (500/day) options remain available; no stage increases automatically.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => loadPreset(ORSA_FAST_OUTREACH_PRESET, "fast")} data-testid="button-orsa-warmup-load-fast">
                Load fast outreach · 900/hour
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => loadPreset(ORSA_FULL_LIST_PRESET, "full-list")} data-testid="button-orsa-warmup-load-full-list">
                Load full list · 5 seconds
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => loadPreset(ORSA_WARMUP_EXPANDED_PRESET, "expanded")} data-testid="button-orsa-warmup-load-expanded">
                Load 1,000/day · 30 seconds
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => loadPreset(ORSA_WARMUP_WEEK_ONE_PRESET, "week-one")} data-testid="button-orsa-warmup-load-week-one">
                Load Week 1: 250/day
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => loadPreset(ORSA_WARMUP_WEEK_TWO_PRESET, "week-two")} data-testid="button-orsa-warmup-load-week-two">
                Load Week 2: 500/day
              </Button>
            </div>
          </div>
          <div className="rounded-md border border-teal-900/15 bg-background p-3 text-sm">
            <p className="font-semibold">Fast preset: 4-second spacing, up to 900 ORSA attempts/hour</p>
            <p className="mt-1 text-muted-foreground">
              At the full hourly rate, 6,000 addresses take about 6 hours 40 minutes, before exclusions, pauses, or other delays. This is an estimate, not a delivery promise.
              {" "}Current saved rate: {settings ? `${settings.hourlyLimit}/hour with ${settings.minIntervalSeconds}-second spacing` : "loading"}.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Full-list option: 720/hour, 5-second spacing, and a 10,000 rolling-24-hour ceiling. About 9¼ hours for 6,664 addresses before exclusions or delays, not a guarantee of finishing today. The example provider ceiling is 730/hour with 10 reserved for other email; verify your actual allowance. In Email Outreach, choose “Review all eligible” to build a full recipient preview within the saved remaining budget. Only eligible recipients of the selected message are included—not every roster row. Keep this page open and your device awake throughout sending; closing the tab stops further batch requests.
          </p>
          {presetLoaded && <p role="status" className="text-sm font-medium text-teal-900 dark:text-teal-200" data-testid="orsa-warmup-preset-unsaved-status">
             {presetLoaded === "fast" ? "Fast outreach (900/hour, 4-second spacing)" : presetLoaded === "full-list" ? "Full-list outreach (720/hour, 5-second spacing)" : presetLoaded === "expanded" ? "Expanded outreach (1,000/day, 30-second spacing)" : presetLoaded === "week-one" ? "Week 1 (days 1–7)" : "Week 2 (days 8–14)"} loaded as an unsaved draft. Loading only changes draft limits; saved settings and usage remain unchanged, and no email is sent. Every increase requires reviewing provider limits and delivery results, saving the controls, and separately confirming a recipient group.
          </p>}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <input type="checkbox" checked={value.enabled} onChange={(event) => update("enabled", event.target.checked)} data-testid="checkbox-orsa-warmup-enabled" />
              <span><strong>Use warm-up limits</strong><span className="block text-muted-foreground">Only governs ORSA sends.</span></span>
            </label>
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <input type="checkbox" checked={value.paused} onChange={(event) => update("paused", event.target.checked)} data-testid="checkbox-orsa-warmup-paused" />
              <span><strong>Keep ORSA outreach paused</strong><span className="block text-muted-foreground">Unpausing changes settings only.</span></span>
            </label>
            {([
              ["hourlyLimit", "ORSA hourly limit", 1, 1000],
              ["dailyLimit", "ORSA daily limit", 1, 10000],
              ["minIntervalSeconds", "Minimum interval (seconds)", 4, 86400],
              ["providerHourlyLimit", "Provider hourly limit", 1, 1000],
              ["reservedHourly", "Reserve for other provider traffic", 0, 999],
            ] as const).map(([field, label, min, max]) => (
              <label key={field} className="space-y-1 text-sm">
                <span className="font-medium">{label}</span>
                <Input
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  value={value[field]}
                  onChange={(event) => update(field, Math.trunc(Number(event.target.value)))}
                  data-testid={`input-orsa-warmup-${field}`}
                />
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Provider capacity after reservation: {capacity}/hour. {invalidLimits && <span className="font-medium text-destructive">Review field ranges and ensure ORSA hourly limit plus reserved capacity does not exceed the provider hourly limit.</span>}
            {" "}Essential and non-ORSA provider traffic is counted in usage, but is not delayed by these controls. Traffic from external applications is not counted; the SendGrid dashboard remains the source of truth.
          </p>

          <div className="space-y-3 rounded-md border border-teal-900/15 bg-teal-50/40 p-4 text-sm dark:bg-teal-950/10">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Before changing live limits</p>
            <p>Before saving each stage, review SendGrid’s actual warm-up limits and delivery results, including delivery, bounce, block, and complaint statistics. Restoring the account does not reset the IP’s age. Week 2 is a manual choice only after first-week review; there is no automatic increase. Adjust deliberately to match verified provider limits and results.</p>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={limitsAcknowledged} onChange={(event) => setLimitsAcknowledged(event.target.checked)} className="mt-1" data-testid="checkbox-orsa-warmup-provider-ack" />
              <span>I verified the provider’s actual warm-up stage and limits, including the reserved capacity above.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={statsReviewed} onChange={(event) => setStatsReviewed(event.target.checked)} className="mt-1" data-testid="checkbox-orsa-warmup-stats-reviewed" />
              <span>I reviewed SendGrid delivery, bounce, block, and complaint statistics before changing ORSA warm-up settings.</span>
            </label>
            <Button
              onClick={() => save.mutate(value)}
              disabled={!readyToSave}
              data-testid="button-orsa-warmup-save"
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save warm-up settings
            </Button>
            {save.isSuccess && <p role="status" className="text-emerald-800 dark:text-emerald-300" data-testid="orsa-warmup-save-success">Settings saved. No email was sent.</p>}
            {save.isError && <p role="alert" className="text-destructive" data-testid="orsa-warmup-save-error">{messageOf(save.error)}</p>}
          </div>
          <p className="text-xs text-muted-foreground">Preview remains available while warm-up is disabled. Settings, page load, and an existing preview never start or resume sends.</p>
        </>}
      </CardContent>
    </Card>
  );
}
