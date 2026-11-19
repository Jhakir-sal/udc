import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Check, RotateCcw, Save } from "lucide-react";
import type { ConnectedAccount } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PrivateAccountNotesProps = {
  certificateId: string;
  accountId: string;
  savedNotes: string | null;
};

export function PrivateAccountNotes({ certificateId, accountId, savedNotes }: PrivateAccountNotesProps) {
  const initialNotes = savedNotes ?? "";
  const [notes, setNotes] = useState(initialNotes);
  const [persistedNotes, setPersistedNotes] = useState(initialNotes);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const submittingRef = useRef(false);
  const lastReceivedNotes = useRef(initialNotes);
  useEffect(() => {
    if (lastReceivedNotes.current === initialNotes) return;
    lastReceivedNotes.current = initialNotes;
    if (submittingRef.current) return;
    setPersistedNotes(initialNotes);
    setNotes(current => current === persistedNotes ? initialNotes : current);
  }, [initialNotes, persistedNotes]);
  const saveNotes = useMutation({
    mutationFn: async (value: string) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/case/${encodeURIComponent(certificateId)}/accounts/${encodeURIComponent(accountId)}`,
        { notes: value },
      );
      const updated = await response.json() as ConnectedAccount;
      if (updated.id !== accountId || updated.certificateId !== certificateId ||
          !(updated.notes === null || typeof updated.notes === "string")) {
        throw new Error("The server did not confirm these account notes. Your text is still here; refresh before trying again.");
      }
      return updated;
    },
  });
  const isDirty = notes !== persistedNotes;

  const handleSave = async () => {
    if (!isDirty || submittingRef.current || saveNotes.isPending) return;
    submittingRef.current = true;
    setError("");
    setSaved(false);
    try {
      const updated = await saveNotes.mutateAsync(notes);
      const nextNotes = updated.notes ?? "";
      setNotes(nextNotes);
      setPersistedNotes(nextNotes);
      setSaved(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certificateId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/accounts", accountId, "company-notification"] }),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save private notes. Your text is still here; try again.");
    } finally {
      submittingRef.current = false;
    }
  };

  const handleCancel = () => {
    setNotes(persistedNotes);
    setError("");
    setSaved(false);
  };

  return (
    <section className="min-w-0 rounded-xl border border-amber-500/25 bg-amber-50/50 p-3 sm:p-4" aria-labelledby="private-account-notes-title">
      <div className="mb-2">
        <h3 id="private-account-notes-title" className="text-sm font-semibold">Private SAL team notes only</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Internal account notes. Never included in company email or shared with the family.
        </p>
      </div>
      <label htmlFor="private-account-notes-input" className="sr-only">Private SAL team account notes</label>
      <Textarea
        id="private-account-notes-input"
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value);
          setError("");
          setSaved(false);
        }}
        maxLength={20000}
        rows={4}
        placeholder="Add private staff notes for this account"
        disabled={saveNotes.isPending}
        data-testid="textarea-private-account-notes"
        aria-describedby="private-account-notes-status"
      />
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id="private-account-notes-status" aria-live="polite" className="min-h-5 text-xs text-muted-foreground">
          {saveNotes.isPending ? (
            "Saving private notes…"
          ) : error ? (
            <span role="alert" className="flex items-start gap-1.5 text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </span>
          ) : isDirty ? (
            `Unsaved changes · ${notes.length.toLocaleString()} / 20,000 characters`
          ) : saved ? (
            <span className="flex items-center gap-1.5 text-primary"><Check className="h-3.5 w-3.5" /> Private notes saved</span>
          ) : (
            `${persistedNotes.length.toLocaleString()} / 20,000 characters · saved privately`
          )}
        </p>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={!isDirty || saveNotes.isPending}
            data-testid="button-cancel-private-account-notes"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saveNotes.isPending}
            data-testid="button-save-private-account-notes"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" /> {saveNotes.isPending ? "Saving…" : "Save notes"}
          </Button>
        </div>
      </div>
    </section>
  );
}
