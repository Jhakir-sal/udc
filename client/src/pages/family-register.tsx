import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Heart, Loader2, Mail, RefreshCw, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SignupConsent } from "@/components/signup-consent";

type Consent = { termsAccepted: boolean; privacyAcknowledged: boolean; communicationsConsent: boolean };
type VerifyResult = { success: boolean; requiresSignIn: boolean; nextPath: "/family-access" | "/" | "/login"; sharedMember: boolean };

export default function FamilyRegister() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [communicationsConsent, setCommunicationsConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationStep, setVerificationStep] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [verified, setVerified] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerifyResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const codeInput = useRef<HTMLInputElement | null>(null);

  const token = new URLSearchParams(window.location.search).get("token") || "";
  const inviteQuery = useQuery({
    queryKey: ["/api/family-invite", token],
    queryFn: async () => {
      if (!token) throw new Error("No invitation token");
      const response = await fetch(`/api/family-invite/${token}`, { credentials: "include" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Invalid invitation");
      }
      return response.json() as Promise<{
        deceasedName: string; email: string; recipientName?: string;
        registrationReference?: string; existingAccount: boolean;
        sharedAccess: boolean; sharingAuthorized: boolean;
      }>;
    },
    enabled: !!token,
    retry: false,
  });
  const invite = inviteQuery.data;
  const existingAccount = invite?.existingAccount === true;

  useEffect(() => {
    if (!invite?.recipientName || invite.existingAccount) return;
    const parts = invite.recipientName.trim().split(/\s+/);
    if (!firstName && parts[0]) setFirstName(parts[0]);
    if (!lastName && parts.length > 1) setLastName(parts.slice(1).join(" "));
  }, [invite?.recipientName, invite?.existingAccount]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const consent: Consent = { termsAccepted, privacyAcknowledged: termsAccepted, communicationsConsent };
  const registerMutation = useMutation({
    mutationFn: async () => {
      const body = existingAccount
        ? { existingAccount: true, consent }
        : { firstName: firstName.trim(), lastName: lastName.trim(), password, consent };
      const response = await apiRequest("POST", `/api/family-invite/${token}/register`, body);
      return response.json();
    },
    onSuccess: (data: any) => {
      setErrorMessage("");
      if (data.requiresSignIn) {
        setVerificationResult({ success: true, requiresSignIn: true, nextPath: "/login", sharedMember: !!invite?.sharedAccess });
        setVerified(true);
        return;
      }
      if (data.requiresVerification || existingAccount) {
        setRegisteredEmail(data.user?.email || invite?.email || "");
        setVerificationToken(data.verificationToken || token);
        setVerificationStep(true);
        setVerificationCode("");
        setResendSeconds(60);
        toast({ title: "Accept your invitation", description: "Enter the latest six-digit email code to confirm the invitation." });
        window.setTimeout(() => codeInput.current?.focus(), 0);
        return;
      }
      setRegisteredEmail(data.user?.email || invite?.email || "");
      setVerificationResult({ success: true, requiresSignIn: false, nextPath: data.nextPath || (data.sharedMember ? "/family-access" : "/"), sharedMember: !!data.sharedMember });
      setVerified(true);
    },
    onError: (error: Error) => setErrorMessage(error.message || "We couldn’t accept this invitation. Please try again."),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/family-invite/${verificationToken}/verify-email`, {
        code: verificationCode.trim(),
        consent,
      });
      return response.json() as Promise<VerifyResult>;
    },
    onSuccess: result => {
      setErrorMessage("");
      setVerificationResult(result);
      setEmailConfirmed(true);
      setVerified(true);
      toast({ title: "Invitation accepted", description: "Your email is confirmed. Continue to the next step when you’re ready." });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || "That code could not be confirmed. Check the latest email code and try again.");
      setVerificationCode("");
      window.setTimeout(() => codeInput.current?.focus(), 0);
    },
  });
  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/family-invite/${verificationToken}/resend-code`, {});
      return response.json();
    },
    onSuccess: () => {
      setErrorMessage("");
      setVerificationCode("");
      setResendSeconds(60);
      toast({ title: "A new code was requested", description: "Only the latest code will work. Check your email." });
      codeInput.current?.focus();
    },
    onError: (error: Error) => setErrorMessage(error.message || "A new code could not be sent. Please wait and try again."),
  });

  const passwordValid = password.length >= 12;
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const handleRegister = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    if (!termsAccepted) { setErrorMessage("Accept the Terms and acknowledge the Privacy Policy to continue."); return; }
    if (!existingAccount) {
      if (!firstName.trim() || !lastName.trim()) { setErrorMessage("Enter your first and last name."); return; }
      if (!passwordValid || !hasSpecialChar) { setErrorMessage("Your password must be at least 12 characters and include a special character."); return; }
      if (!passwordsMatch) { setErrorMessage("Your passwords do not match."); return; }
    }
    registerMutation.mutate();
  };
  const handleVerify = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    if (!/^\d{6}$/.test(verificationCode)) { setErrorMessage("Enter the six-digit code from the latest email."); codeInput.current?.focus(); return; }
    verifyMutation.mutate();
  };
  const continuePath = verificationResult?.requiresSignIn ? "/login" : verificationResult?.nextPath || (verificationResult?.sharedMember ? "/family-access" : "/");
  const nextLabel = verificationResult?.requiresSignIn
    ? "Sign in to continue"
    : continuePath === "/family-access" ? "Continue to identity and sharing checks" : "Continue to your account";

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[linear-gradient(140deg,#32453A_0%,#577178_54%,#d6cdb3_145%)] p-4 sm:p-8">
      <div className="w-full max-w-lg">{children}<p className="mt-5 text-center text-xs text-[#e8e2d3]">Steps After Life · Private, safeguarded family access</p></div>
    </div>
  );

  if (!token) return shell(<Card><CardContent className="space-y-3 p-8 text-center"><XCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="text-xl font-semibold">Invitation link unavailable</h1><p className="text-sm text-muted-foreground">This invitation link is missing or invalid. Ask the case owner for a new invitation.</p><Button asChild variant="outline"><Link href="/login">Go to sign in</Link></Button></CardContent></Card>);
  if (inviteQuery.isLoading) return shell(<Card><CardContent className="space-y-4 p-8"><div className="h-6 w-48 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /><p className="text-sm text-muted-foreground">Checking your invitation…</p></CardContent></Card>);
  if (inviteQuery.isError || !invite) return shell(<Card><CardContent className="space-y-3 p-8 text-center"><AlertTriangle className="mx-auto h-10 w-10 text-amber-700" /><h1 className="text-xl font-semibold">We could not open this invitation</h1><p role="alert" className="text-sm text-muted-foreground">{(inviteQuery.error as Error)?.message || "This invitation is no longer valid."}</p><p className="text-sm text-muted-foreground">Contact the case owner or care team for help.</p><Button variant="outline" onClick={() => inviteQuery.refetch()}>Try again</Button></CardContent></Card>);

  if (verified) return shell(
    <Card data-testid="family-invitation-success">
      <CardContent className="space-y-5 p-7 sm:p-9">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"><ShieldCheck className="h-7 w-7 text-primary" /></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Invitation accepted</p><h1 className="mt-2 text-2xl font-semibold">{emailConfirmed ? "Email confirmed" : "You’re ready to continue"}</h1><p className="mt-2 text-sm text-muted-foreground">{emailConfirmed ? `Confirmation is complete for ${registeredEmail || invite.email}.` : `Your invitation is accepted for ${registeredEmail || invite.email}.`} No Certificate ID email is promised here.</p></div>
        {verificationResult?.requiresSignIn ? (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" data-testid="family-signin-required">
            <p className="font-medium">Sign in to continue securely</p><p className="mt-1">Your existing account was not signed in automatically. Use your usual password and any MFA step. If you are signed in as someone else, sign out and return to this invitation before continuing.</p>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Next steps</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Accept the invitation and confirm your email — complete.</li>
              <li>Verify your identity before private case information is available.</li>
              <li>Review and accept the case owner’s sharing permission. The owner’s signature is recorded if they already signed; your acceptance is still required.</li>
            </ol>
            {invite.sharedAccess && <p className="text-muted-foreground">The owner has already established case sharing. Your own identity and sharing acceptance are still required before access is active.</p>}
            {!invite.sharingAuthorized && <p className="text-muted-foreground">The case owner’s sharing permission is not recorded yet. You can return to the checklist after the owner signs it.</p>}
          </div>
        )}
        <Button className="w-full" onClick={() => { window.location.assign(continuePath); }} data-testid="button-family-continue">{nextLabel}</Button>
      </CardContent>
    </Card>,
  );

  if (verificationStep) return shell(
    <Card data-testid="family-email-verification">
      <CardHeader className="pb-3">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10"><Mail className="h-5 w-5 text-primary" /></div>
        <CardTitle>Confirm and accept this invitation</CardTitle>
        <CardDescription>Enter the six-digit code sent to <strong>{registeredEmail}</strong>. Only the most recently sent code works.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">Three steps to case access</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Accept the invitation and confirm this email.</li><li>Verify your identity.</li><li>Accept the case owner’s sharing permission.</li>
          </ol>
          <p className="mt-3 text-muted-foreground">{invite.sharingAuthorized ? "The owner has signed the sharing permission; you must review and accept it too." : "The owner’s sharing permission is still needed. Access remains restricted until the owner and you both accept."}</p>
        </div>
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="family-verification-code">Six-digit email code</Label><Input ref={codeInput} id="family-verification-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} aria-describedby="family-code-help" className="h-14 text-center font-mono text-2xl tracking-[0.45em]" disabled={verifyMutation.isPending} data-testid="input-family-verification-code" /><p id="family-code-help" className="text-xs text-muted-foreground">You can paste the code here. It expires after a limited time.</p></div>
          {errorMessage && <p role="alert" className="text-sm text-destructive" data-testid="family-registration-error">{errorMessage}</p>}
          <Button type="submit" className="w-full" disabled={verifyMutation.isPending || verificationCode.length !== 6} data-testid="button-confirm-family-email">{verifyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{verifyMutation.isPending ? "Confirming…" : "Confirm email and accept invitation"}</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{resendSeconds > 0 ? `Request another code in ${resendSeconds}s` : "Didn’t receive a code?"}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => resendMutation.mutate()} disabled={resendMutation.isPending || verifyMutation.isPending || resendSeconds > 0} data-testid="button-resend-family-code">{resendMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}{resendMutation.isPending ? "Requesting…" : "Send a new code"}</Button>
        </div>
      </CardContent>
    </Card>,
  );

  return shell(
    <Card data-testid="family-register-card">
      <CardHeader className="pb-3">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10"><Heart className="h-5 w-5 text-primary" /></div>
        <CardTitle>{existingAccount ? "Accept your family invitation" : "Create your family account"}</CardTitle>
        <CardDescription>{existingAccount ? "Use the email code to accept this case invitation. Your existing password and sign-in protections stay unchanged." : "You’ve been invited to join Steps After Life."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary-foreground">Case invitation</p>
          <p className="mt-1 font-semibold">{invite.deceasedName}</p>
          {invite.registrationReference && <p className="mt-1 break-all font-mono text-xs" data-testid="family-registration-reference">Registration reference: {invite.registrationReference}</p>}
          <p className="mt-2 break-all text-sm text-muted-foreground">{invite.email}</p>
          {invite.sharedAccess && <p className="mt-2 text-sm text-muted-foreground">This is an existing shared case. The owner’s permission may still be pending; you must verify your identity and accept the sharing permission before access is active.</p>}
        </div>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">What happens next</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Accept the invitation and confirm your email.</li><li>Verify your identity before private information is available.</li><li>Review and accept the owner’s sharing permission.</li>
          </ol>
          <p className="mt-2 text-muted-foreground">{invite.sharingAuthorized ? "The owner has signed; your own acceptance is still needed." : "The owner’s permission is not yet recorded. Case access stays restricted until both sides accept."}</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          {!existingAccount && <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="firstName">First name</Label><Input id="firstName" autoComplete="given-name" value={firstName} onChange={event => setFirstName(event.target.value)} required data-testid="input-family-first-name" /></div>
              <div className="space-y-1"><Label htmlFor="lastName">Last name</Label><Input id="lastName" autoComplete="family-name" value={lastName} onChange={event => setLastName(event.target.value)} required data-testid="input-family-last-name" /></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-password">Create a password</Label>
              <div className="relative"><Input id="family-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required className="pr-12" data-testid="input-family-password" /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div>
              <p className={`text-xs ${passwordValid ? "text-primary" : "text-muted-foreground"}`}>{passwordValid ? "✓" : "•"} At least 12 characters</p>
              <p className={`text-xs ${hasSpecialChar ? "text-primary" : "text-muted-foreground"}`}>{hasSpecialChar ? "✓" : "•"} At least one special character</p>
            </div>
            <div className="space-y-1"><Label htmlFor="confirmPassword">Confirm password</Label><Input id="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required data-testid="input-family-confirm-password" />{confirmPassword && <p className={`text-xs ${passwordsMatch ? "text-primary" : "text-destructive"}`}>{passwordsMatch ? "Passwords match" : "Passwords do not match"}</p>}</div>
          </>}
          {existingAccount && <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">We won’t ask you to create or change your password, name, or MFA settings. Sign-in will follow your account’s normal security requirements.</p>}
          <SignupConsent idPrefix="invited-family" termsAccepted={termsAccepted} onTermsChange={setTermsAccepted} communicationsConsent={communicationsConsent} onCommunicationsChange={setCommunicationsConsent} />
          {errorMessage && <p role="alert" className="text-sm text-destructive" data-testid="family-registration-error">{errorMessage}</p>}
          <Button type="submit" className="w-full" disabled={registerMutation.isPending || !termsAccepted || (!existingAccount && (!passwordValid || !hasSpecialChar || !passwordsMatch))} data-testid="button-create-family-account">
            {registerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            {registerMutation.isPending ? "Accepting invitation…" : existingAccount ? "Accept invitation and send email code" : "Create account and accept invitation"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline" data-testid="link-go-to-login">Sign in</Link></p>
        </form>
      </CardContent>
    </Card>,
  );
}
