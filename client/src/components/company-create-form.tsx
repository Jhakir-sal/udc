import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Plus, X } from "lucide-react";
import { ACCOUNT_CATEGORIES, createCompanyDirectorySchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CreatedCompany = {
  id: string;
  name: string;
  officialDomain: string;
  status?: string;
  routingVerified?: boolean;
  sent?: boolean;
};

type ExistingCompany = {
  id: string;
  name: string;
  status?: string;
};

type CompanyCreateFormProps = {
  initialName?: string;
  accountId?: string;
  onCreated: (company: CreatedCompany) => void;
  onCancel: () => void;
};

type FormFields = {
  name: string;
  officialDomain: string;
  category: string;
  notificationEmail: string;
  website: string;
  source: string;
};

function failureDetails(error: unknown): { message: string; existingCompany?: ExistingCompany } {
  const text = error instanceof Error ? error.message : "Could not add this company. Please try again.";
  const body = text.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(body) as { error?: string; existingCompany?: ExistingCompany };
    return {
      message: parsed.error || text,
      existingCompany: parsed.existingCompany,
    };
  } catch {
    return { message: text };
  }
}

export function CompanyCreateForm({ initialName = "", accountId, onCreated, onCancel }: CompanyCreateFormProps) {
  const [fields, setFields] = useState<FormFields>({
    name: initialName,
    officialDomain: "",
    category: "",
    notificationEmail: "",
    website: "",
    source: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [existingCompany, setExistingCompany] = useState<ExistingCompany | null>(null);
  const submittingRef = useRef(false);
  const createCompany = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await apiRequest("POST", "/api/admin/company-directory", payload);
      return response.json() as Promise<CreatedCompany>;
    },
  });

  const updateField = (field: keyof FormFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setError("");
    setExistingCompany(null);
  };

  const handleCreate = async () => {
    if (submittingRef.current || createCompany.isPending) return;
    setError("");
    setExistingCompany(null);
    const result = createCompanyDirectorySchema.safeParse({
      name: fields.name.trim(),
      officialDomain: fields.officialDomain.trim().toLowerCase(),
      category: fields.category,
      notificationEmail: fields.notificationEmail.trim() || null,
      website: fields.website.trim() || null,
      source: fields.source.trim() || null,
    });
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] || "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      if (nextErrors.form) setError(nextErrors.form);
      return;
    }

    submittingRef.current = true;
    setFieldErrors({});
    try {
      const created = await createCompany.mutateAsync(result.data);
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ["/api/admin/company-directory"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/company-directory"] }),
      ];
      if (accountId) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ["/api/admin/accounts", accountId, "company-notification"] }),
        );
      }
      await Promise.all(invalidations);
      onCreated(created);
    } catch (caught) {
      const details = failureDetails(caught);
      setError(details.message);
      setExistingCompany(details.existingCompany || null);
    } finally {
      submittingRef.current = false;
    }
  };

  const pending = createCompany.isPending;

  return (
    <section className="min-w-0 rounded-xl border border-primary/20 bg-primary/[.025] p-4" aria-labelledby="company-create-title" data-testid="company-create-form">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="company-create-title" className="font-semibold">Add a directory company</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Save a legitimate company entry. This does not verify email routing or send a notification.
          </p>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={onCancel} disabled={pending} aria-label="Cancel adding company" data-testid="button-cancel-company-create-icon">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <Label htmlFor="company-create-name">Company name *</Label>
          <Input
            id="company-create-name"
            value={fields.name}
            maxLength={200}
            onChange={(event) => updateField("name", event.target.value)}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? "company-create-name-error" : undefined}
            data-testid="input-company-create-name"
          />
          {fieldErrors.name && <p id="company-create-name-error" className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
        </div>
        <div className="min-w-0">
          <Label htmlFor="company-create-domain">Official domain *</Label>
          <Input
            id="company-create-domain"
            value={fields.officialDomain}
            maxLength={253}
            placeholder="company.example"
            onChange={(event) => updateField("officialDomain", event.target.value)}
            aria-invalid={!!fieldErrors.officialDomain}
            aria-describedby={fieldErrors.officialDomain ? "company-create-domain-error" : "company-create-domain-help"}
            data-testid="input-company-create-domain"
          />
          <p id="company-create-domain-help" className="mt-1 text-xs text-muted-foreground">Hostname only; enter the company’s published domain.</p>
          {fieldErrors.officialDomain && <p id="company-create-domain-error" className="mt-1 text-xs text-destructive">{fieldErrors.officialDomain}</p>}
        </div>
        <div className="min-w-0">
          <Label htmlFor="company-create-category">Account category *</Label>
          <Select value={fields.category || "choose-category"} onValueChange={(value) => updateField("category", value === "choose-category" ? "" : value)}>
            <SelectTrigger id="company-create-category" aria-invalid={!!fieldErrors.category} data-testid="select-company-create-category">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="choose-category">Choose a category</SelectItem>
              {ACCOUNT_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>{category.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.category && <p className="mt-1 text-xs text-destructive">{fieldErrors.category}</p>}
        </div>
        <div className="min-w-0">
          <Label htmlFor="company-create-email">Notification email <span className="font-normal text-muted-foreground">optional</span></Label>
          <Input
            id="company-create-email"
            type="email"
            value={fields.notificationEmail}
            maxLength={320}
            placeholder="Published company address"
            onChange={(event) => updateField("notificationEmail", event.target.value)}
            aria-invalid={!!fieldErrors.notificationEmail}
            data-testid="input-company-create-email"
          />
          {fieldErrors.notificationEmail && <p className="mt-1 text-xs text-destructive">{fieldErrors.notificationEmail}</p>}
        </div>
        <div className="min-w-0">
          <Label htmlFor="company-create-website">Website <span className="font-normal text-muted-foreground">optional</span></Label>
          <Input
            id="company-create-website"
            type="url"
            value={fields.website}
            maxLength={2000}
            placeholder="https://company.example"
            onChange={(event) => updateField("website", event.target.value)}
            aria-invalid={!!fieldErrors.website}
            data-testid="input-company-create-website"
          />
          {fieldErrors.website && <p className="mt-1 text-xs text-destructive">{fieldErrors.website}</p>}
        </div>
        <div className="min-w-0 sm:col-span-2">
          <Label htmlFor="company-create-source">Source / evidence <span className="font-normal text-muted-foreground">optional</span></Label>
          <Input
            id="company-create-source"
            value={fields.source}
            maxLength={500}
            placeholder="Published company page or other source"
            onChange={(event) => updateField("source", event.target.value)}
            aria-invalid={!!fieldErrors.source}
            data-testid="input-company-create-source"
          />
          {fieldErrors.source && <p className="mt-1 text-xs text-destructive">{fieldErrors.source}</p>}
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
          <p className="flex items-start gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
          {existingCompany && (
            <a
              className="mt-2 inline-flex min-h-10 items-center font-medium text-primary underline underline-offset-4"
              href={`/admin/companies?q=${encodeURIComponent(existingCompany.name)}`}
              data-testid="link-existing-company-directory-entry"
            >
              View existing directory entry: {existingCompany.name}
            </a>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending} data-testid="button-cancel-company-create">Cancel</Button>
        <Button type="button" onClick={handleCreate} disabled={pending} data-testid="button-save-company-create">
          <Plus className="mr-1.5 h-4 w-4" /> {pending ? "Saving company…" : "Save company"}
        </Button>
      </div>
    </section>
  );
}
