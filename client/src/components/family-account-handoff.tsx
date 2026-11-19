import { Mail, Phone, UserRoundCheck } from "lucide-react";

interface FamilyAccountHandoffProps {
  accountId: string | number;
  status: string;
  taskCompletionStatus?: string | null;
  selectedAction?: string | null;
  instructions?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

const actionLabels: Record<string, string> = {
  close: "Close this account",
  suspend: "Suspend this account",
  continue: "Continue this service",
  transfer: "Transfer this account or service",
};

export function FamilyAccountHandoff({
  accountId,
  status,
  taskCompletionStatus,
  selectedAction,
  instructions,
  contactPhone,
  contactEmail,
}: FamilyAccountHandoffProps) {
  const historicalStatus = status === "closed"
    ? "closed"
    : status === "suspended"
      ? "suspended"
      : taskCompletionStatus === "successful"
        ? "completed"
        : null;

  return (
    <section
      className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
      aria-label="Family account handoff"
      data-testid={`family-account-handoff-${accountId}`}
    >
      <div className="flex items-start gap-2">
        <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold">{historicalStatus ? "Family action record" : "Your family is responsible for this step"}</p>
            {selectedAction && actionLabels[selectedAction] && (
              <p className="mt-1 text-xs font-medium text-foreground">{actionLabels[selectedAction]}</p>
            )}
          </div>
          {historicalStatus && (
            <p className="text-xs leading-relaxed text-muted-foreground" data-testid={`family-account-history-${accountId}`}>
              This account is already marked {historicalStatus}. This is a recorded status, not a new action request.
            </p>
          )}
          <div className="border-t border-primary/10 pt-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Instructions from your concierge</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" data-testid={`family-account-instructions-${accountId}`}>
              {instructions?.trim() || "Your concierge has not added instructions yet."}
            </p>
          </div>
          {(contactPhone?.trim() || contactEmail?.trim()) && (
            <div className="space-y-1 border-t border-primary/10 pt-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Contact details provided by Steps After Life staff; they have not been automatically verified.
              </p>
              {contactPhone?.trim() && (
                <a
                  href={`tel:${contactPhone.trim()}`}
                  className="flex min-w-0 items-center gap-2 break-all text-sm font-medium text-primary hover:underline"
                  data-testid={`family-account-phone-${accountId}`}
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {contactPhone.trim()}
                </a>
              )}
              {contactEmail?.trim() && (
                <a
                  href={`mailto:${contactEmail.trim()}`}
                  className="flex min-w-0 items-center gap-2 break-all text-sm font-medium text-primary hover:underline"
                  data-testid={`family-account-email-${accountId}`}
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {contactEmail.trim()}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
