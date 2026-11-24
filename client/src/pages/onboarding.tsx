import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignaturePad } from "@/components/signature-pad";
import {
  Loader2,
  ShieldCheck,
  FileSignature,
  HelpCircle,
  CheckCircle2,
  LogOut,
  Search,
  PenLine,
  Type,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import logoHorizontalWhite from "@assets/logo-horizontal-white.png";
import { CURRENT_LPOA_AGREEMENT } from "@shared/lpoaAgreement";
import { legalNamesMatch } from "@shared/legalName";
import { CaseRegistrationReference } from "@/components/case-registration-reference";

interface OnboardingStatus {
  certificateId?: string | null;
  required: boolean;
  complete: boolean;
  idVerificationStatus?: "not_started" | "pending" | "verified" | "failed";
  idVerificationFallbackAvailable?: boolean;
  identitySource?: "stripe_verified" | "self_attested_provider_unavailable" | null;
  lpoaSigned?: boolean;
  lpoaReplacementRequired?: boolean;
  lpoa?: { signedAt: string; validUntil: string; principalName: string } | null;
  identity?: {
    verifiedLegalName: string | null;
    identitySource?: "stripe_verified" | "self_attested_provider_unavailable" | null;
    accountNameMatchesId: boolean;
    certificateAuthorized: boolean;
    certificateMatch: "next_of_kin" | "informant" | null;
    relationshipOverrideApproved: boolean;
    reviewRequired: boolean;
    issues: string[];
  };
  estateQuestionNeeded?: boolean;
  estateStatus?: string | null;
  deceasedName?: string | null;
  prefill?: {
    principalName: string;
    principalStreet?: string;
    principalCity?: string;
    principalState?: string;
    principalZip?: string;
  };
}

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

function oneYearFromToday(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function Onboarding() {
  const { logout } = useAuth();
  const { toast } = useToast();

  const statusQuery = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    refetchInterval: (query) =>
      query.state.data?.idVerificationStatus === "pending" ? 5000 : false,
  });
  const status = statusQuery.data;

  const [principalStreet, setPrincipalStreet] = useState<string | null>(null);
  const [principalCity, setPrincipalCity] = useState<string | null>(null);
  const [principalState, setPrincipalState] = useState<string | null>(null);
  const [principalZip, setPrincipalZip] = useState<string | null>(null);
  const [signatureTab, setSignatureTab] = useState<"drawn" | "typed">("drawn");
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [typedSignature, setTypedSignature] = useState("");
  const [consent, setConsent] = useState(false);
  const [principalName, setPrincipalName] = useState<string | null>(null);
  const [identityFallbackAttested, setIdentityFallbackAttested] = useState(false);
  const [estateAnswered, setEstateAnswered] = useState<"no" | "unsure" | null>(null);
  const [askExecutor, setAskExecutor] = useState(false);

  const fallbackIdentity =
    !!status?.idVerificationFallbackAvailable ||
    status?.identitySource === "self_attested_provider_unavailable";
  const nameValue =
    principalName ??
    status?.identity?.verifiedLegalName ??
    status?.prefill?.principalName ??
    "";
  const verifiedIdName =
    status?.idVerificationStatus === "verified" &&
    status?.identity?.identitySource === "stripe_verified"
      ? status?.identity?.verifiedLegalName
      : null;
  const nameDiffersFromId =
    !!verifiedIdName && !!nameValue.trim() && !legalNamesMatch(nameValue, verifiedIdName);
  const streetValue = principalStreet ?? status?.prefill?.principalStreet ?? "";
  const cityValue = principalCity ?? status?.prefill?.principalCity ?? "";
  const stateValue = principalState ?? status?.prefill?.principalState ?? "";
  const zipValue = principalZip ?? status?.prefill?.principalZip ?? "";
  const addressValue = [
    streetValue.trim(),
    cityValue.trim(),
    [stateValue.trim(), zipValue.trim()].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  const startIdVerification = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/create-id-verification-existing-user", { returnPath: "/" });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.alreadyVerified) {
        toast({ title: "Already verified", description: "Your identity is already verified — no need to do it again." });
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      } else if (data.url) {
        window.location.href = data.url;
      } else if (data.devMode) {
        toast({ title: "Development mode", description: "ID verification will auto-complete shortly." });
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] }), 6000);
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Could not start verification", description: error.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      window.location.href = "/";
    },
  });

  const signLpoa = useMutation({
    mutationFn: async () => {
      const signatureData = signatureTab === "drawn" ? drawnSignature : typedSignature.trim();
      const res = await apiRequest("POST", "/api/onboarding/lpoa/sign", {
        certificateId: status?.certificateId,
        principalName: nameValue.trim(),
        principalAddress: addressValue.trim(),
        signatureType: signatureTab,
        signatureData,
        consentAgreed: consent,
        identityFallbackAttested,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "LPOA signed", description: "Your Limited Power of Attorney has been recorded." });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
    },
    onError: (error: any) => {
      toast({ title: "Signing failed", description: error.message, variant: "destructive" });
    },
  });

  const answerEstate = useMutation({
    mutationFn: async (payload: { answer: "yes" | "no" | "unsure"; isExecutor?: "yes" | "no" | "unsure" }) => {
      const res = await apiRequest("POST", "/api/onboarding/estate-answer", { ...payload, certificateId: status?.certificateId });
      return res.json();
    },
    onSuccess: (data: any, payload) => {
      if (payload.answer === "yes") {
        setAskExecutor(false);
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      } else {
        setEstateAnswered(payload.answer as "no" | "unsure");
      }
    },
    onError: (error: any) => {
      toast({ title: "Could not save answer", description: error.message, variant: "destructive" });
    },
  });

  if (statusQuery.isLoading || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const idDone =
    status.idVerificationStatus === "verified" ||
    !!status.idVerificationFallbackAvailable ||
    status.identitySource === "self_attested_provider_unavailable";
  const lpoaDone = !!status.lpoaSigned;
  const estateDone = !status.estateQuestionNeeded && !estateAnswered;

  let currentStep: "id" | "lpoa" | "estate" | "review" | "done";
  if (!idDone) currentStep = "id";
  else if (!lpoaDone) currentStep = "lpoa";
  else if (status.estateQuestionNeeded || estateAnswered) currentStep = "estate";
  else if (!status.complete) currentStep = "review";
  else currentStep = "done";

  const steps = [
    { key: "id", label: "Your ID", icon: ShieldCheck, done: idDone },
    { key: "lpoa", label: "Your permission", icon: FileSignature, done: lpoaDone },
    { key: "estate", label: "Estate plans", icon: HelpCircle, done: estateDone && idDone && lpoaDone },
    { key: "review", label: "Final check", icon: ShieldCheck, done: status.complete },
  ];

  const signatureReady =
    signatureTab === "drawn"
      ? !!drawnSignature
      : typedSignature.trim().length >= 2 && legalNamesMatch(typedSignature, nameValue);
  const canSign =
    nameValue.trim().length >= 2 &&
    !nameDiffersFromId &&
    !!status.certificateId &&
    streetValue.trim().length >= 3 &&
    cityValue.trim().length >= 2 &&
    stateValue.trim().length === 2 &&
    zipValue.trim().length >= 5 &&
    signatureReady &&
    consent &&
    (!fallbackIdentity || identityFallbackAttested);

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <span className="inline-flex rounded-md bg-[#32453A] px-2 py-1 dark:bg-transparent">
            <img src={logoHorizontalWhite} alt="Steps After Life" className="h-9 w-auto" />
          </span>
          <CaseRegistrationReference caseId={status.certificateId} />
          <Button variant="ghost" size="sm" onClick={() => logout()} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 flex justify-center p-4 sm:py-8">
        <div className="w-full max-w-lg space-y-4">
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1 sm:gap-2">
                {i > 0 && <div className="w-6 sm:w-10 h-px bg-border" />}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${
                    s.done
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : currentStep === s.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`step-indicator-${s.key}`}
                >
                  {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                  <span className="hidden xs:inline sm:inline">{s.label}</span>
                </div>
              </div>
            ))}
          </div>

          {currentStep === "id" && (
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <ShieldCheck className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <CardTitle>Verify your identity</CardTitle>
                <CardDescription>
                  We need to confirm who you are before we share private case information. Take a photo of your government ID and a quick selfie. This usually takes about two minutes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {fallbackIdentity && (
                  <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span>
                      {status.idVerificationStatus === "failed"
                        ? "We could not verify your government ID. You may continue by securely attesting your full legal name for concierge review."
                        : "ID verification is currently unavailable. You may continue by securely attesting your full legal name."}
                    </span>
                  </div>
                )}
                {status.idVerificationStatus === "pending" && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin" />
                     We are checking your ID. This page will update on its own.
                  </div>
                )}
                {status.idVerificationStatus === "failed" && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md text-center">
                     We could not verify your ID. Please try again.
                  </div>
                )}
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => startIdVerification.mutate()}
                  disabled={startIdVerification.isPending || status.idVerificationStatus === "pending"}
                  data-testid="button-start-id-verification"
                >
                  {startIdVerification.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {status.idVerificationStatus === "failed" ? "Retry ID verification" : "Start ID verification"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                   Stripe Identity handles this check. Your information is encrypted.
                </p>
              </CardContent>
            </Card>
          )}

          {currentStep === "lpoa" && (
            <Card>
              <CardHeader>
                <CardTitle role="heading" aria-level={1} className="flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-primary" />
                  Limited Power of Attorney
                </CardTitle>
                <CardDescription>
                   {status.lpoaReplacementRequired
                     ? "Your concierge asked for a corrected authorization. Your earlier signed document stays in your case history."
                     : "A Limited Power of Attorney lets Steps After Life act for you on end-of-life matters only."}
                   {" "}Check your details, then sign below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {fallbackIdentity && (
                  <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="identity-fallback-warning">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span>
                      {status.idVerificationStatus === "failed"
                        ? "Your government ID was not verified. Type your full legal name exactly as it appears in your case records. This attestation is recorded for concierge review."
                        : status.idVerificationStatus === "verified"
                          ? "Your ID check finished, but it did not provide a legal name. Enter your full legal name below and attest to it for concierge review. Your typed name is not an ID-verified name."
                        : "Stripe ID verification is unavailable. Type your full legal name exactly as it appears in your case records. This attestation is recorded with your authorization."}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor="principal-name">Your full legal name</Label>
                    <Input
                      id="principal-name"
                      value={nameValue}
                      onChange={(e) => setPrincipalName(e.target.value)}
                      placeholder="Full legal name"
                      data-testid="input-principal-name"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {verifiedIdName
                        ? "Filled from your verified ID. Check the spelling before signing."
                        : "Enter your complete legal name. It must exactly match your account and case records."}
                    </p>
                    {nameDiffersFromId && (
                      <p className="mt-1 text-xs text-destructive" data-testid="text-lpoa-id-name-mismatch">
                        This name differs from the verified ID. We cannot sign the authorization under a different name without concierge review. Contact your concierge if the ID name needs correction.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="principal-street">Street address</Label>
                    <Input
                      id="principal-street"
                      value={streetValue}
                      onChange={(e) => setPrincipalStreet(e.target.value)}
                      placeholder="123 Main St"
                      data-testid="input-principal-street"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <Label htmlFor="principal-city">City</Label>
                      <Input
                        id="principal-city"
                        value={cityValue}
                        onChange={(e) => setPrincipalCity(e.target.value)}
                        placeholder="City"
                        data-testid="input-principal-city"
                      />
                    </div>
                    <div>
                      <Label htmlFor="principal-state">State</Label>
                      <Select value={stateValue} onValueChange={(v) => setPrincipalState(v)}>
                        <SelectTrigger id="principal-state" data-testid="select-principal-state">
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="principal-zip">ZIP</Label>
                      <Input
                        id="principal-zip"
                        value={zipValue}
                        onChange={(e) => setPrincipalZip(e.target.value.replace(/[^0-9-]/g, "").slice(0, 10))}
                        placeholder="ZIP"
                        inputMode="numeric"
                        data-testid="input-principal-zip"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-4 max-h-72 overflow-y-auto text-sm space-y-3" data-testid="text-lpoa-document">
                  <p className="font-semibold text-center">{CURRENT_LPOA_AGREEMENT.title} (Standard)</p>
                  <p>
                    I, <span className="font-semibold underline decoration-dotted">{nameValue.trim() || "________________"}</span>,
                    whose address is <span className="font-semibold underline decoration-dotted">{addressValue.trim() || "________________"}</span> ("Principal").
                  </p>
                  <p>
                    {CURRENT_LPOA_AGREEMENT.grantParagraph}
                  </p>
                  <ol className="list-decimal pl-5 space-y-1">
                    {CURRENT_LPOA_AGREEMENT.authorizedActions.map((action) => <li key={action}>{action}</li>)}
                  </ol>
                  <p>
                    This limited power of attorney is valid from the date of its execution until{" "}
                    <span className="font-semibold underline decoration-dotted">{oneYearFromToday()}</span>.
                  </p>
                  <p>
                    {CURRENT_LPOA_AGREEMENT.diligenceParagraph}
                  </p>
                  <p>
                    {CURRENT_LPOA_AGREEMENT.limitationParagraph}
                  </p>
                  <p>
                    {CURRENT_LPOA_AGREEMENT.acknowledgementParagraph}
                  </p>
                </div>

                <div>
                  <Label className="mb-2 block">Your signature</Label>
                  <Tabs value={signatureTab} onValueChange={(v) => setSignatureTab(v as "drawn" | "typed")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="drawn" data-testid="tab-signature-draw">
                        <PenLine className="h-4 w-4 mr-1" />
                        Draw
                      </TabsTrigger>
                      <TabsTrigger value="typed" data-testid="tab-signature-type">
                        <Type className="h-4 w-4 mr-1" />
                        Type
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="drawn" className="mt-3">
                      <SignaturePad onChange={setDrawnSignature} />
                    </TabsContent>
                    <TabsContent value="typed" className="mt-3 space-y-2">
                      <Input
                        value={typedSignature}
                        onChange={(e) => setTypedSignature(e.target.value)}
                        placeholder="Type your full name"
                        data-testid="input-typed-signature"
                      />
                      {typedSignature.trim() && (
                        <div className="rounded-lg border bg-white dark:bg-slate-100 p-4 text-center">
                          <span className="font-serif italic text-2xl text-slate-800" data-testid="text-typed-signature-preview">
                            {typedSignature.trim()}
                          </span>
                        </div>
                      )}
                      {typedSignature.trim() && !legalNamesMatch(typedSignature, nameValue) && (
                        <p className="text-xs text-destructive">
                          Your typed signature must exactly match your full legal name.
                        </p>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                {fallbackIdentity && (
                  <label className="flex items-start gap-3 text-sm cursor-pointer" data-testid="checkbox-identity-fallback-attestation">
                    <Checkbox
                      checked={identityFallbackAttested}
                      onCheckedChange={(v) => setIdentityFallbackAttested(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      I attest that the name entered above is my full legal name and exactly matches my case records.
                    </span>
                  </label>
                )}

                <label className="flex items-start gap-3 text-sm cursor-pointer" data-testid="checkbox-lpoa-consent">
                  <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                  <span>
                     I have read and understand this Limited Power of Attorney. I intend this electronic signature to be legally binding, like a handwritten signature.
                  </span>
                </label>

                {!status.certificateId && (
                  <p className="text-sm text-amber-900 rounded-md border border-amber-300 bg-amber-50 p-3" data-testid="text-lpoa-case-required">
                    A case must be linked to your account before you can sign this authorization. Please contact your concierge to link your case.
                  </p>
                )}
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => signLpoa.mutate()}
                  disabled={!canSign || signLpoa.isPending}
                  data-testid="button-sign-lpoa"
                >
                  {signLpoa.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSignature className="h-4 w-4 mr-2" />}
                  Sign &amp; continue
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep === "estate" && !estateAnswered && !askExecutor && (
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <HelpCircle className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <CardTitle>One quick question</CardTitle>
                <CardDescription>
                   Did {status.deceasedName || "your loved one"} have a will, trust, or estate plan?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full h-12 text-base"
                  variant="outline"
                  onClick={() => setAskExecutor(true)}
                  disabled={answerEstate.isPending}
                  data-testid="button-estate-yes"
                >
                   Yes, there is a will, trust, or estate plan
                </Button>
                <Button
                  className="w-full h-12 text-base"
                  variant="outline"
                  onClick={() => answerEstate.mutate({ answer: "no" })}
                  disabled={answerEstate.isPending}
                  data-testid="button-estate-no"
                >
                   No, not that I know of
                </Button>
                <Button
                  className="w-full h-12 text-base"
                  variant="outline"
                  onClick={() => answerEstate.mutate({ answer: "unsure" })}
                  disabled={answerEstate.isPending}
                  data-testid="button-estate-unsure"
                >
                  I'm not sure
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  disabled={answerEstate.isPending}
                  onClick={async () => {
                    try {
                      await apiRequest("POST", "/api/onboarding/estate-answer", { answer: "unsure", certificateId: status?.certificateId });
                    } catch { /* proceed regardless */ }
                    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
                    window.location.href = "/";
                  }}
                  data-testid="button-estate-skip"
                >
                   Do this later
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep === "estate" && !estateAnswered && askExecutor && (
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <HelpCircle className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <CardTitle>Are you the authorized executor?</CardTitle>
                <CardDescription>
                  Are you the executor named to handle {status.deceasedName ? `${status.deceasedName}'s` : "this"} estate? An executor is the person legally named to carry out a will.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full h-12 text-base"
                  variant="outline"
                  onClick={() => answerEstate.mutate({ answer: "yes", isExecutor: "yes" })}
                  disabled={answerEstate.isPending}
                  data-testid="button-executor-yes"
                >
                  Yes, I am the authorized executor
                </Button>
                <Button
                  className="w-full h-12 text-base"
                  variant="outline"
                  onClick={() => answerEstate.mutate({ answer: "yes", isExecutor: "no" })}
                  disabled={answerEstate.isPending}
                  data-testid="button-executor-no"
                >
                  No, someone else is
                </Button>
                <Button
                  className="w-full h-12 text-base"
                  variant="outline"
                  onClick={() => answerEstate.mutate({ answer: "yes", isExecutor: "unsure" })}
                  disabled={answerEstate.isPending}
                  data-testid="button-executor-unsure"
                >
                  I'm not sure
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setAskExecutor(false)}
                  data-testid="button-executor-back"
                >
                  Back
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep === "estate" && estateAnswered && (
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Search className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <CardTitle>Let's check the National Estate Registry</CardTitle>
                <CardDescription>
                  {estateAnswered === "no"
                    ? "Even when families believe there's no estate, one is sometimes registered without their knowledge."
                    : "Since you're not sure, the best next step is a quick search of the National Estate Registry."}{" "}
                  Searching takes less than a minute and can uncover wills, trusts, or registered estates for{" "}
                  {status.deceasedName || "your loved one"}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
                    window.location.href = `/estate-registry?tab=ner&name=${encodeURIComponent(status.deceasedName || "")}`;
                  }}
                  data-testid="button-search-ner"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search the Estate Registry
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
                    window.location.href = "/";
                  }}
                  data-testid="button-skip-ner"
                >
                  I'll do this later
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep === "done" && (
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <CardTitle>You're all set</CardTitle>
                <CardDescription>
                   Your identity is verified and your authorization is signed. Our team can now begin work for you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => (window.location.href = "/")}
                  data-testid="button-go-dashboard"
                >
                  Go to my dashboard
                </Button>
              </CardContent>
            </Card>
          )}

          {currentStep === "review" && (
            <Card data-testid="card-identity-review-pending">
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="p-4 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                    <ShieldCheck className="h-8 w-8 text-amber-700 dark:text-amber-400" />
                  </div>
                </div>
                 <CardTitle>We are reviewing your case</CardTitle>
                <CardDescription>
                   Your ID and authorization are complete. A concierge is checking the documented name or relationship before work begins.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                   You do not need to do anything now. We will update your account when the review is complete.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] })}
                  data-testid="button-refresh-identity-review"
                >
                  Refresh status
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
