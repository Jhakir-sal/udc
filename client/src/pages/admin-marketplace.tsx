import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MarketplaceCategory, MarketplaceProvider } from "./marketplace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Archive, CheckCircle2, ExternalLink, Eye, FileEdit, Loader2, PauseCircle, Plus, Send, ShieldCheck } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics";

type ProviderForm = {
  id: string;
  businessName: string;
  categoryId: string;
  description: string;
  services: string;
  serviceAreas: string;
  phone: string;
  email: string;
  website: string;
  imageUrl: string;
  status: MarketplaceProvider["status"];
  vettingSummary: string;
};
const blankProvider: ProviderForm = { id: "", businessName: "", categoryId: "", description: "", services: "", serviceAreas: "", phone: "", email: "", website: "", imageUrl: "", status: "draft", vettingSummary: "" };
const blankCategory = { name: "", slug: "", description: "", isActive: true, sortOrder: 0 };

function toProviderForm(provider: MarketplaceProvider): ProviderForm {
  return {
    id: provider.id,
    businessName: provider.businessName,
    categoryId: provider.categoryId,
    description: provider.description,
    services: Array.isArray(provider.services) ? provider.services.join(", ") : "",
    serviceAreas: Array.isArray(provider.serviceAreas) ? provider.serviceAreas.join(", ") : "",
    phone: provider.phone ?? "",
    email: provider.email ?? "",
    website: provider.website ?? "",
    imageUrl: provider.imageUrl ?? "",
    status: provider.status,
    vettingSummary: provider.vettingSummary ?? "",
  };
}
function list(value: string) { return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean); }
function message(error: unknown) { return error instanceof Error ? error.message : "Please try again."; }

export default function AdminMarketplace() {
  const { toast } = useToast();
  const [providerForm, setProviderForm] = useState<ProviderForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<(MarketplaceCategory | typeof blankCategory) | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const categories = useQuery<MarketplaceCategory[]>({ queryKey: ["/api/admin/marketplace/categories"] });
  const providers = useQuery<MarketplaceProvider[]>({ queryKey: ["/api/admin/marketplace/providers"] });
  const preview = useQuery<MarketplaceProvider>({
    queryKey: ["/api/admin/marketplace/providers", previewId],
    queryFn: async () => (await apiRequest("GET", `/api/admin/marketplace/providers/${previewId}`)).json(),
    enabled: !!previewId,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace/categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace/providers"] });
  };
  const saveProvider = useMutation({
    mutationFn: async (form: ProviderForm) => {
      const body = {
        businessName: form.businessName,
        categoryId: form.categoryId,
        description: form.description,
        services: list(form.services),
        serviceAreas: list(form.serviceAreas),
        phone: form.phone,
        email: form.email,
        website: form.website,
        imageUrl: form.imageUrl,
        status: form.status,
        vettingSummary: form.vettingSummary,
      };
      return apiRequest(form.id ? "PATCH" : "POST", form.id ? `/api/admin/marketplace/providers/${form.id}` : "/api/admin/marketplace/providers", body);
    },
    onSuccess: (_, form) => {
      if (!form.id) trackAnalyticsEvent("admin_partner_created", { partner_type: "marketplace_provider" });
      refresh();
      setProviderForm(null);
      toast({ title: "Provider saved" });
    },
    onError: (error) => toast({ title: "Provider could not be saved", description: message(error), variant: "destructive" }),
  });
  const saveCategory = useMutation({
    mutationFn: (form: MarketplaceCategory | typeof blankCategory) => {
      const body = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      };
      return apiRequest("id" in form && form.id ? "PATCH" : "POST", "id" in form && form.id ? `/api/admin/marketplace/categories/${form.id}` : "/api/admin/marketplace/categories", body);
    },
    onSuccess: () => { refresh(); setCategoryForm(null); toast({ title: "Category saved" }); },
    onError: (error) => toast({ title: "Category could not be saved", description: message(error), variant: "destructive" }),
  });
  const lifecycle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/admin/marketplace/providers/${id}`, { status }),
    onSuccess: (_, values) => { queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace/providers"] }); toast({ title: `Provider moved to ${values.status}` }); },
    onError: (error, values) => toast({ title: `Could not move provider to ${values.status}`, description: message(error), variant: "destructive" }),
  });

  return <div className="mx-auto max-w-7xl p-4 sm:p-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-accent"><ShieldCheck className="h-5 w-5" /> MARKETPLACE MODERATION</div>
        <h1 className="mt-2 font-serif text-4xl">Provider review desk</h1>
        <p className="mt-2 text-muted-foreground">Keep the directory useful, current, and trustworthy.</p>
      </div>
      <Button onClick={() => setProviderForm({ ...blankProvider })} data-testid="button-add-marketplace-provider"><Plus className="mr-2 h-4 w-4" />Add provider</Button>
    </header>
    <div className="mt-8 grid gap-6 lg:grid-cols-[.75fr_1.6fr]">
      <CategoryPanel categories={categories} onNew={() => setCategoryForm({ ...blankCategory })} onEdit={setCategoryForm} />
      <ProviderPanel providers={providers} categories={categories.data ?? []} onEdit={(p) => setProviderForm(toProviderForm(p))} onPreview={setPreviewId} onStatus={(id, status) => lifecycle.mutate({ id, status })} isUpdating={lifecycle.isPending} />
    </div>
    <ProviderDialog form={providerForm} categories={categories.data ?? []} onChange={setProviderForm} onClose={() => setProviderForm(null)} onSave={() => providerForm && saveProvider.mutate(providerForm)} pending={saveProvider.isPending} />
    <CategoryDialog form={categoryForm} onChange={setCategoryForm} onClose={() => setCategoryForm(null)} onSave={() => categoryForm && saveCategory.mutate(categoryForm)} pending={saveCategory.isPending} />
    <PreviewDialog open={!!previewId} provider={preview.data} loading={preview.isLoading} error={preview.isError} onClose={() => setPreviewId(null)} />
  </div>;
}

function CategoryPanel({ categories, onNew, onEdit }: { categories: ReturnType<typeof useQuery<MarketplaceCategory[]>>; onNew: () => void; onEdit: (c: MarketplaceCategory) => void }) {
  return <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Categories</CardTitle><Button size="sm" variant="outline" onClick={onNew} aria-label="Add marketplace category" data-testid="button-add-marketplace-category"><Plus className="h-4 w-4" /></Button></CardHeader><CardContent className="space-y-2">
    {categories.isLoading ? [1, 2, 3].map((n) => <Skeleton key={n} className="h-16 w-full" />) : categories.isError ? <Empty label="Categories could not be loaded." /> : categories.data?.length ? categories.data.map((category) => <button key={category.id} onClick={() => onEdit(category)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50" aria-label={`Edit ${category.name}`} data-testid={`button-edit-category-${category.id}`}><span><b className="block text-sm">{category.name}</b><small className="text-muted-foreground">{category.isActive ? "Visible in directory" : "Archived from directory"}</small></span><FileEdit className="h-4 w-4 text-muted-foreground" /></button>) : <Empty label="No categories yet. Add one before listing providers." />}
  </CardContent></Card>;
}
function ProviderPanel({ providers, categories, onEdit, onPreview, onStatus, isUpdating }: { providers: ReturnType<typeof useQuery<MarketplaceProvider[]>>; categories: MarketplaceCategory[]; onEdit: (p: MarketplaceProvider) => void; onPreview: (id: string) => void; onStatus: (id: string, status: string) => void; isUpdating: boolean }) {
  return <Card><CardHeader><CardTitle>Providers</CardTitle></CardHeader><CardContent className="space-y-3">
    {providers.isLoading ? [1, 2, 3].map((n) => <Skeleton key={n} className="h-28 w-full" />) : providers.isError ? <Empty label="Providers could not be loaded. Refresh to try again." /> : providers.data?.length ? providers.data.map((provider) => <div key={provider.id} className="rounded-xl border p-4" data-testid={`marketplace-provider-${provider.id}`}><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><b>{provider.businessName}</b><Badge variant="secondary">{provider.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{categories.find((c) => c.id === provider.categoryId)?.name ?? "Unassigned category"}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onPreview(provider.id)} data-testid={`button-preview-provider-${provider.id}`}><Eye className="mr-1 h-4 w-4" />Preview</Button><Button size="sm" variant="outline" onClick={() => onEdit(provider)} data-testid={`button-edit-provider-${provider.id}`}>Edit</Button></div></div><p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{provider.description}</p><Lifecycle provider={provider} onStatus={onStatus} pending={isUpdating} /></div>) : <Empty label="No providers yet. Add the first provider when their review is ready." />}
  </CardContent></Card>;
}
function Lifecycle({ provider, onStatus, pending }: { provider: MarketplaceProvider; onStatus: (id: string, status: string) => void; pending: boolean }) {
  const next = provider.status === "draft" ? [["review", "Submit for review", Send]] : provider.status === "review" ? [["approved", "Approve", CheckCircle2], ["suspended", "Suspend", PauseCircle]] : provider.status === "approved" ? [["suspended", "Suspend", PauseCircle], ["archived", "Archive", Archive]] : provider.status === "suspended" ? [["approved", "Reapprove", CheckCircle2], ["archived", "Archive", Archive]] : [["review", "Return to review", Send]];
  return <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">{next.map(([status, label, Icon]) => <Button key={status as string} size="sm" variant="ghost" onClick={() => onStatus(provider.id, status as string)} disabled={pending} data-testid={`button-provider-${status}-${provider.id}`}>{pending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Icon className="mr-1 h-3 w-3" />}{label as string}</Button>)}</div>;
}
function Empty({ label }: { label: string }) { return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{label}</p>; }
function ProviderDialog({ form, categories, onChange, onClose, onSave, pending }: { form: ProviderForm | null; categories: MarketplaceCategory[]; onChange: (f: ProviderForm | null) => void; onClose: () => void; onSave: () => void; pending: boolean }) {
  const set = (key: keyof ProviderForm, value: string) => form && onChange({ ...form, [key]: value });
  return <Dialog open={!!form} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{form?.id ? "Edit provider" : "Add provider"}</DialogTitle></DialogHeader>{form && <div className="grid gap-3 py-3 sm:grid-cols-2"><Field label="Business name" value={form.businessName} onChange={(v) => set("businessName", v)} required /><div className="space-y-1"><Label htmlFor="provider-category">Category</Label><Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}><SelectTrigger id="provider-category" aria-label="Provider category"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div><Field label="Phone" value={form.phone ?? ""} onChange={(v) => set("phone", v)} /><Field label="Email" value={form.email ?? ""} onChange={(v) => set("email", v)} type="email" /><Field label="Website" value={form.website ?? ""} onChange={(v) => set("website", v)} /><Field label="Image URL" value={form.imageUrl ?? ""} onChange={(v) => set("imageUrl", v)} /><Area label="Description" value={form.description} onChange={(v) => set("description", v)} /><Area label="Services (comma or new line separated)" value={form.services} onChange={(v) => set("services", v)} /><Area label="Service areas (comma or new line separated)" value={form.serviceAreas} onChange={(v) => set("serviceAreas", v)} /><Area label="Vetting summary" value={form.vettingSummary ?? ""} onChange={(v) => set("vettingSummary", v)} /></div>}<DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSave} disabled={pending || !form?.businessName || !form.categoryId} data-testid="button-save-marketplace-provider">{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save provider</Button></DialogFooter></DialogContent></Dialog>;
}
function CategoryDialog({ form, onChange, onClose, onSave, pending }: { form: (MarketplaceCategory | typeof blankCategory) | null; onChange: (f: (MarketplaceCategory | typeof blankCategory) | null) => void; onClose: () => void; onSave: () => void; pending: boolean }) {
  const set = (key: string, value: string | boolean | number) => form && onChange({ ...form, [key]: value });
  return <Dialog open={!!form} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{form && "id" in form ? "Edit marketplace category" : "Add marketplace category"}</DialogTitle></DialogHeader>{form && <div className="space-y-3 py-2"><Field label="Name" value={form.name} onChange={(v) => set("name", v)} required /><Field label="Slug" value={form.slug} onChange={(v) => set("slug", v)} required /><Area label="Description" value={form.description} onChange={(v) => set("description", v)} /><Field label="Sort order" value={String(form.sortOrder)} type="number" onChange={(v) => set("sortOrder", Number(v))} /><div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor="category-active">Show in directory</Label><p className="text-xs text-muted-foreground">Turn off to archive this category without deleting it.</p></div><Switch id="category-active" checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} aria-label="Show category in directory" data-testid="switch-category-active" /></div></div>}<DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onSave} disabled={pending || !form?.name || !form.slug} data-testid="button-save-marketplace-category">{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save category</Button></DialogFooter></DialogContent></Dialog>;
}
function PreviewDialog({ open, provider, loading, error, onClose }: { open: boolean; provider?: MarketplaceProvider; loading: boolean; error: boolean; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}><DialogContent><DialogHeader><DialogTitle>Provider preview</DialogTitle></DialogHeader>{loading ? <Skeleton className="h-40 w-full" /> : error ? <p className="text-sm text-destructive">The provider record could not be loaded.</p> : provider ? <div className="space-y-3"><div><p className="font-serif text-2xl">{provider.businessName}</p><Badge className="mt-2" variant="secondary">{provider.status}</Badge></div><p className="text-sm text-muted-foreground">{provider.description}</p><div className="rounded-lg bg-muted p-3 text-sm"><b className="mb-1 block">Vetting note</b>{provider.vettingSummary || "No vetting note has been added."}</div><p className="text-xs text-muted-foreground">This private preview includes records regardless of publication status.</p></div> : null}</DialogContent></Dialog>;
}
function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-"); return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-"); return <div className="space-y-1 sm:col-span-2"><Label htmlFor={id}>{label}</Label><Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} /></div>; }