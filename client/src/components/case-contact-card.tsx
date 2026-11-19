import { useState } from "react";
import { Edit2, Loader2, Phone, Plus, Save, User, Users, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneActions } from "@/components/phone-actions";
import { NextOfKinPrivateIdentity } from "@/components/next-of-kin-private-identity";
import { formatPhone } from "@/lib/utils";
import {
  caseContactPayload,
  caseContactRoleFields,
  emptyCaseContactDraft,
  mapCandidateToCaseContact,
  savedCaseContactDraft,
  type CaseContactDraft,
  type CaseContactRole,
  type ContactCandidate,
} from "@/lib/case-contact-options";

const roleLabels: Record<CaseContactRole, string> = {
  nextOfKin: "Next of Kin",
  primaryContact: "Primary Contact",
  informant: "Informant",
};

const fieldLabels: Record<keyof CaseContactDraft, string> = {
  nextOfKinName: "Full Name",
  nextOfKinRelationship: "Relationship",
  nextOfKinPhone: "Phone",
  nextOfKinEmail: "Email",
  nextOfKinAddress: "Street Address",
  nextOfKinCity: "City",
  nextOfKinState: "State",
  nextOfKinZip: "Zip Code",
  contactName: "Full Name",
  contactPhone: "Phone",
  contactEmail: "Email",
  contactAddress: "Address",
  informantName: "Full Name",
  informantRelationship: "Relationship",
  informantPhone: "Phone",
  informantEmail: "Email",
  informantAddress: "Address",
};

function hasMeaningfulContent(draft: CaseContactDraft, fields: (keyof CaseContactDraft)[]) {
  return fields.some((field) => draft[field].trim().length > 0);
}

export function CaseContactCard({
  role,
  certificate,
  options,
  isSaving,
  onSave,
}: {
  role: CaseContactRole;
  certificate: any;
  options: ContactCandidate[];
  isSaving: boolean;
  onSave: (payload: Record<string, string>) => Promise<unknown>;
}) {
  const title = roleLabels[role];
  const fields = caseContactRoleFields(role);
  const original = savedCaseContactDraft(role, certificate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CaseContactDraft>(original);
  const [mode, setMode] = useState<"edit" | "new" | "candidate">("edit");
  const [selectedId, setSelectedId] = useState("");
  const [saveError, setSaveError] = useState("");
  const nameField = fields[0];
  const testRole = role === "nextOfKin" ? "next-of-kin" : role === "primaryContact" ? "primary-contact" : "informant";

  const isDirty = editing && (fields.some((field) => draft[field] !== original[field]) || mode !== "edit");
  const confirmDiscard = () => !isDirty || window.confirm("Discard these unsaved contact changes?");

  const selectCandidate = (id: string) => {
    if (isSaving || !id) return;
    if (!confirmDiscard()) return;
    const candidate = options.find((option) => option.id === id);
    if (!candidate) return;
    setDraft(mapCandidateToCaseContact(role, candidate));
    setMode("candidate");
    setSelectedId(id);
    setSaveError("");
    setEditing(true);
  };

  const addPerson = () => {
    if (isSaving || !confirmDiscard()) return;
    setDraft(emptyCaseContactDraft());
    setMode("new");
    setSelectedId("");
    setSaveError("");
    setEditing(true);
  };

  const editCurrent = () => {
    if (isSaving) return;
    if (editing && !confirmDiscard()) return;
    setDraft(original);
    setMode("edit");
    setSelectedId("");
    setSaveError("");
    setEditing(true);
  };

  const cancel = () => {
    if (isSaving) return;
    setDraft(original);
    setMode("edit");
    setSelectedId("");
    setSaveError("");
    setEditing(false);
  };

  const save = async () => {
    if (isSaving) return;
    if (draft[nameField].trim().length < 2) {
      setSaveError("Enter a full name before saving.");
      return;
    }
    setSaveError("");
    try {
      await onSave(caseContactPayload(role, draft));
      setEditing(false);
      setMode("edit");
      setSelectedId("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this contact. Please try again.");
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {role === "nextOfKin" ? <Users className="h-4 w-4" /> : role === "primaryContact" ? <Phone className="h-4 w-4" /> : <User className="h-4 w-4" />}
            {title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            {!editing && (
              <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${title}`} onClick={editCurrent} disabled={isSaving} data-testid={`button-edit-${title.toLowerCase().replace(/\s/g, "-")}`}>
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {editing && (
              <>
                <Button type="button" size="sm" variant="ghost" aria-label={`Cancel editing ${title}`} onClick={cancel} disabled={isSaving} data-testid={`button-cancel-${title.toLowerCase().replace(/\s/g, "-")}`}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">Cancel</span>
                </Button>
                <Button type="button" size="sm" aria-label={`Save ${title}`} onClick={save} disabled={isSaving} data-testid={`button-save-${title.toLowerCase().replace(/\s/g, "-")}`}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span className="sr-only">Save</span>
                </Button>
              </>
            )}
              <Button type="button" size="sm" variant="outline" onClick={addPerson} disabled={isSaving} data-testid={`add-contact-${testRole}`}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add person
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`contact-picker-${role}`} className="text-xs font-medium text-muted-foreground">Reuse a person from this case</label>
          <select
            id={`contact-picker-${role}`}
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedId}
            onChange={(event) => selectCandidate(event.target.value)}
            disabled={isSaving}
            aria-label={`Choose an existing case person for ${title}`}
            data-testid={`contact-picker-${testRole}`}
          >
            <option value="">Choose a saved case person…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}{option.email ? ` · ${option.email}` : ""} — {option.source}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-primary/15 bg-primary/[0.035] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current saved {title}</p>
          {hasMeaningfulContent(original, fields) ? (
            <div className="mt-1 space-y-1">
              {fields.map((field) => {
                const value = original[field];
                if (!value) return null;
                if (field.endsWith("Phone")) return <PhoneActions key={field} phoneNumber={value} contactName={original[nameField]} />;
                return <p key={field} className={`text-sm ${field.endsWith("Email") ? "break-all" : "break-words"}`}><span className="text-muted-foreground">{fieldLabels[field]}: </span>{value}</p>;
              })}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No contact details recorded.</p>
          )}
        </div>

        {role === "nextOfKin" && (
          <NextOfKinPrivateIdentity
            key={JSON.stringify([
              certificate?.id ?? certificate?.certificateId ?? certificate?.certId ?? "",
              original.nextOfKinName,
              original.nextOfKinEmail,
              original.nextOfKinPhone,
              original.nextOfKinRelationship,
            ])}
            certificate={certificate}
            contactEditing={editing}
          />
        )}

        {editing && (
          <div className="space-y-3 rounded-md border bg-background p-3">
            <div>
              <p className="text-sm font-semibold">
                {mode === "new" ? `Add person as ${title}` : mode === "candidate" ? "Review selected person" : `Edit ${title}`}
              </p>
              {mode === "candidate" && selectedId && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Source: {options.find((option) => option.id === selectedId)?.source}
                  {options.find((option) => option.id === selectedId)?.email ? ` · ${options.find((option) => option.id === selectedId)?.email}` : ""}
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => {
                const label = fieldLabels[field];
                const isPhone = field.endsWith("Phone");
                const isEmail = field.endsWith("Email");
                return (
                  <div key={field} className={field.endsWith("Address") ? "sm:col-span-2" : ""}>
                    <label htmlFor={`contact-${role}-${field}`} className="mb-1 block text-xs text-muted-foreground">{label}{field === nameField ? " *" : ""}</label>
                    <Input
                      id={`contact-${role}-${field}`}
                      value={isPhone ? formatPhone(draft[field]) : draft[field]}
                      onChange={(event) => setDraft((current) => ({ ...current, [field]: isPhone ? formatPhone(event.target.value) : event.target.value }))}
                      placeholder={label}
                      type={isEmail ? "email" : isPhone ? "tel" : "text"}
                      disabled={isSaving}
                      autoComplete={isEmail ? "email" : isPhone ? "tel" : undefined}
                      data-testid={`input-${field}`}
                    />
                  </div>
                );
              })}
            </div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Selecting a contact does not grant case access or verify legal authority.</p>
      </CardContent>
    </Card>
  );
}
