import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Check, RotateCcw, Save, ShieldCheck } from "lucide-react";
import type { NotificationCompany } from "@shared/accountCompanyNotification";
import { emailMatchesCompanyDomain } from "@shared/companyEmailRouting";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanyEmailEditorProps = {
  company: NotificationCompany;
  accountId: string;
  disabled?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
};

type UpdatedCompany = NotificationCompany & {
  verifiedAt?: string | null;
  verifiedBy?: string | null;
};

type VerifyRoutingPayload = {
  expectedEmail: string;
  expectedDomain: string;
  approveAlternateDomain?: true;
  reason?: string;
};

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function refreshCompanyContext(accountId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/admin/company-directory"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/company-directory"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/admin/accounts", accountId, "company-notification"] }),
  ]);
}

export function CompanyEmailEditor({ company, accountId, disabled = false, onDirtyChange, onPendingChange }: CompanyEmailEditorProps) {
  const initialEmail = company.notificationEmail ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [savedEmail, setSavedEmail] = useState(initialEmail);
  const [confirmedDepartment, setConfirmedDepartment] = useState(false);
  const [alternateReason, setAlternateReason] = useState("");
  const [confirmedAlternateRecipient, setConfirmedAlternateRecipient] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [working, setWorking] = useState(false);
  const actionInFlight = useRef(false);
  const lastDirectoryEmail = useRef(initialEmail);
  const lastCanEmail = useRef(company.canEmail);
  const lastOfficialDomain = useRef(company.officialDomain);
  const saving = useMutation({
    mutationFn: async (notificationEmail: string | null) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/company-directory/${encodeURIComponent(company.id)}`,
        { notificationEmail },
      );
      return response.json() as Promise<UpdatedCompany>;
    },
  });
  const verify = useMutation({
    mutationFn: async (payload: VerifyRoutingPayload) => {
      await apiRequest("POST", `/api/admin/company-directory/${encodeURIComponent(company.id)}/verify-routing`, payload);
    },
  });
  const pending = working || saving.isPending || verify.isPending;
  const isDirty = email !== savedEmail;
  const trimmedEmail = email.trim();
  const savedEmailTrimmed = savedEmail.trim();
  const domainMatches = !!savedEmailTrimmed && emailMatchesCompanyDomain(savedEmailTrimmed, company.officialDomain);
  const alternateReasonTrimmed = alternateReason.trim();
  const alternateReasonValid = alternateReasonTrimmed.length >= 20 && alternateReasonTrimmed.length <= 1000;
  const active = company.status.toLowerCase() === "active";
  const emailError = trimmedEmail.length > 320
    ? "Email address must be 320 characters or fewer."
    : trimmedEmail && !validEmail(trimmedEmail)
      ? "Enter a valid email address, or clear the field to remove it."
      : "";

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  useEffect(() => () => {
    onDirtyChange(false);
    onPendingChange(false);
  }, [onDirtyChange, onPendingChange]);

  useEffect(() => {
    const nextEmail = company.notificationEmail ?? "";
    if (nextEmail === lastDirectoryEmail.current) return;
    lastDirectoryEmail.current = nextEmail;
    setSavedEmail(nextEmail);
    setConfirmedDepartment(false);
    setAlternateReason("");
    setConfirmedAlternateRecipient(false);
    if (!isDirty && !pending) setEmail(nextEmail);
  }, [company.notificationEmail, isDirty, pending]);

  useEffect(() => {
    if (lastOfficialDomain.current === company.officialDomain) return;
    lastOfficialDomain.current = company.officialDomain;
    setConfirmedDepartment(false);
    setAlternateReason("");
    setConfirmedAlternateRecipient(false);
  }, [company.officialDomain]);

  useEffect(() => {
    if (lastCanEmail.current !== company.canEmail) {
      lastCanEmail.current = company.canEmail;
      setConfirmedDepartment(false);
    }
  }, [company.canEmail]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    onDirtyChange(value !== savedEmail);
    setConfirmedDepartment(false);
    setAlternateReason("");
    setConfirmedAlternateRecipient(false);
    setError("");
    setFeedback("");
    setSaved(false);
  };

  const handleCancel = () => {
    setEmail(savedEmail);
    onDirtyChange(false);
    setConfirmedDepartment(false);
    setAlternateReason("");
    setConfirmedAlternateRecipient(false);
    setError("");
    setFeedback("");
    setSaved(false);
  };

  const handleSave = async () => {
    if (!isDirty || pending || disabled || actionInFlight.current || !active) return;
    if (emailError) {
      setError(emailError);
      setFeedback("");
      return;
    }
    const nextEmail = trimmedEmail || null;
    actionInFlight.current = true;
    setWorking(true);
    onPendingChange(true);
    setError("");
    setFeedback("");
    setSaved(false);
    try {
      const updated = await saving.mutateAsync(nextEmail);
      if (!updated || String(updated.id) !== company.id ||
        !(updated.notificationEmail === null || typeof updated.notificationEmail === "string")) {
        throw new Error("The saved company did not match this account. Your email draft is still here.");
      }
      const persistedEmail = updated.notificationEmail ?? "";
      setEmail(persistedEmail);
      setSavedEmail(persistedEmail);
      setConfirmedDepartment(false);
      setAlternateReason("");
      setConfirmedAlternateRecipient(false);
      setSaved(true);
      try {
        await refreshCompanyContext(accountId);
      } catch {
        setFeedback("Email saved. Company status could not refresh; check again before reviewing routing.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save email. Your draft is still here; try again.");
    } finally {
      actionInFlight.current = false;
      setWorking(false);
      onPendingChange(false);
    }
  };

  const handleVerify = async () => {
    if (pending || disabled || actionInFlight.current || !active || isDirty || !savedEmailTrimmed || !domainMatches || !confirmedDepartment) return;
    actionInFlight.current = true;
    setWorking(true);
    onPendingChange(true);
    setError("");
    setFeedback("");
    setSaved(false);
    try {
      await verify.mutateAsync({
        expectedEmail: savedEmailTrimmed,
        expectedDomain: company.officialDomain,
      });
      setConfirmedDepartment(false);
      setFeedback("Routing verification action completed. Check the refreshed context before reviewing or sending.");
      try {
        await refreshCompanyContext(accountId);
      } catch {
        setFeedback("Routing verification ran, but company status could not refresh. Check again before reviewing or sending.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify routing. No message was sent.");
    } finally {
      actionInFlight.current = false;
      setWorking(false);
      onPendingChange(false);
    }
  };

  const handleApproveAlternateEmail = async () => {
    if (
      pending || disabled || actionInFlight.current || !active || isDirty ||
      !savedEmailTrimmed || domainMatches || !alternateReasonValid || !confirmedAlternateRecipient
    ) return;
    actionInFlight.current = true;
    setWorking(true);
    onPendingChange(true);
    setError("");
    setFeedback("");
    setSaved(false);
    try {
      await verify.mutateAsync({
        expectedEmail: savedEmailTrimmed,
        expectedDomain: company.officialDomain,
        approveAlternateDomain: true,
        reason: alternateReasonTrimmed,
      });
      setConfirmedDepartment(false);
      setConfirmedAlternateRecipient(false);
      setAlternateReason("");
      setFeedback("Alternate routing approval submitted. Check the refreshed context before reviewing or sending.");
      try {
        await refreshCompanyContext(accountId);
      } catch {
        setFeedback("Approval was submitted, but company status could not refresh. Check again before reviewing or sending.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve alternate routing. No message was sent.");
    } finally {
      actionInFlight.current = false;
      setWorking(false);
      onPendingChange(false);
    }
  };

  return (
    <section className="mt-3 min-w-0 rounded-lg border bg-background p-3 sm:p-4" aria-labelledby={`company-email-title-${company.id}`} data-testid="company-email-editor">
      <div className="mb-3">
        <h4 id={`company-email-title-${company.id}`} className="text-sm font-semibold">Who should receive the link?</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This address is shared directory information used across accounts. Saving it does not verify routing or send email.
        </p>
      </div>

      {!active ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-50/60 p-3 text-sm text-amber-950">
          <p className="font-medium">This directory company is inactive.</p>
          <p className="mt-2 break-all"><span className="font-medium">Saved notification email:</span> {savedEmailTrimmed || "None"}</p>
          <p className="mt-1">Email editing and routing verification are read-only here. Use company setup to review its status.</p>
          <a className="mt-2 inline-flex min-h-10 items-center font-medium underline underline-offset-4" href={`/admin/companies?q=${encodeURIComponent(company.name)}`}>
            Open company setup
          </a>
        </div>
      ) : (
        <>
          <div className="min-w-0">
            <Label htmlFor={`company-notification-email-${company.id}`}>Recipient email</Label>
            <Input
              id={`company-notification-email-${company.id}`}
              type="email"
              maxLength={320}
              value={email}
              onChange={(event) => handleEmailChange(event.target.value)}
              disabled={pending || disabled}
              aria-invalid={!!emailError || !!error}
              aria-describedby={`company-email-help-${company.id}`}
              placeholder="name@company.com"
              data-testid="input-company-notification-email"
            />
            <p id={`company-email-help-${company.id}`} className="mt-1 text-xs text-muted-foreground">
              Official domain: <span className="break-all font-medium text-foreground">{company.officialDomain}</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              The part before @ may vary; the official domain and its true subdomains match. Other domains need explicit approval. Typo-similar domains never qualify automatically.
            </p>
          </div>

          {emailError && <p role="alert" className="mt-2 text-xs text-destructive">{emailError}</p>}

          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            {isDirty ? "Unsaved email change. Save it before routing can be reviewed." : savedEmailTrimmed ? (
              company.canEmail && company.routingExceptionApproved
                ? `Approved alternate recipient · ${company.recipient || savedEmailTrimmed}`
                : company.canEmail && company.recipient
                  ? `Verified recipient · ${company.recipient}`
                : "Saved email candidate · routing is not verified."
            ) : "No notification email is saved."}
          </p>

          {domainMatches && savedEmailTrimmed && !isDirty && !company.canEmail && (
            <div className="mt-3 rounded-md border border-primary/20 bg-primary/[.035] p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  checked={confirmedDepartment}
                  onChange={(event) => setConfirmedDepartment(event.target.checked)}
                  disabled={pending || disabled}
                  data-testid="checkbox-confirm-death-notification-department"
                />
                <span>I confirm this saved address is accepted by the company’s death-notification department.</span>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                Staff confirmation only. This does not send a test email; routing verification is a separate explicit action.
              </p>
            </div>
          )}

          {savedEmailTrimmed && !domainMatches && !isDirty && !company.canEmail && (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-50/60 p-3 text-sm text-amber-950" data-testid="alternate-email-approval-panel">
              <p className="font-medium">This saved address is outside the company’s recognized domain.</p>
              <p className="mt-1 text-xs leading-relaxed">
                Approve only after independently confirming this is the company’s death-reporting recipient. Similar-looking domains are not evidence.
              </p>
              <div className="mt-3">
                <Label htmlFor={`alternate-routing-reason-${company.id}`}>Reason for alternate-domain approval</Label>
                <textarea
                  id={`alternate-routing-reason-${company.id}`}
                  value={alternateReason}
                  onChange={(event) => setAlternateReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  disabled={pending || disabled}
                  aria-describedby={`alternate-routing-reason-help-${company.id}`}
                  className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="input-alternate-routing-reason"
                />
                <p id={`alternate-routing-reason-help-${company.id}`} className="mt-1 text-xs text-muted-foreground">
                  Provide 20–1000 characters. {alternateReasonTrimmed.length}/1000
                </p>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={confirmedAlternateRecipient}
                  onChange={(event) => setConfirmedAlternateRecipient(event.target.checked)}
                  disabled={pending || disabled}
                  data-testid="checkbox-confirm-alternate-routing-recipient"
                />
                <span>I independently verified this is the company’s death-reporting recipient.</span>
              </label>
            </div>
          )}

          {error && <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
          {feedback && <p role="status" className="mt-2 text-xs text-muted-foreground">{feedback}</p>}
          {saved && !feedback && <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-primary"><Check className="h-3.5 w-3.5" />Email saved; routing remains subject to refreshed verification status.</p>}

          <div className="mt-3 flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleCancel} disabled={!isDirty || pending} data-testid="button-cancel-company-email">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || !!emailError || pending || disabled} data-testid="button-save-company-email">
                <Save className="mr-1.5 h-3.5 w-3.5" />{saving.isPending ? "Saving email…" : "Save email"}
              </Button>
            </div>
            {domainMatches ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleVerify}
                disabled={!active || pending || disabled || isDirty || !savedEmailTrimmed || company.canEmail || !confirmedDepartment}
                data-testid="button-verify-company-email"
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />{verify.isPending ? "Verifying routing…" : "Verify saved email"}
              </Button>
            ) : savedEmailTrimmed && !company.canEmail ? (
              <Button
                type="button"
                size="sm"
                onClick={handleApproveAlternateEmail}
                disabled={!active || pending || disabled || isDirty || !alternateReasonValid || !confirmedAlternateRecipient}
                data-testid="button-approve-alternate-email"
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />{verify.isPending ? "Submitting approval…" : "Approve alternate email"}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
