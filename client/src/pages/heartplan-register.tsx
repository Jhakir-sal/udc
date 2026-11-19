import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, Heart, CheckCircle2, Mail, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { HEARTPLAN_SIGNUP_SOURCE } from "@shared/heartPlanConsent";
import { SignupConsent } from "@/components/signup-consent";
import { OrsaLegacyRegistrationCountdown } from "@/components/orsa-legacy-offer";
import { PrudentialRegistrationNotice } from "@/components/prudential-registration-notice";
import { PrudentialLifeInsuranceSuggestion } from "@/components/prudential-life-insurance-suggestion";
import { CaseSallyHelpButton } from "@/components/sally-chat";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIFE_INSURANCE_COVERAGE_OPTIONS, type LifeInsuranceCoverage } from "@shared/heartPlanLifeInsurance";
import { PRUDENTIAL_ACCESS_MESSAGE, PRUDENTIAL_FREE_ACCESS_DAYS } from "@shared/prudentialOffer";
import prudentialLogo from "@/assets/prudential-logo.svg";
import salLogo from "@assets/logo-horizontal.png";
import "./heartplan-register-prudential.css";

export default function HeartPlanRegister() {
  const signupParams = new URLSearchParams(window.location.search);
  const showPrudentialOffer = signupParams.get("partner") === "prudential";
  const showOrsaOffer = !showPrudentialOffer && signupParams.get("orsa_offer") === "1";
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
  const [newRegistrationToken, setRegistrationToken] = useState("");
  const [verified, setVerified] = useState(false);
  const [policyBundleAccepted, setPolicyBundleAccepted] = useState(false);
  const [communicationsConsent, setCommunicationsConsent] = useState(false);
  const [lifeInsuranceCoverage, setLifeInsuranceCoverage] = useState<LifeInsuranceCoverage | "">("");
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { data: pendingRegistration, isLoading: pendingLoading, isError: pendingError, refetch: retryPending } =
    useQuery<{ pending: boolean; registrationToken?: string; email?: string }>({
      queryKey: ["/api/auth/pending-heartplan-registration"],
      staleTime: 0,
    });
  const registrationToken = newRegistrationToken || pendingRegistration?.registrationToken || "";
  const verificationStep = !!registrationToken;
  const partnerBrand = showPrudentialOffer ? (
    <div className="pr-signup-brands" aria-label="Prudential and Steps After Life partnership">
      <img className="pr-signup-prudential-logo" src={prudentialLogo} alt="Prudential" />
      <span className="pr-signup-brand-divider" aria-hidden="true" />
      <img className="pr-signup-sal-logo" src={salLogo} alt="Steps After Life" />
    </div>
  ) : null;

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/heartplan/register", {
        firstName,
        lastName,
        email,
        password,
        ...(lifeInsuranceCoverage ? { lifeInsuranceCoverage } : {}),
        consent: {
          termsAccepted: policyBundleAccepted,
          privacyAcknowledged: policyBundleAccepted,
          communicationsConsent,
          source: HEARTPLAN_SIGNUP_SOURCE,
        },
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setRegistrationToken(data.registrationToken);
      toast({ title: "Check your email", description: "We've sent a 6-digit verification code to your email address." });
    },
    onError: (error: any) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/auth/verify-email", { registrationToken, code });
      return res.json();
    },
    onSuccess: () => {
      setVerified(true);
      toast({ title: "Email verified!", description: "Welcome to HeartPlan. Taking you to your planning workspace..." });
       setTimeout(() => { window.location.href = "/heartplan/welcome"; }, 1200);
    },
    onError: (error: any) => {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
      setVerificationCode(["", "", "", "", "", ""]);
      codeInputRefs.current[0]?.focus();
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/resend-verification", { registrationToken });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Code re-sent", description: "A new verification code is on its way." });
    },
    onError: (error: any) => {
      toast({ title: "Could not resend", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast({ title: "Missing information", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    if (password.length < 12) {
      toast({ title: "Password too short", description: "Password must be at least 12 characters.", variant: "destructive" });
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      toast({ title: "Password needs a special character", description: "Include at least one special character.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please re-enter your password.", variant: "destructive" });
      return;
    }
    if (!policyBundleAccepted) {
      toast({ title: "Agreement required", description: "Accept the Terms and Conditions and acknowledge the Privacy Policy to create your HeartPlan.", variant: "destructive" });
      return;
    }
    registerMutation.mutate();
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const next = [...verificationCode];
    next[index] = value;
    setVerificationCode(next);
    if (value && index < 5) codeInputRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "") && next.join("").length === 6) {
      verifyMutation.mutate(next.join(""));
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setVerificationCode(pasted.split(""));
      verifyMutation.mutate(pasted);
    }
  };

  if (pendingLoading) {
    return <main className={`min-h-[100dvh] flex items-center justify-center px-4 ${showPrudentialOffer ? "pr-signup pr-signup-state" : ""}`}>
      {showPrudentialOffer ? (
        <div className="pr-signup-state-card">
          {partnerBrand}
          <div className="pr-signup-loading-mark"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading registration" /></div>
          <p>Preparing your private planning space…</p>
        </div>
      ) : <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading registration" />}
    </main>;
  }
  if (pendingError && !newRegistrationToken) {
    return <main className={`min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-4 text-center ${showPrudentialOffer ? "pr-signup pr-signup-state" : ""}`}>
      {showPrudentialOffer && partnerBrand}
      <div className={showPrudentialOffer ? "pr-signup-state-card" : ""}>
        <p>We couldn't check your registration. Please try again.</p>
        <Button onClick={() => retryPending()}>Try again</Button>
      </div>
    </main>;
  }

  return (
    <main className={`min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-background to-muted/40 px-4 py-8 sm:p-6 ${showPrudentialOffer ? "pr-signup" : ""}`}>
      <div className={`w-full max-w-lg space-y-7 ${showPrudentialOffer ? "pr-signup-content" : ""}`}>
        <div className={`flex flex-col items-center gap-3 ${showPrudentialOffer ? "pr-signup-intro" : ""}`}>
          {showPrudentialOffer ? (
            <>
              {partnerBrand}
              <div className="pr-signup-heartplan">
                <Heart className="h-5 w-5" aria-hidden="true" />
                <span>HeartPlan</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-primary">
              <Heart className="h-5 w-5" />
              <span className="font-serif text-xl font-semibold">HeartPlan</span>
            </div>
          )}
          <p className="max-w-md text-center text-base leading-7 text-muted-foreground">
            {showPrudentialOffer
              ? "A private, reassuring place to make a clear plan for the people you love."
              : "Make a clear plan for the people you love. You can return and change it whenever you need to."}
          </p>
        </div>

        {showOrsaOffer && <OrsaLegacyRegistrationCountdown />}
        {showPrudentialOffer && <PrudentialRegistrationNotice />}

        {verified ? (
          <Card className={showPrudentialOffer ? "pr-signup-card pr-signup-success" : undefined}>
            <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
               <p className="font-medium">Your email is confirmed.</p>
               <p className="text-sm text-muted-foreground">Opening your HeartPlan now.</p>
                 {showPrudentialOffer && <p className="pr-signup-terms">{PRUDENTIAL_ACCESS_MESSAGE} No offer review is required, and the offer does not expire.</p>}
            </CardContent>
          </Card>
        ) : verificationStep ? (
          <Card className={showPrudentialOffer ? "pr-signup-card" : undefined}>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className={showPrudentialOffer ? "pr-signup-card-title" : undefined}>Verify your email</CardTitle>
              <CardDescription className={showPrudentialOffer ? "pr-signup-card-description" : undefined}>
                 Enter the six-digit code we sent to <span className="font-medium">{email || pendingRegistration?.email}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                {verificationCode.map((digit, i) => (
                  <Input
                    key={i}
                    ref={(el) => (codeInputRefs.current[i] = el)}
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="w-11 h-12 text-center text-lg font-semibold"
                    inputMode="numeric"
                    maxLength={1}
                    disabled={verifyMutation.isPending}
                    data-testid={`input-code-${i}`}
                  />
                ))}
              </div>
              {verifyMutation.isPending && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking your code
                </div>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => resendMutation.mutate()}
                disabled={resendMutation.isPending}
                data-testid="button-resend-code"
              >
                {resendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Resend code
              </Button>
               <p className="text-center text-sm text-muted-foreground">Already verified? <a href="/login" className="font-medium text-primary underline underline-offset-4">Sign in</a></p>
            </CardContent>
          </Card>
        ) : (
           <Card className={showPrudentialOffer ? "pr-signup-card" : undefined}>
            <CardHeader>
              <CardTitle className={showPrudentialOffer ? "pr-signup-card-title" : undefined}>{showPrudentialOffer ? `Start your ${PRUDENTIAL_FREE_ACCESS_DAYS} days free` : "Create your HeartPlan"}</CardTitle>
              <CardDescription className={showPrudentialOffer ? "pr-signup-card-description" : undefined}>
                 {showPrudentialOffer ? "Your plan is private unless you choose to share it." : "It is free to begin. Your plan is private unless you choose to share it."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-first-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-last-name" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="password">Create a password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      autoComplete="new-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                      aria-pressed={showPassword}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                   <p className="text-sm leading-6 text-muted-foreground">Use at least 12 characters and one special character, such as ! or ?.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    data-testid="input-confirm-password"
                  />
                </div>
                <div className="space-y-2" data-testid="field-life-insurance-coverage">
                  <Label htmlFor="life-insurance-coverage">Life insurance coverage <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Select
                    value={lifeInsuranceCoverage}
                    onValueChange={(value) => setLifeInsuranceCoverage(value as LifeInsuranceCoverage)}
                  >
                    <SelectTrigger id="life-insurance-coverage" data-testid="select-life-insurance-coverage" aria-describedby="life-insurance-privacy">
                      <SelectValue placeholder="Choose an answer, or leave blank" />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFE_INSURANCE_COVERAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p id="life-insurance-privacy" className="text-xs leading-5 text-muted-foreground">
                    This helps tailor optional planning suggestions. It is not shared with Prudential.
                  </p>
                  <PrudentialLifeInsuranceSuggestion coverage={lifeInsuranceCoverage} />
                </div>
                <SignupConsent idPrefix="heartplan" termsAccepted={policyBundleAccepted} onTermsChange={setPolicyBundleAccepted} communicationsConsent={communicationsConsent} onCommunicationsChange={setCommunicationsConsent} />
                <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                  {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                   {showPrudentialOffer ? `Start my ${PRUDENTIAL_FREE_ACCESS_DAYS} days free` : "Create my HeartPlan"}
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <a href="/login" className="text-primary font-medium hover:underline">Sign in</a>
              </p>
            </CardContent>
          </Card>
        )}
         <div className="flex justify-center">
           <CaseSallyHelpButton />
         </div>
         <p className="text-center text-sm leading-6 text-muted-foreground">
           Is your family facing the final weeks of a loved one's life?{" "}
           <a href="/end-of-life-concierge" className="font-medium text-primary underline underline-offset-4">
             Learn about End-of-Life Concierge support
           </a>
         </p>
       </div>
    </main>
  );
}
