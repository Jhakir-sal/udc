import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck,
  FileHeart,
  FileSearch,
  HeartHandshake,
  Home,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { DemoValueEstimator } from "@/components/demo-value-estimator";

export type DemoExperience = "heartplan" | "family" | "partner";
export const DEMO_EXPERIENCE_STORAGE_KEY = "sal-demo-experience";
const experiences = [
  {
    id: "heartplan" as const,
    title: "Heart Plan planner",
    description:
      "Create a personal plan, organize wishes, add trusted contacts, and prepare messages.",
    destination: "/demo/heartplan",
    icon: FileHeart,
    accent: "bg-rose-50 text-rose-700",
  },
  {
    id: "family" as const,
    title: "Family member",
    description:
      "See how a family follows a case, reviews next steps, and finds important documents.",
    destination: "/demo/family",
    icon: Users,
    accent: "bg-amber-50 text-amber-800",
  },
  {
    id: "partner" as const,
    title: "Partner",
    description:
      "Preview how an authorized professional submits and tracks a case securely.",
    destination: "/demo/partner",
    icon: HeartHandshake,
    accent: "bg-emerald-50 text-emerald-800",
  },
];

function chooseExperience(experience: DemoExperience, destination: string, navigate: (path: string) => void) {
  trackAnalyticsEvent("demo_experience_click", { action: "select_experience", experience });
  window.sessionStorage.setItem(DEMO_EXPERIENCE_STORAGE_KEY, experience);
  navigate(destination);
}

function DemoHeader({ label, experience }: { label: string; experience: DemoExperience }) {
  const [, navigate] = useLocation();
  return (
    <div className="border-b bg-background/95">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6">
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Demo: {label}
        </Badge>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <DemoValueEstimator />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              trackAnalyticsEvent("demo_experience_click", { action: "switch_experience", experience });
              navigate("/demo");
            }}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Switch experience</span>
            <span className="sm:hidden">Switch</span>
          </Button>
          <Button size="sm" asChild>
            <a href="/" onClick={() => trackAnalyticsEvent("demo_experience_click", { action: "main_site", experience })}>Main website</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

type FamilySection =
  | "case"
  | "accounts"
  | "benefits"
  | "updates"
  | "find-accounts"
  | "estate-plans"
  | "providers";

function DemoSidebar({
  kind,
  activeFamilySection = "case",
  onFamilySelect,
}: {
  kind: "family" | "partner";
  activeFamilySection?: FamilySection;
  onFamilySelect?: (section: FamilySection) => void;
}) {
  const [notice, setNotice] = useState("");
  const familyItems: Array<[string, FamilySection, typeof Home]> = [
    ["My case", "case", Home],
    ["Accounts and services", "accounts", Users],
    ["Benefits and government", "benefits", Building2],
    ["Updates", "updates", Bell],
    ["Find accounts", "find-accounts", CreditCard],
    ["Find estate plans", "estate-plans", FileSearch],
    ["Vetted providers", "providers", HeartHandshake],
  ] as const;
  const partnerItems: Array<[string, "portal", typeof Building2]> = [
    ["Portal", "portal", Building2],
  ];
  const items = kind === "family" ? familyItems : partnerItems;
  const showNotice = (label: string) =>
    setNotice(
      `${label} is represented safely in this demonstration and does not open live records.`,
    );
  return (
    <>
      <aside className="fixed bottom-[10rem] left-0 top-[7.5rem] z-20 hidden w-72 overflow-y-auto border-r bg-sidebar px-3 py-5 text-sidebar-foreground lg:block">
        <p className="px-3 pb-3 text-xs uppercase tracking-wider text-sidebar-foreground/50">
          {kind === "family" ? "Your family’s case" : "Partner organization"}
        </p>
        <nav aria-label={`${kind} demo navigation`} className="space-y-1">
          {items.map(([title, section, Icon], index) => (
            <button
              key={title}
              type="button"
              onClick={() => {
                if (kind === "family")
                  onFamilySelect?.(section as FamilySection);
                else if (index) showNotice(title);
              }}
              data-testid={`demo-nav-${kind}-${section}`}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${
                kind === "family"
                  ? activeFamilySection === section
                  : index === 0
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{title}</span>
              <ArrowRight className="h-3.5 w-3.5 opacity-50" />
            </button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-3 right-3 rounded-md bg-sidebar-accent/40 p-3 text-xs leading-5 text-sidebar-foreground/75">
          <p className="font-medium text-sidebar-foreground">
            Demonstration workspace
          </p>
          <p className="mt-1">
            All names, documents, and actions are synthetic.
          </p>
        </div>
      </aside>
      <div className="border-b bg-muted/35 px-4 py-2 lg:hidden">
        <div className="flex gap-2 overflow-x-auto">
          {items.map(([title, section, Icon], index) => (
            <Button
              key={title}
              type="button"
              variant={
                kind === "family" && activeFamilySection === section
                  ? "secondary"
                  : index === 0
                    ? "secondary"
                    : "ghost"
              }
              size="sm"
              className="shrink-0"
              onClick={() => {
                if (kind === "family")
                  onFamilySelect?.(section as FamilySection);
                else if (index) showNotice(title);
              }}
              data-testid={`demo-nav-mobile-${kind}-${section}`}
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {title}
            </Button>
          ))}
        </div>
      </div>
      {notice && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-lg"
        >
          {notice}
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

function DemoDisclosure() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <p>
        <strong className="text-foreground">Demo workspace.</strong> Synthetic
        information only. Nothing entered here creates a case, contacts a
        provider, completes identity verification, or changes a real record.
        Selected certificate contents are not read or uploaded.
      </p>
    </div>
  );
}

export function DemoExperienceSelector({ includeHeartPlan = true }: { includeHeartPlan?: boolean }) {
  const [, navigate] = useLocation();
  const visibleExperiences = includeHeartPlan
    ? experiences
    : experiences.filter(({ id }) => id !== "heartplan");

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <Badge className="mt-7" variant="secondary">
            Company demonstration
          </Badge>
          <h1 className="mt-5 font-serif text-3xl font-semibold text-primary sm:text-5xl">
            Choose the experience you want to explore
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            Each path uses demonstration information only. You can switch
            experiences at any time.
          </p>
          <Button variant="ghost" className="mt-3 underline underline-offset-4" asChild>
            <a href="/" onClick={() => trackAnalyticsEvent("demo_experience_click", { action: "main_site" })}>Return to the main website</a>
          </Button>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
          {visibleExperiences.map(
            ({ id, title, description, destination, icon: Icon, accent }) => (
              <Card
                key={id}
                className="flex h-full flex-col border-border/80 shadow-sm"
              >
                <CardHeader>
                  <div
                    className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${accent}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="font-serif text-2xl">{title}</CardTitle>
                  <CardDescription className="min-h-20 text-sm leading-6">
                    {description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    className="w-full"
                    onClick={() => chooseExperience(id, destination, navigate)}
                    data-testid={`button-demo-${id}`}
                  >
                    Explore this experience
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ),
          )}
        </div>
        <div className="mx-auto mt-6 max-w-5xl">
          <DemoValueEstimator variant="card" />
        </div>
        <div className="mx-auto mt-8 flex max-w-2xl items-start gap-3 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            This shared demonstration does not display real customer, family, or
            partner records.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DemoHeartPlanExperience() {
  type DemoAsset = { id: number; name: string; type: string; institution: string; action: string };
  type DemoContact = { id: number; name: string; relationship: string; email: string; advisor: boolean };
  type DemoForm = {
    name: string; birthDate: string; phone: string; city: string; state: string;
    resting: string; service: string; details: string;
    messageTo: string; messageSubject: string; messageBody: string;
  };
  const initialForm: DemoForm = {
    name: "Casey Example", birthDate: "1982-04-16", phone: "555-0142",
    city: "Harborview", state: "Oregon", resting: "Cremation",
    service: "A small gathering at home", details: "Please play quiet piano music and invite only close friends.",
    messageTo: "Rowan Example", messageSubject: "A note for later",
    messageBody: "Thank you for the ordinary days: the walks, the soup, and the laughter in the kitchen. Keep making room for joy.",
  };
  const initialAssets: DemoAsset[] = [
    { id: 1, name: "Rainy Day checking", type: "Bank account", institution: "Fictional Credit Union", action: "Close or transfer as appropriate" },
    { id: 2, name: "Blue bicycle", type: "Personal property", institution: "Home storage", action: "Give to Rowan Example" },
  ];
  const initialContacts: DemoContact[] = [
    { id: 1, name: "Rowan Example", relationship: "Sibling", email: "rowan@example.invalid", advisor: false },
    { id: 2, name: "Dr. Avery Sample", relationship: "Trusted advisor", email: "avery@example.invalid", advisor: true },
  ];
  const sectionMeta = [
    ["Personal information", "A gentle starting point", "Your basics and where you call home."],
    ["My wishes", "The things that matter", "Personal guidance for the people around you."],
    ["Document vault", "A map to important papers", "A private list of records, without handling the originals."],
    ["Assets & accounts", "Make the practical visible", "A clear list of things and accounts to help later."],
    ["Trusted contacts", "Choose your circle", "The people who should know what to do."],
    ["Legacy Messages", "Words that stay close", "A private note for someone you love."],
  ] as const;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [assets, setAssets] = useState(initialAssets);
  const [contacts, setContacts] = useState(initialContacts);
  const [documentAdded, setDocumentAdded] = useState(true);
  const [messageSaved, setMessageSaved] = useState(true);
  const [newAsset, setNewAsset] = useState({ name: "", type: "Bank account", institution: "", action: "Review with family" });
  const [newContact, setNewContact] = useState({ name: "", relationship: "", email: "", advisor: false });
  const [completedSections, setCompletedSections] = useState<boolean[]>(() => sectionMeta.map(() => false));
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState("");
  const updateForm = (key: keyof DemoForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const completedCount = completedSections.filter(Boolean).length;
  const reset = () => {
    setStep(0); setForm(initialForm); setAssets(initialAssets); setContacts(initialContacts);
    setDocumentAdded(true); setMessageSaved(true); setNewAsset({ name: "", type: "Bank account", institution: "", action: "Review with family" });
    setNewContact({ name: "", relationship: "", email: "", advisor: false });
    setCompletedSections(sectionMeta.map(() => false)); setFinished(false); setNotice("");
  };
  const goTo = (next: number) => {
    setStep(Math.max(0, Math.min(5, next)));
    trackAnalyticsEvent("demo_experience_click", { action: "select_experience", experience: "heartplan" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const addAsset = () => {
    if (!newAsset.name.trim()) { setNotice("Give this sample item a name first."); return; }
    setAssets((current) => [...current, { ...newAsset, id: Date.now() }]);
    setNewAsset({ name: "", type: "Bank account", institution: "", action: "Review with family" });
    setNotice("Sample asset added to this browser-only plan.");
  };
  const addContact = () => {
    if (!newContact.name.trim() || !newContact.email.trim()) { setNotice("Add a sample name and email address first."); return; }
    setContacts((current) => [...current, { ...newContact, id: Date.now() }]);
    setNewContact({ name: "", relationship: "", email: "", advisor: false });
    setNotice("Trusted contact added to this browser-only plan.");
  };
  const saveAndContinue = () => {
    setCompletedSections((currentSections) => currentSections.map((complete, index) => index === step ? true : complete));
    if (step === 5) setFinished(true);
    else goTo(step + 1);
  };
  const field = (label: string, key: keyof DemoForm, type = "text") => (
    <div className="space-y-2"><Label htmlFor={`demo-${key}`}>{label}</Label>
      <Input id={`demo-${key}`} type={type} value={form[key]} onChange={(event) => updateForm(key, event.target.value)} autoComplete="off" /></div>
  );
  const current = sectionMeta[step];
  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_right,hsl(var(--accent)/.12),transparent_30rem)]">
      <DemoHeader label="HeartPlan preview" experience="heartplan" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6 sm:py-10">
        <DemoDisclosure />
        <section className="rounded-2xl border border-primary/15 bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div><Badge variant="secondary">Guided browser demo</Badge>
              <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-primary sm:text-5xl">Your HeartPlan</h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">A calm place to gather the practical details and personal words your people may need someday.</p>
            </div>
            <div className="rounded-xl bg-primary/5 px-5 py-4 md:min-w-48"><p className="text-3xl font-semibold text-primary">{Math.round(completedCount / 6 * 100)}%</p><p className="text-sm text-muted-foreground">{completedCount} of 6 sections ready</p></div>
          </div>
          <div className="mt-7 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${completedCount} of 6 sections complete`}><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${completedCount / 6 * 100}%` }} /></div>
        </section>
        <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
          <nav aria-label="HeartPlan sections" className="h-fit rounded-2xl border bg-card p-3 lg:sticky lg:top-24">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your journey</p>
            {sectionMeta.map(([label, detail], index) => <button key={label} type="button" onClick={() => goTo(index)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors ${step === index ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} aria-current={step === index ? "step" : undefined}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step === index ? "bg-primary-foreground/15" : completedSections[index] ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{completedSections[index] ? "✓" : index + 1}</span>
              <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className={`block truncate text-xs ${step === index ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{detail}</span></span>
            </button>)}
            <button type="button" onClick={reset} className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><RefreshCcw className="h-4 w-4" /> Restart demo</button>
          </nav>
          <section className="min-w-0">
            {finished ? <Card className="border-accent/30 bg-accent/5"><CardContent className="p-6 sm:p-10"><div className="flex flex-col items-center text-center"><div className="rounded-full bg-emerald-100 p-4 text-emerald-700"><CheckCircle2 className="h-9 w-9" /></div><h2 className="mt-5 font-serif text-3xl font-semibold text-primary">Review your sample plan</h2><p className="mt-3 max-w-xl text-muted-foreground">Everything below is fictional and exists only in this browser tab. In a real plan, these details would be yours to revisit and share on your terms.</p></div><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Personal information</p><p className="mt-1 font-medium">{form.name}</p><p className="text-sm text-muted-foreground">{form.city}, {form.state}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Wishes</p><p className="mt-1 font-medium">{form.resting}</p><p className="text-sm text-muted-foreground">{form.service}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Documents and assets</p><p className="mt-1 font-medium">{assets.length} fictional items listed</p><p className="text-sm text-muted-foreground">{documentAdded ? "Document checklist marked as located" : "No documents marked"}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">People and message</p><p className="mt-1 font-medium">{contacts.length} trusted contacts</p><p className="text-sm text-muted-foreground">{messageSaved ? "Legacy Message sealed" : "Message still in draft"}</p></div></div><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Button onClick={reset} variant="outline"><RefreshCcw className="mr-2 h-4 w-4" /> Try the demo again</Button><Button asChild><a href="/heartplan-register">Create a real HeartPlan <ArrowRight className="ml-2 h-4 w-4" /></a></Button></div></CardContent></Card> : <Card className="orsa-reveal border-primary/10 shadow-sm">
              <CardHeader className="border-b bg-primary/[.03]"><p className="text-sm font-medium text-accent">Step {step + 1} of 6</p><CardTitle className="font-serif text-3xl">{current[0]}</CardTitle><CardDescription className="text-base">{current[1]} — {current[2]}</CardDescription></CardHeader>
              <CardContent className="space-y-6 p-5 sm:p-8">
                {step === 0 && <div className="grid gap-5 sm:grid-cols-2">{field("Fictional full name", "name")}{field("Fictional date of birth", "birthDate", "date")}{field("Fictional phone", "phone")}<div className="space-y-2"><Label htmlFor="demo-city">Fictional city</Label><Input id="demo-city" value={form.city} onChange={(e) => updateForm("city", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="demo-state">State or region</Label><Input id="demo-state" value={form.state} onChange={(e) => updateForm("state", e.target.value)} /></div><div className="rounded-xl bg-secondary/30 p-4 text-sm text-muted-foreground sm:col-span-2"><strong className="text-foreground">A useful beginning.</strong> These details help distinguish your plan and make practical conversations easier.</div></div>}
                {step === 1 && <div className="space-y-5"><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="demo-resting">Resting preference</Label><select id="demo-resting" value={form.resting} onChange={(e) => updateForm("resting", e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option>Cremation</option><option>Burial</option><option>Green or natural burial</option><option>Still deciding</option></select></div><div className="space-y-2"><Label htmlFor="demo-service">Gathering or service</Label><Input id="demo-service" value={form.service} onChange={(e) => updateForm("service", e.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="demo-details">Helpful guidance</Label><textarea id="demo-details" value={form.details} onChange={(e) => updateForm("details", e.target.value)} rows={5} className="flex w-full rounded-md border bg-background px-3 py-2 text-sm" /></div><p className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-muted-foreground">There is no perfect answer here. A few honest preferences can be a kindness to the people making decisions later.</p></div>}
                {step === 2 && <div className="space-y-5"><div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-muted-foreground"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-accent" /><p><strong className="text-foreground">A safe map, not a file upload.</strong> This simulator never opens, reads, or uploads a file. It only shows how you might mark a record as located.</p></div></div><div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="font-medium">Sample family documents</p><p className="text-sm text-muted-foreground">{documentAdded ? "Will, healthcare directive, and insurance note marked as located." : "Nothing marked yet."}</p></div><Button variant={documentAdded ? "outline" : "default"} onClick={() => { setDocumentAdded(true); setNotice("No file was selected or read. A fictional document checklist was added."); }}><Upload className="mr-2 h-4 w-4" />{documentAdded ? "Marked as located" : "Simulate document action"}</Button></div><p className="text-xs text-muted-foreground">In this demo, every record is fictional and no object storage or persistence is involved.</p></div>}
                {step === 3 && <div className="space-y-5"><div className="space-y-3">{assets.map((asset) => <div key={asset.id} className="flex items-start gap-3 rounded-xl border p-4"><Home className="mt-1 h-5 w-5 shrink-0 text-accent" /><div className="min-w-0 flex-1"><p className="font-medium">{asset.name}</p><p className="text-sm text-muted-foreground">{asset.type} · {asset.institution || "Fictional institution"}</p><p className="mt-1 text-xs text-muted-foreground">Plan: {asset.action}</p></div><Button variant="ghost" size="sm" onClick={() => setAssets(assets.filter((item) => item.id !== asset.id))} aria-label={`Remove ${asset.name}`}>Remove</Button></div>)}</div><div className="rounded-xl bg-muted/40 p-4"><p className="mb-3 font-medium">Add another fictional item</p><div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Sample asset name" placeholder="Item name" value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} /><Input aria-label="Sample institution" placeholder="Institution or location" value={newAsset.institution} onChange={(e) => setNewAsset({ ...newAsset, institution: e.target.value })} /><select aria-label="Sample asset type" value={newAsset.type} onChange={(e) => setNewAsset({ ...newAsset, type: e.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm"><option>Bank account</option><option>Property</option><option>Vehicle</option><option>Subscription</option><option>Personal property</option></select><Input aria-label="Sample asset plan" placeholder="What should happen?" value={newAsset.action} onChange={(e) => setNewAsset({ ...newAsset, action: e.target.value })} /></div><Button className="mt-3" variant="outline" onClick={addAsset}>Add sample item</Button></div></div>}
                {step === 4 && <div className="space-y-5"><div className="space-y-3">{contacts.map((contact) => <div key={contact.id} className="flex items-start gap-3 rounded-xl border p-4"><Users className="mt-1 h-5 w-5 shrink-0 text-accent" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{contact.name}</p><Badge variant={contact.advisor ? "secondary" : "outline"}>{contact.advisor ? "Trusted advisor" : contact.relationship}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{contact.email}</p></div><Button variant="ghost" size="sm" onClick={() => setContacts(contacts.filter((item) => item.id !== contact.id))} aria-label={`Remove ${contact.name}`}>Remove</Button></div>)}</div><div className="rounded-xl bg-muted/40 p-4"><p className="mb-3 font-medium">Choose another fictional person</p><div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Sample contact name" placeholder="Name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} /><Input aria-label="Sample contact relationship" placeholder="Relationship" value={newContact.relationship} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })} /><Input aria-label="Sample contact email" placeholder="name@example.invalid" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newContact.advisor} onChange={(e) => setNewContact({ ...newContact, advisor: e.target.checked })} /> Give advisor-level access in this demo</label></div><Button className="mt-3" variant="outline" onClick={addContact}>Add trusted person</Button></div></div>}
                {step === 5 && <div className="space-y-5"><div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">Sealed until the plan is activated</p><p className="mt-1">This sample message stays in React state only. It is not sent, emailed, stored, or connected to a recipient.</p></div><div className="space-y-4">{field("Recipient (fictional)", "messageTo")} {field("Subject", "messageSubject")}<div className="space-y-2"><Label htmlFor="demo-messageBody">Your message</Label><textarea id="demo-messageBody" value={form.messageBody} onChange={(e) => { updateForm("messageBody", e.target.value); setMessageSaved(false); }} rows={7} className="flex w-full rounded-md border bg-background px-3 py-2 text-sm" /></div><Button variant={messageSaved ? "outline" : "default"} onClick={() => { setMessageSaved(Boolean(form.messageTo && form.messageBody)); setNotice("The fictional Legacy Message is sealed in this browser demo."); }}>{messageSaved ? "Message sealed in demo" : "Seal sample message"}</Button></div></div>}
                {notice && <p role="status" className="rounded-lg bg-secondary/40 p-3 text-sm text-foreground">{notice}</p>}
                <div className="flex flex-col-reverse justify-between gap-3 border-t pt-5 sm:flex-row"><Button variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0}>Back</Button><Button onClick={saveAndContinue}>{step === 5 ? "Review my sample plan" : "Save and continue"}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
              </CardContent>
            </Card>}
            <p className="mt-4 text-center text-xs text-muted-foreground">Edits disappear when you leave or refresh this page. Use fictional information only.</p>
          </section>
        </div>
        <Card className="border-primary/20 bg-primary/5"><CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><p className="font-medium">Ready to make this personal?</p><p className="text-sm text-muted-foreground">Create a real HeartPlan when you want your information to be securely saved.</p></div><Button asChild><a href="/heartplan-register">Create a real HeartPlan</a></Button></CardContent></Card>
      </main>
    </div>
  );
}

export function DemoLpoaExperience() {
  const [principalName, setPrincipalName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [signature, setSignature] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitPracticeForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!principalName.trim() || !relationship.trim() || !signature.trim() || !reviewed) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <DemoHeader label="Practice LPOA" experience="heartplan" />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className="text-center">
          <Badge variant="secondary">Safe demonstration</Badge>
          <h1 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">
            Practice Limited Power of Attorney
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Use this sample to see what the family authorization step looks like.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <strong>Practice only—this is not a legal document.</strong> Nothing
            entered here is saved, uploaded, sent, or connected to a real case.
            Use made-up information only.
          </p>
        </div>

        {submitted ? (
          <Card data-testid="demo-lpoa-complete">
            <CardContent className="flex flex-col items-center p-8 text-center">
              <div className="rounded-full bg-emerald-100 p-3 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="mt-4 font-serif text-2xl font-semibold">Practice form complete</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                This demonstration was completed only in your browser. No
                signature or personal information was recorded.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPrincipalName("");
                    setRelationship("");
                    setSignature("");
                    setReviewed(false);
                    setSubmitted(false);
                  }}
                >
                  Fill out another sample
                </Button>
                <Button asChild>
                  <a href="/demo/family">Return to family demo</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={submitPracticeForm}>
            <Card>
              <CardHeader>
                <CardTitle>Sample family authorization</CardTitle>
                <CardDescription>
                  All fields stay in this browser tab and are cleared when you leave.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="demo-principal-name">Your sample full name</Label>
                    <Input
                      id="demo-principal-name"
                      value={principalName}
                      onChange={(event) => setPrincipalName(event.target.value)}
                      placeholder="Jordan Sample"
                      autoComplete="off"
                      required
                      data-testid="input-demo-lpoa-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-relationship">Relationship to the person who died</Label>
                    <Input
                      id="demo-relationship"
                      value={relationship}
                      onChange={(event) => setRelationship(event.target.value)}
                      placeholder="For example: sibling"
                      autoComplete="off"
                      required
                      data-testid="input-demo-lpoa-relationship"
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-5 text-sm leading-6">
                  <h2 className="font-semibold">What this sample represents</h2>
                  <p className="mt-2 text-muted-foreground">
                    In the real process, a family representative may authorize
                    Steps After Life to contact institutions and service providers
                    for a specific case, request information, and help complete
                    approved administrative tasks. The authorization is limited
                    and does not transfer ownership of property or accounts.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="demo-signature">Type your sample signature</Label>
                  <Input
                    id="demo-signature"
                    value={signature}
                    onChange={(event) => setSignature(event.target.value)}
                    placeholder="Type the same sample name used above"
                    autoComplete="off"
                    required
                    data-testid="input-demo-lpoa-signature"
                  />
                  {signature && (
                    <p className="rounded-md bg-white p-3 font-serif text-2xl italic text-slate-800">
                      {signature}
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-3 rounded-lg border p-4">
                  <Checkbox
                    id="demo-lpoa-review"
                    checked={reviewed}
                    onCheckedChange={(checked) => setReviewed(checked === true)}
                    data-testid="checkbox-demo-lpoa-review"
                  />
                  <Label htmlFor="demo-lpoa-review" className="cursor-pointer leading-5">
                    I understand this is a safe demonstration with no legal effect
                    and that I should use made-up information only.
                  </Label>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={!principalName.trim() || !relationship.trim() || !signature.trim() || !reviewed}
                  data-testid="button-demo-lpoa-complete"
                >
                  Complete practice form
                </Button>
              </CardContent>
            </Card>
          </form>
        )}
      </main>
    </div>
  );
}

export function DemoFamilyExperience() {
  const [activeSection, setActiveSection] = useState<FamilySection>("case");
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [idStatus, setIdStatus] = useState<"ready" | "checking" | "verified">(
    "ready",
  );
  const [notice, setNotice] = useState("");
  const runId = () => {
    setIdStatus("checking");
    window.setTimeout(() => setIdStatus("verified"), 900);
  };
  const cases = [
    ["Morgan Sample", "Certificate #DEMO-2026-001", "Under review"],
    ["Taylor Sample", "Certificate #DEMO-2026-002", "Completed"],
  ];
  const completedCaseWork = [
    ["Social Security Administration", "Death notification accepted", "September 2, 2026"],
    ["Evergreen Electric", "Service transferred to the surviving household member", "September 3, 2026"],
    ["Northstar Mobile", "Cell phone account closed", "September 3, 2026"],
    ["Summit Bank Visa", "Card issuer notified and account secured", "September 4, 2026"],
    ["Harbor Rewards Mastercard", "Card issuer notified and account secured", "September 4, 2026"],
    ["Juniper Store Card", "Card issuer notified and account secured", "September 4, 2026"],
    ["Northstar 401(k)", "Retirement funds transferred to the named beneficiary", "September 5, 2026"],
    ["Evergreen Life Insurance", "Insurer notified and claim packet delivered", "September 5, 2026"],
    ["StreamBox", "Subscription cancelled", "September 5, 2026"],
    ["Daily Chronicle", "Subscription cancelled", "September 5, 2026"],
    ["MealCrate", "Subscription cancelled", "September 5, 2026"],
  ];
  const pendingCaseWork = [
    ["Social Security Administration", "Death notification accepted", "Completed"],
    ["Evergreen Electric", "Service transferred to the surviving household member", "Completed"],
    ["Northstar Mobile", "Cell phone account closed", "Completed"],
    ["Summit Bank Visa", "Card issuer notified and account secured", "Completed"],
    ["Harbor Rewards Mastercard", "Card issuer notified and account secured", "Completed"],
    ["Juniper Store Card", "Waiting for the issuer to confirm closure", "Pending"],
    ["Northstar 401(k)", "Beneficiary transfer documents under review", "Pending"],
    ["Evergreen Life Insurance", "Claim notification awaiting confirmation", "Pending"],
    ["StreamBox", "Subscription cancelled", "Completed"],
    ["Daily Chronicle", "Cancellation request submitted", "Pending"],
    ["MealCrate", "Cancellation request submitted", "Pending"],
  ];
  return (
    <div className="min-h-[100dvh] bg-background">
      <DemoHeader label="Family member" experience="family" />
      <DemoSidebar
        kind="family"
        activeFamilySection={activeSection}
        onFamilySelect={setActiveSection}
      />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:ml-72 lg:px-8">
        <div data-testid="demo-family-greeting">
          <p className="text-sm text-muted-foreground">Your family’s case</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
            Welcome back, Demo Family
          </h1>
          <p className="mt-1 text-muted-foreground">
            Here is the latest on your case.
          </p>
        </div>
        <DemoDisclosure />
        {activeSection !== "case" ? (
          <FamilySyntheticView section={activeSection} />
        ) : (
          <>
            <Card data-testid="demo-family-identity">
              <CardHeader>
                <CardTitle>Identity & authorization</CardTitle>
                <CardDescription>
                  Your verification status helps us protect your family’s
                  information.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <IdentityDemoStatus status={idStatus} onRun={runId} />
                <div className="rounded-xl border p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                        <FileHeart className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">
                          Limited Power of Attorney
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Signed and available to the concierge team for this
                          sample case.
                        </p>
                        <a
                          href="/demo/lpoa"
                          className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                          data-testid="link-demo-lpoa"
                        >
                          Try the safe sample LPOA
                        </a>
                      </div>
                    </div>
                    <Badge variant="secondary">Completed</Badge>
                  </div>
                  <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
                    <p>
                      <span className="text-muted-foreground">Signed:</span>{" "}
                      August 28, 2026
                    </p>
                    <p className="mt-1">
                      <span className="text-muted-foreground">
                        Valid through:
                      </span>{" "}
                      August 28, 2027
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="demo-family-cases">
              <CardHeader>
                <CardTitle>Cases</CardTitle>
                <CardDescription>
                  Documents and status for your loved ones.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cases.map(([name, certificate, status]) => (
                  <div
                    key={certificate}
                    className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <FileCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-sm text-muted-foreground">
                          {certificate}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          status === "Completed" ? "secondary" : "outline"
                        }
                      >
                        {status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedCase(certificate);
                        }}
                        data-testid={status === "Completed" ? "button-view-completed-demo-case" : "button-view-pending-demo-case"}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            {selectedCase === "Certificate #DEMO-2026-002" && (
              <Card data-testid="demo-completed-work-case" className="border-emerald-200">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        Taylor Sample — completed work case
                      </CardTitle>
                      <CardDescription className="mt-2">
                        Certificate #DEMO-2026-002 · Synthetic demonstration records only
                      </CardDescription>
                    </div>
                    <Badge className="w-fit bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      11 of 11 completed
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                    All requested notifications, transfers, closures, and
                    cancellations for this fake case are complete. No real
                    company was contacted.
                  </div>
                  <div className="grid gap-3">
                    {completedCaseWork.map(([provider, result, date]) => (
                      <div
                        key={provider}
                        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-full bg-emerald-100 p-1.5 text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">{provider}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{result}</p>
                          </div>
                        </div>
                        <div className="pl-9 text-sm sm:pl-0 sm:text-right">
                          <Badge variant="secondary">Completed</Badge>
                          <p className="mt-1 text-xs text-muted-foreground">{date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedCase(null)}
                    data-testid="button-close-completed-demo-case"
                  >
                    Close case details
                  </Button>
                </CardContent>
              </Card>
            )}
            {selectedCase === "Certificate #DEMO-2026-001" && (
              <Card data-testid="demo-pending-work-case">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>Morgan Sample — work case</CardTitle>
                      <CardDescription className="mt-2">
                        Certificate #DEMO-2026-001 · Synthetic demonstration records only
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="w-fit">
                      6 of 11 completed
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-[54.55%] rounded-full bg-primary" />
                  </div>
                  <div className="grid gap-3">
                    {pendingCaseWork.map(([provider, result, itemStatus]) => {
                      const isComplete = itemStatus === "Completed";
                      return (
                        <div
                          key={provider}
                          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 rounded-full p-1.5 ${
                              isComplete
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {isComplete ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                <Loader2 className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{provider}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{result}</p>
                            </div>
                          </div>
                          <Badge variant={isComplete ? "secondary" : "outline"}>
                            {itemStatus}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedCase(null)}
                    data-testid="button-close-pending-demo-case"
                  >
                    Close case details
                  </Button>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              <Card data-testid="demo-family-accounts">
                <CardHeader>
                  <CardTitle>Accounts and services</CardTitle>
                  <CardDescription>
                    Track progress across the accounts connected to this case.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">6 of 11</p>
                  <p className="text-sm text-muted-foreground">
                    accounts completed
                  </p>
                  <div className="mt-4 h-2 rounded-full bg-muted">
                    <div className="h-2 w-[54.55%] rounded-full bg-primary" />
                  </div>
                  <Button
                    className="mt-5 w-full"
                    variant="outline"
                    onClick={() =>
                      setNotice(
                        "Accounts and services stay inside the safe demo.",
                      )
                    }
                  >
                    View accounts and services
                  </Button>
                </CardContent>
              </Card>
              <Card data-testid="demo-family-activity">
                <CardHeader>
                  <CardTitle>Recent updates</CardTitle>
                  <CardDescription>
                    Latest activity on your case.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ActivityRow
                    icon={CheckCircle2}
                    text="Identity and authorization confirmed"
                    date="Aug 28, 2026"
                  />
                  <ActivityRow
                    icon={Bell}
                    text="Certificate is under concierge review"
                    date="Aug 27, 2026"
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}
        {notice && activeSection === "case" && (
          <p role="status" className="rounded-md border bg-card p-3 text-sm">
            {notice}
          </p>
        )}
      </main>
    </div>
  );
}

function IdentityDemoStatus({
  status,
  onRun,
}: {
  status: "ready" | "checking" | "verified";
  onRun: () => void;
}) {
  return (
    <div className="rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-full p-2 ${status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"}`}
          >
            {status === "checking" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="font-semibold">Government ID</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === "verified"
                ? "Test ID verified successfully."
                : status === "checking"
                  ? "Running a safe sample verification…"
                  : "Run the sample check to preview ID verification."}
            </p>
          </div>
        </div>
        <Badge variant={status === "verified" ? "secondary" : "outline"}>
          {status === "verified"
            ? "Verified"
            : status === "checking"
              ? "Checking"
              : "Not verified"}
        </Badge>
      </div>
      <Button
        className="mt-4 w-full"
        variant={status === "verified" ? "outline" : "default"}
        onClick={onRun}
        disabled={status === "checking"}
        data-testid="button-demo-test-id"
      >
        {status === "checking"
          ? "Checking sample ID"
          : status === "verified"
            ? "Run test again"
            : "Run test ID check"}
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Demo only — no real ID or personal data is collected.
      </p>
    </div>
  );
}

function ActivityRow({
  icon: Icon,
  text,
  date,
}: {
  icon: typeof CheckCircle2;
  text: string;
  date: string;
}) {
  return (
    <div className="flex gap-3 border-b pb-3 last:border-0">
      <Icon className="mt-0.5 h-5 w-5 text-primary" />
      <div>
        <p className="text-sm">{text}</p>
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
    </div>
  );
}

function FamilySyntheticView({
  section,
}: {
  section: Exclude<FamilySection, "case">;
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("all");
  const views = {
    accounts: {
      title: "Accounts and services",
      description: "Manage the accounts connected to your loved one’s case.",
      rows: [
        "First Community Bank — Pending action",
        "Evergreen Utilities — Closed",
        "Harbor Mobile — In progress",
      ],
    },
    benefits: {
      title: "Benefits and government",
      description: "Track benefit and government notifications for this case.",
      rows: [
        "Social Security Administration — Ready to notify",
        "Veterans benefits — Review eligibility",
        "County recorder — Information received",
      ],
    },
    updates: {
      title: "Updates",
      description: "Recent activity and important case notifications.",
      rows: [
        "Certificate review is in progress",
        "Identity and authorization confirmed",
        "One account needs family attention",
      ],
    },
    "find-accounts": {
      title: "Find accounts",
      description:
        "Search for financial accounts connected to this synthetic case.",
      rows: [
        "Account discovery is available after authorization",
        "Search results are simulated in this demo",
      ],
    },
    "estate-plans": {
      title: "Find estate plans",
      description:
        "Search for estate planning documents for this synthetic case.",
      rows: [
        "No estate plan search has been started",
        "This demo does not query any registry",
      ],
    },
    providers: {
      title: "Vetted providers",
      description: "Browse providers selected for the family support network.",
      rows: [
        "Estate settlement support — Available",
        "Home transition support — Available",
        "Grief counseling — Available",
      ],
    },
  }[section];
  const visibleRows =
    filter === "all"
      ? views.rows
      : views.rows.filter((row) => row.toLowerCase().includes(filter));

  return (
    <section data-testid={`demo-family-view-${section}`} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{views.title}</CardTitle>
          <CardDescription>{views.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(section === "accounts" ||
            section === "benefits" ||
            section === "updates") && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
              <p className="self-center text-sm text-muted-foreground">
                Synthetic records only
              </p>
            </div>
          )}
          {visibleRows.length ? (
            visibleRows.map((row) => (
              <button
                key={row}
                type="button"
                onClick={() => setSelected(row)}
                className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-4 text-left hover:bg-muted"
              >
                <span className="text-sm font-medium">{row}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No synthetic records match this filter.
            </div>
          )}
        </CardContent>
      </Card>
      {selected !== "all" && (
        <Card>
          <CardContent className="p-5">
            <p className="font-medium">{selected}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This is a local demonstration detail. No search, account, benefit,
              or provider record was accessed.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => setSelected("all")}
            >
              Close detail
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

type PartnerForm = {
  name: string;
  dob: string;
  dod: string;
  state: string;
  county: string;
  authority: string;
  place: string;
  cause: string;
};
const blankPartnerForm: PartnerForm = {
  name: "",
  dob: "",
  dod: "",
  state: "",
  county: "",
  authority: "",
  place: "",
  cause: "",
};
const demoSampleForm: PartnerForm = {
  name: "Morgan Sample",
  dob: "04/12/1965",
  dod: "08/21/2026",
  state: "MI",
  county: "DMC",
  authority: "Demo County Clerk",
  place: "Demo General Hospital",
  cause: "Synthetic example only",
};
const states = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

export function DemoPartnerExperience() {
  const [form, setForm] = useState(blankPartnerForm);
  const [fileName, setFileName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(false);
  const [copied, setCopied] = useState(false);
  const update = (key: keyof PartnerForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const downloadSampleCertificate = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#fffdf7";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#29483b";
    context.lineWidth = 10;
    context.strokeRect(35, 35, canvas.width - 70, canvas.height - 70);
    context.fillStyle = "#29483b";
    context.textAlign = "center";
    context.font = "bold 38px serif";
    context.fillText("DEMONSTRATION DEATH CERTIFICATE", 600, 120);
    context.fillStyle = "#a33a2b";
    context.font = "bold 26px sans-serif";
    context.fillText("SYNTHETIC SAMPLE — NOT A LEGAL DOCUMENT", 600, 170);
    context.textAlign = "left";
    context.fillStyle = "#17231e";
    context.font = "25px sans-serif";
    [
      ["Decedent Name", "Morgan Sample"],
      ["Date of Birth", "04/12/1965"],
      ["Date of Death", "08/21/2026"],
      ["Certificate Number", "DEMO-2026-001"],
      ["Issuing Authority", "Demo County Clerk"],
      ["State", "MI"],
      ["County", "DMC"],
      ["Place of Death", "Demo General Hospital"],
    ].forEach(([label, value], index) => {
      const y = 260 + index * 90;
      context.font = "bold 22px sans-serif";
      context.fillText(`${label}:`, 100, y);
      context.font = "24px sans-serif";
      context.fillText(value, 410, y);
    });
    context.fillStyle = "#a33a2b";
    context.textAlign = "center";
    context.font = "bold 24px sans-serif";
    context.fillText("FOR STEPS AFTER LIFE DEMONSTRATION USE ONLY", 600, 1360);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sal-synthetic-death-certificate.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  const scan = (file?: File) => {
    if (!file) return;
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      setError("Upload a PDF, JPEG, PNG, or WebP synthetic certificate.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The demo document must be 10 MB or smaller.");
      return;
    }
    setFileName(file.name);
    setError("");
    setScanning(true);
    window.setTimeout(() => {
      setForm(demoSampleForm);
      setScanning(false);
    }, 800);
  };
  const canSubmit = Boolean(
    form.name &&
    form.dob &&
    form.dod &&
    form.state &&
    form.county &&
    form.authority,
  );
  const submit = () => {
    if (!canSubmit) return;
    setResult(true);
  };
  const field = (
    key: keyof PartnerForm,
    label: string,
    placeholder: string,
    optional = false,
  ) => (
    <div>
      <Label htmlFor={`demo-partner-${key}`}>
        {label}
        {optional ? " (Optional)" : ""}
      </Label>
      <Input
        id={`demo-partner-${key}`}
        className="mt-1.5"
        value={form[key]}
        onChange={(event) => update(key, event.target.value)}
        placeholder={placeholder}
        data-testid={`input-demo-partner-${key}`}
      />
    </div>
  );
  return (
    <div className="min-h-[100dvh] bg-background">
      <DemoHeader label="Partner" experience="partner" />
      <DemoSidebar kind="partner" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:ml-72 lg:px-8">
        <div>
          <p className="text-sm text-muted-foreground">Authorized organization</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
            Partner Portal
          </h1>
          <p className="mt-1 text-muted-foreground">
            Submit and verify death certificates on behalf of an authorized partner organization.
          </p>
        </div>
        <DemoDisclosure />
        <CertificateUploader
          fileName={fileName}
          scanning={scanning}
          error={error}
          onScan={scan}
          onDownload={downloadSampleCertificate}
          onLoadSample={() => setForm(demoSampleForm)}
        />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <Card data-testid="demo-partner-form">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Create Death Certificate
              </CardTitle>
              <CardDescription>
                Enter the deceased's information to generate a synthetic result.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {field("name", "Full Legal Name of Deceased", "Morgan Sample")}
              <div className="grid gap-4 sm:grid-cols-2">
                {field("dob", "Date of Birth", "MM/DD/YYYY")}
                {field("dod", "Date of Death", "MM/DD/YYYY")}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="demo-partner-state">State</Label>
                  <Select
                    value={form.state}
                    onValueChange={(value) => update("state", value)}
                  >
                    <SelectTrigger
                      id="demo-partner-state"
                      className="mt-1.5"
                      data-testid="select-demo-partner-state"
                    >
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {field("county", "County Code", "DMC")}
              </div>
              {field("authority", "Issuing Authority", "Demo County Clerk")}
              {field("place", "Place of Death", "City, County, State", true)}
              {field("cause", "Cause of Death", "Synthetic example only", true)}
              <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                Demo only: Create Blockchain Certificate below creates a local
                synthetic result and never calls the real certificate API.
              </p>
              <Button
                className="w-full"
                onClick={submit}
                disabled={!canSubmit}
                data-testid="button-demo-create-certificate"
              >
                Create Blockchain Certificate
              </Button>
            </CardContent>
          </Card>
          <PartnerResults
            result={result}
            copied={copied}
            setCopied={setCopied}
          />
        </div>
      </main>
    </div>
  );
}

function CertificateUploader({
  fileName,
  scanning,
  error,
  onScan,
  onDownload,
  onLoadSample,
}: {
  fileName: string;
  scanning: boolean;
  error: string;
  onScan: (file?: File) => void;
  onDownload: () => void;
  onLoadSample: () => void;
}) {
  return (
    <Card data-testid="demo-partner-uploader">
      <CardHeader>
        <CardTitle>Upload the death certificate</CardTitle>
        <CardDescription>
          Start with a certificate file. This local simulation never reads or
          uploads its contents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label htmlFor="demo-partner-certificate">
              Certificate document
            </Label>
            <p className="text-xs text-muted-foreground">
              {fileName ||
                "PDF, JPEG, PNG, or WebP up to 10 MB. Contents stay on this device."}
            </p>
          </div>
          <label className="flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {scanning ? "Reading certificate…" : "Choose certificate"}
            <input
              id="demo-partner-certificate"
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              disabled={scanning}
              onChange={(event) => {
                onScan(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
              data-testid="input-demo-partner-certificate"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onDownload}>
            <FileCheck className="mr-2 h-4 w-4" />
            Download sample certificate
          </Button>
          <Button type="button" variant="ghost" onClick={onLoadSample}>
            Load synthetic sample
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 text-sm text-destructive"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PartnerResults({
  result,
  copied,
  setCopied,
}: {
  result: boolean;
  copied: boolean;
  setCopied: (value: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      {result && (
        <Card
          data-testid="demo-partner-success"
          className="border-emerald-200 bg-emerald-50/50"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              Certificate Created Successfully
            </CardTitle>
            <CardDescription>
              Explicitly synthetic result. No blockchain or registry record was
              created.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">
                Synthetic Blockchain ID
              </Label>
              <div className="mt-1 flex gap-2">
                <code className="flex-1 rounded border bg-background p-2 text-sm">
                  demo-chain-2026-001
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard?.writeText("demo-chain-2026-001");
                    setCopied(true);
                  }}
                  aria-label="Copy synthetic blockchain ID"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="text-xs">Copy</span>
                  )}
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Certificate Number
              </Label>
              <p className="font-mono text-sm">SAL-DEMO-1104</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Synthetic Blockchain Hash
              </Label>
              <p className="break-all font-mono text-xs text-muted-foreground">
                demo-hash-8f3c1a7b-2026
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <Card data-testid="demo-partner-api">
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
          <CardDescription>
            Use the API to integrate with authorized systems.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="text-muted-foreground">Endpoint</span>
            <code className="mt-1 block rounded bg-muted p-2">
              POST /api/blockchain/create
            </code>
          </p>
          <p>
            <span className="text-muted-foreground">Authentication</span>
            <code className="mt-1 block rounded bg-muted p-2">
              X-API-Key: your_api_key
            </code>
          </p>
          <p>
            <span className="text-muted-foreground">Required fields:</span>{" "}
            deceasedName, dateOfDeath, dateOfBirth, issuingAuthority, stateCode,
            countyCode
          </p>
          <p>
            <span className="text-muted-foreground">Optional fields:</span>{" "}
            placeOfDeath, causeOfDeath
          </p>
          <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            Demo only: this workspace does not call this endpoint.
          </p>
        </CardContent>
      </Card>
      <Card data-testid="demo-partner-verify">
        <CardHeader>
          <CardTitle>Verify Certificate</CardTitle>
          <CardDescription>
            Check the authenticity of a certificate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Verification endpoint</p>
          <code className="mt-1 block rounded bg-muted p-2 text-sm">
            GET /api/blockchain/verify/:identifier
          </code>
          <p className="mt-3 text-sm text-muted-foreground">
            Verification is disabled in this synthetic workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
