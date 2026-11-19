import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { formatDateInput, formatSsnInput } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Shield,
  FileCheck,
  Loader2,
  Copy,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  Upload,
  AlertTriangle,
  XCircle,
  FileImage,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

const certificateSchema = z.object({
  deceasedName: z.string().min(2, "Full legal name is required"),
  dateOfDeath: z.string().min(1, "Date of death is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  ssn: z.string().optional(),
  issuingAuthority: z.string().min(2, "Issuing authority is required"),
  stateCode: z.string().min(2, "State is required"),
  countyCode: z.string().min(2, "County is required"),
  placeOfDeathType: z.string().optional(),
  placeOfDeathFacility: z.string().optional(),
  placeOfDeathAddress: z.string().optional(),
  placeOfDeathCity: z.string().optional(),
  placeOfDeathCounty: z.string().optional(),
  placeOfDeathState: z.string().optional(),
  placeOfDeathZip: z.string().optional(),
  causeOfDeath: z.string().optional(),
  submitterName: z.string().min(2, "Your name is required"),
  submitterOrganization: z.string().min(2, "Authorized organization name is required"),
  submitterEmail: z.string().email("Valid email is required"),
  submitterPhone: z.string().optional(),
  submitterIsNextOfKin: z.boolean().default(true),
  nextOfKinName: z.string().optional(),
  nextOfKinRelationship: z.string().optional(),
  nextOfKinEmail: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  nextOfKinAddress: z.string().optional(),
  nextOfKinCity: z.string().optional(),
  nextOfKinState: z.string().optional(),
  nextOfKinZip: z.string().optional(),
}).refine((data) => {
  if (!data.submitterIsNextOfKin) {
    return !!data.nextOfKinName && data.nextOfKinName.length >= 2;
  }
  return true;
}, { message: "Next of kin name is required", path: ["nextOfKinName"] })
.refine((data) => {
  if (!data.submitterIsNextOfKin) {
    return !!data.nextOfKinEmail && data.nextOfKinEmail.includes("@");
  }
  return true;
}, { message: "Next of kin email is required", path: ["nextOfKinEmail"] })
.refine((data) => {
  if (!data.submitterIsNextOfKin) {
    return !!data.nextOfKinRelationship && data.nextOfKinRelationship.length >= 2;
  }
  return true;
}, { message: "Relationship to deceased is required", path: ["nextOfKinRelationship"] });

type CertificateFormData = z.infer<typeof certificateSchema>;

interface BlockchainResult {
  success: boolean;
  blockchainId: string;
  certificateNumber: string;
  blockchainHash: string;
  verificationStatus: string;
  aiVerificationStatus: string;
  message: string;
}

interface VerificationResult {
  success: boolean;
  verificationToken?: string;
  verification: {
    isAuthentic?: boolean;
    confidenceScore?: number;
    verificationStatus?: string;
    overallAssessment?: string;
    concerns?: string[];
    recommendations?: string[];
  };
  extractedData: Record<string, string | null>;
}

function VerifySection() {
  const { toast } = useToast();
  const [verifyId, setVerifyId] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const verifyMutation = useMutation({
    mutationFn: async (blockchainId: string) => {
      const res = await fetch(`/api/blockchain/verify/${encodeURIComponent(blockchainId)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Verification failed");
      }
      return res.json();
    },
    onSuccess: (data) => setVerifyResult(data),
    onError: (error: Error) => {
      setVerifyResult(null);
      toast({ title: "Not Found", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Check a record
        </CardTitle>
        <CardDescription>
          Enter a Blockchain ID or certificate number to confirm that a record exists. Personal information is never shown here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Blockchain ID or certificate number"
            value={verifyId}
            onChange={(e) => setVerifyId(e.target.value)}
            data-testid="input-verify-blockchain-id"
          />
          <Button
            onClick={() => verifyId.trim() && verifyMutation.mutate(verifyId.trim())}
            disabled={verifyMutation.isPending || !verifyId.trim()}
            data-testid="button-verify"
          >
            {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
        </div>
        {verifyResult && (
          <div className={`p-4 rounded-lg border ${verifyResult.verified ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900" : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"}`}>
            <div className="flex items-center gap-2 mb-2">
              {verifyResult.verified ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <EyeOff className="h-5 w-5 text-red-600" />}
              <span className="font-medium text-sm">{verifyResult.verified ? "Record confirmed" : "No record found"}</span>
            </div>
            {verifyResult.verified && (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Status: <Badge variant="outline" className="text-xs ml-1">{verifyResult.status}</Badge></p>
                <p>Issued by: {verifyResult.issuingAuthority}</p>
                <p>Recorded: {new Date(verifyResult.submittedAt).toLocaleDateString()}</p>
                <p className="text-xs italic mt-2 flex items-center gap-1"><Lock className="h-3 w-3" />Personal information is not shown during a check.</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BlockchainPortal() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<BlockchainResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFilePreview, setUploadedFilePreview] = useState<string | null>(null);
  const [documentObjectPath, setDocumentObjectPath] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [step, setStep] = useState<"upload" | "review" | "form">("upload");

  const form = useForm<CertificateFormData>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      deceasedName: "",
      dateOfDeath: "",
      dateOfBirth: "",
      ssn: "",
      issuingAuthority: "",
      stateCode: "",
      countyCode: "",
      placeOfDeathType: "",
      placeOfDeathFacility: "",
      placeOfDeathAddress: "",
      placeOfDeathCity: "",
      placeOfDeathCounty: "",
      placeOfDeathState: "",
      placeOfDeathZip: "",
      causeOfDeath: "",
      submitterName: "",
      submitterOrganization: "",
      submitterEmail: "",
      submitterPhone: "",
      submitterIsNextOfKin: true,
      nextOfKinName: "",
      nextOfKinRelationship: "",
      nextOfKinEmail: "",
      nextOfKinPhone: "",
      nextOfKinAddress: "",
      nextOfKinCity: "",
      nextOfKinState: "",
      nextOfKinZip: "",
    },
  });

  const resizeImageForAI = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 2048;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
          else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
        resolve(dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("Failed to load image")); };
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!supportedTypes.includes(file.type)) {
      toast({ title: "Unsupported file type", description: "Please upload JPEG, PNG, GIF, WebP, or PDF", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 20MB", variant: "destructive" });
      return;
    }

    setUploadedFile(file);
    setUploadProgress(0);
    setIsUploading(true);
    setVerificationResult(null);

    try {
      setUploadProgress(10);
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) {
        const errBody = await urlRes.text();
        throw new Error(`Upload setup failed: ${errBody}`);
      }
      const { uploadURL, objectPath } = await urlRes.json();

      setUploadProgress(30);
      const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error("File upload failed — please try again");

      setDocumentObjectPath(objectPath);
      setUploadProgress(50);

      if (file.type.startsWith('image/')) {
        setUploadedFilePreview(URL.createObjectURL(file));
      } else {
        setUploadedFilePreview(null);
      }

      setIsVerifying(true);
      setUploadProgress(60);

      try {
        let dataUrlForAI: string;
        if (file.type.startsWith('image/')) {
          dataUrlForAI = await resizeImageForAI(file);
        } else {
          dataUrlForAI = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
          });
        }

        setUploadProgress(70);

        const verifyRes = await fetch("/api/blockchain/verify-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrlForAI }),
        });

        if (!verifyRes.ok) {
          let errMsg = "Verification failed";
          try { const err = await verifyRes.json(); errMsg = err.error || errMsg; } catch {}
          throw new Error(errMsg);
        }

        const result: VerificationResult = await verifyRes.json();
        setVerificationResult(result);

        if (result.extractedData) {
          const ed = result.extractedData;
          if (ed.deceasedName) form.setValue("deceasedName", ed.deceasedName);
          if (ed.dateOfBirth) form.setValue("dateOfBirth", ed.dateOfBirth);
          if (ed.dateOfDeath) form.setValue("dateOfDeath", ed.dateOfDeath);
          if (ed.issuingAuthority) form.setValue("issuingAuthority", ed.issuingAuthority);
          if (ed.stateCode) form.setValue("stateCode", ed.stateCode);
          if (ed.countyCode) form.setValue("countyCode", ed.countyCode);
          if (ed.placeOfDeathType) form.setValue("placeOfDeathType", ed.placeOfDeathType);
          if (ed.placeOfDeathFacility) form.setValue("placeOfDeathFacility", ed.placeOfDeathFacility);
          if (ed.placeOfDeathCity) form.setValue("placeOfDeathCity", ed.placeOfDeathCity);
          if (ed.placeOfDeathCounty) form.setValue("placeOfDeathCounty", ed.placeOfDeathCounty);
          if (ed.placeOfDeathState) form.setValue("placeOfDeathState", ed.placeOfDeathState);
          if (ed.placeOfDeathZip) form.setValue("placeOfDeathZip", ed.placeOfDeathZip);
        }

        setUploadProgress(100);
        setStep("review");
      } catch (verifyError: any) {
        console.error("AI verification error:", verifyError);
        toast({
          title: "AI Verification Could Not Complete",
          description: "The document was uploaded successfully. You can proceed to fill in the details manually — the SAL team will verify it.",
          variant: "default",
        });
        setStep("review");
        setVerificationResult({
          success: false,
          verification: {
            verificationStatus: "needs_review",
            confidenceScore: 0,
            overallAssessment: "AI verification could not process this document. The file has been uploaded and the SAL concierge team will review it manually.",
          },
          extractedData: {},
        });
      } finally {
        setIsVerifying(false);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
      setUploadedFile(null);
      setDocumentObjectPath(null);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  }, [form, toast, resizeImageForAI]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const createMutation = useMutation({
    mutationFn: async (data: CertificateFormData) => {
      const nokData = data.submitterIsNextOfKin
        ? {
            nextOfKinName: data.submitterName,
            nextOfKinRelationship: "Self / Filing Party",
            nextOfKinEmail: data.submitterEmail,
            nextOfKinPhone: data.submitterPhone || "",
            nextOfKinAddress: "",
            nextOfKinCity: "",
            nextOfKinState: "",
            nextOfKinZip: "",
          }
        : {
            nextOfKinName: data.nextOfKinName || "",
            nextOfKinRelationship: data.nextOfKinRelationship || "",
            nextOfKinEmail: data.nextOfKinEmail || "",
            nextOfKinPhone: data.nextOfKinPhone || "",
            nextOfKinAddress: data.nextOfKinAddress || "",
            nextOfKinCity: data.nextOfKinCity || "",
            nextOfKinState: data.nextOfKinState || "",
            nextOfKinZip: data.nextOfKinZip || "",
          };
      const payload = {
        ...data,
        ...nokData,
        documentUrl: documentObjectPath,
        verificationToken: verificationResult?.verificationToken,
      };
      const res = await fetch("/api/blockchain/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create certificate");
      }
      return res.json();
    },
    onSuccess: (data: BlockchainResult) => {
      setLastResult(data);
      toast({ title: "Blockchain Certificate Created" });
      setStep("upload");
      setUploadedFile(null);
      setUploadedFilePreview(null);
      setDocumentObjectPath(null);
      setImageDataUrl(null);
      setVerificationResult(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const resetUpload = () => {
    setStep("upload");
    setUploadedFile(null);
    setUploadedFilePreview(null);
    setDocumentObjectPath(null);
    setImageDataUrl(null);
    setVerificationResult(null);
    setUploadProgress(0);
    form.reset();
  };

  const verStatus = verificationResult?.verification?.verificationStatus;
  const verScore = verificationResult?.verification?.confidenceScore || 0;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight mb-2">Partner portal</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Upload a death certificate scan. We check it, then you complete the details to create a Blockchain ID. A Blockchain ID is a secure record number.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            {step === "upload" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Step 1: Upload a death certificate scan
                  </CardTitle>
                  <CardDescription>
                    Upload a clear scan. Our system reviews it for signs that it is authentic. A person can review it if needed.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/jpeg,image/png,image/gif,image/webp,application/pdf";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleFileSelect(file);
                      };
                      input.click();
                    }}
                    data-testid="dropzone-certificate"
                  >
                    {isUploading || isVerifying ? (
                      <div className="space-y-4">
                        <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                        <p className="font-medium">
                          {isUploading ? "Uploading your document…" : "Checking your document…"}
                        </p>
                        <Progress value={uploadProgress} className="max-w-xs mx-auto" />
                        <p className="text-xs text-muted-foreground">
                          {uploadProgress < 60 ? "Saving it securely…" : uploadProgress < 100 ? "Reviewing it…" : "Ready to continue."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <FileImage className="h-12 w-12 mx-auto text-muted-foreground/50" />
                        <div>
                          <p className="font-medium">Drop a certificate here, or select a file</p>
                          <p className="text-sm text-muted-foreground mt-1">JPEG, PNG, GIF, WebP, or PDF. Maximum 20 MB.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t text-center">
                    <p className="text-sm text-muted-foreground mb-2">Do not have the document yet?</p>
                    <Button
                      variant="outline"
                      onClick={() => setStep("form")}
                      data-testid="button-skip-upload"
                    >
                      Continue without a document
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Our care team can collect and check the document later.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === "review" && verificationResult && (
              <Card className={
                verStatus === "verified" ? "border-green-200 dark:border-green-900" :
                verStatus === "rejected" ? "border-red-200 dark:border-red-900" :
                "border-yellow-200 dark:border-yellow-900"
              }>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {verStatus === "verified" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      {verStatus === "needs_review" && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
                      {verStatus === "rejected" && <XCircle className="h-5 w-5 text-red-600" />}
                      AI Verification Result
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={resetUpload} data-testid="button-reset-upload">
                      <X className="h-4 w-4 mr-1" />Upload Different
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    {uploadedFilePreview && (
                      <img src={uploadedFilePreview} alt="Certificate preview" className="h-20 w-16 object-cover rounded border" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={verStatus === "verified" ? "default" : verStatus === "rejected" ? "destructive" : "secondary"}>
                          {verStatus === "verified" ? "Verified" : verStatus === "rejected" ? "Rejected" : "Needs Review"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">Confidence: {verScore}%</span>
                      </div>
                      <Progress value={verScore} className="h-2" />
                      <p className="text-sm text-muted-foreground mt-2">{verificationResult.verification?.overallAssessment}</p>
                    </div>
                  </div>

                  {verificationResult.verification?.concerns && verificationResult.verification.concerns.length > 0 && (
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
                      <p className="text-xs font-medium text-yellow-800 dark:text-yellow-400 mb-1">Concerns:</p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-500 space-y-1">
                        {verificationResult.verification.concerns.map((c, i) => (
                          <li key={i}>- {c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {verStatus === "rejected" ? (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                      <p className="text-sm text-red-700 dark:text-red-400">
                        This document did not pass AI verification. Please upload a clearer scan or a different document.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm">
                        {verStatus === "verified"
                          ? "The document passed AI verification. Please confirm the details below."
                          : "The document could not be fully verified by AI. You can still proceed — the SAL team will manually verify this certificate."}
                      </p>
                      <Button className="mt-3 w-full" onClick={() => setStep("form")} data-testid="button-proceed-to-form">
                        Proceed to Complete Details
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === "form" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileCheck className="h-5 w-5" />
                        {documentObjectPath ? "Step 2: Complete Certificate Details" : "Complete Certificate Details"}
                      </CardTitle>
                      <CardDescription>
                        {verStatus === "verified"
                          ? "AI has pre-filled some fields. Please verify and complete the information."
                          : !documentObjectPath
                          ? "Fill in all details below. The SAL concierge team will collect and verify the death certificate document."
                          : "Please fill in all details. This certificate will be flagged for manual review by the SAL team."}
                      </CardDescription>
                    </div>
                    <Badge variant={verStatus === "verified" ? "default" : !documentObjectPath ? "outline" : "secondary"} className="shrink-0">
                      {verStatus === "verified" ? "AI Verified" : !documentObjectPath ? "No Document" : "Needs Review"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-5">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Submitter Information</p>
                        <Separator />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="submitterName" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Your Full Name</FormLabel>
                            <FormControl><Input placeholder="Jane Smith" {...field} data-testid="input-submitter-name" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="submitterOrganization" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Authorized organization</FormLabel>
                            <FormControl><Input placeholder="Example organization" {...field} data-testid="input-submitter-org" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="submitterEmail" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl><Input type="email" placeholder="jane@smithfuneral.com" {...field} data-testid="input-submitter-email" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="submitterPhone" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone (Optional)</FormLabel>
                            <FormControl><Input placeholder="(555) 123-4567" {...field} data-testid="input-submitter-phone" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="space-y-1 pt-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Next of Kin</p>
                        <Separator />
                      </div>

                      <FormField control={form.control} name="submitterIsNextOfKin" render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium">I am the next of kin</FormLabel>
                            <FormDescription className="text-xs">
                              {field.value
                                ? "Your contact info above will be used as the next of kin."
                                : "Please provide the next of kin's contact information below."}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-is-next-of-kin"
                            />
                          </FormControl>
                        </FormItem>
                      )} />

                      {!form.watch("submitterIsNextOfKin") && (
                        <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                          <FormField control={form.control} name="nextOfKinName" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Next of Kin Full Name</FormLabel>
                              <FormControl><Input placeholder="Mary Jane Smith" {...field} data-testid="input-nok-name" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name="nextOfKinRelationship" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Relationship to Deceased</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-nok-relationship"><SelectValue placeholder="Select relationship" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Spouse">Spouse</SelectItem>
                                  <SelectItem value="Child">Child</SelectItem>
                                  <SelectItem value="Parent">Parent</SelectItem>
                                  <SelectItem value="Sibling">Sibling</SelectItem>
                                  <SelectItem value="Grandchild">Grandchild</SelectItem>
                                  <SelectItem value="Grandparent">Grandparent</SelectItem>
                                  <SelectItem value="Legal Guardian">Legal Guardian</SelectItem>
                                  <SelectItem value="Power of Attorney">Power of Attorney</SelectItem>
                                  <SelectItem value="Executor of Estate">Executor of Estate</SelectItem>
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="nextOfKinEmail" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl><Input type="email" placeholder="mary@example.com" {...field} data-testid="input-nok-email" /></FormControl>
                                <FormDescription className="text-xs">An invitation will be sent to this email</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="nextOfKinPhone" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone (Optional)</FormLabel>
                                <FormControl><Input placeholder="(555) 123-4567" {...field} data-testid="input-nok-phone" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>

                          <FormField control={form.control} name="nextOfKinAddress" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Street Address (Optional)</FormLabel>
                              <FormControl><Input placeholder="123 Main Street" {...field} data-testid="input-nok-address" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <div className="grid grid-cols-3 gap-3">
                            <FormField control={form.control} name="nextOfKinCity" render={({ field }) => (
                              <FormItem>
                                <FormLabel>City</FormLabel>
                                <FormControl><Input placeholder="City" {...field} data-testid="input-nok-city" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="nextOfKinState" render={({ field }) => (
                              <FormItem>
                                <FormLabel>State</FormLabel>
                                <FormControl><Input placeholder="State" {...field} data-testid="input-nok-state" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="nextOfKinZip" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Zip Code</FormLabel>
                                <FormControl><Input placeholder="12345" {...field} data-testid="input-nok-zip" /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1 pt-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Deceased Information</p>
                        <Separator />
                      </div>

                      <FormField control={form.control} name="deceasedName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Legal Name of Deceased</FormLabel>
                          <FormControl><Input placeholder="John William Smith" {...field} data-testid="input-deceased-name" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date of Birth</FormLabel>
                            <FormControl><Input type="text" placeholder="MM/DD/YYYY" {...field} onChange={(e) => field.onChange(formatDateInput(e.target.value))} maxLength={10} data-testid="input-dob" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="dateOfDeath" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date of Death</FormLabel>
                            <FormControl><Input type="text" placeholder="MM/DD/YYYY" {...field} onChange={(e) => field.onChange(formatDateInput(e.target.value))} maxLength={10} data-testid="input-dod" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <FormField control={form.control} name="ssn" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Social Security Number (Optional)</FormLabel>
                          <FormControl><Input placeholder="111-11-1111" {...field} onChange={(e) => field.onChange(formatSsnInput(e.target.value))} maxLength={11} data-testid="input-ssn" /></FormControl>
                          <FormDescription className="text-xs flex items-center gap-1">
                            <Lock className="h-3 w-3" />Encrypted immediately — never stored in plain text
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="stateCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-state"><SelectValue placeholder="Select state" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="countyCode" render={({ field }) => (
                          <FormItem>
                            <FormLabel>County</FormLabel>
                            <FormControl><Input placeholder="Los Angeles" {...field} data-testid="input-county" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <FormField control={form.control} name="issuingAuthority" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Issuing Authority</FormLabel>
                          <FormControl><Input placeholder="Los Angeles County Registrar-Recorder" {...field} data-testid="input-issuing-authority" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="space-y-1 pt-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Place of Death</p>
                        <Separator />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="placeOfDeathType" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type of Place</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-pod-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Hospital - Inpatient">Hospital — Inpatient</SelectItem>
                                <SelectItem value="Hospital - Outpatient/ER">Hospital — Outpatient/ER</SelectItem>
                                <SelectItem value="Nursing Home / Long-Term Care">Nursing Home / Long-Term Care</SelectItem>
                                <SelectItem value="Hospice Facility">Hospice Facility</SelectItem>
                                <SelectItem value="Decedent's Home">Decedent's Home</SelectItem>
                                <SelectItem value="Other Residence">Other Residence</SelectItem>
                                <SelectItem value="Assisted Living">Assisted Living</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="placeOfDeathFacility" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Facility Name</FormLabel>
                            <FormControl><Input placeholder="Memorial Hospital" {...field} data-testid="input-pod-facility" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <FormField control={form.control} name="placeOfDeathAddress" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl><Input placeholder="1234 Medical Center Dr" {...field} data-testid="input-pod-address" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="placeOfDeathCity" render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl><Input placeholder="Houston" {...field} data-testid="input-pod-city" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="placeOfDeathCounty" render={({ field }) => (
                          <FormItem>
                            <FormLabel>County</FormLabel>
                            <FormControl><Input placeholder="Harris" {...field} data-testid="input-pod-county" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="placeOfDeathState" render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-pod-state"><SelectValue placeholder="Select state" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="placeOfDeathZip" render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code</FormLabel>
                            <FormControl><Input placeholder="77001" maxLength={10} {...field} data-testid="input-pod-zip" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <FormField control={form.control} name="causeOfDeath" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cause of Death (Optional)</FormLabel>
                          <FormControl><Input placeholder="Natural causes" {...field} data-testid="input-cause-of-death" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={createMutation.isPending}
                        data-testid="button-create-blockchain"
                      >
                        {createMutation.isPending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Blockchain Record...</>
                        ) : (
                          <><Shield className="mr-2 h-4 w-4" />Create Blockchain Certificate</>
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6">
            {lastResult && (
              <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    Certificate Created
                  </CardTitle>
                  <CardDescription>
                    Share the Blockchain ID below with the Steps After Life concierge team.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Blockchain ID</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 p-3 bg-background rounded border text-sm font-mono break-all font-bold" data-testid="text-blockchain-id">
                        {lastResult.blockchainId}
                      </code>
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(lastResult.blockchainId, "blockchainId")} data-testid="button-copy-blockchain-id">
                        {copied === "blockchainId" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Certificate Number</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 p-2 bg-background rounded border text-sm font-mono" data-testid="text-cert-number">{lastResult.certificateNumber}</code>
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(lastResult.certificateNumber, "certNumber")} data-testid="button-copy-cert-number">
                        {copied === "certNumber" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Verification Status</Label>
                    <div className="mt-1">
                      <Badge variant={lastResult.aiVerificationStatus === "verified" ? "default" : "secondary"}>
                        {lastResult.aiVerificationStatus === "verified" ? "AI Verified" : "Pending Manual Review"}
                      </Badge>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{lastResult.message}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <VerifySection />

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Privacy & Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                  <p>Scanned certificates are stored in encrypted object storage</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                  <p>AI reviews each document for authenticity markers</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                  <p>Only the Blockchain ID is shared externally — no PII</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                  <p>Documents that fail AI review are flagged for manual verification</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

    </div>
  );
}
