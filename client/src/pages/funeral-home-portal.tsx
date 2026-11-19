import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { formatDateInput } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  FileCheck,
  Loader2,
  Lock,
  Copy,
  CheckCircle2,
  AlertCircle,
  Upload,
  FileSearch,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface UserRole {
  role: "user" | "admin" | "funeral_home";
  funeralHomeId?: string;
}

interface CertificateResult {
  success: boolean;
  certificate: any;
  blockchainId: string;
  certificateNumber: string;
  blockchainHash: string;
  message: string;
}

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

const certificateSchema = z.object({
  deceasedName: z.string().min(2, "Full name is required"),
  dateOfDeath: z.string().min(1, "Date of death is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  issuingAuthority: z.string().min(2, "Issuing authority is required"),
  stateCode: z.string().min(2, "State is required"),
  countyCode: z.string().min(2, "County code is required"),
  placeOfDeath: z.string().optional(),
  causeOfDeath: z.string().optional(),
});

type CertificateFormData = z.infer<typeof certificateSchema>;

export default function FuneralHomePortal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<CertificateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const certificateInputRef = useRef<HTMLInputElement>(null);
  const [isReadingCertificate, setIsReadingCertificate] = useState(false);
  const [certificateReadError, setCertificateReadError] = useState("");
  const [certificateFileName, setCertificateFileName] = useState("");

  const { data: roleData, isLoading: roleLoading } = useQuery<UserRole>({
    queryKey: ["/api/user/role"],
  });

  const form = useForm<CertificateFormData>({
    resolver: zodResolver(certificateSchema),
    defaultValues: {
      deceasedName: "",
      dateOfDeath: "",
      dateOfBirth: "",
      issuingAuthority: "",
      stateCode: "",
      countyCode: "",
      placeOfDeath: "",
      causeOfDeath: "",
    },
  });

  const createCertificate = useMutation({
    mutationFn: async (data: CertificateFormData) => {
      const response = await apiRequest(
        "POST",
        "/api/funeral-home/certificates",
        data,
      );
      return response.json();
    },
    onSuccess: (data: CertificateResult) => {
      setLastResult(data);
      toast({
        title: "Certificate Created",
        description: `Blockchain ID: ${data.blockchainId}`,
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onSubmit = (data: CertificateFormData) => {
    createCertificate.mutate(data);
  };

  const readCertificate = (file?: File) => {
    if (!file) return;
    const accepted = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!accepted.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setCertificateReadError(
        "Choose a PDF, JPEG, PNG, or WebP file up to 10 MB.",
      );
      return;
    }
    setCertificateReadError("");
    setCertificateFileName(file.name);
    setIsReadingCertificate(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await apiRequest("POST", "/api/ocr/certificate", {
          imageDataUrl: reader.result,
        });
        const result = await response.json();
        if (result.verification?.verificationStatus === "rejected") {
          setCertificateReadError(
            result.verification.overallAssessment ||
              "This certificate could not be verified.",
          );
          return;
        }
        if (!result.extractedData) {
          setCertificateReadError(
            "No readable certificate details were found. You can enter the details manually.",
          );
          return;
        }
        const extracted = result.extractedData;
        const asUsDate = (value: unknown) => {
          const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
          return match
            ? `${match[2]}/${match[3]}/${match[1]}`
            : String(value || "");
        };
        if (extracted.deceasedName)
          form.setValue("deceasedName", String(extracted.deceasedName));
        if (extracted.dateOfBirth)
          form.setValue("dateOfBirth", asUsDate(extracted.dateOfBirth));
        if (extracted.dateOfDeath)
          form.setValue("dateOfDeath", asUsDate(extracted.dateOfDeath));
        if (extracted.placeOfDeathState)
          form.setValue("stateCode", String(extracted.placeOfDeathState));
        if (extracted.placeOfDeathCounty)
          form.setValue("countyCode", String(extracted.placeOfDeathCounty));
        if (extracted.issuingAuthority)
          form.setValue("issuingAuthority", String(extracted.issuingAuthority));
        if (extracted.placeOfDeathFacility || extracted.placeOfDeathCity)
          form.setValue(
            "placeOfDeath",
            [
              extracted.placeOfDeathFacility,
              extracted.placeOfDeathCity,
              extracted.placeOfDeathState,
            ]
              .filter(Boolean)
              .join(", "),
          );
        if (extracted.causeOfDeath)
          form.setValue("causeOfDeath", String(extracted.causeOfDeath));
        toast({
          title: "Certificate details filled",
          description:
            "Please review each field before creating the certificate.",
        });
      } catch (error: any) {
        setCertificateReadError(
          error?.message ||
            "The certificate could not be read. You can enter the details manually.",
        );
      } finally {
        setIsReadingCertificate(false);
      }
    };
    reader.onerror = () => {
      setCertificateReadError("The selected file could not be read.");
      setIsReadingCertificate(false);
    };
    reader.readAsDataURL(file);
  };

  if (roleLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
    );
  }

  if (roleData?.role !== "funeral_home" && roleData?.role !== "admin") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="max-w-md mx-auto mt-20">
          <CardContent className="pt-6 text-center">
            <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              This portal is only available to registered funeral homes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-semibold tracking-tight">
              Funeral Home Portal
            </h1>
            <p className="text-muted-foreground">
              Create and manage death certificates with blockchain verification
            </p>
          </div>
        </div>
      </div>

      <Card
        className="mb-6 border-primary/30 bg-primary/5"
        data-testid="card-partner-certificate-first"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Start with the death certificate
          </CardTitle>
          <CardDescription>
            Upload a certificate first. We will read it securely and fill
            matching fields below for your review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="partner-certificate-upload">
                Certificate document
              </Label>
              <p className="text-xs text-muted-foreground">
                {certificateFileName ||
                  "PDF, JPEG, PNG, or WebP up to 10 MB. Authenticity checks remain enabled."}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => certificateInputRef.current?.click()}
              disabled={isReadingCertificate}
              data-testid="button-partner-certificate-upload"
            >
              <Upload className="mr-2 h-4 w-4" />
              {isReadingCertificate
                ? "Reading certificate…"
                : "Choose certificate"}
            </Button>
            <input
              ref={certificateInputRef}
              id="partner-certificate-upload"
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => {
                readCertificate(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
              data-testid="input-partner-certificate-upload"
            />
          </div>
          {certificateReadError && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 text-sm text-destructive"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {certificateReadError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Create Death Certificate
            </CardTitle>
            <CardDescription>
              Enter the deceased's information to generate a blockchain-verified
              certificate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="deceasedName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Legal Name of Deceased</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John William Smith"
                          {...field}
                          data-testid="input-deceased-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
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
                            onChange={(e) =>
                              field.onChange(formatDateInput(e.target.value))
                            }
                            maxLength={10}
                            data-testid="input-dob"
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
                            onChange={(e) =>
                              field.onChange(formatDateInput(e.target.value))
                            }
                            maxLength={10}
                            data-testid="input-dod"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="stateCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-state">
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {US_STATES.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="countyCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>County Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="LAC"
                            {...field}
                            data-testid="input-county-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="issuingAuthority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issuing Authority</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Los Angeles County Registrar-Recorder"
                          {...field}
                          data-testid="input-issuing-authority"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="placeOfDeath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Place of Death (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="City, County, State"
                          {...field}
                          data-testid="input-place-of-death"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="causeOfDeath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cause of Death (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Natural causes"
                          {...field}
                          data-testid="input-cause-of-death"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createCertificate.isPending}
                  data-testid="button-create-certificate"
                >
                  {createCertificate.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Certificate...
                    </>
                  ) : (
                    <>
                      <FileCheck className="mr-2 h-4 w-4" />
                      Create Blockchain Certificate
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {lastResult && (
            <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  Certificate Created Successfully
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Blockchain ID
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 p-2 bg-background rounded border text-sm font-mono break-all">
                      {lastResult.blockchainId}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(lastResult.blockchainId)}
                      data-testid="button-copy-blockchain-id"
                    >
                      {copied ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    Certificate Number
                  </Label>
                  <p className="font-mono text-sm mt-1">
                    {lastResult.certificateNumber}
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    Blockchain Hash
                  </Label>
                  <p className="font-mono text-xs mt-1 text-muted-foreground break-all">
                    {lastResult.blockchainHash}
                  </p>
                </div>

                <Separator />

                <p className="text-sm text-muted-foreground">
                  This certificate has been securely recorded on the blockchain
                  and can be verified using the certificate number.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>API Documentation</CardTitle>
              <CardDescription>
                Use the API to integrate with your systems
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Endpoint
                </Label>
                <code className="block p-2 bg-muted rounded text-sm mt-1">
                  POST /api/funeral-home/certificates
                </code>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Authentication
                </Label>
                <code className="block p-2 bg-muted rounded text-sm mt-1">
                  X-API-Key: your_api_key
                </code>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Required Fields
                </Label>
                <ul className="text-sm mt-1 space-y-1 text-muted-foreground">
                  <li>
                    deceasedName, dateOfDeath, dateOfBirth, issuingAuthority,
                    stateCode, countyCode
                  </li>
                </ul>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Optional Fields
                </Label>
                <ul className="text-sm mt-1 space-y-1 text-muted-foreground">
                  <li>placeOfDeath, causeOfDeath</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verify Certificate</CardTitle>
              <CardDescription>
                Check the authenticity of a certificate
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Verification Endpoint
                </Label>
                <code className="block p-2 bg-muted rounded text-sm mt-1">
                  GET /api/funeral-home/verify/:certificateNumber
                </code>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
