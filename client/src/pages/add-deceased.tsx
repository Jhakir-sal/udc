import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatPhone, formatDateInput, formatSsnInput, getPhoneMismatchWarnings } from "@/lib/utils";
import { useLocation } from "wouter";
import { useRef } from "react";
import {
  UserPlus,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  Heart,
  FileText,
  User,
  Upload,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Shield } from "lucide-react";
import { REFERRAL_SOURCES } from "@shared/schema";
import { trackAnalyticsEvent } from "@/lib/analytics";

const steps = [
  { id: 1, label: "Deceased Information", icon: User },
  { id: 2, label: "Place of Death", icon: MapPin },
  { id: 3, label: "Next of Kin & Contacts", icon: Heart },
  { id: 4, label: "Review & Submit", icon: Check },
];

export default function AddDeceasedPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    deceasedFirstName: "",
    deceasedMiddleName: "",
    deceasedLastName: "",
    deceasedSuffix: "",
    deceasedSsn: "",
    dateOfBirth: "",
    dateOfDeath: "",
    certificateNumber: "",
    issuingAuthority: "",
    placeOfDeathType: "",
    placeOfDeathFacility: "",
    placeOfDeathAddress: "",
    placeOfDeathCity: "",
    placeOfDeathCounty: "",
    placeOfDeathState: "",
    placeOfDeathZip: "",
    fatherName: "",
    motherName: "",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    deceasedRelationshipToRecipient: "",
    nextOfKinPhone: "",
    nextOfKinEmail: "",
    nextOfKinAddress: "",
    nextOfKinCity: "",
    nextOfKinState: "",
    nextOfKinZip: "",
    informantName: "",
    informantRelationship: "",
    informantPhone: "",
    informantEmail: "",
    informantAddress: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    referralSource: "",
    referralDetail: "",
    referralCompanyId: "",
  });
  const referralCompanies = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/admin/referral-companies?active=true"],
    enabled: user?.role === "admin",
  });

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedFileName, setScannedFileName] = useState<string | null>(null);
  const [scannedFields, setScannedFields] = useState<string[]>([]);

  const isoToUsDate = (iso: string | null | undefined): string => {
    if (!iso) return "";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    return `${m[2]}/${m[3]}/${m[1]}`;
  };

  const splitName = (full: string) => {
    const suffixes = ["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"];
    let name = full.trim();
    // Handle "Last, First Middle" format
    const commaIdx = name.indexOf(",");
    if (commaIdx > 0) {
      const beforeComma = name.slice(0, commaIdx).trim();
      const afterComma = name.slice(commaIdx + 1).trim();
      // Only treat as Last-First if what follows the comma isn't just a suffix
      if (afterComma && !suffixes.includes(afterComma.toLowerCase())) {
        name = `${afterComma} ${beforeComma}`;
      } else {
        name = `${beforeComma} ${afterComma}`;
      }
    }
    const parts = name.split(/\s+/).filter(Boolean);
    let suffix = "";
    if (parts.length > 1 && suffixes.includes(parts[parts.length - 1].toLowerCase())) {
      suffix = parts.pop()!;
    }
    const first = parts.shift() || "";
    const last = parts.pop() || "";
    const middle = parts.join(" ");
    return { first, middle, last, suffix };
  };

  const mapPlaceType = (t: string | null | undefined): string => {
    if (!t) return "";
    const v = t.toLowerCase();
    if (v.includes("hospital")) return "hospital";
    if (v.includes("nursing") || v.includes("long-term") || v.includes("assisted")) return "nursing_home";
    if (v.includes("hospice")) return "hospice";
    if (v.includes("home") || v.includes("residence")) return "home";
    return "other";
  };

  const handleCertificateScan = (file: File) => {
    const supported = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!supported.includes(file.type)) {
      toast({ title: "Unsupported file", description: "Please upload a JPEG, PNG, GIF, WebP image, or PDF.", variant: "destructive" });
      return;
    }
    setIsScanning(true);
    setScannedFileName(null);
    setScannedFields([]);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await apiRequest("POST", "/api/ocr/certificate", { imageDataUrl: reader.result });
        const result = await res.json();
        if (!result.success || !result.extractedData) {
          toast({
            title: "Could not read certificate",
            description: result.error || "The document could not be verified or read. Please enter the details manually.",
            variant: "destructive",
          });
          return;
        }
        const d = result.extractedData;
        const filled: string[] = [];
        const updates: Partial<typeof form> = {};
        // Treat placeholder values like "None" / "N/A" / "Unknown" as empty
        const cleanName = (v: unknown): string => {
          const s = String(v ?? "").trim();
          if (!s) return "";
          const norm = s.toLowerCase().replace(/[^a-z]/g, "");
          if (["none", "na", "notapplicable", "unknown", "null", "notlisted", "notstated"].includes(norm)) return "";
          return s;
        };
        let spouseName = cleanName(d.spouseName);
        const fatherName = cleanName(d.fatherName);
        const motherName = cleanName(d.motherName);
        const informantName = cleanName(d.informantName);
        // Safety guards: a divorced/widowed/single decedent has no surviving spouse,
        // and the spouse name must never be the mother's or father's name.
        const marital = String(d.maritalStatus ?? "").toLowerCase();
        const noSpouseStatus = /divorc|widow|never\s*married|single|unmarried/.test(marital);
        const sameName = (a: string, b: string) =>
          !!a && !!b && a.toLowerCase().replace(/[^a-z]/g, "") === b.toLowerCase().replace(/[^a-z]/g, "");
        if (spouseName && (noSpouseStatus || sameName(spouseName, motherName) || sameName(spouseName, fatherName))) {
          spouseName = "";
        }
        if (d.deceasedName) {
          const { first, middle, last, suffix } = splitName(d.deceasedName);
          if (first) updates.deceasedFirstName = first;
          if (middle) updates.deceasedMiddleName = middle;
          if (last) updates.deceasedLastName = last;
          if (suffix) updates.deceasedSuffix = suffix;
          filled.push("Name");
        }
        const dob = isoToUsDate(d.dateOfBirth);
        if (dob) { updates.dateOfBirth = dob; filled.push("Date of Birth"); }
        const dod = isoToUsDate(d.dateOfDeath);
        if (dod) { updates.dateOfDeath = dod; filled.push("Date of Death"); }
        if (d.certificateNumber) { updates.certificateNumber = String(d.certificateNumber); filled.push("Certificate #"); }
        if (d.deceasedSsn) {
          const ssnDigits = String(d.deceasedSsn).replace(/\D/g, "");
          if (ssnDigits.length === 9) {
            updates.deceasedSsn = formatSsnInput(ssnDigits);
            filled.push("SSN");
          }
        }
        if (d.issuingAuthority) { updates.issuingAuthority = String(d.issuingAuthority); filled.push("Issuing Authority"); }
        const podType = mapPlaceType(d.placeOfDeathType);
        if (podType) updates.placeOfDeathType = podType;
        if (d.placeOfDeathFacility) updates.placeOfDeathFacility = String(d.placeOfDeathFacility);
        if (d.placeOfDeathCity) updates.placeOfDeathCity = String(d.placeOfDeathCity);
        if (d.placeOfDeathCounty) updates.placeOfDeathCounty = String(d.placeOfDeathCounty);
        if (d.placeOfDeathState) updates.placeOfDeathState = String(d.placeOfDeathState);
        if (d.placeOfDeathZip) updates.placeOfDeathZip = String(d.placeOfDeathZip);
        if (podType || d.placeOfDeathFacility || d.placeOfDeathCity) filled.push("Place of Death");
        // Parents (dedicated fields)
        if (fatherName) { updates.fatherName = fatherName; filled.push("Father's Name"); }
        if (motherName) { updates.motherName = motherName; filled.push("Mother's Name"); }
        // Next of kin: prefer surviving spouse, then informant, then parents
        if (spouseName) {
          updates.nextOfKinName = spouseName.replace(/\s*\([^)]*\)/g, "").trim();
          updates.nextOfKinRelationship = "Spouse";
          filled.push("Next of Kin (Spouse)");
        } else if (informantName && d.informantRelationship) {
          updates.nextOfKinName = informantName;
          updates.nextOfKinRelationship = String(d.informantRelationship);
          filled.push("Next of Kin (Informant)");
        } else if (fatherName) {
          updates.nextOfKinName = fatherName;
          updates.nextOfKinRelationship = "Father";
          filled.push("Next of Kin (Father)");
        } else if (motherName) {
          updates.nextOfKinName = motherName;
          updates.nextOfKinRelationship = "Mother";
          filled.push("Next of Kin (Mother)");
        }
        // Informant details
        if (informantName) {
          updates.informantName = informantName;
          if (d.informantRelationship) updates.informantRelationship = String(d.informantRelationship);
          if (d.informantAddress) updates.informantAddress = String(d.informantAddress);
          filled.push("Informant");
        }
        setForm((prev) => ({ ...prev, ...updates }));
        setScannedFileName(file.name);
        setScannedFields(filled);
        toast({
          title: "Certificate scanned",
          description: filled.length > 0
            ? `Auto-filled: ${filled.join(", ")}. Please review each field for accuracy.`
            : "No readable fields were found. Please enter the details manually.",
        });
      } catch (err: any) {
        toast({ title: "Scan failed", description: err.message || "Could not process the document.", variant: "destructive" });
      } finally {
        setIsScanning(false);
      }
    };
    reader.onerror = () => {
      setIsScanning(false);
      toast({ title: "Could not read file", description: "Please try a different file.", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

  const buildFullName = () => {
    return [form.deceasedFirstName, form.deceasedMiddleName, form.deceasedLastName, form.deceasedSuffix]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  };

  const createCaseMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const { deceasedFirstName, deceasedMiddleName, deceasedLastName, deceasedSuffix, ...rest } = data;
      const deceasedName = [deceasedFirstName, deceasedMiddleName, deceasedLastName, deceasedSuffix]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
      const res = await apiRequest("POST", "/api/admin/add-deceased", { ...rest, deceasedName });
      return res.json();
    },
    onSuccess: (data: any) => {
      trackAnalyticsEvent("certificate_or_case_created", {
        workflow: "manual_case",
        input_method: scannedFileName ? "upload" : "manual",
        ocr_used: Boolean(scannedFileName),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/all-certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/families"] });
      toast({
        title: "Case created",
        description: `Case for ${buildFullName()} has been created successfully.`,
      });
      navigate(`/admin/case/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create case",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isStep1Valid = form.deceasedFirstName.trim() && form.deceasedLastName.trim() && form.dateOfBirth && form.dateOfDeath && form.referralSource;

  if (user?.role !== "admin") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">This page is only available to concierge team members.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/cases")} data-testid="button-back-cases">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Cases
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-serif font-semibold tracking-tight flex items-center gap-3" data-testid="text-page-title">
          <UserPlus className="h-8 w-8 text-primary" />
          Add Deceased Person
        </h1>
        <p className="text-muted-foreground mt-1">
          Manually create a new case by entering the deceased person's information.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <button
                onClick={() => {
                  if (s.id <= step) setStep(s.id);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-${s.id}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline truncate">{s.label}</span>
                <span className="md:hidden">{s.id}</span>
              </button>
              {i < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
              )}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <Card className="mb-6 border-dashed">
          <CardContent className="p-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCertificateScan(file);
                e.target.value = "";
              }}
              data-testid="input-certificate-scan-file"
            />
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ScanLine className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Scan Death Certificate</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload the certificate and we'll auto-fill the vital information below using AI document reading.
                  </p>
                  {scannedFileName && (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1 mt-1" data-testid="text-scan-result">
                      <CheckCircle2 className="h-4 w-4" />
                      {scannedFileName} scanned{scannedFields.length > 0 ? ` — filled: ${scannedFields.join(", ")}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                data-testid="button-scan-certificate"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reading certificate...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload & Auto-Fill
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Deceased Information</CardTitle>
            <CardDescription>Enter the deceased person's basic information. Name, date of birth, and date of death are required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:col-span-2">
                <div>
                  <Label htmlFor="deceasedFirstName">First Name *</Label>
                  <Input
                    id="deceasedFirstName"
                    value={form.deceasedFirstName}
                    onChange={(e) => update("deceasedFirstName", e.target.value)}
                    placeholder="First"
                    data-testid="input-deceased-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="deceasedMiddleName">Middle Name</Label>
                  <Input
                    id="deceasedMiddleName"
                    value={form.deceasedMiddleName}
                    onChange={(e) => update("deceasedMiddleName", e.target.value)}
                    placeholder="Middle"
                    data-testid="input-deceased-middle-name"
                  />
                </div>
                <div>
                  <Label htmlFor="deceasedLastName">Last Name *</Label>
                  <Input
                    id="deceasedLastName"
                    value={form.deceasedLastName}
                    onChange={(e) => update("deceasedLastName", e.target.value)}
                    placeholder="Last"
                    data-testid="input-deceased-last-name"
                  />
                </div>
                <div>
                  <Label htmlFor="deceasedSuffix">Suffix</Label>
                  <Input
                    id="deceasedSuffix"
                    value={form.deceasedSuffix}
                    onChange={(e) => update("deceasedSuffix", e.target.value)}
                    placeholder="Jr., Sr., III"
                    data-testid="input-deceased-suffix"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="deceasedSsn">Social Security Number</Label>
                <Input
                  id="deceasedSsn"
                  value={form.deceasedSsn}
                  onChange={(e) => update("deceasedSsn", formatSsnInput(e.target.value))}
                  placeholder="111-11-1111"
                  maxLength={11}
                  data-testid="input-deceased-ssn"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fatherName">Father's Name</Label>
                  <Input
                    id="fatherName"
                    value={form.fatherName}
                    onChange={(e) => update("fatherName", e.target.value)}
                    placeholder="Full name"
                    data-testid="input-father-name"
                  />
                </div>
                <div>
                  <Label htmlFor="motherName">Mother's Name (maiden)</Label>
                  <Input
                    id="motherName"
                    value={form.motherName}
                    onChange={(e) => update("motherName", e.target.value)}
                    placeholder="Full name"
                    data-testid="input-mother-name"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="certificateNumber">Certificate Number</Label>
                <Input
                  id="certificateNumber"
                  value={form.certificateNumber}
                  onChange={(e) => update("certificateNumber", e.target.value)}
                  placeholder="Auto-generated if left blank"
                  data-testid="input-certificate-number"
                />
              </div>
              <div>
                <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                <Input
                  id="dateOfBirth"
                  type="text"
                  placeholder="MM/DD/YYYY"
                  value={form.dateOfBirth}
                  onChange={(e) => update("dateOfBirth", formatDateInput(e.target.value))}
                  maxLength={10}
                  data-testid="input-date-of-birth"
                />
              </div>
              <div>
                <Label htmlFor="dateOfDeath">Date of Death *</Label>
                <Input
                  id="dateOfDeath"
                  type="text"
                  placeholder="MM/DD/YYYY"
                  value={form.dateOfDeath}
                  onChange={(e) => update("dateOfDeath", formatDateInput(e.target.value))}
                  maxLength={10}
                  data-testid="input-date-of-death"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="issuingAuthority">Issuing Authority</Label>
                <Input
                  id="issuingAuthority"
                  value={form.issuingAuthority}
                  onChange={(e) => update("issuingAuthority", e.target.value)}
                  placeholder="e.g., State of California, Department of Public Health"
                  data-testid="input-issuing-authority"
                />
              </div>
              <div>
                <Label htmlFor="referralSource">How did the family hear about us? <span className="text-destructive">*</span></Label>
                <Select
                  value={form.referralSource}
                  onValueChange={(v) => {
                    update("referralSource", v);
                    if (v !== "care_patrol" && v !== "funeral_home" && v !== "referral") {
                      update("referralDetail", "");
                      update("referralCompanyId", "");
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-referral-source">
                    <SelectValue placeholder="Select a source" />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.referralSource === "care_patrol" || form.referralSource === "funeral_home" || form.referralSource === "referral") && (
                <>
                <div>
                  <Label htmlFor="referralCompanyId">Registered referral company</Label>
                  <Select value={form.referralCompanyId || "none"} onValueChange={(value) => update("referralCompanyId", value === "none" ? "" : value)}>
                    <SelectTrigger id="referralCompanyId" data-testid="select-referral-company">
                      <SelectValue placeholder="Select a company, if registered" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not registered / use details</SelectItem>
                      {(referralCompanies.data || []).map((company) => (
                        <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Progress sharing stays off until the signed-in family owner confirms digitally.
                  </p>
                </div>
                <div>
                  <Label htmlFor="referralDetail">
                    {form.referralSource === "care_patrol" ? "Care Patrol Location / fallback" : "Company Name & Location / fallback"}
                  </Label>
                  <Input
                    id="referralDetail"
                    value={form.referralDetail}
                    onChange={(e) => update("referralDetail", e.target.value)}
                    placeholder={form.referralSource === "care_patrol" ? "e.g., Care Patrol of North Dallas" : "e.g., Smith Family Funeral Home, Austin TX"}
                    data-testid="input-referral-detail"
                  />
                </div>
                </>
              )}
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep(2)} disabled={!isStep1Valid} data-testid="button-next-step">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Place of Death</CardTitle>
            <CardDescription>Enter location details where the death occurred. All fields are optional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="placeOfDeathType">Type of Place</Label>
                <Select value={form.placeOfDeathType} onValueChange={(v) => update("placeOfDeathType", v)}>
                  <SelectTrigger data-testid="select-pod-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hospital">Hospital</SelectItem>
                    <SelectItem value="home">Home / Residence</SelectItem>
                    <SelectItem value="nursing_home">Nursing Home</SelectItem>
                    <SelectItem value="hospice">Hospice</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="placeOfDeathFacility">Facility Name</Label>
                <Input
                  id="placeOfDeathFacility"
                  value={form.placeOfDeathFacility}
                  onChange={(e) => update("placeOfDeathFacility", e.target.value)}
                  placeholder="Hospital or facility name"
                  data-testid="input-pod-facility"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="placeOfDeathAddress">Street Address</Label>
                <Input
                  id="placeOfDeathAddress"
                  value={form.placeOfDeathAddress}
                  onChange={(e) => update("placeOfDeathAddress", e.target.value)}
                  placeholder="123 Main Street"
                  data-testid="input-pod-address"
                />
              </div>
              <div>
                <Label htmlFor="placeOfDeathCity">City</Label>
                <Input
                  id="placeOfDeathCity"
                  value={form.placeOfDeathCity}
                  onChange={(e) => update("placeOfDeathCity", e.target.value)}
                  placeholder="City"
                  data-testid="input-pod-city"
                />
              </div>
              <div>
                <Label htmlFor="placeOfDeathCounty">County</Label>
                <Input
                  id="placeOfDeathCounty"
                  value={form.placeOfDeathCounty}
                  onChange={(e) => update("placeOfDeathCounty", e.target.value)}
                  placeholder="County"
                  data-testid="input-pod-county"
                />
              </div>
              <div>
                <Label htmlFor="placeOfDeathState">State</Label>
                <Input
                  id="placeOfDeathState"
                  value={form.placeOfDeathState}
                  onChange={(e) => update("placeOfDeathState", e.target.value)}
                  placeholder="State"
                  data-testid="input-pod-state"
                />
              </div>
              <div>
                <Label htmlFor="placeOfDeathZip">ZIP Code</Label>
                <Input
                  id="placeOfDeathZip"
                  value={form.placeOfDeathZip}
                  onChange={(e) => update("placeOfDeathZip", e.target.value)}
                  placeholder="12345"
                  data-testid="input-pod-zip"
                />
              </div>
            </div>
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-prev-step">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(3)} data-testid="button-next-step">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Next of Kin & Contacts</CardTitle>
            <CardDescription>Enter family and contact information. All fields are optional but help with case management.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Heart className="h-4 w-4" /> Next of Kin
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.nextOfKinName} onChange={(e) => update("nextOfKinName", e.target.value)} placeholder="Full name" data-testid="input-nok-name" />
                </div>
                <div>
                  <Label>Relationship</Label>
                  <Input value={form.nextOfKinRelationship} onChange={(e) => update("nextOfKinRelationship", e.target.value)} placeholder="e.g., Spouse, Son, Daughter" data-testid="input-nok-relationship" />
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.deceasedRelationshipToRecipient} onChange={(e) => update("deceasedRelationshipToRecipient", e.target.value)} data-testid="select-deceased-relationship-to-recipient">
                    <option value="">Relationship of deceased to recipient (optional)</option>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                     <option value="parent">Parent</option>
                    <option value="spouse">Spouse</option>
                     <option value="partner">Partner</option>
                    <option value="sibling">Sibling</option>
                     <option value="brother">Brother</option>
                     <option value="sister">Sister</option>
                     <option value="son">Son</option>
                     <option value="daughter">Daughter</option>
                     <option value="child">Child</option>
                     <option value="grandparent">Grandparent</option>
                     <option value="relative">Relative</option>
                     <option value="friend">Friend</option>
                  </select>
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input type="tel" value={formatPhone(form.nextOfKinPhone)} onChange={(e) => update("nextOfKinPhone", formatPhone(e.target.value))} placeholder="555-123-4567" data-testid="input-nok-phone" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.nextOfKinEmail} onChange={(e) => update("nextOfKinEmail", e.target.value)} placeholder="email@example.com" data-testid="input-nok-email" />
                </div>
                <div className="md:col-span-2">
                  <Label>Street Address</Label>
                  <Input value={form.nextOfKinAddress} onChange={(e) => update("nextOfKinAddress", e.target.value)} placeholder="123 Main Street" data-testid="input-nok-address" />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={form.nextOfKinCity} onChange={(e) => update("nextOfKinCity", e.target.value)} placeholder="City" data-testid="input-nok-city" />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={form.nextOfKinState} onChange={(e) => update("nextOfKinState", e.target.value)} placeholder="State" data-testid="input-nok-state" />
                </div>
                <div>
                  <Label>Zip Code</Label>
                  <Input value={form.nextOfKinZip} onChange={(e) => update("nextOfKinZip", e.target.value)} placeholder="12345" data-testid="input-nok-zip" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Informant
                </h3>
                {form.nextOfKinName && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      update("informantName", form.nextOfKinName);
                      update("informantRelationship", form.nextOfKinRelationship);
                      update("informantPhone", form.nextOfKinPhone);
                      update("informantEmail", form.nextOfKinEmail);
                      update("informantAddress", [form.nextOfKinAddress, form.nextOfKinCity, form.nextOfKinState, form.nextOfKinZip].filter(Boolean).join(", "));
                    }}
                    data-testid="button-informant-same-as-nok"
                  >
                    Same as Next of Kin
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.informantName} onChange={(e) => update("informantName", e.target.value)} placeholder="Full name" data-testid="input-informant-name" />
                </div>
                <div>
                  <Label>Relationship</Label>
                  <Input value={form.informantRelationship} onChange={(e) => update("informantRelationship", e.target.value)} placeholder="e.g., Spouse, Sibling" data-testid="input-informant-relationship" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input type="tel" value={formatPhone(form.informantPhone)} onChange={(e) => update("informantPhone", formatPhone(e.target.value))} placeholder="555-123-4567" data-testid="input-informant-phone" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.informantEmail} onChange={(e) => update("informantEmail", e.target.value)} placeholder="email@example.com" data-testid="input-informant-email" />
                </div>
                <div className="md:col-span-2">
                  <Label>Address</Label>
                  <Input value={form.informantAddress} onChange={(e) => update("informantAddress", e.target.value)} placeholder="Full mailing address" data-testid="input-informant-address" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" /> Primary Contact
                </h3>
                <div className="flex gap-2">
                  {form.nextOfKinName && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        update("contactName", form.nextOfKinName);
                        update("contactPhone", form.nextOfKinPhone);
                        update("contactEmail", form.nextOfKinEmail);
                      }}
                      data-testid="button-contact-same-as-nok"
                    >
                      Same as Next of Kin
                    </Button>
                  )}
                  {form.informantName && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        update("contactName", form.informantName);
                        update("contactPhone", form.informantPhone);
                        update("contactEmail", form.informantEmail);
                      }}
                      data-testid="button-contact-same-as-informant"
                    >
                      Same as Informant
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Name</Label>
                  <Input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="Full name" data-testid="input-contact-name" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input type="tel" value={formatPhone(form.contactPhone)} onChange={(e) => update("contactPhone", formatPhone(e.target.value))} placeholder="555-123-4567" data-testid="input-contact-phone" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} placeholder="email@example.com" data-testid="input-contact-email" />
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-prev-step">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(4)} data-testid="button-next-step">
                Review <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Submit</CardTitle>
            <CardDescription>Review the information below before creating the case.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(() => {
              const phoneWarnings = getPhoneMismatchWarnings([
                { label: "Next of Kin", name: form.nextOfKinName, phone: form.nextOfKinPhone },
                { label: "Informant", name: form.informantName, phone: form.informantPhone },
                { label: "Primary Contact", name: form.contactName, phone: form.contactPhone },
              ]);
              if (phoneWarnings.length === 0) return null;
              return (
                <div
                  className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2"
                  data-testid="alert-phone-mismatch"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Phone number mismatch detected
                  </div>
                  {phoneWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800 dark:text-amber-300" data-testid={`text-phone-mismatch-${i}`}>
                      {w}
                    </p>
                  ))}
                </div>
              );
            })()}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-primary mb-2">Deceased Information</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{buildFullName() || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">SSN</dt>
                    <dd className="font-medium">{form.deceasedSsn ? `***-**-${form.deceasedSsn.slice(-4)}` : "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Date of Birth</dt>
                    <dd className="font-medium">{form.dateOfBirth || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Date of Death</dt>
                    <dd className="font-medium">{form.dateOfDeath || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Father</dt>
                    <dd className="font-medium">{form.fatherName || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Mother</dt>
                    <dd className="font-medium">{form.motherName || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Certificate #</dt>
                    <dd className="font-medium">{form.certificateNumber || "Auto-generated"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Issuing Authority</dt>
                    <dd className="font-medium">{form.issuingAuthority || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Heard About Us</dt>
                    <dd className="font-medium text-right">
                      {form.referralSource
                        ? `${REFERRAL_SOURCES.find((s) => s.value === form.referralSource)?.label || form.referralSource}${form.referralDetail ? ` — ${form.referralDetail}` : ""}`
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-primary mb-2">Place of Death</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-medium">{form.placeOfDeathType || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Facility</dt>
                    <dd className="font-medium">{form.placeOfDeathFacility || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Location</dt>
                    <dd className="font-medium text-right">
                      {[form.placeOfDeathCity, form.placeOfDeathState, form.placeOfDeathZip].filter(Boolean).join(", ") || "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-primary mb-2">Next of Kin</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{form.nextOfKinName || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Relationship</dt>
                    <dd className="font-medium">{form.nextOfKinRelationship || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium">{form.nextOfKinPhone || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium">{form.nextOfKinEmail || "—"}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-primary mb-2">Informant</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{form.informantName || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Relationship</dt>
                    <dd className="font-medium">{form.informantRelationship || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium">{form.informantPhone || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium">{form.informantEmail || "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep(3)} data-testid="button-prev-step">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => createCaseMutation.mutate(form)}
                disabled={createCaseMutation.isPending || !isStep1Valid}
                data-testid="button-submit-case"
              >
                {createCaseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Create Case
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
