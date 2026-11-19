import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { savedCaseContactDraft } from "@/lib/case-contact-options";

type IdentityMetadata = {
  hasSsn: boolean;
  hasDob: boolean;
  contactToken: string;
  version: string | null;
};

type PrivateValues = { ssn: string | null; dob: string | null };
type Draft = { ssn: string; dob: string };

const endpointFor = (certificate: any) => {
  const id = certificate?.id ?? certificate?.certificateId ?? certificate?.certId;
  return id == null ? null : `/api/admin/case/${encodeURIComponent(String(id))}/next-of-kin-private-identity`;
};

function privateResponseIsValid(value: any): value is PrivateValues & IdentityMetadata {
  return value && (typeof value.ssn === "string" || value.ssn === null) &&
    (typeof value.dob === "string" || value.dob === null) &&
    typeof value.hasSsn === "boolean" && typeof value.hasDob === "boolean" &&
    typeof value.contactToken === "string" && value.contactToken.length === 64 &&
    (typeof value.version === "string" || value.version === null);
}

export function NextOfKinPrivateIdentity({
  certificate,
  contactEditing,
}: {
  certificate: any;
  contactEditing: boolean;
}) {
  const contact = savedCaseContactDraft("nextOfKin", certificate);
  const hasSavedName = contact.nextOfKinName.trim().length >= 2;
  const endpoint = endpointFor(certificate);
  const [metadata, setMetadata] = useState<IdentityMetadata | null>(null);
  const [metadataState, setMetadataState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [revealed, setRevealed] = useState<PrivateValues | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [pending, setPending] = useState<"reveal" | "save" | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const metadataRequest = useRef(0);
  const contactEditingRef = useRef(contactEditing);
  contactEditingRef.current = contactEditing;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = contactEditing || !hasSavedName;

  const clearSensitive = useCallback(() => {
    generation.current += 1;
    setRevealed(null);
    setDraft(null);
    setEditing(false);
    setShowDraft(false);
    setPending(null);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const refreshMetadata = useCallback(async () => {
    const request = ++metadataRequest.current;
    if (!endpoint) {
      setMetadata(null);
      setMetadataState("unavailable");
      return;
    }
    setMetadataState("loading");
    try {
      const response = await apiRequest("GET", endpoint);
      const result = await response.json();
      if (request !== metadataRequest.current) return;
      if (
        typeof result?.hasSsn !== "boolean" ||
        typeof result?.hasDob !== "boolean" ||
        typeof result?.contactToken !== "string" ||
        !(typeof result?.version === "string" || result?.version === null)
      ) {
        throw new Error("Invalid identity metadata");
      }
      setMetadata({
        hasSsn: result.hasSsn,
        hasDob: result.hasDob,
        contactToken: result.contactToken,
        version: result.version,
      });
      setMetadataState("ready");
    } catch {
      if (request !== metadataRequest.current) return;
      setMetadata(null);
      setMetadataState("unavailable");
    }
  }, [endpoint]);

  useEffect(() => {
    if (!contactEditing) void refreshMetadata();
    else {
      metadataRequest.current += 1;
      clearSensitive();
    }
    return () => {
      metadataRequest.current += 1;
      clearSensitive();
    };
  }, [clearSensitive, contactEditing, refreshMetadata]);

  useEffect(() => {
    if (!revealed && !editing) return;
    timer.current = setTimeout(clearSensitive, 60_000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [clearSensitive, editing, revealed]);

  useEffect(() => {
    const clearWhenHidden = () => {
      if (document.visibilityState === "hidden") clearSensitive();
    };
    const clearOnBlur = () => clearSensitive();
    document.addEventListener("visibilitychange", clearWhenHidden);
    window.addEventListener("blur", clearOnBlur);
    return () => {
      document.removeEventListener("visibilitychange", clearWhenHidden);
      window.removeEventListener("blur", clearOnBlur);
    };
  }, [clearSensitive]);

  const reveal = async () => {
    if (locked || !endpoint || !metadata || pending) return;
    const requestGeneration = generation.current;
    setPending("reveal");
    setError("");
    try {
      const response = await fetch(`${endpoint}/reveal`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
        body: JSON.stringify({ contactToken: metadata.contactToken }),
      });
      if (!response.ok) throw new Error("Request unavailable");
      const result = await response.json();
      if (requestGeneration !== generation.current || contactEditingRef.current) return;
      if (!privateResponseIsValid(result)) throw new Error("Invalid identity response");
      setMetadata({
        hasSsn: result.hasSsn,
        hasDob: result.hasDob,
        contactToken: result.contactToken,
        version: result.version,
      });
      setRevealed({ ssn: result.ssn, dob: result.dob });
    } catch {
      if (requestGeneration === generation.current) setError("Could not reveal private details. Please try again.");
    } finally {
      if (requestGeneration === generation.current) setPending(null);
    }
  };

  const beginEdit = () => {
    if (locked || !metadata || pending) return;
    if ((metadata.hasSsn || metadata.hasDob) && !revealed) return;
    setDraft({
      ssn: revealed?.ssn ?? "",
      dob: revealed?.dob ?? "",
    });
    setRevealed(null);
    setEditing(true);
    setShowDraft(false);
    setError("");
  };

  const save = async () => {
    if (locked || !endpoint || !metadata || !draft || pending) return;
    const removesSavedValue = (metadata.hasSsn && !draft.ssn.trim()) || (metadata.hasDob && !draft.dob.trim());
    if (removesSavedValue && !window.confirm("A blank field removes its saved value. Continue saving?")) return;
    const requestGeneration = generation.current;
    setPending("save");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
        body: JSON.stringify({
          ssn: draft.ssn.trim() || null,
          dob: draft.dob.trim() || null,
          contactToken: metadata.contactToken,
          version: metadata.version,
        }),
      });
      if (!response.ok) throw new Error("Save unavailable");
      if (requestGeneration !== generation.current || contactEditingRef.current) return;
      setRevealed(null);
      setDraft(null);
      setEditing(false);
      setShowDraft(false);
      setPending(null);
      await refreshMetadata();
    } catch {
      if (requestGeneration === generation.current) {
        setPending(null);
        setError("Could not save. Check the nine-digit SSN and birth date. If another staff member changed these details, cancel and reopen before trying again.");
      }
    }
  };

  if (!hasSavedName) return null;
  const available = metadataState === "ready" && !!metadata;
  const shownMetadata = locked ? null : metadata;
  const shownValues = locked ? null : revealed;
  const isRevealed = !!shownValues;

  return (
    <section aria-labelledby="next-of-kin-private-identity-title" className="min-w-0 rounded-lg border border-amber-800/20 bg-amber-50/55 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="next-of-kin-private-identity-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LockKeyhole className="h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
            Private identity details
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Collect only when required for an authorized transfer. Hidden by default; never sent automatically.
          </p>
          {(editing || isRevealed) && (
            <p className="mt-1 text-xs text-muted-foreground">Automatically hides after 60 seconds or when you leave this window.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <>
              {isRevealed ? (
                <Button type="button" size="sm" variant="outline" onClick={clearSensitive} disabled={locked}>
                  <EyeOff className="mr-1.5 h-4 w-4" /> Hide
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={reveal} disabled={locked || !available || pending !== null}>
                  <Eye className="mr-1.5 h-4 w-4" />
                  {pending === "reveal" ? "Loading…" : "Show"}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={beginEdit} disabled={locked || !available || pending !== null || (!!shownMetadata && (shownMetadata.hasSsn || shownMetadata.hasDob) && !isRevealed)} aria-label="Edit private identity details">
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={clearSensitive} disabled={pending === "save"}>
                <X className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={locked || pending !== null}>
                <Save className="mr-1.5 h-4 w-4" /> {pending === "save" ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {contactEditing ? (
        <p className="mt-3 rounded-md border border-amber-900/10 bg-background/65 px-3 py-2 text-sm text-muted-foreground">
          Save the contact details before viewing or editing private identity information.
        </p>
      ) : metadataState === "loading" ? (
        <div className="mt-3 space-y-2" aria-label="Loading private identity status">
          <div className="h-4 w-40 animate-pulse rounded bg-amber-900/10" />
          <div className="h-4 w-48 animate-pulse rounded bg-amber-900/10" />
        </div>
      ) : metadataState === "unavailable" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/20 bg-background/65 px-3 py-2">
          <p role="status" className="text-sm text-muted-foreground">Private identity status is unavailable.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void refreshMetadata()}>Try again</Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            <span className="font-medium">Social Security number:</span>{" "}
            {isRevealed ? shownValues?.ssn || "Not provided" : shownMetadata?.hasSsn ? "SSN on file" : "Not provided"}
          </p>
          <p className="text-sm">
            <span className="font-medium">Date of birth:</span>{" "}
            {isRevealed ? shownValues?.dob || "Not provided" : shownMetadata?.hasDob ? "Date of birth on file" : "Not provided"}
          </p>
          {shownMetadata && (shownMetadata.hasSsn || shownMetadata.hasDob) && !isRevealed && !editing && (
            <p className="text-xs text-muted-foreground">Reveal saved values before editing so existing details are not accidentally removed.</p>
          )}
          {editing && draft && (
            <div className="mt-3 grid min-w-0 gap-3 rounded-md border border-amber-900/10 bg-background/75 p-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="nok-private-ssn" className="mb-1 block text-xs font-medium">Social Security number</label>
                <Input
                  id="nok-private-ssn"
                  type={showDraft ? "text" : "password"}
                  value={draft.ssn}
                  onChange={(event) => setDraft((current) => current ? { ...current, ssn: event.target.value } : current)}
                  placeholder="Enter SSN"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending === "save"}
                  aria-describedby="nok-private-edit-warning"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="nok-private-dob" className="mb-1 block text-xs font-medium">Date of birth</label>
                <Input
                  id="nok-private-dob"
                  type={showDraft ? "date" : "password"}
                  value={draft.dob}
                  onChange={(event) => setDraft((current) => current ? { ...current, dob: event.target.value } : current)}
                  placeholder="YYYY-MM-DD"
                  autoComplete="off"
                  disabled={pending === "save"}
                  aria-describedby="nok-private-edit-warning"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowDraft((shown) => !shown)} aria-pressed={showDraft}>
                  {showDraft ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
                  {showDraft ? "Hide inputs" : "Show inputs"}
                </Button>
                <p id="nok-private-edit-warning" className="text-xs leading-relaxed text-muted-foreground">
                  Both fields are hidden while editing. Leaving a saved field blank removes that value.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {error && !contactEditing && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
