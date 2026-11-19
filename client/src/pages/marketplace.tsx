import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BadgeCheck, ExternalLink, Mail, MapPin, Phone, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics";

export interface MarketplaceCategory { id: string; name: string; slug: string; description: string; isActive: boolean; sortOrder: number }
export interface MarketplaceProvider { id: string; businessName: string; categoryId: string; description: string; services: string[]; serviceAreas: string[]; phone?: string | null; email?: string | null; website?: string | null; imageUrl?: string | null; status: string; vettingSummary?: string | null; vettedAt?: string | null; approvedAt?: string | null }

function useTrack() {
  return useMutation({ mutationFn: ({ providerId, action }: { providerId: string; action: "listing_view" | "profile_view" | "phone" | "email" | "website" }) => apiRequest("POST", "/api/marketplace/events", { providerId, action }) });
}
function ProviderMark({ provider }: { provider: MarketplaceProvider }) {
  return provider.imageUrl ? <img src={provider.imageUrl} alt="" className="h-14 w-14 rounded-2xl object-cover border border-primary/10" /> : <div className="h-14 w-14 shrink-0 rounded-2xl bg-[hsl(var(--secondary))] text-primary flex items-center justify-center font-serif text-xl">{provider.businessName.slice(0, 1)}</div>;
}
function DirectContactNote() { return <p className="text-xs leading-relaxed text-muted-foreground">When you contact a provider, you are connecting with them directly. Steps After Life does not share your plan, case, or personal details.</p>; }

export default function Marketplace() {
  const { id } = useParams<{ id: string }>();
  return id ? <ProviderProfile id={id} /> : <Directory />;
}

function Directory() {
  const requestedQuery = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
  const [q, setQ] = useState(requestedQuery); const [category, setCategory] = useState("all"); const [location, setLocation] = useState(""); const tracked = useRef(new Set<string>());
  const categories = useQuery<MarketplaceCategory[]>({ queryKey: ["/api/marketplace/categories"] });
  const providers = useQuery<MarketplaceProvider[]>({ queryKey: ["/api/marketplace/providers", q, category, location], queryFn: async () => (await apiRequest("GET", `/api/marketplace/providers?q=${encodeURIComponent(q)}&category=${category === "all" ? "" : encodeURIComponent(category)}&location=${encodeURIComponent(location)}`)).json() });
  const track = useTrack();
  useEffect(() => { providers.data?.forEach((p) => { if (!tracked.current.has(p.id)) { tracked.current.add(p.id); track.mutate({ providerId: p.id, action: "listing_view" }); } }); }, [providers.data, track.mutate]);
  const activeCategories = useMemo(() => categories.data?.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder) ?? [], [categories.data]);
  const reset = () => { setQ(""); setCategory("all"); setLocation(""); };
  return <div className="min-h-[calc(100dvh-65px)] bg-[radial-gradient(circle_at_88%_0%,hsl(var(--secondary)/.55),transparent_28rem)]">
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-7 sm:py-10">
      <header className="max-w-3xl">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-accent"><ShieldCheck className="h-5 w-5" /> STEPS AFTER LIFE MARKETPLACE</div>
        <h1 className="font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">A steadier way to find support.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">A considered directory of providers for the practical work ahead, whether you are managing a loss or preparing your own plan.</p>
      </header>
      <section className="mt-8 rounded-[1.35rem] border border-primary/10 bg-card/90 p-4 shadow-[0_16px_40px_hsl(156_17%_24%_/.07)] sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_190px]">
          <div className="relative"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-10" placeholder="Search by provider or service" aria-label="Search providers" /></div>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-11"><SelectValue placeholder="All services" /></SelectTrigger><SelectContent><SelectItem value="all">All services</SelectItem>{activeCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          <div className="relative"><MapPin className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-11 pl-10" placeholder="City or region" aria-label="Location" /></div>
        </div>
      </section>
      <div className="mt-9 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block"><div className="sticky top-24 rounded-2xl bg-primary p-5 text-primary-foreground"><BadgeCheck className="h-6 w-6 text-[hsl(var(--secondary))]" /><h2 className="mt-8 font-serif text-2xl">What vetted means here</h2><p className="mt-3 text-sm leading-relaxed text-primary-foreground/80">We review provider information, service fit, and readiness to support people during difficult transitions.</p><p className="mt-6 text-xs text-primary-foreground/65">Vetting is not an endorsement or a guarantee of availability or outcomes.</p></div></aside>
        <main>
          <div className="mb-4 flex items-center justify-between"><p className="text-sm text-muted-foreground">{providers.isLoading ? "Finding providers" : `${providers.data?.length ?? 0} providers available`}</p><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><SlidersHorizontal className="h-4 w-4" /> Refine your search</div></div>
          {providers.isLoading ? <div className="grid gap-4 sm:grid-cols-2">{[1,2,3,4].map((n) => <Skeleton key={n} className="h-64 rounded-2xl" />)}</div> : providers.isError ? <State title="We could not load the directory" body="Please check your connection and try again." action="Try again" onClick={() => providers.refetch()} /> : providers.data?.length ? <div className="grid gap-4 sm:grid-cols-2">{providers.data.map((p) => <Link key={p.id} href={`/marketplace/${p.id}`} className="group rounded-2xl border bg-card p-5 transition-transform hover:-translate-y-0.5 hover:shadow-md" data-testid={`provider-card-${p.id}`}><div className="flex gap-4"><ProviderMark provider={p} /><div className="min-w-0"><div className="flex gap-2"><h2 className="font-serif text-xl leading-tight">{p.businessName}</h2><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" /></div><p className="mt-1 text-sm text-muted-foreground">{activeCategories.find(c => c.id === p.categoryId)?.name ?? "Provider"}</p></div></div><p className="mt-5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{p.description}</p><div className="mt-4 flex flex-wrap gap-1.5">{p.serviceAreas.slice(0, 2).map(a => <Badge key={a} variant="secondary" className="font-normal">{a}</Badge>)}</div><span className="mt-5 inline-flex text-sm font-semibold text-accent group-hover:underline">View provider details</span></Link>)}</div> : <State title={q || category !== "all" || location ? "No providers match these details" : "This directory is being carefully assembled"} body={q || category !== "all" || location ? "Try a broader service, city, or provider name." : "Check back soon. We are adding providers only as they complete our review."} action={q || category !== "all" || location ? "Clear filters" : undefined} onClick={reset} />}
        </main>
      </div>
    </div>
  </div>;
}
function State({ title, body, action, onClick }: { title: string; body: string; action?: string; onClick?: () => void }) { return <div className="rounded-2xl border border-dashed bg-card/60 px-6 py-16 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-accent" /><h2 className="mt-4 font-serif text-2xl">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>{action && <Button variant="outline" className="mt-6" onClick={onClick}>{action}</Button>}</div>; }

function ProviderProfile({ id }: { id: string }) {
  const provider = useQuery<MarketplaceProvider>({ queryKey: ["/api/marketplace/providers", id], queryFn: async () => (await apiRequest("GET", `/api/marketplace/providers/${id}`)).json() });
  const categories = useQuery<MarketplaceCategory[]>({ queryKey: ["/api/marketplace/categories"] }); const track = useTrack(); const viewed = useRef(false);
  useEffect(() => {
    if (provider.data && !viewed.current) {
      viewed.current = true;
      track.mutate({ providerId: id, action: "profile_view" });
      trackAnalyticsEvent("marketplace_provider_view", {});
    }
  }, [provider.data, id, track.mutate]);
  if (provider.isLoading) return <div className="mx-auto max-w-5xl p-7"><Skeleton className="h-96 rounded-3xl" /></div>;
  if (provider.isError || !provider.data) return <div className="mx-auto max-w-5xl p-7"><State title="This provider is unavailable" body="It may have moved or is no longer in the vetted directory." action="Return to directory" onClick={() => window.history.back()} /></div>;
  const p = provider.data; const category = categories.data?.find(c => c.id === p.categoryId)?.name;
  const action = (event: "phone" | "email" | "website") => {
    track.mutate({ providerId: p.id, action: event });
    trackAnalyticsEvent("marketplace_provider_contact", { action: event });
  };
  return <div className="mx-auto max-w-5xl px-4 py-7 sm:px-7 sm:py-10"><Link href="/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All vetted providers</Link><div className="mt-7 grid gap-8 lg:grid-cols-[1fr_300px]"><article><div className="flex gap-5"><ProviderMark provider={p} /><div><div className="flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-accent" /><span className="text-xs font-bold tracking-widest text-accent">SAL VETTED</span></div><h1 className="mt-2 font-serif text-4xl leading-tight">{p.businessName}</h1><p className="mt-2 text-muted-foreground">{category}</p></div></div><div className="mt-8 border-y py-7"><h2 className="font-serif text-2xl">About this provider</h2><p className="mt-3 leading-relaxed text-muted-foreground">{p.description}</p></div><section className="py-7"><h2 className="font-serif text-2xl">Services</h2><div className="mt-4 flex flex-wrap gap-2">{p.services.map(s => <Badge key={s} variant="secondary" className="px-3 py-1 font-normal">{s}</Badge>)}</div></section><section className="border-t py-7"><h2 className="font-serif text-2xl">Service areas</h2><p className="mt-3 text-muted-foreground">{p.serviceAreas.join(" · ") || "Please contact this provider for availability."}</p></section>{p.vettingSummary && <section className="rounded-2xl bg-secondary/45 p-6"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-accent" /> Why SAL listed this provider</div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.vettingSummary}</p></section>}</article><aside className="lg:sticky lg:top-24 lg:h-fit"><Card className="border-primary/15 shadow-sm"><CardContent className="p-5"><h2 className="font-serif text-2xl">Contact directly</h2><p className="mt-2 text-sm text-muted-foreground">Ask the questions that matter to your family or plan.</p><div className="mt-5 space-y-2">{p.phone && <Button asChild className="w-full justify-start" onClick={() => action("phone")}><a href={`tel:${p.phone}`}><Phone className="mr-2 h-4 w-4" /> {p.phone}</a></Button>}{p.email && <Button asChild variant="outline" className="w-full justify-start" onClick={() => action("email")}><a href={`mailto:${p.email}`}><Mail className="mr-2 h-4 w-4" /> Email provider</a></Button>}{p.website && <Button asChild variant="outline" className="w-full justify-start" onClick={() => action("website")}><a href={p.website} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Visit website</a></Button>}</div><div className="mt-6 border-t pt-4"><DirectContactNote /></div></CardContent></Card></aside></div></div>;
}