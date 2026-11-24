import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Mail, KeyRound, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ResetStep = "email" | "code" | "newPassword" | "success";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const requestResetMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const response = await apiRequest("POST", "/api/auth/forgot-password", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("code");
      toast({
        title: "Check your email",
        description: "If an account exists with this email, we've sent a 6-digit reset code.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Request failed",
        description: error.message || "Unable to process your request",
        variant: "destructive",
      });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async (data: { email: string; code: string }) => {
      const response = await apiRequest("POST", "/api/auth/verify-reset-code", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("newPassword");
      toast({
        title: "Code verified",
        description: "Please enter your new password.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired reset code",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { email: string; code: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/auth/reset-password", data);
      return response.json();
    },
    onSuccess: () => {
      setStep("success");
      toast({
        title: "Password reset successful",
        description: "You can now sign in with your new password.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reset failed",
        description: error.message || "Unable to reset password",
        variant: "destructive",
      });
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestResetMutation.mutate({ email });
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCodeMutation.mutate({ email, code: code.trim() });
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 12) {
      toast({
        title: "Password too short",
        description: "Password must be at least 12 characters.",
        variant: "destructive",
      });
      return;
    }
    resetPasswordMutation.mutate({ email, code: code.trim(), newPassword });
  };

  return (
    <div className="family-shell flex flex-1 flex-col">
      <main className="flex-1 flex items-center justify-center p-4 py-8 sm:p-8">
        <Card className="family-card w-full max-w-md">
          <CardHeader className="space-y-2 p-6 sm:p-8 sm:pb-5">
            {step === "email" && (
              <>
                <CardTitle role="heading" aria-level={1} className="font-serif text-2xl flex items-center gap-2">
                  <Mail className="h-6 w-6" />
                  Reset Password
                </CardTitle>
                <CardDescription>
                  Enter your email address. We will send a six-digit code if it matches an account.
                </CardDescription>
              </>
            )}
            {step === "code" && (
              <>
                <CardTitle className="font-serif text-2xl flex items-center gap-2">
                  <Mail className="h-6 w-6" />
                  Enter Reset Code
                </CardTitle>
                <CardDescription>
                  Enter the six-digit code we sent to {email}.
                </CardDescription>
              </>
            )}
            {step === "newPassword" && (
              <>
                <CardTitle className="font-serif text-2xl flex items-center gap-2">
                  <KeyRound className="h-6 w-6" />
                  Create New Password
                </CardTitle>
                <CardDescription>
                  Choose a new password with at least 12 characters.
                </CardDescription>
              </>
            )}
            {step === "success" && (
              <>
                <CardTitle className="font-serif text-2xl text-green-600">
                  Password Reset Complete
                </CardTitle>
                <CardDescription>
                  You can now sign in with your new password.
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="p-6 pt-1 sm:px-8 sm:pb-8">
            {step === "email" && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-reset-email"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full min-h-12"
                  disabled={requestResetMutation.isPending}
                  data-testid="button-send-reset"
                >
                  {requestResetMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending code…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/login")}
                  data-testid="button-back-login"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetCode">6-Digit Code</Label>
                  <Input
                    id="resetCode"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    className="text-center text-2xl tracking-[0.5em]"
                    data-testid="input-reset-code"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full min-h-12"
                  disabled={verifyCodeMutation.isPending || code.length !== 6}
                  data-testid="button-verify-code"
                >
                  {verifyCodeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Code"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full min-h-12"
                  disabled={requestResetMutation.isPending}
                  onClick={() => requestResetMutation.mutate({ email })}
                  data-testid="button-resend-code"
                >
                  Resend code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full min-h-12"
                  onClick={() => { setStep("email"); setCode(""); }}
                  data-testid="button-change-email"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Use a different email
                </Button>
              </form>
            )}

            {step === "newPassword" && (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 12 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={12}
                      className="pr-10"
                      data-testid="input-new-password"
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
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={12}
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
                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetPasswordMutation.isPending}
                  data-testid="button-reset-password"
                >
                  {resetPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </form>
            )}

            {step === "success" && (
              <div className="space-y-4">
                <p className="text-center text-muted-foreground">
                  You can now sign in with your new password.
                </p>
                <Button
                  className="w-full"
                  onClick={() => navigate("/login")}
                  data-testid="button-go-login"
                >
                  Go to sign in
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
