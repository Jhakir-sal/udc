import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ReminderKind = "id" | "owner_approval";

interface FamilySafeguardReminderProps {
  certificateId: string;
  userId: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  kind?: ReminderKind;
}

interface ReminderResult {
  emailSent: true;
  recipientEmail: string;
  requestedAt: string;
}

export function FamilySafeguardReminder({
  certificateId,
  userId,
  recipientName,
  recipientEmail,
  kind = "id",
}: FamilySafeguardReminderProps) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ReminderResult | null>(null);
  const [attempted, setAttempted] = useState(false);
  const label = kind === "owner_approval" ? "Remind owner to approve" : "Send ID needed";
  const destination = kind === "owner_approval"
    ? "the case owner’s account email"
    : recipientEmail || "the family member’s account email";

  const reminder = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/admin/case/${encodeURIComponent(certificateId)}/family-members/${encodeURIComponent(userId)}/remind`,
        { kind, confirmed: true },
      );
      return response.json() as Promise<ReminderResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/case", certificateId, "family-authorizations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/case/${certificateId}/family-authorizations`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certificateId, "family-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/case", certificateId, "events"] });
    },
  });

  return (
    <div className="flex flex-col items-start gap-1.5" data-testid={`family-safeguard-reminder-${kind}-${userId}`}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 text-xs transition-colors hover:border-teal-600/50 hover:bg-teal-50/70 focus-visible:ring-teal-700"
        onClick={() => setOpen(true)}
        disabled={reminder.isPending || attempted || !certificateId || !userId}
        data-testid={`button-family-reminder-${kind}-${userId}`}
      >
        <Mail className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>

      {reminder.isError && (
        <p role="alert" className="flex max-w-sm items-start gap-1.5 text-xs text-destructive" data-testid={`family-reminder-error-${userId}`}>
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{reminder.error instanceof Error ? reminder.error.message : "Reminder could not be requested. Please review the case status."}</span>
        </p>
      )}
      {result && (
        <div role="status" className="text-xs text-teal-800 dark:text-teal-300" data-testid={`family-reminder-success-${userId}`}>
          <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Reminder accepted for delivery</p>
          <p className="mt-0.5 text-muted-foreground">
            {new Date(result.requestedAt).toLocaleString()} · {result.recipientEmail}
          </p>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!reminder.isPending) setOpen(nextOpen); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipientName ? `For ${recipientName}. ` : ""}This will send one individual email to{" "}
              <span className="break-all font-medium text-foreground">{destination}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-md border border-teal-900/10 bg-teal-50/60 p-3 text-sm text-foreground dark:bg-teal-950/20">
            <p>The recipient must sign in to continue.</p>
            <p>This reminder grants no case access.</p>
            <p>Limited to one reminder of this type per recipient, per case, each hour.</p>
            <p>Never reply to the email with ID documents.</p>
          </div>
          {reminder.isError && (
            <p role="alert" className="text-sm text-destructive" data-testid={`family-reminder-dialog-error-${userId}`}>
              {reminder.error instanceof Error ? reminder.error.message : "The reminder could not be requested."}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reminder.isPending} data-testid={`button-cancel-family-reminder-${userId}`}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reminder.isPending || attempted}
              onClick={(event) => {
                event.preventDefault();
                if (!reminder.isPending && !attempted) {
                  setAttempted(true);
                  reminder.mutate();
                }
              }}
              data-testid={`button-confirm-family-reminder-${kind}-${userId}`}
            >
              {reminder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm reminder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
