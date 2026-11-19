import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, FileText, Gem, ImagePlus, Loader2, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Category = "watch" | "vehicle" | "real_estate" | "jewelry" | "trading_card" | "collectible" | "art" | "other";

interface Valuation {
  id: string;
  category: Category;
  itemName: string;
  brand: string | null;
  model: string | null;
  condition: string;
  aiSummary: string;
  comparables: string[];
  assumptions: string[];
  risks: string[];
  missingEvidence: string[];
  fmvLowCents: number;
  fmvHighCents: number;
  fmvCents: number;
  offerCents: number;
  confidence: number;
  status: "analyzed" | "approved" | "rejected";
  createdAt: string;
  attachments: EvidenceAttachment[];
  comparableSales: ComparableSale[];
  aiFmvLowCents: number | null;
  aiFmvHighCents: number | null;
  aiFmvCents: number | null;
  aiConfidence: number | null;
  evidenceSummary: string | null;
  updatedAt: string;
  revision: number;
}

interface ComparableSale {
  id?: string;
  soldAt: string;
  source: string;
  sourceUrl: string | null;
  priceCents: number;
  condition: string;
  matchQuality: "strong" | "moderate" | "weak";
  included: boolean;
  exclusionReason: string | null;
}

interface EvidenceAttachment {
  id: string;
  valuationId: string | null;
  objectPath: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  status: "uploading" | "ready" | "processing" | "attached";
}

interface PhotoDraft {
  key: string;
  file: File;
  previewUrl: string;
  attachment?: EvidenceAttachment;
  uploading?: boolean;
  error?: string;
}

const categoryLabels: Record<Category, string> = {
  watch: "Watch",
  vehicle: "Car or vehicle",
  real_estate: "Home or real estate",
  jewelry: "Jewelry",
  trading_card: "Trading card",
  collectible: "Collectible or valuable",
  art: "Art",
  other: "Other hard asset",
};

const conditionOptions = [
  ["new", "New / unused"], ["like_new", "Like new"], ["excellent", "Excellent"],
  ["very_good", "Very good"], ["good", "Good"], ["fair", "Fair"], ["poor", "Poor"],
  ["damaged", "Damaged / major defects"], ["salvage", "Salvage / parts value"],
] as const;

const authenticationOptions = [
  ["not_reviewed", "Not reviewed"], ["seller_represented", "Seller states authentic"],
  ["documents_supplied", "Supporting documents supplied"], ["reference_matched", "Serial / reference matched"],
  ["third_party_authenticated", "Authenticated by a third party"],
  ["professionally_graded", "Professionally graded or certified"],
  ["ownership_or_title_verified", "Ownership or title verified"],
  ["concerns_identified", "Authentication concerns identified"],
] as const;

function optionLabel(options: readonly (readonly [string, string])[], value: string) {
  return options.find(([key]) => key === value)?.[1] || value;
}

const emptyForm = {
  category: "watch" as Category,
  itemName: "",
  brand: "",
  model: "",
  yearOrEdition: "",
  referenceNumber: "",
  propertyLocation: "",
  propertyType: "",
  livingAreaSquareFeet: "",
  bedrooms: "",
  bathrooms: "",
  lotSize: "",
  saleContext: "",
  condition: "",
  conditionNotes: "",
  description: "",
  provenanceNotes: "",
  authenticityNotes: "",
  authenticityStatus: "not_reviewed",
  askingPrice: "",
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

async function preparePhoto(file: File): Promise<File> {
  if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name}: choose a photo under 30 MB.`);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())) {
    throw new Error(`${file.name}: choose a JPEG, PNG, or WebP image. HEIC and other formats are not supported; use a JPEG or a camera-compatible format.`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: this image could not be opened. Please choose a JPEG or a camera-compatible photo.`);
  }
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`${file.name}: this photo could not be prepared. Please try another image.`);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error(`${file.name}: this photo could not be prepared. Please try another image.`);
    if (blob.size > 10 * 1024 * 1024) throw new Error(`${file.name}: the prepared image is over 10 MB. Choose a smaller photo.`);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function DetailList({ title, items, warning = false }: { title: string; items: string[]; warning?: boolean }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2">
            {warning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminHardAssetValuations() {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Valuation | null>(null);
  const [comparableSales, setComparableSales] = useState<ComparableSale[]>([]);
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState<EvidenceAttachment[]>([]);
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const [pendingUploadBytes, setPendingUploadBytes] = useState(0);
  const [photoMode, setPhotoMode] = useState(true);
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [photoPreparing, setPhotoPreparing] = useState(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const photoDraftsRef = useRef(photoDrafts);
  photoDraftsRef.current = photoDrafts;
  useEffect(() => () => {
    photoDraftsRef.current.forEach(draft => URL.revokeObjectURL(draft.previewUrl));
  }, []);
  const photoSlotsUsed = attachments.length + photoDrafts.filter(draft => !draft.attachment).length;
  const { data: valuations = [], isLoading } = useQuery<Valuation[]>({
    queryKey: ["/api/admin/hard-asset-valuations"],
  });

  const analyze = useMutation({
    mutationFn: async () => {
      const askingPriceCents = form.askingPrice
        ? Math.round(Number(form.askingPrice.replace(/[$,]/g, "")) * 100)
        : null;
      const body = photoMode
        ? { photoMode: true, attachmentIds: attachments.filter((item) => item.contentType.startsWith("image/") && item.status === "ready").map((item) => item.id) }
        : {
            ...form,
            askingPriceCents,
            askingPrice: undefined,
            livingAreaSquareFeet: form.livingAreaSquareFeet ? Number(form.livingAreaSquareFeet) : null,
            bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
            attachmentIds: attachments.map((attachment) => attachment.id),
          };
      const response = await apiRequest("POST", "/api/admin/hard-asset-valuations/analyze", body);
      return response.json() as Promise<Valuation>;
    },
    onSuccess: (valuation) => {
      setSelected(valuation);
      setComparableSales([]);
      setAttachments([]);
      photoDrafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
      setPhotoDrafts([]);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hard-asset-valuations"] });
      toast({ title: "Valuation ready", description: "Review the AI insights before approving an offer." });
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    onError: (error: Error) => {
      toast({ title: "Valuation failed", description: error.message, variant: "destructive" });
    },
  });

  const uploadEvidence = useMutation<EvidenceAttachment, Error, File>({
    onMutate: (file: File) => {
      setUploadsInProgress((count) => count + 1);
      setPendingUploadBytes((bytes) => bytes + file.size);
    },
    mutationFn: async (file: File) => {
      const prepared = await apiRequest("POST", "/api/admin/hard-asset-valuations/upload-url", {
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });
      const { attachment, uploadURL } = await prepared.json() as { attachment: EvidenceAttachment; uploadURL: string };
      try {
        const uploaded = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!uploaded.ok) throw new Error("The file upload failed");
        const finalized = await apiRequest("POST", `/api/admin/hard-asset-valuations/attachments/${attachment.id}/finalize`, {});
        return finalized.json() as Promise<EvidenceAttachment>;
      } catch (error) {
        await apiRequest("DELETE", `/api/admin/hard-asset-valuations/attachments/${attachment.id}`).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: (attachment) => setAttachments((current) => [...current, attachment]),
    onError: (error: Error) => toast({ title: "Evidence upload failed", description: error.message, variant: "destructive" }),
    onSettled: (_data, _error, file) => {
      setUploadsInProgress((count) => Math.max(0, count - 1));
      setPendingUploadBytes((bytes) => Math.max(0, bytes - file.size));
    },
  });

  const removePendingEvidence = async (attachment: EvidenceAttachment) => {
    try {
      await apiRequest("DELETE", `/api/admin/hard-asset-valuations/attachments/${attachment.id}`);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      const removed = photoDrafts.find((draft) => draft.attachment?.id === attachment.id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      setPhotoDrafts((drafts) => drafts.filter((draft) => draft.attachment?.id !== attachment.id));
    } catch (error) {
      toast({ title: "Could not remove evidence", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    }
  };

  const discardDraft = async () => {
    if (attachments.length) {
      try {
        await apiRequest("POST", "/api/admin/hard-asset-valuations/attachments/abandon", {
          attachmentIds: attachments.map((attachment) => attachment.id),
        });
      } catch (error) {
        toast({ title: "Could not discard draft evidence", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
        return;
      }
    }
    setAttachments([]);
    setForm(emptyForm);
    photoDrafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
    setPhotoDrafts([]);
  };

  const deleteValuation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a valuation first");
      if (!window.confirm("Permanently delete this valuation and all of its private evidence files?")) return false;
      await apiRequest("DELETE", `/api/admin/hard-asset-valuations/${selected.id}`);
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) return;
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hard-asset-valuations"] });
      toast({ title: "Valuation and private evidence deleted" });
    },
  });

  const review = useMutation({
    mutationFn: async (status: "approved" | "rejected") => {
      if (!selected) throw new Error("Select a valuation first");
      const response = await apiRequest("PATCH", `/api/admin/hard-asset-valuations/${selected.id}/review`, { status });
      return response.json() as Promise<Valuation>;
    },
    onSuccess: (valuation) => {
      setSelected(valuation);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hard-asset-valuations"] });
      toast({ title: valuation.status === "approved" ? "Offer approved" : "Valuation rejected" });
    },
    onError: (error: Error) => toast({ title: "Review not saved", description: error.message, variant: "destructive" }),
  });

  const saveComparables = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a valuation first");
      const response = await apiRequest("PATCH", `/api/admin/hard-asset-valuations/${selected.id}/comparables`, {
        comparableSales,
        expectedRevision: selected.revision,
      });
      return response.json() as Promise<Valuation>;
    },
    onSuccess: (valuation) => {
      setSelected(valuation);
      setComparableSales(valuation.comparableSales || []);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hard-asset-valuations"] });
      toast({ title: "Verified comparables saved", description: "FMV and purchase target now reflect the included sales." });
    },
    onError: (error: Error) => toast({ title: "Comparables not saved", description: error.message, variant: "destructive" }),
  });

  const selectValuation = (valuation: Valuation) => {
    setSelected(valuation);
    setComparableSales(valuation.comparableSales || []);
  };

  const updateComparable = (index: number, patch: Partial<ComparableSale>) => {
    setComparableSales((current) => current.map((sale, saleIndex) => saleIndex === index ? { ...sale, ...patch } : sale));
  };

  const filtered = valuations.filter((valuation) =>
    `${valuation.itemName} ${valuation.brand || ""} ${valuation.model || ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  const runValuation = () => {
    if (photoMode) {
      if (photoDrafts.some((draft) => !draft.attachment)) {
        toast({ title: "Finish the selected photos", description: "Retry each failed photo or remove it before estimating.", variant: "destructive" });
        return;
      }
      const photos = attachments.filter((item) => item.contentType.startsWith("image/") && item.status === "ready");
      if (photos.length < 1 || photos.length > 6) {
        toast({ title: "Add 1–6 ready photos", description: "Choose clear views of one item before asking for an estimate.", variant: "destructive" });
        return;
      }
      if (uploadsInProgress > 0 || photoPreparing > 0) {
        toast({ title: "Photos are still preparing", description: "Wait for all selected photos to finish uploading.", variant: "destructive" });
        return;
      }
      analyze.mutate();
      return;
    }
    const missing: string[] = [];
    if (!form.itemName.trim()) missing.push("item name");
    if (!form.condition) missing.push("condition");
    if (form.description.trim().length < 10) missing.push("a detailed description of at least 10 characters");
    if (missing.length > 0) {
      toast({
        title: "Complete the required fields",
        description: `Add ${missing.join(", ")} before running the valuation.`,
        variant: "destructive",
      });
      return;
    }
    analyze.mutate();
  };

  const uploadPhotoFiles = async (selectedFiles: FileList | File[]) => {
    const incoming = Array.from(selectedFiles);
    const photoCount = attachments.length + photoDrafts.filter(draft => !draft.attachment).length;
    const available = 6 - photoCount;
    if (incoming.length > available) {
      toast({ title: "Photo limit reached", description: `You can add ${Math.max(available, 0)} more photo${available === 1 ? "" : "s"} for this item. Extra selected files were not added.`, variant: "destructive" });
    }
    const candidates = incoming.slice(0, Math.max(available, 0));
    if (!candidates.length) return;
    setPhotoPreparing((count) => count + candidates.length);
    for (const source of candidates) {
      let draft: PhotoDraft | undefined;
      try {
        const prepared = await preparePhoto(source);
        draft = { key: `${Date.now()}-${Math.random()}`, file: prepared, previewUrl: URL.createObjectURL(prepared), uploading: true };
        setPhotoDrafts((current) => [...current, draft!]);
        const uploaded = await uploadEvidence.mutateAsync(prepared);
        draft = { ...draft, attachment: uploaded, uploading: false };
        setPhotoDrafts((current) => current.map((item) => item.key === draft!.key ? draft! : item));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Please try another photo.";
        if (draft) setPhotoDrafts((current) => current.map((item) => item.key === draft!.key ? { ...item, uploading: false, error: message } : item));
        else toast({ title: "Photo could not be added", description: message, variant: "destructive" });
      } finally {
        setPhotoPreparing((count) => Math.max(0, count - 1));
      }
    }
  };

  const retryPhoto = async (draft: PhotoDraft) => {
    setPhotoDrafts((current) => current.map((item) => item.key === draft.key ? { ...item, uploading: true, error: undefined } : item));
    try {
      const uploaded = await uploadEvidence.mutateAsync(draft.file);
      setPhotoDrafts((current) => current.map((item) => item.key === draft.key ? { ...item, attachment: uploaded, uploading: false } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      setPhotoDrafts((current) => current.map((item) => item.key === draft.key ? { ...item, uploading: false, error: message } : item));
    }
  };

  const removePhotoDraft = async (draft: PhotoDraft) => {
    if (draft.attachment) {
      await removePendingEvidence(draft.attachment);
      return;
    }
    URL.revokeObjectURL(draft.previewUrl);
    setPhotoDrafts((current) => current.filter((item) => item.key !== draft.key));
  };

  const switchMode = (nextPhotoMode: boolean) => {
    if (analyze.isPending || uploadsInProgress > 0 || photoPreparing > 0) return;
    if (nextPhotoMode === photoMode) return;
    if (nextPhotoMode && attachments.some((attachment) => !attachment.contentType.startsWith("image/"))) {
      toast({ title: "Remove supporting documents first", description: "Photo mode accepts images only. Your documents are still attached; remove them in manual intake before switching.", variant: "destructive" });
      return;
    }
    if (nextPhotoMode && attachments.length + photoDrafts.filter(draft => !draft.attachment).length > 6) {
      toast({ title: "Photo mode supports six photos", description: "Remove extra images in manual intake before switching. Nothing has been removed.", variant: "destructive" });
      return;
    }
    setPhotoMode(nextPhotoMode);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Gem className="h-6 w-6 text-primary" />
            <h1 className="font-serif text-3xl font-semibold">Hard Asset Valuation</h1>
            <Badge variant="secondary">Admin only</Badge>
          </div>
          <p className="mt-2 text-muted-foreground">
            Preliminary market insights for homes, watches, vehicles, jewelry, collectibles, art, and other valuables.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Asset intake</CardTitle>
            <CardDescription>One item at a time. Choose photo-first for a quick family-friendly estimate, or enter details manually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1" aria-label="Intake mode">
              <Button type="button" variant={photoMode ? "default" : "ghost"} onClick={() => switchMode(true)} aria-pressed={photoMode}><Camera className="mr-2 h-4 w-4" />Photo first</Button>
              <Button type="button" variant={!photoMode ? "default" : "ghost"} onClick={() => switchMode(false)} aria-pressed={!photoMode}>Manual intake</Button>
            </div>
            {photoMode ? (
              <section className="space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="font-medium">Show us one item</p>
                  <p className="mt-1 text-sm text-muted-foreground">Take 2–6 views when possible: the whole item, labels or maker marks, and any wear or damage. One estimate per item, not a room batch.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background px-3 py-4 text-center text-sm font-medium hover:bg-muted/50">
                    <Camera className="h-6 w-6 text-primary" />
                    <span>Take photo</span>
                    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={analyze.isPending || uploadsInProgress > 0 || photoPreparing > 0 || photoSlotsUsed >= 6} onChange={(event) => { if (event.target.files) void uploadPhotoFiles(event.target.files); event.currentTarget.value = ""; }} />
                  </label>
                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background px-3 py-4 text-center text-sm font-medium hover:bg-muted/50">
                    <ImagePlus className="h-6 w-6 text-primary" />
                    <span>Choose photos</span>
                    <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={analyze.isPending || uploadsInProgress > 0 || photoPreparing > 0 || photoSlotsUsed >= 6} onChange={(event) => { if (event.target.files) void uploadPhotoFiles(event.target.files); event.currentTarget.value = ""; }} />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP only. Photos are resized to a maximum 2048 px and prepared privately before upload.</p>
                {(photoPreparing > 0 || uploadsInProgress > 0) && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparing and uploading selected photos…</p>}
                {photoDrafts.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photoDrafts.map((draft, index) => <div key={draft.key} className="overflow-hidden rounded-xl border bg-background">
                    <div className="relative aspect-square bg-muted"><img src={draft.previewUrl} alt={`Selected item photo ${index + 1}`} className="h-full w-full object-cover" />
                      <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2 h-8 w-8" disabled={draft.uploading || analyze.isPending || photoPreparing > 0 || uploadsInProgress > 0} onClick={() => void removePhotoDraft(draft)} aria-label={`Remove photo ${index + 1}`}><X className="h-4 w-4" /></Button>
                      {draft.uploading && <div className="absolute inset-0 flex items-center justify-center bg-foreground/35 text-primary-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>}
                    </div>
                    <div className="p-2 text-xs">
                      <p className="truncate font-medium">{draft.file.name}</p>
                      {draft.error ? <div className="mt-1 flex items-center justify-between gap-1 text-destructive"><span className="line-clamp-2">{draft.error}</span><Button type="button" variant="ghost" size="sm" disabled={analyze.isPending || photoPreparing > 0 || uploadsInProgress > 0} onClick={() => void retryPhoto(draft)}><Upload className="mr-1 h-3 w-3" />Retry</Button></div> : <p className="mt-1 text-muted-foreground">{draft.attachment ? "Private photo ready" : "Preparing photo…"}</p>}
                    </div>
                  </div>)}
                </div>}
                {attachments.filter(item => !photoDrafts.some(draft => draft.attachment?.id === item.id)).map(item => (
                  <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg border p-2 text-sm">
                    <Upload className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.fileName} · ready</span>
                    <Button size="icon" variant="ghost" disabled={analyze.isPending || photoPreparing > 0 || uploadsInProgress > 0} onClick={() => void removePendingEvidence(item)} aria-label={`Remove ${item.fileName}`}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                  Photos are privately stored and sent to AI when you request an estimate. Photographs help identify the item and visible condition; they do not verify authenticity or ownership. Estimates are preliminary and not certified. Avoid including people, addresses or private documents.
                </div>
              </section>
            ) : (
            <>
            <div>
              <Label>Asset type</Label>
              <Select value={form.category} onValueChange={(category: Category) => setForm({ ...form, category })}>
                <SelectTrigger className="mt-1.5" data-testid="select-valuation-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item name <span className="text-destructive">*</span></Label>
              <Input className="mt-1.5" placeholder={form.category === "real_estate" ? "Example: Three-bedroom single-family home" : "Example: Rolex Submariner Date"} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} data-testid="input-valuation-name" />
            </div>
            {form.category === "real_estate" && (
              <div className="space-y-4 rounded-lg border bg-muted/20 p-4" data-testid="real-estate-fields">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>City, state, and ZIP</Label><Input className="mt-1.5" placeholder="Avoid owner names" value={form.propertyLocation} onChange={(e) => setForm({ ...form, propertyLocation: e.target.value })} /></div>
                  <div><Label>Property type</Label><Input className="mt-1.5" placeholder="Single-family, condo, multifamily…" value={form.propertyType} onChange={(e) => setForm({ ...form, propertyType: e.target.value })} /></div>
                  <div><Label>Living area (sq. ft.)</Label><Input className="mt-1.5" type="number" min="1" value={form.livingAreaSquareFeet} onChange={(e) => setForm({ ...form, livingAreaSquareFeet: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Bedrooms</Label><Input className="mt-1.5" type="number" min="0" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></div>
                    <div><Label>Bathrooms</Label><Input className="mt-1.5" placeholder="2.5" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} /></div>
                  </div>
                  <div><Label>Lot size</Label><Input className="mt-1.5" placeholder="0.25 acres or 10,890 sq. ft." value={form.lotSize} onChange={(e) => setForm({ ...form, lotSize: e.target.value })} /></div>
                </div>
                <div><Label>Sale and comparable context</Label><Textarea className="mt-1.5" placeholder="Target sale date, occupancy, known recent nearby closed sales, taxes, HOA, liens, zoning, or other transaction context." value={form.saleContext} onChange={(e) => setForm({ ...form, saleContext: e.target.value })} /></div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Brand or maker</Label><Input className="mt-1.5" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
              <div><Label>Model</Label><Input className="mt-1.5" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
              <div><Label>{form.category === "real_estate" ? "Year built or renovated" : "Year, edition, or set"}</Label><Input className="mt-1.5" value={form.yearOrEdition} onChange={(e) => setForm({ ...form, yearOrEdition: e.target.value })} /></div>
              <div><Label>{form.category === "real_estate" ? "Parcel or listing reference" : "Reference, VIN, serial, or card number"}</Label><Input className="mt-1.5" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Condition <span className="text-destructive">*</span></Label>
                <Select value={form.condition} onValueChange={(condition) => setForm({ ...form, condition })}>
                  <SelectTrigger className="mt-1.5" data-testid="select-valuation-condition"><SelectValue placeholder="Select condition" /></SelectTrigger>
                  <SelectContent>{conditionOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Authentication status</Label>
                <Select value={form.authenticityStatus} onValueChange={(authenticityStatus) => setForm({ ...form, authenticityStatus })}>
                  <SelectTrigger className="mt-1.5" data-testid="select-valuation-authentication"><SelectValue /></SelectTrigger>
                  <SelectContent>{authenticationOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Condition notes</Label><Textarea className="mt-1.5" placeholder="Wear, damage, repairs, mileage, grading, included box/papers…" value={form.conditionNotes} onChange={(e) => setForm({ ...form, conditionNotes: e.target.value })} data-testid="input-valuation-condition-notes" /></div>
            <div><Label>Detailed description</Label><Textarea className="mt-1.5 min-h-28" placeholder="Materials, dimensions, features, known history, included accessories, and anything unusual." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-valuation-description" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Provenance or ownership evidence</Label><Textarea className="mt-1.5" value={form.provenanceNotes} onChange={(e) => setForm({ ...form, provenanceNotes: e.target.value })} /></div>
              <div><Label>Authentication evidence</Label><Textarea className="mt-1.5" value={form.authenticityNotes} onChange={(e) => setForm({ ...form, authenticityNotes: e.target.value })} /></div>
            </div>
            <div><Label>Seller asking price (optional)</Label><Input className="mt-1.5" inputMode="decimal" placeholder="$0" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Photos and supporting documents</Label>
              <p className="text-xs text-muted-foreground">Up to 10 JPEG, PNG, WebP, or PDF files, 10 MB each and 30 MB total. Images are inspected by AI; documents remain available for staff review.</p>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                disabled={analyze.isPending || uploadsInProgress > 0 || attachments.length >= 10}
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  const slots = 10 - attachments.length - uploadsInProgress;
                  const bytesAlreadyUsed = attachments.reduce((total, item) => total + item.fileSize, 0) + pendingUploadBytes;
                  const accepted: File[] = [];
                  let totalBytes = bytesAlreadyUsed;
                  for (const file of files) {
                    if (attachments.length + uploadsInProgress + accepted.length >= 10) {
                      toast({ title: "Evidence file limit reached", description: "Up to 10 files may be attached. Some selected files were not added.", variant: "destructive" });
                      break;
                    }
                    if (file.size > 10 * 1024 * 1024) {
                      toast({ title: "File is too large", description: `${file.name} exceeds the 10 MB per-file limit.`, variant: "destructive" });
                      continue;
                    }
                    if (totalBytes + file.size > 30 * 1024 * 1024) {
                      toast({ title: "Evidence size limit reached", description: "The 30 MB total evidence limit would be exceeded. This file was not added.", variant: "destructive" });
                      continue;
                    }
                    accepted.push(file);
                    totalBytes += file.size;
                  }
                  if (files.length > slots && slots >= 0) toast({ title: "Some files were not added", description: `Only ${slots} file slot${slots === 1 ? "" : "s"} remain.`, variant: "destructive" });
                  accepted.forEach((file) => uploadEvidence.mutate(file));
                  event.currentTarget.value = "";
                }}
                data-testid="input-valuation-evidence"
              />
              {uploadsInProgress > 0 && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Uploading and verifying private evidence…</p>}
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  {attachment.contentType.startsWith("image/") ? <Upload className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                  <Button size="icon" variant="ghost" disabled={analyze.isPending} onClick={() => removePendingEvidence(attachment)} aria-label={`Remove ${attachment.fileName}`}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            </>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={runValuation} disabled={analyze.isPending || uploadsInProgress > 0 || photoPreparing > 0} data-testid="button-run-valuation">
                {analyze.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {photoMode ? "Estimate this item" : "Run AI valuation insights"}
              </Button>
              <Button variant="outline" onClick={discardDraft} disabled={analyze.isPending || uploadsInProgress > 0 || photoPreparing > 0 || (!attachments.length && !photoDrafts.length && form === emptyForm)}>Discard draft</Button>
            </div>
          </CardContent>
        </Card>

        <div ref={resultsRef} className="scroll-mt-4 space-y-6">
          {!selected ? (
            <Card className="border-dashed"><CardContent className="py-20 text-center"><Sparkles className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-3 font-medium">AI insights will appear here</p><p className="mt-1 text-sm text-muted-foreground">{photoMode ? "Add photos, then tap Estimate this item for a preliminary value range." : "Complete the intake to generate a preliminary market estimate."}</p></CardContent></Card>
          ) : (
            <>
              <Card className="border-primary/30">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><CardTitle>{selected.itemName}</CardTitle><CardDescription>{categoryLabels[selected.category]} · {optionLabel(conditionOptions, selected.condition)}</CardDescription></div>
                    <Badge variant={selected.confidence >= 75 ? "default" : "secondary"}>{selected.confidence}% confidence</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:bg-violet-950/20">
                    <div className="mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /><p className="text-sm font-semibold">General AI market context</p></div>
                    <p className="text-sm leading-6">{selected.aiSummary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Not a live search and not verified sale evidence. Original AI estimate: {money(selected.aiFmvLowCents ?? selected.fmvLowCents)}–{money(selected.aiFmvHighCents ?? selected.fmvHighCents)} at {selected.aiConfidence ?? selected.confidence}% confidence.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-muted p-4"><p className="text-xs text-muted-foreground">{selected.evidenceSummary ? "Verified sale range" : "AI context range"}</p><p className="mt-1 text-lg font-semibold">{money(selected.fmvLowCents)}–{money(selected.fmvHighCents)}</p></div>
                    <div className="rounded-lg bg-muted p-4"><p className="text-xs text-muted-foreground">{selected.evidenceSummary ? "Evidence-weighted FMV" : "AI context FMV"}</p><p className="mt-1 text-2xl font-semibold">{money(selected.fmvCents)}</p></div>
                    <div className="rounded-lg bg-primary p-4 text-primary-foreground"><p className="text-xs opacity-80">Purchase target · FMV less 20%</p><p className="mt-1 text-2xl font-semibold">{money(selected.offerCents)}</p></div>
                  </div>
                  {selected.evidenceSummary ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"><strong>Verified live evidence:</strong> {selected.evidenceSummary}</p> : <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">No verified live comparable sales are included yet. The figures above remain general AI context and cannot be approved.</p>}
                  <DetailList title="Market reference classes" items={selected.comparables} />
                  <DetailList title="Assumptions" items={selected.assumptions} />
                  <DetailList title="Risks" items={selected.risks} warning />
                  <DetailList title="Evidence still needed" items={selected.missingEvidence} warning />
                  {!!selected.attachments?.length && (
                    <div>
                      <p className="text-sm font-medium">Private evidence</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selected.attachments.map((attachment) => (
                          <Button key={attachment.id} variant="outline" size="sm" asChild>
                            <a href={attachment.objectPath} target="_blank" rel="noreferrer"><FileText className="mr-2 h-4 w-4" />{attachment.fileName}</a>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div><CardTitle>Verified comparable sales</CardTitle><CardDescription>Record dated sales reviewed from an approved source. Excluded sales remain in the audit trail but do not affect FMV.</CardDescription></div>
                    <Button variant="outline" size="sm" onClick={() => setComparableSales((sales) => [...sales, emptyComparable()])}><Plus className="mr-1 h-4 w-4" />Add sale</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {comparableSales.length === 0 ? <p className="text-sm text-muted-foreground">No live sales recorded.</p> : comparableSales.map((sale, index) => (
                    <div key={sale.id || index} className="space-y-3 rounded-lg border p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><Label>Sale date</Label><Input type="date" max={new Date().toISOString().slice(0, 10)} disabled={!!sale.id} className="mt-1" value={sale.soldAt} onChange={(e) => updateComparable(index, { soldAt: e.target.value })} /></div>
                        <div><Label>Sale price</Label><Input inputMode="decimal" disabled={!!sale.id} className="mt-1" value={sale.priceCents ? sale.priceCents / 100 : ""} onChange={(e) => updateComparable(index, { priceCents: Math.round(Number(e.target.value) * 100) })} placeholder="0.00" /></div>
                        <div><Label>Source</Label><Input disabled={!!sale.id} className="mt-1" value={sale.source} onChange={(e) => updateComparable(index, { source: e.target.value })} placeholder="Auction house, dealer, marketplace…" /></div>
                        <div><Label>Source URL (optional)</Label><Input disabled={!!sale.id} className="mt-1" value={sale.sourceUrl || ""} onChange={(e) => updateComparable(index, { sourceUrl: e.target.value || null })} placeholder="https://…" /></div>
                        <div><Label>Condition</Label><Input disabled={!!sale.id} className="mt-1" value={sale.condition} onChange={(e) => updateComparable(index, { condition: e.target.value })} /></div>
                        <div><Label>Match quality</Label><Select disabled={!!sale.id} value={sale.matchQuality} onValueChange={(matchQuality: ComparableSale["matchQuality"]) => updateComparable(index, { matchQuality })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="strong">Strong</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="weak">Weak</SelectItem></SelectContent></Select></div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={sale.included} onChange={(e) => updateComparable(index, { included: e.target.checked, exclusionReason: e.target.checked ? null : sale.exclusionReason })} />Include in FMV</label>
                        {!sale.included && <Input className="min-w-52 flex-1" value={sale.exclusionReason || ""} onChange={(e) => updateComparable(index, { exclusionReason: e.target.value || null })} placeholder="Why is this sale excluded?" />}
                        {sale.id ? <Button variant="ghost" size="sm" disabled={!sale.included} onClick={() => updateComparable(index, { included: false, exclusionReason: "Removed from active review" })}>Exclude</Button> : <Button variant="ghost" size="icon" aria-label="Remove unsaved comparable" onClick={() => setComparableSales((sales) => sales.filter((_, saleIndex) => saleIndex !== index))}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                  ))}
                  <Button onClick={() => saveComparables.mutate()} disabled={saveComparables.isPending || comparableSales.some((sale) => !sale.soldAt || !sale.source || !sale.condition || sale.priceCents <= 0 || (!sale.included && !sale.exclusionReason))}>
                    {saveComparables.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save and recalculate FMV
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
                <CardContent className="space-y-4 pt-6">
                  <div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" /><p className="text-sm">Internal preliminary estimate only. Do not share or purchase until ownership, authenticity, condition, title, liens, inspection findings where applicable, and current market comparables have been reviewed by a qualified person.</p></div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => review.mutate("approved")} disabled={review.isPending || selected.status === "approved" || !(selected.comparableSales || []).some((sale) => sale.included)}>Approve purchase target</Button>
                    <Button variant="outline" onClick={() => review.mutate("rejected")} disabled={review.isPending || selected.status === "rejected"}>Reject estimate</Button>
                    <Button variant="destructive" onClick={() => deleteValuation.mutate()} disabled={deleteValuation.isPending}><Trash2 className="mr-2 h-4 w-4" />Delete valuation</Button>
                    <Badge variant="outline" className="ml-auto capitalize">{selected.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent valuations</CardTitle><CardDescription>Saved internal estimates and review status.</CardDescription></CardHeader>
        <CardContent>
          <div className="relative mb-4 max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search assets" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">No valuations yet.</p> : (
            <div className="divide-y rounded-md border">
              {filtered.map((valuation) => (
                <button key={valuation.id} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/50" onClick={() => selectValuation(valuation)}>
                  <div><p className="font-medium">{valuation.itemName}</p><p className="text-sm text-muted-foreground">{categoryLabels[valuation.category]} · {money(valuation.fmvCents)} FMV</p></div>
                  <div className="text-right"><p className="font-medium">{money(valuation.offerCents)}</p><Badge variant="outline" className="capitalize">{valuation.status}</Badge></div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const emptyComparable = (): ComparableSale => ({
  soldAt: new Date().toISOString().slice(0, 10),
  source: "",
  sourceUrl: null,
  priceCents: 0,
  condition: "",
  matchQuality: "moderate",
  included: true,
  exclusionReason: null,
});
