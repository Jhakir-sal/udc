import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, ArrowRight, Phone, User, Eye, EyeOff, Mail, ShieldCheck, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { SignupConsent } from "@/components/signup-consent";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

type RegistrationStep = "account" | "verify-email" | "phone" | "verify-phone" | "id-verification" | "complete";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<RegistrationStep>("account");
  const [userId, setUserId] = useState("");
  
  // Account form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [communicationsConsent, setCommunicationsConsent] = useState(false);
  
  // Email verification state
  const [emailCode, setEmailCode] = useState(["", "", "", "", "", ""]);
  const [registrationToken, setRegistrationToken] = useState("");
  const [hasLinkedCertificate, setHasLinkedCertificate] = useState(false);
  const emailCodeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Phone verification state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  
  // ID verification state
  const [verificationSessionId, setVerificationSessionId] = useState("");
  const completionTracked = useRef(false);

  const completeSignup = (idVerification: "verified" | "skipped") => {
    setStep("complete");
    if (!completionTracked.current) {
      completionTracked.current = true;
      trackAnalyticsEvent("signup_completed", { id_verification: idVerification });
    }
  };
  
  // Password visibility state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string; consent: { termsAccepted: boolean; privacyAcknowledged: boolean; communicationsConsent: boolean } }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      trackAnalyticsEvent("signup_account_created", { linked_certificate: Boolean(data.linkedCertificate) });
      setUserId(data.userId);
      setRegistrationToken(data.registrationToken);
      if (data.linkedCertificate) setHasLinkedCertificate(true);
      setStep("verify-email");
      toast({
        title: "Check your email",
        description: "We sent a 6-digit verification code to your email address.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    },
  });

  // Email verification mutation
  const verifyEmailMutation = useMutation({
    mutationFn: async (data: { registrationToken: string; code: string }) => {
      const response = await apiRequest("POST", "/api/auth/verify-email", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.hasLinkedCertificate) setHasLinkedCertificate(true);
      setStep("phone");
      toast({
        title: "Email verified!",
        description: data.hasLinkedCertificate
          ? "Your Certificate ID has been sent to your email. Now let's set up two-factor authentication."
          : "Now let's set up your phone for two-factor authentication.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired code",
        variant: "destructive",
      });
      setEmailCode(["", "", "", "", "", ""]);
    },
  });

  // Resend email verification code
  const resendEmailCodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/resend-verification", { registrationToken });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "New code sent", description: "Check your email for the new verification code." });
      setEmailCode(["", "", "", "", "", ""]);
    },
    onError: (error: any) => {
      toast({ title: "Failed to resend", description: error.message, variant: "destructive" });
    },
  });

  const handleEmailCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...emailCode];
    newCode[index] = value.slice(-1);
    setEmailCode(newCode);
    if (value && index < 5) {
      emailCodeRefs.current[index + 1]?.focus();
    }
    const fullCode = newCode.join("");
    if (fullCode.length === 6) {
      verifyEmailMutation.mutate({ registrationToken, code: fullCode });
    }
  };

  const handleEmailCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !emailCode[index] && index > 0) {
      emailCodeRefs.current[index - 1]?.focus();
    }
  };

  const handleEmailCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setEmailCode(newCode);
      verifyEmailMutation.mutate({ registrationToken, code: pasted });
    }
  };

  // Send phone verification mutation
  const sendPhoneVerificationMutation = useMutation({
    mutationFn: async (data: { userId: string; phoneNumber: string }) => {
      const response = await apiRequest("POST", "/api/auth/send-phone-verification", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("verify-phone");
      toast({
        title: "Code sent",
        description: "We texted a verification code to your phone.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send code",
        description: error.message || "Could not send verification code",
        variant: "destructive",
      });
    },
  });

  // Verify phone mutation
  const verifyPhoneMutation = useMutation({
    mutationFn: async (data: { userId: string; code: string }) => {
      const response = await apiRequest("POST", "/api/auth/verify-phone", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("id-verification");
      toast({
        title: "Phone verified",
        description: "Now let's verify your identity for added security.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired code",
        variant: "destructive",
      });
    },
  });

  // Create ID verification session mutation
  const createIdVerificationMutation = useMutation({
    mutationFn: async (data: { userId: string }) => {
      const response = await apiRequest("POST", "/api/auth/create-id-verification", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.alreadyVerified) {
        completeSignup("verified");
        toast({
          title: "Already verified",
          description: "Your identity is already verified — no need to do it again.",
        });
        return;
      }
      setVerificationSessionId(data.sessionId);
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Verification setup failed",
        description: error.message || "Could not start ID verification",
        variant: "destructive",
      });
    },
  });

  // Check ID verification status
  const { data: verificationStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["/api/auth/id-verification-status", userId],
    enabled: step === "id-verification" && !!userId,
    refetchInterval: step === "id-verification" ? 3000 : false,
  });

  useEffect(() => {
    if (verificationStatus && (verificationStatus as any).status === "verified") {
      completeSignup("verified");
      toast({
        title: "Identity verified",
        description: "Your account is fully set up. Welcome to Steps After Life!",
      });
    }
  }, [verificationStatus, toast]);

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
      toast({ title: "Agreement required", description: "Accept the Terms and Conditions and acknowledge the Privacy Policy to create an account.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }
    if (password.length < 12) {
      toast({
        title: "Password too short",
        description: "Password must be at least 12 characters.",
        variant: "destructive",
      });
      return;
    }
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (!hasSpecialChar) {
      toast({
        title: "Password needs special character",
        description: "Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:',.<>/?)",
        variant: "destructive",
      });
      return;
    }
    createAccountMutation.mutate({
      email, password, firstName, lastName,
      consent: { termsAccepted, privacyAcknowledged: termsAccepted, communicationsConsent },
    });
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length < 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number.",
        variant: "destructive",
      });
      return;
    }
    sendPhoneVerificationMutation.mutate({ userId, phoneNumber: `+1${cleaned}` });
  };

  const handlePhoneVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyPhoneMutation.mutate({ userId, code: verificationCode });
  };

  const handleStartIdVerification = () => {
    createIdVerificationMutation.mutate({ userId });
  };

  const handleSkipIdVerification = () => {
    completeSignup("skipped");
  };

  const handleComplete = () => {
    window.location.href = "/";
  };


  return (
    <div className="family-shell flex flex-1 flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:p-6">
        <Card className="family-card w-full max-w-lg">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <span className={step === "account" ? "text-primary font-medium" : ""}>Account</span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === "verify-email" ? "text-primary font-medium" : ""}>Email</span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === "phone" || step === "verify-phone" ? "text-primary font-medium" : ""}>Phone</span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === "id-verification" ? "text-primary font-medium" : ""}>Identity</span>
              <ArrowRight className="h-3 w-3" />
              <span className={step === "complete" ? "text-primary font-medium" : ""}>Done</span>
            </div>
            <CardTitle className="font-serif text-2xl">
              {step === "account" && "Create your account"}
              {step === "verify-email" && "Verify your email"}
              {step === "phone" && "Set up two-factor authentication"}
              {step === "verify-phone" && "Verify your phone"}
              {step === "id-verification" && "Verify your identity"}
              {step === "complete" && "You're all set!"}
            </CardTitle>
            <CardDescription>
              {step === "account" && "Enter your details to get started."}
              {step === "verify-email" && `Enter the six-digit code we sent to ${email}.`}
              {step === "phone" && "Add a phone number for safer sign-in."}
              {step === "verify-phone" && "Enter the code we texted to your phone."}
              {step === "id-verification" && "Stripe Identity is an optional service that helps protect your account."}
              {step === "complete" && "Your account is ready."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "account" && (
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      data-testid="input-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 12 characters with special character"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pr-10"
                      data-testid="input-confirm-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                      aria-pressed={showConfirmPassword}
                      data-testid="button-toggle-confirm-password"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <SignupConsent idPrefix="family" termsAccepted={termsAccepted} onTermsChange={setTermsAccepted} communicationsConsent={communicationsConsent} onCommunicationsChange={setCommunicationsConsent} />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createAccountMutation.isPending}
                  data-testid="button-create-account"
                >
                  {createAccountMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <a
                    href="/login"
                    className="text-primary underline-offset-4 hover:underline"
                    data-testid="link-login"
                  >
                    Sign in
                  </a>
                </div>
              </form>
            )}

            {step === "verify-email" && (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 rounded-full" style={{ backgroundColor: "rgba(50, 69, 58, 0.1)" }}>
                    <Mail className="h-8 w-8" style={{ color: "#32453A" }} />
                  </div>
                </div>

                {hasLinkedCertificate && (
                  <div className="rounded-lg border p-3 text-sm" style={{ backgroundColor: "rgba(149, 104, 52, 0.05)", borderColor: "rgba(149, 104, 52, 0.2)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="h-4 w-4" style={{ color: "#956834" }} />
                      <p className="text-xs uppercase tracking-wider font-medium" style={{ color: "#956834" }}>Case linked</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      We found a pending invitation for your email. Your Certificate ID will be sent securely after verification.
                    </p>
                  </div>
                )}

                <div className="flex justify-center gap-2" onPaste={handleEmailCodePaste}>
                  {emailCode.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => { emailCodeRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleEmailCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleEmailCodeKeyDown(index, e)}
                      className="w-12 h-14 text-center text-2xl font-mono font-bold"
                      style={{ borderColor: digit ? "#32453A" : undefined }}
                      disabled={verifyEmailMutation.isPending}
                      data-testid={`input-email-code-${index}`}
                    />
                  ))}
                </div>

                {verifyEmailMutation.isPending && (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#32453A" }} />
                    <p className="text-sm text-muted-foreground">Verifying...</p>
                  </div>
                )}

                <div className="text-center text-sm text-muted-foreground">
                  Didn't receive the code?{" "}
                  <button
                    type="button"
                    onClick={() => resendEmailCodeMutation.mutate()}
                    disabled={resendEmailCodeMutation.isPending}
                    className="text-primary underline-offset-4 hover:underline font-medium inline-flex items-center gap-1"
                    data-testid="button-resend-email-code"
                  >
                    {resendEmailCodeMutation.isPending ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Sending...</>
                    ) : (
                      <><RefreshCw className="h-3 w-3" /> Resend Code</>
                    )}
                  </button>
                </div>

                <p className="text-xs text-muted-foreground text-center">Code expires in 10 minutes</p>
              </div>
            )}

            {step === "phone" && (
              <form onSubmit={handlePhoneSubmit} className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Phone className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <div className="flex gap-2">
                    <Input
                      value="+1"
                      disabled
                      className="w-16 text-center"
                    />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="555-123-4567"
                      value={formatPhone(phoneNumber)}
                      onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                      required
                      data-testid="input-phone"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    We'll send a verification code to your email
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={sendPhoneVerificationMutation.isPending}
                  data-testid="button-send-code"
                >
                  {sendPhoneVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending code...
                    </>
                  ) : (
                    "Send verification code"
                  )}
                </Button>
              </form>
            )}

            {step === "verify-phone" && (
              <form onSubmit={handlePhoneVerifySubmit} className="space-y-6">
                <div className="flex flex-col items-center space-y-4">
                  <InputOTP
                    maxLength={6}
                    value={verificationCode}
                    onChange={setVerificationCode}
                    data-testid="input-otp"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-sm text-muted-foreground">
                    Didn't receive a code?{" "}
                    <button
                      type="button"
                      onClick={() => sendPhoneVerificationMutation.mutate({ userId, phoneNumber: `+1${phoneNumber.replace(/\D/g, "")}` })}
                      className="text-primary underline-offset-4 hover:underline"
                      data-testid="button-resend-code"
                    >
                      Resend
                    </button>
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifyPhoneMutation.isPending || verificationCode.length !== 6}
                  data-testid="button-verify-phone"
                >
                  {verifyPhoneMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify phone"
                  )}
                </Button>
              </form>
            )}

            {step === "id-verification" && (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Verify your identity using Stripe Identity to unlock all features and protect your account.
                  </p>
                  {(verificationStatus as any)?.status === "pending" && (
                    <div className="flex items-center justify-center gap-2 text-amber-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Verification in progress...</span>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {!verificationSessionId && (
                    <Button
                      onClick={handleStartIdVerification}
                      className="w-full"
                      disabled={createIdVerificationMutation.isPending}
                      data-testid="button-start-id-verification"
                    >
                      {createIdVerificationMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting verification...
                        </>
                      ) : (
                        "Verify my identity"
                      )}
                    </Button>
                  )}
                  {verificationSessionId && (verificationStatus as any)?.status !== "verified" && (
                    <Button
                      onClick={() => refetchStatus()}
                      variant="outline"
                      className="w-full"
                      data-testid="button-check-status"
                    >
                      Check verification status
                    </Button>
                  )}
                  <Button
                    onClick={handleSkipIdVerification}
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    data-testid="button-skip-id-verification"
                  >
                    Skip for now
                  </Button>
                </div>
              </div>
            )}

            {step === "complete" && (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="p-4 bg-green-500/10 rounded-full">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Welcome to Steps After Life</p>
                  <p className="text-sm text-muted-foreground">
                    Your account is ready. {hasLinkedCertificate ? "Your case has been linked and your Certificate ID has been sent to your email." : "You can now access your family dashboard."}
                  </p>
                </div>
                <Button
                  onClick={handleComplete}
                  className="w-full"
                  data-testid="button-go-to-dashboard"
                >
                  Go to Dashboard
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
