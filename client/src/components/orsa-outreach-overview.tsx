import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Mail, MessageSquare, RefreshCw, Search, ShieldAlert } from "lucide-react";
import type { OutreachEmailAudience, OutreachGroup, OutreachMember, OutreachOverview } from "@shared/orsaOutreach";

const groups: { id: OutreachGroup; label: string; helper: string }[] = [
  { id: "all", label: "Everyone", helper: "All active members" },
  { id: "both_contacted", label: "Email + text", helper: "Historical attempt on both channels" },
  { id: "email_only", label: "Email only", helper: "Email attempt; no text attempt" },
  { id: "sms_only", label: "Text only", helper: "Text attempt; no email attempt" },
  { id: "no_outreach", label: "No outreach", helper: "No recorded email or text attempt" },
  { id: "emailed", label: "Email attempted", helper: "Any recorded email attempt, including uncertain or failed" },
  { id: "texted", label: "Text attempted", helper: "Any recorded text attempt, including uncertain or failed" },
  { id: "not_emailed", label: "No email attempt", helper: "No recorded attempt, regardless of eligibility or opt-out" },
  { id: "not_texted", label: "No text attempt", helper: "No recorded attempt, regardless of eligibility or opt-out" },
  { id: "email_opted_out", label: "Email opt-outs", helper: "Email channel opted out" },
  { id: "sms_opted_out", label: "Text opt-outs", helper: "SMS channel opted out" },
  { id: "needs_review", label: "Needs review", helper: "Uncertain or failed contact history" },
  { id: "opted_out", label: "Any opt-out", helper: "At least one channel is opted out" },
];

type Props = {
  active: boolean;
  onStartEmail: (audience: OutreachEmailAudience) => void;
};

function dateLabel(value: string | null) {
  if (!value) return "No attempt recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function channelLabel(state: OutreachMember["emailState"] | OutreachMember["smsState"]) {
  const labels: Record<typeof state, string> = {
    not_contacted: "Never attempted",
    submitted: "Submitted · delivery unconfirmed",
    delivered: "Delivered",
    failed: "Failed",
    needs_review: "Needs review · outcome uncertain",
    opted_out: "Opted out",
    missing_contact: "No usable contact",
    shared_contact: "Shared contact · unavailable",
  };
  return labels[state];
}

function statusTone(state: OutreachMember["emailState"] | OutreachMember["smsState"]) {
  if (state === "opted_out" || state === "failed") return "destructive" as const;
  if (state === "needs_review") return "secondary" as const;
  if (state === "delivered") return "secondary" as const;
  return "outline" as const;
}

export function OrsaOutreachOverview({ active, onStartEmail }: Props) {
  const [group, setGroup] = useState<OutreachGroup>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const query = useQuery<OutreachOverview>({
    queryKey: ["/api/admin/orsa/outreach", group, search, offset, limit],
    enabled: active,
    queryFn: async () => {
      const params = new URLSearchParams({ group, q: search.trim(), offset: String(offset), limit: String(limit) });
      return (await apiRequest("GET", `/api/admin/orsa/outreach?${params.toString()}`)).json();
    },
  });
  const data = query.data;
  const page = data?.members ?? [];
  const groupDescription = groups.find((item) => item.id === group)?.helper;

  return (
    <section className={active ? "space-y-5" : "hidden"} aria-label="Outreach history" aria-hidden={!active}>
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-semibold text-destructive">Never text an SMS opt-out.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              SMS STOP applies to texts. An email opt-out applies to email. Neither permission carries over to the other channel.
              “Submitted” means the provider accepted a request; it does not confirm delivery. Uncertain attempts are review-only.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-2xl">Outreach history</CardTitle>
              <CardDescription className="mt-1">
                One roster view for email and SMS. Counts reflect the full active roster.
                {data && <span className="block">Last checked {dateLabel(data.checkedAt)}.</span>}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Refresh outreach history">
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {data && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="Outreach group counts">
            {groups.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setGroup(item.id); setOffset(0); }}
                aria-pressed={group === item.id}
                className={`min-h-20 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${group === item.id ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/60"}`}
              >
                <span className="block text-xl font-semibold tabular-nums">{data.counts[item.id]}</span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">{item.helper}</span>
              </button>
            ))}
          </div>}
          {group === "not_emailed" && <div className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm">
              These members have no recorded email attempt, regardless of signup, contactability, or opt-out status. The email workflow preview removes registered, ineligible, and suppressed recipients, so not everyone in this history group will be sendable. Review the recipient preview before any send; this action does not send email.
            </p>
            <Button className="shrink-0" onClick={() => onStartEmail("never_emailed")}>
              <Mail className="mr-2 h-4 w-4" />Review eligible email preview
            </Button>
          </div>}

          {data?.smsPaused && <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>SMS campaign paused</AlertTitle>
            <AlertDescription>
              {data.smsRunStatus ? `Current run status: ${data.smsRunStatus.replace(/_/g, " ")}. ` : ""}
              Review the SMS campaign workflow before starting or resuming any text activity.
            </AlertDescription>
          </Alert>}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-md">
              <label htmlFor="orsa-outreach-search" className="mb-1.5 block text-sm font-medium">Find a member or contact</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="orsa-outreach-search" className="pl-9" type="search" value={search}
                  onChange={(event) => { setSearch(event.target.value); setOffset(0); }}
                  placeholder="Name, email, or phone" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {data ? `${data.total} ${group === "all" ? "active members" : "matching members"} · ${groupDescription}` : "Loading outreach records"}
            </p>
          </div>

          {query.isLoading && <div className="space-y-3" aria-label="Loading outreach history">
            {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-lg bg-muted/70" />)}
          </div>}
          {query.isError && <Alert variant="destructive">
            <AlertTitle>Outreach history is unavailable</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>Contact history could not be loaded. Do not use absence of this list as permission to contact.</span>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>}
          {data && page.length === 0 && <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-10 text-center">
            <p className="font-medium">No members in this view</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another outreach group or search term.</p>
          </div>}

          <div className="space-y-3">
            {page.map((member) => {
              return <article key={member.id} className="rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold">{member.displayName?.trim() || "Name unavailable"}</h3>
                      {member.signedUp && <Badge variant="secondary">Account active</Badge>}
                      {!member.active && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <p className="break-all"><span className="font-medium text-foreground">Email:</span> {member.email || "Not available"}</p>
                      <p className="break-words"><span className="font-medium text-foreground">Phone:</span> {member.phone || "Not available"}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className={`rounded-lg border p-3 ${member.emailState === "opted_out" ? "border-destructive/40 bg-destructive/5" : "bg-muted/20"}`}>
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" />Email</span>
                      <Badge variant={statusTone(member.emailState)} className="max-w-full whitespace-normal break-words text-left leading-snug">{channelLabel(member.emailState)}</Badge>
                    </div>
                    <p className={`mt-2 text-sm font-semibold ${member.emailAttempted ? "text-foreground" : "text-muted-foreground"}`} data-testid={`orsa-email-attempt-${member.id}`}>
                      {member.emailAttempted ? "Email attempt recorded" : "No email attempt recorded"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Last attempt: {dateLabel(member.emailLastAttemptAt)}</p>
                    {member.emailState === "opted_out" && <p className="mt-2 text-xs font-semibold text-destructive">Do not email this member.</p>}
                  </div>
                  <div className={`rounded-lg border p-3 ${member.smsState === "opted_out" ? "border-destructive/40 bg-destructive/5" : "bg-muted/20"}`}>
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" />Text message</span>
                      <Badge variant={statusTone(member.smsState)} className="max-w-full whitespace-normal break-words text-left leading-snug">{channelLabel(member.smsState)}</Badge>
                    </div>
                    <p className={`mt-2 text-sm font-semibold ${member.smsAttempted ? "text-foreground" : "text-muted-foreground"}`} data-testid={`orsa-text-attempt-${member.id}`}>
                      {member.smsAttempted ? "Text attempt recorded" : "No text attempt recorded"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Last attempt: {dateLabel(member.smsLastAttemptAt)}</p>
                    {member.smsState === "opted_out" && <p className="mt-2 text-xs font-semibold text-destructive">Do not text this number. STOP is a channel-specific opt-out.</p>}
                  </div>
                </div>
              </article>;
            })}
          </div>

          {data && <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Showing {data.total ? data.offset + 1 : 0}–{Math.min(data.offset + page.length, data.total)} of {data.total}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset <= 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={offset + limit >= data.total || query.isFetching} onClick={() => setOffset(offset + limit)}>Next</Button>
            </div>
          </div>}
          {data && <p className="text-xs text-muted-foreground">Status checked {dateLabel(data.checkedAt)}. A missing attempt is not permission if a channel is opted out or needs review. Email and SMS consent are evaluated separately.</p>}
        </CardContent>
      </Card>
    </section>
  );
}
