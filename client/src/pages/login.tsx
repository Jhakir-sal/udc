import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

type LoginStep = "credentials" | "2fa";

function destinationClass(destination: unknown): "home" | "heartplan_advisor" | "other" {
  if (window.location.pathname.startsWith("/heartplan/advisor/")) return "heartplan_advisor";
  return destination === "/" || destination === "/heartplan" ? "home" : "other";
}

export default function Login() {
  const { toast } = useToast();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [entraEnabled, setEntraEnabled] = useState(false);
  useEffect(() => {
    if (window.location.pathname !== "/auth/complete") return;
    fetch("/api/auth/mfa-status", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.requires2FA) {
          applyMfaDelivery(data);
          setStep("2fa");
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then((response) => {
        if (!response.ok) throw new Error(`Provider request failed (${response.status})`);
        return response.json();
      })
      .then((providers) => {
        if (active) setEntraEnabled(providers.entraId === true);
      })
      .catch((error) => console.error("Could not load sign-in providers:", error));
    return () => { active = false; };
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [codeSentVia, setCodeSentVia] = useState<"sms" | "email">("email");
  const [codeDestination, setCodeDestination] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(false);

  function applyMfaDelivery(data: any) {
    setCodeSentVia(data.sentVia === "sms" ? "sms" : "email");
    setCodeDestination(data.destination || "");
    setDeliveryNote(data.deliveryNote || "");
    setSmsAvailable(data.smsAvailable === true);
    setEmailAvailable(data.emailAvailable === true);
  }

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.requires2FA) {
        const via = data.sentVia === "sms" ? "sms" : "email";
        applyMfaDelivery(data);
        setStep("2fa");
        toast({
          title: "Verification code requested",
          description:
            via === "sms"
              ? "Please check your phone for a text message with the verification code."
              : "Please check your email for the verification code.",
        });
      } else {
        trackAnalyticsEvent("login_success", {
          auth_path: "password",
          destination_class: destinationClass(data.destination || "/"),
        });
        toast({
          title: "Login successful",
          description: "Welcome back!",
        });
        window.location.href = window.location.pathname.startsWith("/heartplan/advisor/")
          ? `${window.location.pathname}${window.location.search}`
          : data.destination || "/";
      }
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  const verify2FAMutation = useMutation({
    mutationFn: async (data: { code: string }) => {
      const response = await apiRequest("POST", "/api/auth/verify-2fa", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      trackAnalyticsEvent("login_success", {
        auth_path: "two_factor",
        destination_class: destinationClass(data.destination || "/"),
      });
      toast({
        title: "Verification successful",
        description: "Welcome back!",
      });
      window.location.href = window.location.pathname.startsWith("/heartplan/advisor/")
        ? `${window.location.pathname}${window.location.search}`
        : data.destination || "/";
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired code",
        variant: "destructive",
      });
    },
  });

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const handle2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verify2FAMutation.mutate({ code: verificationCode });
  };

  const resendMutation = useMutation({
    mutationFn: async (channel: "sms" | "email") => {
      const response = await apiRequest("POST", "/api/auth/resend-2fa", { channel });
      return response.json();
    },
    onSuccess: (data: any) => {
      const via = data.sentVia === "sms" ? "sms" : "email";
      applyMfaDelivery(data);
      setVerificationCode("");
      toast({
        title: "New code requested",
        description: via === "sms" ? "Check your phone for a text message." : "Check your email for the new code.",
      });
    },
    onError: (error: any) => toast({
      title: "Could not resend code",
      description: error.message || "Please wait and try again.",
      variant: "destructive",
    }),
  });

  return (
    <div className="family-shell flex flex-1 flex-col">
      <main className="flex-1 flex items-center justify-center p-4 py-8 sm:p-8">
        <Card className="family-card w-full max-w-md">
          <CardHeader className="space-y-2 p-6 sm:p-8 sm:pb-5">
            <CardTitle role="heading" aria-level={1} className="font-serif text-2xl">
              {step === "credentials" ? "Welcome back" : "Two-Factor Authentication"}
            </CardTitle>
            <CardDescription>
              {step === "credentials"
                ? "Enter your email and password to continue."
                : codeSentVia === "sms"
                  ? `Enter the text code requested for ${codeDestination || "your verified phone"}.`
                  : `Enter the code emailed to ${codeDestination || "your verified email"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-1 sm:px-8 sm:pb-8">
            {step === "credentials" && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a
                      href="/forgot-password"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full min-h-12"
                  disabled={loginMutation.isPending}
                  data-testid="button-login-submit"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing you in…
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <a
                    href="/register"
                    className="text-primary underline-offset-4 hover:underline"
                    data-testid="link-register"
                  >
                    Create an account
                  </a>
                </div>
                {entraEnabled && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full min-h-12"
                      onClick={() => (window.location.href = "/api/login")}
                      data-testid="button-sso-login"
                    >
                      Sign in with SSO
                    </Button>
                  </>
                )}
                <p className="text-center text-xs text-muted-foreground pt-2">
                  Family, HeartPlan, team, and funeral-home accounts all sign in here.
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  Want text sign-in codes? Once signed in, verify your phone and enable two-factor sign-in in Account Settings. A password is still required.
                </p>
              </form>
            )}

            {step === "2fa" && (
              <form onSubmit={handle2FASubmit} className="space-y-6">
                {deliveryNote && <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="mfa-delivery-note">{deliveryNote}</p>}
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
                </div>
                <Button
                  type="submit"
                  className="w-full min-h-12"
                  disabled={verify2FAMutation.isPending || verificationCode.length !== 6}
                  data-testid="button-verify-2fa"
                >
                  {verify2FAMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-12"
                  onClick={() => resendMutation.mutate(codeSentVia)}
                  disabled={resendMutation.isPending}
                  data-testid="button-resend-2fa"
                >
                  {resendMutation.isPending ? "Requesting..." : codeSentVia === "sms" ? "Resend text code" : "Resend email code"}
                </Button>
                {((codeSentVia === "sms" && emailAvailable) || (codeSentVia === "email" && smsAvailable)) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-12"
                    disabled={resendMutation.isPending || verify2FAMutation.isPending}
                    onClick={() => resendMutation.mutate(codeSentVia === "sms" ? "email" : "sms")}
                    data-testid="button-switch-mfa-channel"
                  >
                    {codeSentVia === "sms" ? "Use email instead" : "Use text instead"}
                  </Button>
                )}
                <p className="text-center text-xs text-muted-foreground">Only the most recently requested code is valid. Codes expire after 10 minutes.</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("credentials")}
                  data-testid="button-back-login"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
