import { useState } from "react";
import { formatPhone } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FAMILY_DOCUMENT_TYPES } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  Phone,
  User,
  Mail,
  FileText,
  Upload,
  ExternalLink,
  Trash2,
} from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

type PhoneStep = "idle" | "enter" | "verify";

export default function SettingsPage() {
  const { user } = useAuth();
  const staffMfaRequired = user?.role === "admin" || user?.role === "funeral_home";
  const { toast } = useToast();
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("idle");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [codeSentVia, setCodeSentVia] = useState<"sms" | "email">("email");

  const securityQuery = useQuery({
    queryKey: ["/api/user/security"],
  });

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docType, setDocType] = useState("other");
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const certificatesQuery = useQuery<any[]>({ queryKey: ["/api/certificates"], enabled: user?.role === "user" });

  const myDocsQuery = useQuery<any[]>({
    queryKey: ["/api/family-documents"],
    enabled: user?.role === "user",
    refetchInterval: (query) =>
      (query.state.data as any[] | undefined)?.some((doc) => doc.analysis?.status === "pending")
        ? 5000
        : false,
  });

  const updateSuggestionMutation = useMutation({
    mutationFn: async ({ id, category, status }: { id: string; category?: string; status?: "dismissed" }) =>
      (await apiRequest("PATCH", `/api/family-document-suggestions/${id}`, { category, status })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] }),
    onError: (error: any) => toast({ title: "Could not update suggestion", description: error.message, variant: "destructive" }),
  });
  const confirmSuggestionMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/family-document-suggestions/${id}/confirm`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Account added for review", description: "The suggestion was added as an account. Your concierge team still needs to review any action." });
    },
    onError: (error: any) => toast({ title: "Could not confirm suggestion", description: error.message, variant: "destructive" }),
  });
  const retryAnalysisMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/family-documents/${id}/analyze`, {})).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] }),
    onError: (error: any) => toast({ title: "Could not retry scan", description: error.message, variant: "destructive" }),
  });

  const handleDocUpload = async (files: File[]) => {
    if (!selectedCertificateId) {
      toast({ title: "Choose a case", description: "Select the loved one's case before uploading.", variant: "destructive" });
      return;
    }
    if (files.length > 10) {
      toast({ title: "Too many files", description: "You can upload up to 10 documents at a time.", variant: "destructive" });
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    const invalid = files.find((f) => !validTypes.includes(f.type));
    if (invalid) {
      toast({ title: "Invalid file type", description: `${invalid.name} is not a PDF or image file.`, variant: "destructive" });
      return;
    }
    const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) {
      toast({ title: "File too large", description: `${tooBig.name} exceeds the 10MB limit.`, variant: "destructive" });
      return;
    }
    setIsUploadingDoc(true);
    let uploaded = 0;
    const failed: string[] = [];
    for (const file of files) {
      try {
        const metaRes = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type,
          certificateId: selectedCertificateId,
        });
        const { uploadURL, objectPath } = await metaRes.json();
        const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type, "x-ms-blob-type": "BlockBlob" } });
        if (!uploadRes.ok) throw new Error("Upload failed");
        await apiRequest("POST", "/api/family-documents", {
          label: file.name.replace(/\.[^.]+$/, ""),
          documentType: docType,
          certificateId: selectedCertificateId,
          fileName: file.name,
          objectPath,
          contentType: file.type,
        });
        uploaded++;
      } catch {
        failed.push(file.name);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] });
    if (failed.length === 0) {
      toast({ title: uploaded === 1 ? "Document uploaded" : `${uploaded} documents uploaded`, description: "Your concierge team can now view them." });
    } else {
      toast({ title: `${uploaded} uploaded, ${failed.length} failed`, description: `Failed: ${failed.join(", ")}`, variant: "destructive" });
    }
    setIsUploadingDoc(false);
  };

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => {
      await apiRequest("DELETE", `/api/family-documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-documents"] });
      toast({ title: "Document removed", description: "It is no longer available to you or the Steps After Life team." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove document", description: error.message, variant: "destructive" });
    },
  });

  const toggle2FAMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/security/toggle-2fa", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/security"] });
      toast({
        title: data.twoFactorEnabled ? "MFA Enabled" : "MFA Disabled",
        description: data.twoFactorEnabled
          ? "You'll receive a code by text message when signing in (email if the text can't be delivered)."
          : "Multi-factor authentication has been turned off.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update MFA", description: error.message, variant: "destructive" });
    },
  });

  const sendPhoneCodeMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string }) => {
      const res = await apiRequest("POST", "/api/user/security/send-phone-code", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      const via = data.sentVia === "sms" ? "sms" : "email";
      setCodeSentVia(via);
      setPhoneStep("verify");
      toast({
        title: "Code sent",
        description:
          via === "sms"
            ? "Check your phone for a text message with the verification code."
            : "Check your email for the verification code.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send code", description: error.message, variant: "destructive" });
    },
  });

  const verifyPhoneCodeMutation = useMutation({
    mutationFn: async (data: { code: string }) => {
      const res = await apiRequest("POST", "/api/user/security/verify-phone-code", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/security"] });
      setPhoneStep("idle");
      setPhoneNumber("");
      setVerifyCode("");
      toast({ title: "Phone verified", description: "Your phone number has been verified. You can now enable MFA." });
    },
    onError: (error: any) => {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  const security = securityQuery.data as any;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-semibold" data-testid="text-settings-title">Account Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your contact details, security, and documents.</p>
      </div>

      {user?.role === "user" && <Card data-testid="settings-family-access-link">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-medium">Family case access</p><p className="text-sm text-muted-foreground">Review identity checks and sharing permissions for invited cases.</p></div>
          <Button asChild variant="outline"><Link href="/family-access" data-testid="link-settings-family-access">View safeguards</Link></Button>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email</span>
            </div>
            <span className="text-sm font-medium" data-testid="text-user-email">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Name</span>
            </div>
            <span className="text-sm font-medium" data-testid="text-user-name">
              {user?.firstName} {user?.lastName}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Phone Verification
          </CardTitle>
          <CardDescription>
             Verify your phone before you turn on sign-in codes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {securityQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Phone Number</p>
                  {security?.phoneNumber ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-phone-number">{security.phoneNumber}</p>
                  ) : (
                     <p className="text-sm text-muted-foreground">No phone number saved</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {security?.phoneVerified ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1" data-testid="badge-phone-verified">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1" data-testid="badge-phone-unverified">
                      <XCircle className="h-3 w-3" />
                      Not Verified
                    </Badge>
                  )}
                </div>
              </div>

              {phoneStep === "idle" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPhoneStep("enter")}
                  data-testid="button-add-phone"
                >
                  <Phone className="h-4 w-4 mr-1" />
                   {security?.phoneNumber ? "Change phone number" : "Add phone number"}
                </Button>
              )}

              {phoneStep === "enter" && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <Label htmlFor="phoneNumber">Mobile Phone Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="phoneNumber"
                      type="tel"
                      placeholder="555-123-4567"
                      value={formatPhone(phoneNumber)}
                      onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                      data-testid="input-phone-number"
                    />
                    <Button
                      size="sm"
                      onClick={() => sendPhoneCodeMutation.mutate({ phoneNumber })}
                      disabled={sendPhoneCodeMutation.isPending || !phoneNumber}
                      data-testid="button-send-phone-code"
                    >
                      {sendPhoneCodeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Send Code"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPhoneStep("idle"); setPhoneNumber(""); }}
                      data-testid="button-cancel-phone"
                    >
                      Cancel
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                     We will text a six-digit code to this number. You must receive the text to verify this phone.
                  </p>
                </div>
              )}

              {phoneStep === "verify" && (
                <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                  <div className="text-center">
                    <p className="text-sm font-medium mb-1">Enter Verification Code</p>
                    <p className="text-xs text-muted-foreground">
                      {codeSentVia === "sms"
                        ? "We texted a 6-digit code to your phone. Codes expire in 10 minutes."
                        : "We sent a 6-digit code to your email."}
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={verifyCode}
                      onChange={setVerifyCode}
                      data-testid="input-phone-verify-code"
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
                  <div className="flex justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => verifyPhoneCodeMutation.mutate({ code: verifyCode })}
                      disabled={verifyPhoneCodeMutation.isPending || verifyCode.length !== 6}
                      data-testid="button-verify-phone-code"
                    >
                      {verifyPhoneCodeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : null}
                      Verify
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPhoneStep("enter");
                        setVerifyCode("");
                      }}
                      data-testid="button-resend-phone-code"
                    >
                      Request another code after 10 minutes
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Multi-Factor Authentication (MFA)
          </CardTitle>
          <CardDescription>
             When this is on, enter your password and then a code each time you sign in. We text verified phones; if text delivery fails, we can email a backup code to your verified address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {securityQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${security?.twoFactorEnabled || staffMfaRequired ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"}`}>
                    <Lock className={`h-4 w-4 ${security?.twoFactorEnabled || staffMfaRequired ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                     <p className="text-sm font-medium">Sign-in verification code</p>
                    <p className="text-xs text-muted-foreground">
                      {security?.twoFactorEnabled || staffMfaRequired
                         ? security?.phoneVerified
                           ? `Text codes go to your verified phone ending in ${security?.phoneNumber?.replace(/\D/g, "").slice(-4)}. Email is available as a backup.`
                           : "Email verification is active. Enroll and verify your phone above to switch to text codes."
                         : "Turn this on to require a code every time you sign in."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {toggle2FAMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Switch
                    checked={!!security?.twoFactorEnabled || staffMfaRequired}
                    onCheckedChange={() => {
                      if (!security?.phoneVerified) {
                        toast({
                          title: "Phone verification required",
                          description: "Please verify your phone number first before enabling MFA.",
                          variant: "destructive",
                        });
                        return;
                      }
                      toggle2FAMutation.mutate();
                    }}
                    disabled={toggle2FAMutation.isPending || staffMfaRequired}
                    data-testid="switch-toggle-2fa"
                  />
                </div>
              </div>
              {!security?.phoneVerified && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />
                  Verify your phone number above to use text MFA. Until then, sign-in codes use your verified email.
                </p>
              )}
              {staffMfaRequired && (
                <p className="text-xs text-muted-foreground">MFA is required for staff accounts and cannot be turned off.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {user?.role === "user" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              My Documents
            </CardTitle>
            <CardDescription>
               Share documents with your Steps After Life team, such as ID, wills, insurance policies, or statements. Choose a document type, then choose up to 10 files. Only you and the team can see them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="w-[220px]" data-testid="select-doc-type">
                  <SelectValue placeholder="Document type" />
                </SelectTrigger>
                <SelectContent>
                  {FAMILY_DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedCertificateId} onValueChange={setSelectedCertificateId}>
                <SelectTrigger className="w-[280px]" data-testid="select-document-case"><SelectValue placeholder="Choose case" /></SelectTrigger>
                <SelectContent>{(certificatesQuery.data || []).map((certificate) => (
                  <SelectItem key={certificate.id} value={certificate.id}>{certificate.deceasedName}</SelectItem>
                ))}</SelectContent>
              </Select>
              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) handleDocUpload(files);
                    e.target.value = "";
                  }}
                  data-testid="input-upload-my-doc"
                />
                <Button variant="outline" size="sm" asChild disabled={isUploadingDoc}>
                  <span className="cursor-pointer">
                    {isUploadingDoc ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                     Upload documents
                  </span>
                </Button>
              </label>
            </div>
            {myDocsQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : myDocsQuery.data && myDocsQuery.data.length > 0 ? (
              <div className="space-y-2">
                {myDocsQuery.data.map((doc: any) => (
                  <div key={doc.id} className="text-sm p-2.5 rounded-lg border" data-testid={`row-my-doc-${doc.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{doc.label || doc.fileName}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs" data-testid={`badge-doc-type-${doc.id}`}>
                          {FAMILY_DOCUMENT_TYPES.find((t) => t.value === doc.documentType)?.label || "Other"}
                        </Badge>
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 px-2" asChild data-testid={`button-view-my-doc-${doc.id}`}>
                          <a href={doc.objectPath} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive"
                          onClick={() => deleteDocMutation.mutate(doc.id)}
                          disabled={deleteDocMutation.isPending}
                          data-testid={`button-delete-my-doc-${doc.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {doc.analysis?.status === "pending" && (
                       <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                         <Loader2 className="h-3 w-3 animate-spin" /> Scanning document for recurring payments…
                       </div>
                     )}
                     {doc.analysis?.status === "failed" && (
                       <div className="mt-2 flex items-center justify-between gap-2 text-xs text-destructive">
                         <span>Document scan failed. No account was created.</span>
                         <Button size="sm" variant="outline" onClick={() => retryAnalysisMutation.mutate(doc.id)} disabled={retryAnalysisMutation.isPending}>Retry scan</Button>
                       </div>
                     )}
                     {doc.analysis?.status === "completed" && doc.analysis.suggestions?.length === 0 && (
                       <p className="mt-2 text-xs text-muted-foreground">
                         Scan complete. No recurring payments were identified.
                       </p>
                     )}
                     {!!doc.analysis?.suggestions?.filter((s: any) => s.status === "pending").length && (
                       <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-2">
                          <div>
                            <p className="text-xs font-medium">Bills and recurring payments found</p>
                            <p className="text-xs text-muted-foreground">Review each suggestion below. Nothing is changed or cancelled automatically.</p>
                          </div>
                         {doc.analysis.suggestions.filter((s: any) => s.status === "pending").map((s: any) => (
                           <div key={s.id} className="rounded border bg-background p-2 space-y-2">
                             <div className="flex items-start justify-between gap-2">
                               <div>
                                 <p className="font-medium">{s.merchantName}</p>
                                 <p className="text-xs text-muted-foreground">{s.description}{s.amountCents != null ? ` · $${(s.amountCents / 100).toFixed(2)}` : ""}{s.frequency ? ` · ${s.frequency}` : ""}</p>
                               </div>
                               <Badge variant="outline">{s.confidence || "low"} confidence</Badge>
                             </div>
                             <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                               <p className="text-xs font-medium">What to do next</p>
                               <p className="mt-1 text-xs text-muted-foreground">{s.recommendedAction || "Review this item with the concierge team before taking action."}</p>
                             </div>
                             <div className="flex flex-wrap items-center gap-2">
                               <Select value={s.category} onValueChange={(category) => updateSuggestionMutation.mutate({ id: s.id, category })}>
                                 <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value="financial">Financial</SelectItem>
                                   <SelectItem value="memberships">Memberships</SelectItem>
                                   <SelectItem value="subscriptions">Subscriptions</SelectItem>
                                   <SelectItem value="real_estate">Phone & utilities</SelectItem>
                                   <SelectItem value="protected_information">Protected information</SelectItem>
                                   <SelectItem value="miscellaneous">Miscellaneous</SelectItem>
                                 </SelectContent>
                               </Select>
                               <Button size="sm" onClick={() => confirmSuggestionMutation.mutate(s.id)} disabled={confirmSuggestionMutation.isPending}>Add for concierge review</Button>
                               <Button size="sm" variant="ghost" onClick={() => updateSuggestionMutation.mutate({ id: s.id, status: "dismissed" })}>Dismiss</Button>
                             </div>
                           </div>
                         ))}
                       </div>
                     )}
                  </div>
                ))}
              </div>
             ) : (
               <p className="text-sm text-muted-foreground" data-testid="text-no-documents">No documents saved yet. Choose a type and upload a file when you are ready.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
