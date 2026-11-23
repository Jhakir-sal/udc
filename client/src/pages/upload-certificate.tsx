import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { formatDateInput, formatOcrDate } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  FileUp, 
  Shield, 
  CheckCircle2, 
  ArrowRight,
  Upload,
  Lock,
  AlertCircle,
  FileImage,
  X,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Stamp,
  PenTool,
  FileText,
  Type,
  Fingerprint,
  Hash,
  Building2,
  Calendar,
  Pencil,
  Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { insertCertificateSchema, type InsertCertificate } from "@shared/schema";
import { z } from "zod";
import { trackAnalyticsEvent } from "@/lib/analytics";

const certificateFormSchema = insertCertificateSchema.extend({
  deceasedName: insertCertificateSchema.shape.deceasedName.min(2, "Name must be at least 2 characters"),
  certificateNumber: insertCertificateSchema.shape.certificateNumber.min(5, "Certificate number must be at least 5 characters"),
  issuingAuthority: insertCertificateSchema.shape.issuingAuthority.min(2, "Issuing authority is required"),
  submitterRelationship: z.string().min(1, "Please select your relationship to your loved one"),
  estateStatus: z.string().min(1, "Please answer the estate question"),
}).superRefine((data, ctx) => {
  if (data.estateStatus === "yes" && !data.isAuthorizedExecutor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["isAuthorizedExecutor"],
      message: "Please tell us if you are the authorized executor",
    });
  }
});

const RELATIONSHIP_OPTIONS = [
  "Spouse",
  "Child",
  "Parent",
  "Sibling",
  "Grandchild",
  "Other Family Member",
  "Friend",
  "Legal Representative",
  "Other",
];

type CertificateFormValues = InsertCertificate;

const steps = [
  {
    title: "Upload certificate",
    description: "We read it for you"
  },
  {
    title: "Check details",
    description: "Review the information"
  },
  {
    title: "Save case",
    description: "Your document is protected"
  }
];

interface VerificationData {
  isAuthentic: boolean;
  confidenceScore: number;
  verificationStatus: "verified" | "needs_review" | "rejected";
  findings?: {
    officialSeal?: { present: boolean; description: string; confidence: number };
    signatures?: { present: boolean; count: number; types: string[]; confidence: number };
    documentFormat?: { valid: boolean; description: string; confidence: number };
    typography?: { consistent: boolean; issues: string[]; confidence: number };
    securityFeatures?: { present: boolean; features: string[]; confidence: number };
    certificateNumber?: { present: boolean; format: string; confidence: number };
    issuingAuthority?: { present: boolean; name: string; legitimate: boolean; confidence: number };
    dateStamps?: { present: boolean; consistent: boolean; confidence: number };
  };
  overallAssessment: string;
  concerns?: string[];
  recommendations?: string[];
}

export default function UploadCertificate() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [documentObjectPath, setDocumentObjectPath] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [verification, setVerification] = useState<VerificationData | null>(null);
  const [isEditingVerify, setIsEditingVerify] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CertificateFormValues>({
    resolver: zodResolver(certificateFormSchema),
    defaultValues: {
      deceasedName: "",
      deceasedSsn: "",
      dateOfDeath: "",
      dateOfBirth: "",
      certificateNumber: "",
      issuingAuthority: "",
      status: "pending",
      submitterRelationship: "",
      estateStatus: "",
      isAuthorizedExecutor: "",
    },
  });

  const createCertificate = useMutation({
    mutationFn: async (data: CertificateFormValues) => {
      const response = await apiRequest("POST", "/api/certificates", data);
      return response.json();
    },
    onSuccess: async (data) => {
      trackAnalyticsEvent("certificate_or_case_created", {
        workflow: "certificate_upload",
        input_method: "upload",
        ocr_used: true,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      toast({
          title: "Death certificate added",
          description: "Your document is protected and saved with this case.",
      });
      navigate("/onboarding");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
          description: error.message || "We could not add this document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    setUploadedFile(file);
    setIsExtracting(true);
    setDocumentObjectPath(null);

    // Store the actual document in object storage so it stays on file with the case
    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (urlRes.ok) {
        const { uploadURL, objectPath } = await urlRes.json();
        const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type, "x-ms-blob-type": "BlockBlob" } });
        if (putRes.ok) {
          setDocumentObjectPath(objectPath);
        }
      }
      if (!urlRes.ok) {
        console.error("Document storage setup failed");
      }
    } catch (storeError) {
      console.error("Document storage error:", storeError);
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        
        if (!dataUrl) {
          toast({
            title: "Error",
            description: "Failed to read file. Please try again.",
            variant: "destructive",
          });
          setIsExtracting(false);
          return;
        }

        try {
          const response = await apiRequest("POST", "/api/ocr/certificate", {
            imageDataUrl: dataUrl
          });
          const result = await response.json();

          // Store verification data
          if (result.verification) {
            setVerification(result.verification);
          }

          // Handle rejected documents
          if (result.verification?.verificationStatus === "rejected") {
            toast({
              title: "Document Verification Failed",
              description: result.verification.overallAssessment || "This document does not appear to be a legitimate death certificate.",
              variant: "destructive",
            });
            setIsExtracting(false);
            return;
          }

          if (result.success && result.extractedData) {
            const data = result.extractedData;
            
            if (data.deceasedName) form.setValue("deceasedName", data.deceasedName);
            if (data.deceasedSsn) form.setValue("deceasedSsn", data.deceasedSsn);
            if (data.dateOfBirth) form.setValue("dateOfBirth", formatOcrDate(data.dateOfBirth));
            if (data.dateOfDeath) form.setValue("dateOfDeath", formatOcrDate(data.dateOfDeath));
            if (data.certificateNumber) form.setValue("certificateNumber", data.certificateNumber);
            if (data.issuingAuthority) form.setValue("issuingAuthority", data.issuingAuthority);
            const missingRequiredDetails = !data.deceasedName || !data.certificateNumber || !data.issuingAuthority;
            setIsEditingVerify(missingRequiredDetails);

            // Show appropriate toast based on verification status
            if (result.verification?.verificationStatus === "verified") {
              toast({
                title: "Certificate Verified",
                description: `Document authenticity confirmed (${result.verification.confidenceScore}% confidence). Details have been extracted.`,
              });
            } else if (result.verification?.verificationStatus === "needs_review") {
              toast({
                title: "Manual Review Required",
                description: "Document requires additional verification. Details have been extracted but please verify carefully.",
                variant: "default",
              });
            } else {
              toast({
                title: "Information Extracted",
                description: "Certificate details have been automatically filled. Please verify the information.",
              });
            }
            
            setCurrentStep(1);
          } else {
            toast({
              title: "Extraction Complete",
              description: "Could not extract all fields automatically. Please fill in the details manually.",
            });
          }
        } catch (error: any) {
          console.error("OCR error:", error);
          let errorMessage = "Could not extract text from image. Please fill in the details manually.";
          
          try {
            // Try to parse error response if it's a fetch error
            if (error instanceof Response || error?.json) {
              const errorData = await error.json?.();
              errorMessage = errorData?.error || errorMessage;
            } else if (error?.message) {
              errorMessage = error.message;
            }
          } catch {
            // Use default message
          }
          
          if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
            toast({
              title: "Session Expired",
              description: "Please sign in again to continue.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Extraction Failed",
              description: errorMessage,
              variant: "destructive",
            });
          }
        }
        
        setIsExtracting(false);
      };

      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to read the file. Please try again.",
          variant: "destructive",
        });
        setIsExtracting(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error("File processing error:", error);
      setIsExtracting(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
      
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload an image (JPEG, PNG, GIF, WebP) or PDF file.",
          variant: "destructive",
        });
        return;
      }

      processFile(file);
    }
  }, [toast, form]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setDocumentObjectPath(null);
    setVerification(null);
    form.reset();
    setCurrentStep(0);
  };

  const onSubmit = (data: CertificateFormValues) => {
    if (currentStep < 2) {
      setIsEditingVerify(false);
      setCurrentStep(currentStep + 1);
    } else {
      createCertificate.mutate({
        ...data,
        documentUrl: documentObjectPath,
        isAuthorizedExecutor: data.estateStatus === "yes" ? data.isAuthorizedExecutor : null,
      });
    }
  };

  const formValues = form.watch();

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl overflow-x-hidden px-4 py-6 sm:p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-semibold tracking-tight">Start with the death certificate</h1>
        <p className="text-muted-foreground mt-1">
          Upload a photo or scan first. We’ll read it securely and fill in the official details so you don’t have to type them.
        </p>
      </div>

      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <div key={step.title} className="flex items-center">
            <div className="flex items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  index <= currentStep
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {index < currentStep ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>
              <div className="ml-3 hidden sm:block">
                <p className={`text-sm font-medium ${index <= currentStep ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={`hidden sm:block w-24 h-0.5 mx-4 ${index < currentStep ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5" />
                Upload the death certificate
              </CardTitle>
              <CardDescription>
                This is the fastest way to start. You’ll review what we find before anything is saved.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {currentStep === 0 && (
                    <div className="space-y-6">
                      <div
                         className={`relative w-full min-w-0 overflow-hidden rounded-lg border-2 border-dashed p-4 transition-colors sm:p-8 ${
                          isDragging
                            ? "border-primary bg-primary/5"
                            : uploadedFile
                            ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                            : "border-muted-foreground/30 hover:border-primary/50"
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        data-testid="dropzone-certificate"
                      >
                        {isExtracting ? (
                          <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                             <p className="text-lg font-medium">Reading your document</p>
                            <p className="text-sm text-muted-foreground mt-1">
                               We are checking the document and filling in details.
                            </p>
                          </div>
                        ) : uploadedFile ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
                                <FileImage className="h-6 w-6 text-green-600 dark:text-green-400" />
                              </div>
                              <div>
                                <p className="font-medium">{uploadedFile.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(uploadedFile.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={removeFile}
                              data-testid="button-remove-file"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8">
                            <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                             <p className="text-lg font-medium">Choose the death certificate</p>
                            <p className="text-sm text-muted-foreground mt-1">
                               Drag it here, or choose a file.
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                               Accepted files: JPEG, PNG, GIF, WebP, or PDF.
                            </p>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                              onChange={handleFileSelect}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              data-testid="input-file-certificate"
                            />
                          </div>
                        )}
                      </div>

                      {/* Verification Report */}
                      {verification && (
                        <Card className="border-2" data-testid="card-verification-report">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="flex items-center gap-2 text-lg">
                                {verification.verificationStatus === "verified" ? (
                                  <ShieldCheck className="h-5 w-5 text-green-600" />
                                ) : verification.verificationStatus === "needs_review" ? (
                                  <ShieldQuestion className="h-5 w-5 text-yellow-600" />
                                ) : (
                                  <ShieldAlert className="h-5 w-5 text-red-600" />
                                )}
                                Document Verification
                              </CardTitle>
                              <Badge
                                variant={
                                  verification.verificationStatus === "verified"
                                    ? "default"
                                    : verification.verificationStatus === "needs_review"
                                    ? "secondary"
                                    : "destructive"
                                }
                                data-testid="badge-verification-status"
                              >
                                {verification.verificationStatus === "verified"
                                  ? "Verified"
                                  : verification.verificationStatus === "needs_review"
                                  ? "Needs Review"
                                  : "Rejected"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Confidence Score */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Confidence Score</span>
                                <span className="font-medium">{verification.confidenceScore}%</span>
                              </div>
                              <Progress 
                                value={verification.confidenceScore} 
                                className="h-2"
                                data-testid="progress-confidence"
                              />
                            </div>

                            {/* Overall Assessment */}
                            <p className="text-sm text-muted-foreground">
                              {verification.overallAssessment}
                            </p>

                            {/* Authentication Markers */}
                            {verification.findings && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {verification.findings.officialSeal && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <Stamp className={`h-4 w-4 ${verification.findings.officialSeal.present ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Official Seal</span>
                                    {verification.findings.officialSeal.present ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                                {verification.findings.signatures && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <PenTool className={`h-4 w-4 ${verification.findings.signatures.present ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Signatures ({verification.findings.signatures.count || 0})</span>
                                    {verification.findings.signatures.present ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                                {verification.findings.documentFormat && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <FileText className={`h-4 w-4 ${verification.findings.documentFormat.valid ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Document Format</span>
                                    {verification.findings.documentFormat.valid ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                                {verification.findings.typography && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <Type className={`h-4 w-4 ${verification.findings.typography.consistent ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Typography</span>
                                    {verification.findings.typography.consistent ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                                {verification.findings.securityFeatures && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <Fingerprint className={`h-4 w-4 ${verification.findings.securityFeatures.present ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Security Features</span>
                                    {verification.findings.securityFeatures.present ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                                {verification.findings.certificateNumber && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <Hash className={`h-4 w-4 ${verification.findings.certificateNumber.present ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Certificate Number</span>
                                    {verification.findings.certificateNumber.present ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                                {verification.findings.issuingAuthority && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <Building2 className={`h-4 w-4 ${verification.findings.issuingAuthority.legitimate ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Issuing Authority</span>
                                    {verification.findings.issuingAuthority.legitimate ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                                {verification.findings.dateStamps && (
                                  <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                                    <Calendar className={`h-4 w-4 ${verification.findings.dateStamps.present ? "text-green-600" : "text-muted-foreground"}`} />
                                    <span>Date Stamps</span>
                                    {verification.findings.dateStamps.present ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto" />
                                    ) : (
                                      <X className="h-3 w-3 text-muted-foreground ml-auto" />
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Concerns */}
                            {verification.concerns && verification.concerns.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-yellow-600">Concerns:</p>
                                <ul className="text-sm text-muted-foreground list-disc pl-4">
                                  {verification.concerns.map((concern, idx) => (
                                    <li key={idx}>{concern}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                       <div className="hidden" aria-hidden="true">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            Or enter details manually
                          </span>
                        </div>
                      </div>

                       <div className="hidden" aria-hidden="true">
                        <FormField
                          control={form.control}
                          name="deceasedName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Your Loved One's Full Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Enter their full legal name" 
                                  {...field} 
                                  data-testid="input-deceased-name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="deceasedSsn"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Social Security Number</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="XXX-XX-XXXX" 
                                  maxLength={11}
                                  {...field} 
                                  value={field.value || ""}
                                  onChange={(e) => {
                                    let val = e.target.value.replace(/[^\d]/g, "");
                                    if (val.length > 3) val = val.slice(0, 3) + "-" + val.slice(3);
                                    if (val.length > 6) val = val.slice(0, 6) + "-" + val.slice(6);
                                    if (val.length > 11) val = val.slice(0, 11);
                                    field.onChange(val);
                                  }}
                                  data-testid="input-deceased-ssn"
                                />
                              </FormControl>
                              <FormDescription>
                                Required for credit protection and government notifications
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="dateOfBirth"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date of Birth</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="text" 
                                    placeholder="MM/DD/YYYY"
                                    {...field} 
                                    onChange={(e) => field.onChange(formatDateInput(e.target.value))}
                                    maxLength={10}
                                    data-testid="input-date-of-birth"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="dateOfDeath"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date of Death</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="text" 
                                    placeholder="MM/DD/YYYY"
                                    {...field} 
                                    onChange={(e) => field.onChange(formatDateInput(e.target.value))}
                                    maxLength={10}
                                    data-testid="input-date-of-death"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="certificateNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Certificate Number</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Enter certificate number" 
                                  {...field} 
                                  data-testid="input-certificate-number"
                                />
                              </FormControl>
                              <FormDescription>
                                The unique identifier on the death certificate
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="issuingAuthority"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Issuing Authority</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-issuing-authority">
                                    <SelectValue placeholder="Select issuing authority" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="California Dept of Public Health">California Dept of Public Health</SelectItem>
                                  <SelectItem value="New York State DOH">New York State DOH</SelectItem>
                                  <SelectItem value="Texas DSHS">Texas DSHS</SelectItem>
                                  <SelectItem value="Florida DOH">Florida DOH</SelectItem>
                                  <SelectItem value="Other State Agency">Other State Agency</SelectItem>
                                  <SelectItem value="County Registrar">County Registrar</SelectItem>
                                  <SelectItem value="City Health Department">City Health Department</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="submitterRelationship"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Your Relationship to Your Loved One <span className="text-destructive">*</span></FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-submitter-relationship">
                                    <SelectValue placeholder="Select your relationship" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {RELATIONSHIP_OPTIONS.map((rel) => (
                                    <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Required — how are you related to the person named on this certificate?
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="estateStatus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Did your loved one have an estate, trust, or will?</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-estate-status">
                                    <SelectValue placeholder="Select an answer" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="yes">Yes — there is an estate, trust, or will</SelectItem>
                                  <SelectItem value="no">No</SelectItem>
                                  <SelectItem value="unsure">I'm not sure</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {(form.watch("estateStatus") === "unsure" || form.watch("estateStatus") === "no") && (
                          <div className="flex items-start gap-3 p-4 rounded-lg border bg-primary/5" data-testid="prompt-ner-search">
                            <Search className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Not sure? Search the National Estate Registry</p>
                              <p className="text-sm text-muted-foreground mb-3">
                                A quick search can uncover wills, trusts, or registered estates
                                {form.watch("deceasedName") ? ` for ${form.watch("deceasedName")}` : ""}.
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(`/estate-registry?tab=ner&name=${encodeURIComponent(form.getValues("deceasedName") || "")}`, "_blank")}
                                data-testid="button-search-ner-upload"
                              >
                                <Search className="h-4 w-4 mr-2" />
                                Search the Estate Registry
                              </Button>
                              </div>
                          </div>
                        )}

                        {form.watch("estateStatus") === "yes" && (
                          <FormField
                            control={form.control}
                            name="isAuthorizedExecutor"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Are you the authorized executor of the estate?</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-authorized-executor">
                                      <SelectValue placeholder="Select an answer" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="yes">Yes, I am the authorized executor</SelectItem>
                                    <SelectItem value="no">No, someone else is</SelectItem>
                                    <SelectItem value="unsure">I'm not sure</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-4 text-center">
                        <p className="text-sm font-medium">Don’t have a digital copy?</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Take a clear photo with your phone. Make sure all four corners and the certificate number are visible.
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          className="mt-1 underline underline-offset-4"
                          onClick={() => {
                            setIsEditingVerify(true);
                            setCurrentStep(1);
                          }}
                          data-testid="button-enter-certificate-manually"
                        >
                          I can’t upload it — enter details manually
                        </Button>
                      </div>
                    </div>
                  )}

                  {currentStep === 1 && (
                    <div className="space-y-6">
                      <div className="rounded-lg border p-6 bg-muted/30">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-medium">Please verify the following information:</h3>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditingVerify(!isEditingVerify)}
                            data-testid="button-edit-verify"
                          >
                            {isEditingVerify ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Done Editing
                              </>
                            ) : (
                              <>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </>
                            )}
                          </Button>
                        </div>
                        {isEditingVerify ? (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="deceasedName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Loved One's Full Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter their full legal name" {...field} data-testid="input-edit-deceased-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="deceasedSsn"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Social Security Number</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="XXX-XX-XXXX"
                                    maxLength={11}
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => {
                                      let val = e.target.value.replace(/[^\d]/g, "");
                                      if (val.length > 3) val = val.slice(0, 3) + "-" + val.slice(3);
                                      if (val.length > 6) val = val.slice(0, 6) + "-" + val.slice(6);
                                      if (val.length > 11) val = val.slice(0, 11);
                                      field.onChange(val);
                                    }}
                                    data-testid="input-edit-deceased-ssn"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="dateOfBirth"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Date of Birth</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="text"
                                      placeholder="MM/DD/YYYY"
                                      {...field}
                                      onChange={(e) => field.onChange(formatDateInput(e.target.value))}
                                      maxLength={10}
                                      data-testid="input-edit-date-of-birth"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="dateOfDeath"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Date of Death</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="text"
                                      placeholder="MM/DD/YYYY"
                                      {...field}
                                      onChange={(e) => field.onChange(formatDateInput(e.target.value))}
                                      maxLength={10}
                                      data-testid="input-edit-date-of-death"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={form.control}
                            name="certificateNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Certificate Number</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter certificate number" {...field} data-testid="input-edit-certificate-number" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="issuingAuthority"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Issuing Authority</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-edit-issuing-authority">
                                      <SelectValue placeholder="Select issuing authority" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="California Dept of Public Health">California Dept of Public Health</SelectItem>
                                    <SelectItem value="New York State DOH">New York State DOH</SelectItem>
                                    <SelectItem value="Texas DSHS">Texas DSHS</SelectItem>
                                    <SelectItem value="Florida DOH">Florida DOH</SelectItem>
                                    <SelectItem value="Other State Agency">Other State Agency</SelectItem>
                                    <SelectItem value="County Registrar">County Registrar</SelectItem>
                                    <SelectItem value="City Health Department">City Health Department</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="hidden" aria-hidden="true">
                          <FormField
                            control={form.control}
                            name="submitterRelationship"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Relationship to Your Loved One <span className="text-destructive">*</span></FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-edit-submitter-relationship">
                                      <SelectValue placeholder="Select your relationship" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {RELATIONSHIP_OPTIONS.map((rel) => (
                                      <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="estateStatus"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Did your loved one have an estate, trust, or will?</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-edit-estate-status">
                                      <SelectValue placeholder="Select an answer" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="yes">Yes — there is an estate, trust, or will</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                    <SelectItem value="unsure">I'm not sure</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {(form.watch("estateStatus") === "unsure" || form.watch("estateStatus") === "no") && (
                            <div className="flex items-start gap-3 p-4 rounded-lg border bg-primary/5" data-testid="prompt-ner-search-edit">
                              <Search className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-medium">Not sure? Search the National Estate Registry</p>
                                <p className="text-sm text-muted-foreground mb-3">
                                  A quick search can uncover wills, trusts, or registered estates
                                  {form.watch("deceasedName") ? ` for ${form.watch("deceasedName")}` : ""}.
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(`/estate-registry?tab=ner&name=${encodeURIComponent(form.getValues("deceasedName") || "")}`, "_blank")}
                                  data-testid="button-search-ner-edit"
                                >
                                  <Search className="h-4 w-4 mr-2" />
                                  Search the Estate Registry
                                </Button>
                              </div>
                            </div>
                          )}
                          {form.watch("estateStatus") === "yes" && (
                            <FormField
                              control={form.control}
                              name="isAuthorizedExecutor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Are you the authorized executor of the estate?</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-edit-authorized-executor">
                                        <SelectValue placeholder="Select an answer" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="yes">Yes, I am the authorized executor</SelectItem>
                                      <SelectItem value="no">No, someone else is</SelectItem>
                                      <SelectItem value="unsure">I'm not sure</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          </div>
                        </div>
                        ) : (
                        <dl className="space-y-4">
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Full Name</dt>
                            <dd className="font-medium">{formValues.deceasedName || "—"}</dd>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Social Security Number</dt>
                            <dd className="font-medium" data-testid="text-verify-ssn">
                              {formValues.deceasedSsn ? `***-**-${formValues.deceasedSsn.replace(/[^\d]/g, "").slice(-4)}` : "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Date of Birth</dt>
                            <dd className="font-medium">{formValues.dateOfBirth || "—"}</dd>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Date of Death</dt>
                            <dd className="font-medium">{formValues.dateOfDeath || "—"}</dd>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Certificate Number</dt>
                            <dd className="font-medium">{formValues.certificateNumber || "—"}</dd>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Issuing Authority</dt>
                            <dd className="font-medium">{formValues.issuingAuthority || "—"}</dd>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Your Relationship</dt>
                            <dd className="font-medium" data-testid="text-verify-relationship">{formValues.submitterRelationship || "—"}</dd>
                          </div>
                          <div className="flex justify-between py-2 border-b">
                            <dt className="text-muted-foreground">Estate, Trust, or Will</dt>
                            <dd className="font-medium" data-testid="text-verify-estate">
                              {formValues.estateStatus === "yes" ? "Yes" : formValues.estateStatus === "no" ? "No" : formValues.estateStatus === "unsure" ? "Not sure" : "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between py-2">
                            <dt className="text-muted-foreground">Authorized Executor</dt>
                            <dd className="font-medium" data-testid="text-verify-executor">
                              {formValues.estateStatus !== "yes" ? "N/A" : formValues.isAuthorizedExecutor === "yes" ? "Yes" : formValues.isAuthorizedExecutor === "no" ? "No" : formValues.isAuthorizedExecutor === "unsure" ? "Not sure" : "—"}
                            </dd>
                          </div>
                        </dl>
                         )}
                         <div className="space-y-4 border-t pt-5" data-testid="section-required-family-questions">
                           <div>
                             <h3 className="font-medium">A few things the certificate can’t tell us</h3>
                             <p className="text-sm text-muted-foreground">Just select an answer—no additional typing is needed.</p>
                           </div>
                           <FormField
                             control={form.control}
                             name="submitterRelationship"
                             render={({ field }) => (
                               <FormItem>
                                 <FormLabel>Your relationship to your loved one</FormLabel>
                                 <Select onValueChange={field.onChange} value={field.value || ""}>
                                   <FormControl>
                                     <SelectTrigger data-testid="select-required-relationship">
                                       <SelectValue placeholder="Select your relationship" />
                                     </SelectTrigger>
                                   </FormControl>
                                   <SelectContent>
                                     {RELATIONSHIP_OPTIONS.map((rel) => (
                                       <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                                     ))}
                                   </SelectContent>
                                 </Select>
                                 <FormMessage />
                               </FormItem>
                             )}
                           />
                           <FormField
                             control={form.control}
                             name="estateStatus"
                             render={({ field }) => (
                               <FormItem>
                                 <FormLabel>Did your loved one have an estate, trust, or will?</FormLabel>
                                 <Select onValueChange={field.onChange} value={field.value || ""}>
                                   <FormControl>
                                     <SelectTrigger data-testid="select-required-estate-status">
                                       <SelectValue placeholder="Select an answer" />
                                     </SelectTrigger>
                                   </FormControl>
                                   <SelectContent>
                                     <SelectItem value="yes">Yes</SelectItem>
                                     <SelectItem value="no">No</SelectItem>
                                     <SelectItem value="unsure">I’m not sure</SelectItem>
                                   </SelectContent>
                                 </Select>
                                 <FormMessage />
                               </FormItem>
                             )}
                           />
                           {form.watch("estateStatus") === "yes" && (
                             <FormField
                               control={form.control}
                               name="isAuthorizedExecutor"
                               render={({ field }) => (
                                 <FormItem>
                                   <FormLabel>Are you the authorized executor?</FormLabel>
                                   <Select onValueChange={field.onChange} value={field.value || ""}>
                                     <FormControl>
                                       <SelectTrigger data-testid="select-required-authorized-executor">
                                         <SelectValue placeholder="Select an answer" />
                                       </SelectTrigger>
                                     </FormControl>
                                     <SelectContent>
                                       <SelectItem value="yes">Yes</SelectItem>
                                       <SelectItem value="no">No, someone else is</SelectItem>
                                       <SelectItem value="unsure">I’m not sure</SelectItem>
                                     </SelectContent>
                                   </Select>
                                   <FormMessage />
                                 </FormItem>
                               )}
                             />
                           )}
                         </div>
                      </div>
                      <div className="flex items-start gap-3 p-4 rounded-lg bg-accent/50">
                        <AlertCircle className="h-5 w-5 text-accent-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">Important</p>
                          <p className="text-sm text-muted-foreground">
                            Please ensure all information matches the official death certificate exactly. 
                            Incorrect information may delay the notification process.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div className="space-y-6 text-center py-8">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mx-auto">
                        <Lock className="h-10 w-10 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Ready to Submit</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                          Your certificate will be securely encrypted and stored on the blockchain. 
                          All connected service providers will be automatically notified.
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Shield className="h-4 w-4" />
                        <span>256-bit AES Encryption</span>
                      </div>
                    </div>
                  )}

                  {currentStep > 0 && (
                  <div className="flex justify-between pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setIsEditingVerify(false); setCurrentStep(Math.max(0, currentStep - 1)); }}
                      disabled={currentStep === 0}
                      data-testid="button-back"
                    >
                      Back
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createCertificate.isPending || isExtracting}
                      data-testid="button-next"
                    >
                      {createCertificate.isPending ? (
                        "Processing..."
                      ) : currentStep === 2 ? (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Submit Certificate
                        </>
                      ) : (
                        <>
                          Continue
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                  1
                </div>
                <div>
                  <p className="font-medium text-sm">Upload Certificate</p>
                  <p className="text-xs text-muted-foreground">Drag & drop or select file - AI extracts details</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                  2
                </div>
                <div>
                  <p className="font-medium text-sm">Blockchain Encryption</p>
                  <p className="text-xs text-muted-foreground">Certificate is encrypted and verified</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                  3
                </div>
                <div>
                  <p className="font-medium text-sm">Auto-Notify Services</p>
                  <p className="text-xs text-muted-foreground">Connected accounts are notified automatically</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                  4
                </div>
                <div>
                  <p className="font-medium text-sm">Take Action</p>
                  <p className="text-xs text-muted-foreground">Close, suspend, or continue each account</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-accent/30 border-accent">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-medium">Security Guaranteed</span>
              </div>
              <p className="text-sm text-muted-foreground">
                All data is encrypted using industry-standard AES-256 encryption and stored on a 
                secure blockchain for tamper-proof verification.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <FileImage className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-900 dark:text-blue-100">AI-Powered OCR</span>
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Upload an image of the death certificate and our AI will automatically extract 
                all the relevant information for you.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
