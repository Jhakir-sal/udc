import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, CheckCircle, ArrowRight, ShieldCheck, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import logoHorizontalWhite from "@assets/logo-horizontal-white.png";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

type VerificationStep = "phone" | "verify-phone" | "id-verification" | "complete";

export default function CompleteVerification() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState<VerificationStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      if (user.phoneVerified && user.idVerificationStatus !== "verified") {
        setStep("id-verification");
      } else if (!user.phoneVerified) {
        setStep("phone");
        if (user.phoneNumber) {
          setPhoneNumber(user.phoneNumber.replace(/^\+1/, ""));
        }
      }
    }
  }, [user]);


  const sendPhoneVerificationMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string }) => {
      const response = await apiRequest("POST", "/api/auth/send-verification-to-existing-user", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      setStep("verify-phone");
      // In development mode, the server returns the code for testing
      if (data.devCode) {
        setDevCode(data.devCode);
      }
      toast({
        title: "Code sent",
        description: "We sent a verification code to your email.",
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

  const verifyPhoneMutation = useMutation({
    mutationFn: async (data: { code: string }) => {
      const response = await apiRequest("POST", "/api/auth/verify-phone-existing-user", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
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

  const startIdVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/create-id-verification-existing-user", {});
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.alreadyVerified) {
        toast({
          title: "Already verified",
          description: "Your identity is already verified — no need to do it again.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        window.location.href = "/";
      } else if (data.url) {
        window.location.href = data.url;
      } else if (data.devMode) {
        toast({
          title: "Development Mode",
          description: "ID verification will auto-complete in 5 seconds.",
        });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          window.location.href = "/";
        }, 5000);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Could not start ID verification",
        variant: "destructive",
      });
    },
  });

  const handleSendCode = () => {
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length !== 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid 10-digit US phone number",
        variant: "destructive",
      });
      return;
    }
    sendPhoneVerificationMutation.mutate({ phoneNumber: `+1${cleaned}` });
  };

  const handleVerifyPhone = () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit code",
        variant: "destructive",
      });
      return;
    }
    verifyPhoneMutation.mutate({ code: verificationCode });
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <a href="/" className="inline-flex items-center rounded-md bg-[#32453A] px-2 py-1 dark:bg-transparent">
            <img src={logoHorizontalWhite} alt="Steps After Life" className="h-10 w-auto" />
          </a>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2 mb-4">
              <span className={step === "phone" || step === "verify-phone" ? "text-primary font-medium" : ""}>
                Phone
              </span>
              <ArrowRight className="h-4 w-4" />
              <span className={step === "id-verification" ? "text-primary font-medium" : ""}>
                ID Verify
              </span>
              <ArrowRight className="h-4 w-4" />
              <span className={step === "complete" ? "text-primary font-medium" : ""}>
                Done
              </span>
            </div>

            {step === "phone" && (
              <>
                <CardTitle>Complete Your Verification</CardTitle>
                <CardDescription>
                  Hi {user?.firstName}, please verify your phone to secure your account.
                </CardDescription>
              </>
            )}

            {step === "verify-phone" && (
              <>
                <CardTitle>Enter Verification Code</CardTitle>
                <CardDescription>
                  We sent a 6-digit code to your email.
                </CardDescription>
                {devCode && (
                  <div className="mt-2 p-2 bg-amber-100 dark:bg-amber-900 rounded-md text-sm">
                    <span className="font-medium">Dev Mode:</span> Your code is <span className="font-mono font-bold">{devCode}</span>
                  </div>
                )}
              </>
            )}

            {step === "id-verification" && (
              <>
                <CardTitle>Verify Your Identity</CardTitle>
                <CardDescription>
                  Final step: verify your identity for maximum account security.
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {step === "phone" && (
              <>
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Phone className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 bg-muted rounded-md border text-sm text-muted-foreground">
                      +1
                    </div>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="555-123-4567"
                      value={formatPhone(phoneNumber)}
                      onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                      data-testid="input-phone"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    We'll send a verification code to your email
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSendCode}
                  disabled={sendPhoneVerificationMutation.isPending}
                  data-testid="button-send-code"
                >
                  {sendPhoneVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending code...
                    </>
                  ) : (
                    "Send verification code"
                  )}
                </Button>
              </>
            )}

            {step === "verify-phone" && (
              <>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={verificationCode}
                    onChange={setVerificationCode}
                    data-testid="input-verification-code"
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
                  className="w-full"
                  onClick={handleVerifyPhone}
                  disabled={verifyPhoneMutation.isPending || verificationCode.length !== 6}
                  data-testid="button-verify-code"
                >
                  {verifyPhoneMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify phone"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("phone")}
                >
                  Use a different number
                </Button>
              </>
            )}

            {step === "id-verification" && (
              <>
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <ShieldCheck className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    To protect your account and ensure secure access to sensitive documents,
                    we need to verify your identity.
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Your information is encrypted and secure</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => startIdVerificationMutation.mutate()}
                  disabled={startIdVerificationMutation.isPending}
                  data-testid="button-start-id-verification"
                >
                  {startIdVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting verification...
                    </>
                  ) : (
                    "Start ID verification"
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
