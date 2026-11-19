import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { readOutreachFile } from "@/lib/outreach-file";
import { OUTREACH_MAILING_ADDRESS, OUTREACH_PDF_MAX_BYTES, PARTNER_OVERVIEW_FILENAME } from "@shared/outreach";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, FileUp, Mail, RefreshCw, Search, Send } from "lucide-react";
import { OutreachStatusFilter, OutreachTrackedContact, OutreachSummary } from "@shared/outreachTracking";
import { RecipientHistory } from "@/components/recipient-history";

type Contact = OutreachTrackedContact;
type Template = { id: string; label: string; subject: string; body?: string; attachmentSha256?: string | null };
type OutreachData = { contacts: Contact[]; templates: Template[]; senderEmail: string; configured: boolean; testConfigured: boolean; total: number; eligible: number; page: number; pageSize: number; summary: OutreachSummary };
type Preview = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachment: { filename: string; size: number; pages?: number; sha256: string } | null;
  reviewedFor: { contactId: string; templateId: string; ccEmail: string; attachmentVersion: number };
};
type TestPreview = Omit<Preview, "reviewedFor"> & {
  reviewedFor: { testEmail: string; templateId: string; ccEmail: string };
};
type SendResult = { email: string; status: string; error?: string };
type SendResponse = { sent: number; skipped: number; failed: number; results: SendResult[] };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}
function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export default function AdminOutreachPage({ embedded = false }: { embedded?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const pdfReadGeneration = useRef(0);
  const [attachment, setAttachment] = useState<{ filename: string; content: string; file: File } | null>(null);
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const templateForm = useRef<HTMLDivElement>(null);
  const [templateId, setTemplateId] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testPreview, setTestPreview] = useState<TestPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewContactId, setPreviewContactId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ label: "", subject: "", body: "", attachPartnerOverview: false });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OutreachStatusFilter>("not_sent");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const outreach = useQuery<OutreachData>({
    queryKey: ["/api/admin/outreach", page, status, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), status, search });
      return (await apiRequest("GET", `/api/admin/outreach?${params}`)).json() as Promise<OutreachData>;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const contacts = useMemo(() => outreach.data?.contacts ?? [], [outreach.data?.contacts]);
  const templates = outreach.data?.templates ?? [];
  const sendableContacts = useMemo(() => contacts.filter((contact) => contact.outreachStatus === "not_sent" && !contact.unsubscribedAt), [contacts]);
  const currentTemplate = templates.find((template) => template.id === templateId);
  const pdfUrl = useMemo(() => attachment ? URL.createObjectURL(attachment.file) : null, [attachment]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const attachmentPayload = attachment ? { filename: attachment.filename, content: attachment.content } : undefined;
  const templateText = `${currentTemplate?.subject || ""}\n${currentTemplate?.body || ""}`;
  const bracketName = /\[\s*first[\s_-]*name\s*\]/i.test(templateText);
  const attachmentClaim = /\battach(?:ed|ment|ments|ing)?\b/i.test(templateText);
  const ccAddress = ccEmail.trim();
  const testAddress = testEmail.trim();
  const ccIsValid = !ccAddress || z.string().email().max(320).safeParse(ccAddress).success;
  const testIsValid = z.string().email().max(320).safeParse(testAddress).success
    && (!ccAddress || ccAddress.toLowerCase() !== testAddress.toLowerCase());
  const matchedPreview = preview?.reviewedFor.contactId === previewContactId
    && preview.reviewedFor.templateId === templateId
    && preview.reviewedFor.ccEmail === ccAddress
    && preview.reviewedFor.attachmentVersion === attachmentVersion ? preview : null;
  const matchedTestPreview = testPreview?.reviewedFor.testEmail === testAddress
    && testPreview.reviewedFor.templateId === templateId
    && testPreview.reviewedFor.ccEmail === ccAddress ? testPreview : null;

  useEffect(() => {
    const eligibleIds = new Set(contacts.filter((contact) => contact.outreachStatus === "not_sent" && !contact.unsubscribedAt).map((contact) => contact.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => eligibleIds.has(id)).slice(0, 25);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [contacts]);
  useEffect(() => {
    if (selectedIds.length && !selectedIds.includes(previewContactId)) {
      setPreviewContactId(selectedIds[0]);
      setPreview(null);
      setConfirmationChecked(false);
    } else if (!selectedIds.length && previewContactId) {
      setPreviewContactId("");
      setPreview(null);
      setConfirmationChecked(false);
    }
  }, [selectedIds, previewContactId]);

  const clearRecipientWorkflow = () => {
    setSelectedIds([]);
    setPreviewContactId("");
    setPreview(null);
    setConfirmationChecked(false);
  };
  useEffect(() => {
    if (!outreach.data) return;
    const lastPage = Math.max(1, Math.ceil(outreach.data.total / outreach.data.pageSize));
    if (page > lastPage) {
      clearRecipientWorkflow();
      setPage(lastPage);
    }
  }, [outreach.data, page]);
  const changeStatus = (next: OutreachStatusFilter) => {
    if (next === status) return;
    clearRecipientWorkflow();
    setPage(1);
    setStatus(next);
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextSearch = searchInput.trim().slice(0, 200);
    if (nextSearch === search) return;
    clearRecipientWorkflow();
    setPage(1);
    setSearch(nextSearch);
  };

  const importCsv = useMutation({
    mutationFn: async (csv: string) => (await apiRequest("POST", "/api/admin/outreach/import", { csv })).json() as Promise<{ imported: number; skipped: number; skippedRows: { row: number; reason: string }[] }>,
    onSuccess: async (result) => {
      const details = result.skippedRows.slice(0, 5).map(({ row, reason }) => `row ${row} (${reason})`).join(", ");
      setImportMessage(`Imported ${result.imported} contact${result.imported === 1 ? "" : "s"}.` +
        (result.skipped ? ` Skipped ${result.skipped} invalid row${result.skipped === 1 ? "" : "s"}: ${details}${result.skipped > 5 ? `, and ${result.skipped - 5} more` : ""}.` : ""));
      setPreview(null);
      setConfirmationChecked(false);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/outreach"] });
    },
  });
  const saveTemplate = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: typeof newTemplate }) =>
      (await apiRequest(id ? "PATCH" : "POST", id ? `/api/admin/outreach/templates/${id}` : "/api/admin/outreach/templates", draft)).json() as Promise<Template>,
    onSuccess: async (saved) => {
      setNewTemplate({ label: "", subject: "", body: "", attachPartnerOverview: false });
      setEditingTemplateId(null);
      updateTemplate(saved.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/outreach"] });
    },
  });
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/outreach/templates/${id}`)).json() as Promise<{ deleted: boolean }>,
    onSuccess: async (_result, id) => {
      if (templateId === id) updateTemplate("");
      if (editingTemplateId === id) {
        setEditingTemplateId(null);
        setNewTemplate({ label: "", subject: "", body: "", attachPartnerOverview: false });
      }
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/outreach"] });
    },
  });
  const previewMutation = useMutation({
    mutationFn: async () => {
      const reviewedFor = {
        contactId: previewContactId,
        templateId,
        ccEmail: ccAddress,
        attachmentVersion,
      };
      const response = await apiRequest("POST", "/api/admin/outreach/preview", {
        contactId: reviewedFor.contactId, templateId: reviewedFor.templateId,
        ccEmail: ccAddress || undefined, attachment: attachmentPayload,
      });
      const rendered = await response.json() as Omit<Preview, "reviewedFor">;
      return { ...rendered, reviewedFor };
    },
    onSuccess: setPreview,
    onError: () => setPreview(null),
  });
  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/outreach/send", {
        contactIds: selectedIds,
        onlyUnsent: true,
        templateId,
        ...(ccAddress ? { ccEmail: ccAddress } : {}),
        attachment: attachmentPayload,
      });
      return response.json() as Promise<SendResponse>;
    },
    onSuccess: async () => {
      setConfirmationChecked(false);
      setSelectedIds([]);
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/outreach"] });
    },
  });
  const testPreviewMutation = useMutation({
    mutationFn: async () => {
      const reviewedFor = { testEmail: testAddress, templateId, ccEmail: ccAddress };
      const response = await apiRequest("POST", "/api/admin/outreach/test-preview", {
        ...reviewedFor, ccEmail: ccAddress || undefined,
      });
      const rendered = await response.json() as Omit<TestPreview, "reviewedFor">;
      return { ...rendered, reviewedFor };
    },
    onSuccess: setTestPreview,
    onError: () => setTestPreview(null),
  });
  const testSendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/outreach/test-send", {
        testEmail: testAddress, templateId,
        ...(ccAddress ? { ccEmail: ccAddress } : {}),
      });
      return response.json() as Promise<{ sent: boolean; to: string; cc: string | null; subject: string }>;
    },
    onSuccess: () => setTestPreview(null),
  });

  const updateTemplate = (value: string) => {
    setTemplateId(value);
    setPreview(null);
    setTestPreview(null);
    setConfirmationChecked(false);
    clearPdf();
  };
  const copyTemplate = () => {
    if (!currentTemplate?.body) return;
    saveTemplate.reset();
    setEditingTemplateId(null);
    setNewTemplate({
      label: `Copy of ${currentTemplate.label}`.slice(0, 100),
      subject: currentTemplate.subject.replace(/\[\s*first[\s_-]*name\s*\]/gi, "{{first_name}}"),
      body: currentTemplate.body.replace(/\[\s*first[\s_-]*name\s*\]/gi, "{{first_name}}"),
      attachPartnerOverview: Boolean(currentTemplate.attachmentSha256 || attachmentClaim),
    });
    templateForm.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const editTemplate = () => {
    if (!currentTemplate?.body) return;
    saveTemplate.reset();
    setEditingTemplateId(currentTemplate.id);
    setNewTemplate({
      label: currentTemplate.label,
      subject: currentTemplate.subject,
      body: currentTemplate.body,
      attachPartnerOverview: Boolean(currentTemplate.attachmentSha256),
    });
    templateForm.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toggleContact = (contact: Contact, checked: boolean) => {
    setConfirmationChecked(false);
    setSelectedIds((current) => checked
      ? current.length >= 25 || current.includes(contact.id) ? current : [...current, contact.id]
      : current.filter((id) => id !== contact.id));
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    setImportMessage("");
    setFileError("");
    setIsReading(true);
    try {
      importCsv.mutate(await readOutreachFile(file));
    } catch (error) {
      setFileError(errorMessage(error));
    } finally {
      setIsReading(false);
    }
  };
  const clearPdf = () => {
    pdfReadGeneration.current++;
    setAttachmentVersion(pdfReadGeneration.current);
    setAttachment(null);
    setAttachmentError("");
    setAttachmentLoading(false);
    setPreview(null);
    setConfirmationChecked(false);
  };
  const loadPdf = (file?: File) => {
    clearPdf();
    if (!file) return;
    if (!file.size || file.size > OUTREACH_PDF_MAX_BYTES ||
        !/^[a-zA-Z0-9][a-zA-Z0-9 _().-]{0,119}\.pdf$/i.test(file.name) || file.name.includes("..")) {
      setAttachmentError("Choose a PDF under 5 MB with a simple filename.");
      return;
    }
    const generation = pdfReadGeneration.current;
    setAttachmentLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (generation !== pdfReadGeneration.current) return;
      const data = String(reader.result ?? "");
      if (!/^data:[^,]*;base64,/.test(data)) {
        setAttachmentError("The PDF could not be read. Choose it again.");
      } else {
        setAttachment({ filename: file.name, content: data.slice(data.indexOf(",") + 1), file });
      }
      setAttachmentLoading(false);
    };
    reader.onerror = () => {
      if (generation !== pdfReadGeneration.current) return;
      setAttachmentError("The PDF could not be read. Choose it again.");
      setAttachmentLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const canPreview = !!previewContactId && !!templateId && ccIsValid && !attachmentLoading && !attachmentError;
  const canTestPreview = testIsValid && !!templateId && ccIsValid
    && !bracketName && (!attachmentClaim || !!currentTemplate?.attachmentSha256);
  const canTestSend = canTestPreview && !!matchedTestPreview && !!outreach.data?.testConfigured
    && (currentTemplate?.attachmentSha256 ? matchedTestPreview.attachment?.sha256 === currentTemplate.attachmentSha256 : !matchedTestPreview.attachment)
    && !testPreviewMutation.isPending && !testSendMutation.isPending;
  const canSend = selectedIds.length > 0 && selectedIds.length <= 25 && !!templateId
    && ccIsValid
    && !!matchedPreview && selectedIds.includes(previewContactId)
    && !bracketName && (!attachmentClaim || !!currentTemplate?.attachmentSha256 || !!attachment)
    && !attachmentLoading && !attachmentError
    && (currentTemplate?.attachmentSha256
      ? matchedPreview.attachment?.sha256 === currentTemplate.attachmentSha256
      : attachment ? matchedPreview.attachment?.filename === attachment.filename : !matchedPreview.attachment)
    && !!outreach.data?.configured && confirmationChecked && !previewMutation.isPending && !sendMutation.isPending;

  return <section aria-label="Email outreach" className={embedded ? "min-w-0 space-y-6" : "mx-auto max-w-7xl min-w-0 space-y-6 p-4 sm:p-7"}>
    <header>
      <div className="flex items-center gap-3 text-accent"><Mail className="h-7 w-7" /><span className="text-sm font-semibold tracking-wide">ADMIN TOOLS</span></div>
      {embedded ? <h2 className="mt-2 font-serif text-2xl font-semibold">Email outreach</h2> : <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">Email outreach</h1>}
      <p className="mt-2 max-w-3xl text-muted-foreground">Import business contacts you are permitted to email, choose a template, and review the personalized message before sending.</p>
      <Button className="mt-4" onClick={() => fileInput.current?.click()} disabled={!outreach.data || isReading || importCsv.isPending}><FileUp className="mr-2 h-4 w-4" />Upload recipient CSV or Excel</Button>
    </header>

    {outreach.isLoading && <div className="py-10 text-center text-muted-foreground" role="status">Loading outreach contacts…</div>}
    {outreach.isError && <Alert variant="destructive"><AlertTitle>Outreach data could not be loaded</AlertTitle><AlertDescription>{errorMessage(outreach.error)} <Button className="ml-2" size="sm" variant="outline" onClick={() => outreach.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></AlertDescription></Alert>}

    {outreach.data && <>
      <Card>
        <CardHeader><CardTitle>Sender and delivery requirements</CardTitle><CardDescription>Messages use the sender address below. It must be verified with the email provider. The fixed physical mailing address is included in every message.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Sender email</span>
            <span className="font-mono text-sm">{outreach.data.senderEmail || "Not configured"}</span>
            <Badge variant={outreach.data.configured ? "secondary" : "destructive"}>{outreach.data.configured ? "Sending available" : "Sending unavailable"}</Badge>
          </div>
           {!outreach.data.configured && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Live outreach is unavailable</AlertTitle><AlertDescription>Campaign sending requires the published app and its email provider. Test sends can run in development if the provider is configured. {outreach.data.senderEmail} must be verified with the provider.</AlertDescription></Alert>}
          <div className="grid gap-2">
            <p className="text-sm font-medium">Physical mailing address (fixed)</p>
            <p className="text-sm">{OUTREACH_MAILING_ADDRESS}</p>
            <p className="text-sm text-muted-foreground">Included automatically in previews, test emails, and outreach sends.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] [&>*]:min-w-0">
        <Card>
           <CardHeader><CardTitle>Import contacts from CSV or Excel</CardTitle><CardDescription>Upload a CSV, XLS, or XLSX file with up to 2,000 contacts. Excel imports use the first worksheet. Include columns for <code>Email Address, Name, Company Name</code> (or <code>email, first_name, company_name</code>). Full names are kept; the first name is used for greetings. Empty rows are ignored; contacts with missing or invalid names or emails are skipped and reported while the rest import.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
             <input ref={fileInput} className="sr-only" type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Choose contacts CSV or Excel file" onChange={(event) => { void loadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
             <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={isReading || importCsv.isPending}><FileUp className="mr-2 h-4 w-4" />{isReading ? "Reading file…" : importCsv.isPending ? "Importing…" : "Choose CSV or Excel file"}</Button>
            {importMessage && <p className="text-sm" role="status">{importMessage}</p>}
             {fileError && <Alert variant="destructive"><AlertTitle>File could not be imported</AlertTitle><AlertDescription>{fileError}</AlertDescription></Alert>}
            {importCsv.isError && <Alert variant="destructive"><AlertTitle>Contacts were not imported</AlertTitle><AlertDescription>{errorMessage(importCsv.error)}</AlertDescription></Alert>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Compose and preview</CardTitle><CardDescription>Personalization is rendered by the server using the selected contact and template.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="outreach-template">Email template</Label>
              <Select value={templateId} onValueChange={updateTemplate}>
                <SelectTrigger id="outreach-template" aria-label="Email template"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                <SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>)}</SelectContent>
              </Select>
              {currentTemplate && <section aria-label="Selected template" className="space-y-3 rounded-md border bg-muted/40 p-4">
                <p className="text-sm font-semibold">Saved template: {currentTemplate.label}</p>
                <p className="break-words text-sm">Subject: {currentTemplate.subject}</p>
                {currentTemplate.body && <>
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-t pt-3 font-sans text-sm">{currentTemplate.body}</pre>
                  {currentTemplate.attachmentSha256 && <p className="text-sm font-medium">Attached to this template: {PARTNER_OVERVIEW_FILENAME} · 1-page PDF · <a className="underline" href="/api/admin/outreach/partner-overview" target="_blank" rel="noopener noreferrer">Open approved PDF</a></p>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={editTemplate}>Edit template</Button>
                    <Button size="sm" variant="outline" onClick={copyTemplate}>Copy as new template</Button>
                    <Button size="sm" variant="destructive" onClick={() => { deleteTemplate.reset(); setDeleteTarget(currentTemplate); }}>Delete template</Button>
                  </div>
                </>}
              </section>}
              {bracketName && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Greeting will not be personalized</AlertTitle><AlertDescription><code>[First Name]</code> stays as written. Use <code>{"{{first_name}}"}</code> in a revised template instead.</AlertDescription></Alert>}
               {attachmentClaim && !currentTemplate?.attachmentSha256 && !attachment && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>No attachment selected</AlertTitle><AlertDescription>Select an approved PDF below before sending, or save a revised template with the pinned one-page PDF.</AlertDescription></Alert>}
              {deleteTemplate.isError && <Alert variant="destructive"><AlertTitle>Template was not deleted</AlertTitle><AlertDescription>{errorMessage(deleteTemplate.error)}</AlertDescription></Alert>}
              <p className="text-xs text-muted-foreground">Choose the built-in credit union email or save your own reusable template below.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="outreach-cc">CC email (optional)</Label>
              <Input id="outreach-cc" type="email" autoComplete="email" value={ccEmail} maxLength={320}
                onChange={(event) => { setCcEmail(event.target.value); setPreview(null); setTestPreview(null); setConfirmationChecked(false); }}
                placeholder="colleague@example.com" aria-invalid={!ccIsValid} />
              <p className="text-sm text-muted-foreground">This address will receive a copy of every individual email and will be visible to each recipient. Use a trusted address that is not on the outreach contact list. The unsubscribe link in each copy belongs to its To recipient.</p>
              {!ccIsValid && <p className="text-sm text-destructive" role="alert">Enter a valid CC email address or leave this blank.</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="preview-recipient">Preview recipient</Label>
              <Select value={previewContactId} onValueChange={(value) => { setPreviewContactId(value); setPreview(null); }}>
                <SelectTrigger id="preview-recipient" aria-label="Preview recipient"><SelectValue placeholder="Choose an unsent contact" /></SelectTrigger>
                <SelectContent>{sendableContacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.firstName ? `${contact.firstName} — ` : ""}{contact.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="outreach-pdf">Approved PDF for this send (optional, max 5 MB)</Label>
              <input ref={pdfInput} id="outreach-pdf" className="sr-only" type="file" accept=".pdf,application/pdf"
                onChange={(event) => { loadPdf(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={() => pdfInput.current?.click()}
                  disabled={!!currentTemplate?.attachmentSha256 || attachmentLoading || sendMutation.isPending}>
                  <FileUp className="mr-2 h-4 w-4" />{attachmentLoading ? "Reading PDF…" : "Choose approved PDF"}
                </Button>
                {attachment && <Button type="button" variant="ghost" onClick={clearPdf} disabled={sendMutation.isPending}>Remove PDF</Button>}
              </div>
              {currentTemplate?.attachmentSha256 && <p className="text-sm text-muted-foreground">This saved template already includes its approved one-page PDF. Choose a different template to attach a PDF for this send.</p>}
              {attachment && <p className="text-sm">Selected: {attachment.filename} ({Math.ceil(attachment.file.size / 1024)} KB)</p>}
              {attachmentError && <p role="alert" className="text-sm text-destructive">{attachmentError} Sending is blocked until you choose a valid PDF or continue without it.</p>}
              {attachmentError && <Button type="button" variant="ghost" onClick={clearPdf}>Continue without a PDF</Button>}
              <p className="text-xs text-muted-foreground">Select only a document approved for these contacts. Preview the message and open the PDF before sending.</p>
            </div>
            <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={!canPreview || previewMutation.isPending}>
              {previewMutation.isPending ? "Preparing preview…" : "Load personalized preview"}
            </Button>
            {previewMutation.isError && <Alert variant="destructive"><AlertTitle>Preview unavailable</AlertTitle><AlertDescription>{errorMessage(previewMutation.error)}</AlertDescription></Alert>}
            {matchedPreview && <section aria-label="Personalized email preview" className="space-y-2 rounded-md border bg-muted/40 p-4">
              <p className="text-sm">To: {matchedPreview.to}</p>
              {matchedPreview.reviewedFor.ccEmail && <p className="text-sm">CC: {matchedPreview.reviewedFor.ccEmail}</p>}
              <p className="font-semibold">Subject: {matchedPreview.subject}</p>
              <iframe title="SAL-branded outreach preview" sandbox="" srcDoc={matchedPreview.html} className="h-96 w-full rounded-md border bg-white" />
              <details className="text-sm"><summary className="cursor-pointer">Plain-text version</summary><pre className="mt-2 whitespace-pre-wrap break-words font-sans">{matchedPreview.text}</pre></details>
              <p className="border-t pt-3 text-sm font-medium">{matchedPreview.attachment
                ? `Attachment: ${matchedPreview.attachment.filename}${matchedPreview.attachment.pages ? ` · ${matchedPreview.attachment.pages} page` : ""} · ${Math.ceil(matchedPreview.attachment.size / 1024)} KB`
                : "No attachment will be sent with this template."}</p>
              {matchedPreview.attachment && <a className="text-sm underline" href={attachment && pdfUrl ? pdfUrl : "/api/admin/outreach/partner-overview"} target="_blank" rel="noopener noreferrer">Open PDF for review</a>}
            </section>}
          </CardContent>
        </Card>
      </div>

       <Card>
         <CardHeader>
           <CardTitle>Send a test email</CardTitle>
           <CardDescription>Enter an inbox you control to check how the SAL-branded message and its attachment look before contacting anyone. No contact is selected or marked as sent.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           <div className="grid gap-2">
             <Label htmlFor="outreach-test-email">Test recipient email</Label>
             <Input id="outreach-test-email" type="email" autoComplete="email" maxLength={320} value={testEmail}
               onChange={(event) => { setTestEmail(event.target.value); setTestPreview(null); testSendMutation.reset(); }}
               placeholder="you@example.com" aria-invalid={!!testEmail && !testIsValid} />
             <p className="text-sm text-muted-foreground">The sample uses “Taylor” at “Example Credit Union” instead of a real contact. Test recipients cannot be on the outreach contact list. {ccAddress ? `The test will also CC ${ccAddress}.` : "No CC is set."} Test emails do not contain a live unsubscribe link; live outreach keeps its working opt-out link.</p>
             {!!testEmail && !testIsValid && <p className="text-sm text-destructive" role="alert">Enter a valid email address different from the CC address.</p>}
           </div>
           <Button variant="outline" onClick={() => testPreviewMutation.mutate()} disabled={!canTestPreview || testPreviewMutation.isPending}>
             {testPreviewMutation.isPending ? "Preparing sample…" : "Preview test email"}
           </Button>
           {testPreviewMutation.isError && <Alert variant="destructive"><AlertTitle>Test preview unavailable</AlertTitle><AlertDescription>{errorMessage(testPreviewMutation.error)}</AlertDescription></Alert>}
           {matchedTestPreview && <section aria-label="Test email preview" className="space-y-2 rounded-md border bg-muted/40 p-4">
             <p className="text-sm">To: {matchedTestPreview.to}{ccAddress ? ` · CC: ${ccAddress}` : ""}</p>
             <p className="font-semibold">Subject: {matchedTestPreview.subject}</p>
             <iframe title="SAL-branded test email preview" sandbox="" srcDoc={matchedTestPreview.html} className="h-96 w-full rounded-md border bg-white" />
             <p className="text-sm">{matchedTestPreview.attachment
               ? `Attachment: ${matchedTestPreview.attachment.filename} · ${matchedTestPreview.attachment.pages} page · ${Math.ceil(matchedTestPreview.attachment.size / 1024)} KB`
               : "No attachment with this template."}</p>
             <details className="text-sm"><summary className="cursor-pointer">Plain-text version</summary><pre className="mt-2 whitespace-pre-wrap break-words font-sans">{matchedTestPreview.text}</pre></details>
           </section>}
           <Button onClick={() => testSendMutation.mutate()} disabled={!canTestSend}>
             <Send className="mr-2 h-4 w-4" />{testSendMutation.isPending ? "Sending test…" : "Send test email"}
           </Button>
           {!outreach.data.testConfigured && <p className="text-sm text-muted-foreground">Configure the email provider to send a test. Preview remains available.</p>}
           {testSendMutation.isSuccess && <p className="text-sm" role="status">Test email accepted by the provider for {testSendMutation.data.to}{testSendMutation.data.cc ? `, CC ${testSendMutation.data.cc}` : ""}. Check the inbox to confirm delivery and appearance. No outreach contact was marked as sent.</p>}
           {testSendMutation.isError && <Alert variant="destructive"><AlertTitle>Test send not confirmed</AlertTitle><AlertDescription>{errorMessage(testSendMutation.error)} No outreach contact was marked as sent.</AlertDescription></Alert>}
         </CardContent>
       </Card>

       <Card ref={templateForm}>
         <CardHeader>
            <CardTitle>{editingTemplateId ? "Edit email template" : "Save another email template"}</CardTitle>
            <CardDescription>Use <code>{"{{first_name}}"}</code> and <code>{"{{company_name}}"}</code> for personalization. The mailing address and unsubscribe link are added automatically. {editingTemplateId ? "Saving creates a new version and retires the old one; past delivery records remain unchanged. This unsent-contact checklist still excludes contacts emailed under earlier versions." : "Select a saved template above to edit or delete it. The built-in starter template remains available."}</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="template-name">Template name</Label><Input id="template-name" value={newTemplate.label} onChange={event => { saveTemplate.reset(); setNewTemplate(current => ({ ...current, label: event.target.value })); }} placeholder="Funeral home introduction" maxLength={100} /></div>
            <div className="grid gap-2"><Label htmlFor="template-subject">Subject</Label><Input id="template-subject" value={newTemplate.subject} onChange={event => { saveTemplate.reset(); setNewTemplate(current => ({ ...current, subject: event.target.value })); }} placeholder="An idea for {{company_name}}" maxLength={180} /></div>
            <div className="grid gap-2"><Label htmlFor="template-body">Message body</Label><Textarea id="template-body" rows={8} value={newTemplate.body} onChange={event => { saveTemplate.reset(); setNewTemplate(current => ({ ...current, body: event.target.value })); }} placeholder={"Hi {{first_name}},\n\nI'd like to introduce Steps After Life to {{company_name}}.\n\nBest,\nDave"} maxLength={10000} /></div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={newTemplate.attachPartnerOverview} onChange={event => { saveTemplate.reset(); setNewTemplate(current => ({ ...current, attachPartnerOverview: event.target.checked })); }} />
              <span>Attach the approved one-page partner overview PDF ({PARTNER_OVERVIEW_FILENAME}) to this template.</span>
            </label>
            {/\[\s*first[\s_-]*name\s*\]/i.test(`${newTemplate.subject}\n${newTemplate.body}`) && <p className="text-sm text-destructive">Use <code>{"{{first_name}}"}</code> instead of <code>[First Name]</code> to personalize the greeting.</p>}
            {/\battach(?:ed|ment|ments|ing)?\b/i.test(`${newTemplate.subject}\n${newTemplate.body}`) && !newTemplate.attachPartnerOverview && <p className="text-sm text-destructive">This message promises an attachment. Select the one-page PDF above before saving.</p>}
           <div className="flex flex-wrap gap-2">
             <Button variant="outline" disabled={!newTemplate.label.trim() || !newTemplate.subject.trim() || !newTemplate.body.trim() || saveTemplate.isPending} onClick={() => saveTemplate.mutate({ id: editingTemplateId, draft: newTemplate })}>{saveTemplate.isPending ? "Saving…" : editingTemplateId ? "Save revised template" : "Save email template"}</Button>
             {editingTemplateId && <Button variant="ghost" disabled={saveTemplate.isPending} onClick={() => { setEditingTemplateId(null); setNewTemplate({ label: "", subject: "", body: "", attachPartnerOverview: false }); saveTemplate.reset(); }}>Cancel editing</Button>}
           </div>
           {saveTemplate.isError && <Alert variant="destructive"><AlertTitle>Template was not saved</AlertTitle><AlertDescription>{errorMessage(saveTemplate.error)}</AlertDescription></Alert>}
            {saveTemplate.isSuccess && <p className="text-sm text-muted-foreground" role="status">Saved. The selected template and its full message are shown above; choose a contact to preview personalization.</p>}
         </CardContent>
       </Card>

       <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete email template?</AlertDialogTitle>
             <AlertDialogDescription>Remove “{deleteTarget?.label}” from the template list? It cannot be used for new sends. Past delivery records and their original version are kept.</AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel disabled={deleteTemplate.isPending}>Cancel</AlertDialogCancel>
             <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteTemplate.isPending}
               onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteTemplate.mutate(deleteTarget.id); }}>
               {deleteTemplate.isPending ? "Deleting…" : "Delete template"}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

       <Card>
         <CardHeader>
           <div className="flex flex-wrap items-center justify-between gap-3">
             <div><CardTitle>Recipients</CardTitle><CardDescription>{outreach.data.summary.all} total contacts · {outreach.data.eligible} not sent and eligible · choose up to 25</CardDescription></div>
             <Button data-testid="outreach-refresh" size="sm" variant="outline" onClick={() => outreach.refetch()} disabled={outreach.isFetching}><RefreshCw className="mr-2 h-4 w-4" />{outreach.isFetching ? "Refreshing…" : "Refresh status"}</Button>
           </div>
         </CardHeader>
         <CardContent className="space-y-4">
           <div className="grid gap-3">
             <div className="flex flex-wrap gap-2" role="group" aria-label="Filter recipients by outreach status">
               {([
                 ["not_sent", "Not sent"],
                 ["sent", "Sent"],
                 ["needs_review", "Needs review"],
                 ["unsubscribed", "Unsubscribed"],
                 ["all", "All"],
               ] as [OutreachStatusFilter, string][]).map(([value, label]) => (
                 <Button key={value} data-testid={`outreach-filter-${value}`} type="button" size="sm" variant={status === value ? "default" : "outline"} aria-pressed={status === value} onClick={() => changeStatus(value)}>
                   {label} <span className="ml-2 tabular-nums">{outreach.data.summary[value]}</span>
                 </Button>
               ))}
             </div>
             <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitSearch} role="search">
               <div className="relative flex-1">
                 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                 <Input data-testid="outreach-search" className="pl-9" value={searchInput} maxLength={200} onChange={(event) => setSearchInput(event.target.value.slice(0, 200))} placeholder="Search name, email, or company" aria-label="Search recipients by name, email, or company" />
               </div>
               <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
               {search && <Button type="button" variant="ghost" onClick={() => { setSearchInput(""); clearRecipientWorkflow(); setPage(1); setSearch(""); }}>Clear search</Button>}
             </form>
           </div>

           <p className="text-sm text-muted-foreground">Sent means the email provider accepted the message; it does not confirm inbox delivery. Needs review means an active or uncertain attempt and is never retried automatically. A rejected last attempt remains eligible, but review it before sending again.</p>

           <div className="flex flex-wrap items-center justify-between gap-2 border-y py-3">
             <div className="flex flex-wrap gap-2">
               <Button data-testid="outreach-select-next-25" type="button" size="sm" onClick={() => {
                 const next = sendableContacts.slice(0, 25).map((contact) => contact.id);
                 setSelectedIds(next);
                 setPreviewContactId(next[0] || "");
                 setPreview(null);
                 setConfirmationChecked(false);
               }} disabled={!sendableContacts.length || sendMutation.isPending}>
                 Select next 25 not sent
               </Button>
               <Button data-testid="outreach-clear-selection" type="button" size="sm" variant="outline" onClick={clearRecipientWorkflow} disabled={!selectedIds.length || sendMutation.isPending}>Clear selection</Button>
             </div>
             <p data-testid="outreach-selection-count" className="text-sm font-medium" aria-live="polite">{selectedIds.length} / 25 recipients selected</p>
           </div>

           {outreach.data.total === 0 ? (
             <div className="rounded-md border border-dashed px-4 py-10 text-center">
               <p className="font-medium">{search ? "No matching contacts" : status === "not_sent" ? "No unsent contacts" : "No contacts in this status"}</p>
               <p className="mt-1 text-sm text-muted-foreground">{search ? "Try another name, email, or company, or clear the search." : "Change the status filter or import contacts to continue."}</p>
             </div>
           ) : <div className="overflow-x-auto">
              <Table className="min-w-[850px]">
               <TableHeader><TableRow><TableHead className="w-16">Select</TableHead><TableHead>Contact</TableHead><TableHead>Company</TableHead><TableHead>Outreach status</TableHead><TableHead>Last sent</TableHead><TableHead>Last attempt</TableHead><TableHead>History</TableHead></TableRow></TableHeader>
               <TableBody>{contacts.map((contact) => {
                 const selected = selectedIds.includes(contact.id);
                 const selectable = contact.outreachStatus === "not_sent" && !contact.unsubscribedAt;
                 const badgeVariant = contact.outreachStatus === "unsubscribed" ? "destructive" : contact.outreachStatus === "needs_review" ? "outline" : "secondary";
                 const statusLabel = contact.outreachStatus === "not_sent" ? "Not sent" : contact.outreachStatus === "needs_review" ? "Needs review" : contact.outreachStatus === "unsubscribed" ? "Unsubscribed" : "Sent";
                 return <TableRow key={contact.id} data-testid={`outreach-recipient-${contact.id}`}>
                   <TableCell><input type="checkbox" checked={selected} disabled={!selectable || sendMutation.isPending || (!selected && selectedIds.length >= 25)} onChange={(event) => toggleContact(contact, event.target.checked)} aria-label={`Select ${contact.email}`} /></TableCell>
                   <TableCell><span className="font-medium">{contact.fullName || contact.firstName || "—"}</span><div className="text-sm text-muted-foreground">{contact.email}</div></TableCell>
                   <TableCell>{contact.companyName || "—"}</TableCell>
                   <TableCell><Badge variant={badgeVariant}>{statusLabel}</Badge>
                     {contact.outreachStatus === "needs_review" && <div className="mt-1 max-w-56 text-xs text-muted-foreground">An attempt is pending or uncertain. Do not retry automatically.</div>}
                     {contact.outreachStatus === "sent" && <div className="mt-1 max-w-56 text-xs text-muted-foreground">Accepted by provider; inbox delivery is not confirmed.</div>}
                     {contact.outreachStatus === "unsubscribed" && <div className="mt-1 text-xs text-muted-foreground">Suppressed {dateLabel(contact.unsubscribedAt)}</div>}
                   </TableCell>
                   <TableCell className="min-w-32 text-sm text-muted-foreground">{dateLabel(contact.lastSentAt)}</TableCell>
                   <TableCell className="min-w-44 text-sm text-muted-foreground">
                     {contact.lastAttemptAt ? <><div>{dateLabel(contact.lastAttemptAt)}</div><div className="mt-1">{contact.lastAttemptStatus?.toLowerCase() === "failed" ? <Badge variant="outline">Last attempt rejected</Badge> : contact.lastAttemptStatus ? `Status: ${contact.lastAttemptStatus}` : "Attempt status unknown"}</div>{contact.lastAttemptSubject && <div className="mt-1 max-w-48 truncate" title={contact.lastAttemptSubject}>{contact.lastAttemptSubject}</div>}</> : "No attempts"}
                   </TableCell>
                   <TableCell><RecipientHistory contactId={contact.id} contactName={contact.fullName || contact.email} /></TableCell>
                 </TableRow>;
               })}</TableBody>
             </Table>
           </div>}

           <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
             <span>{outreach.data.total ? `Showing ${(page - 1) * outreach.data.pageSize + 1}–${Math.min(page * outreach.data.pageSize, outreach.data.total)} of ${outreach.data.total} filtered contacts` : "0 matching contacts"} · Page {page} of {Math.max(1, Math.ceil(outreach.data.total / outreach.data.pageSize))}</span>
             <div className="flex gap-2">
               <Button size="sm" variant="outline" disabled={page <= 1 || outreach.isFetching} onClick={() => { clearRecipientWorkflow(); setPage((current) => current - 1); }}>Previous</Button>
               <Button size="sm" variant="outline" disabled={page * outreach.data.pageSize >= outreach.data.total || outreach.isFetching} onClick={() => { clearRecipientWorkflow(); setPage((current) => current + 1); }}>Next</Button>
             </div>
           </div>

           {selectedIds.length >= 25 && <p className="text-sm text-amber-700" role="status">The per-send limit is 25 recipients. Clear the selection to choose another group.</p>}
           <div className="space-y-3 rounded-md border p-4" data-testid="outreach-confirmation">
             <p className="font-medium">Review and send to {selectedIds.length} selected recipient{selectedIds.length === 1 ? "" : "s"}</p>
             <label className="flex items-start gap-2 text-sm">
               <input type="checkbox" className="mt-1" checked={confirmationChecked} onChange={(event) => setConfirmationChecked(event.target.checked)} disabled={selectedIds.length === 0 || selectedIds.length > 25 || sendMutation.isPending} />
               <span>I reviewed the message for a selected contact, confirm the fixed physical mailing address shown above is correct, and {attachment ? `confirm ${attachment.filename} is the approved PDF I reviewed and want attached` : currentTemplate?.attachmentSha256 ? "confirm the approved one-page PDF named in the preview will be attached" : "understand that no overview file is attached"}. {ccAddress ? `I approve copying ${ccAddress} on each individual email (visible to its recipient). ` : ""}Send only to selected contacts who remain unsent.</span>
             </label>
             <Button data-testid="outreach-send" onClick={() => sendMutation.mutate()} disabled={!canSend}>
               <Send className="mr-2 h-4 w-4" />{sendMutation.isPending ? "Sending…" : `Send to ${selectedIds.length} selected`}
             </Button>
             {!preview || !selectedIds.includes(previewContactId) ? <p className="text-sm text-muted-foreground">Preview one of the selected contacts before sending. Selecting recipients does not create a preview or send.</p> : null}
             {sendMutation.isError && <Alert variant="destructive"><AlertTitle>Send request failed</AlertTitle><AlertDescription>{errorMessage(sendMutation.error)} No success is assumed; refresh recipient status before retrying.</AlertDescription></Alert>}
           </div>
           {sendMutation.isSuccess && <section aria-live="polite" className="space-y-3 rounded-md border p-4">
             <h3 className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-accent" />Delivery results</h3>
             <p className="text-sm">{sendMutation.data.sent} accepted by the email provider · {sendMutation.data.skipped} skipped · {sendMutation.data.failed} failed or uncertain</p>
             {sendMutation.data.results.length > 0 && <ul className="space-y-2 text-sm">
               {sendMutation.data.results.map((result, index) => <li key={`${result.email}-${index}`} className="flex flex-wrap gap-x-2">
                 <span className="font-medium">{result.email}</span><Badge variant={result.status.toLowerCase() === "sent" ? "secondary" : "destructive"}>{result.status}</Badge>{result.error && <span className="text-destructive">{result.error}</span>}
               </li>)}
             </ul>}
             {sendMutation.data.failed > 0 && <p className="text-sm font-medium text-destructive">Some deliveries failed. Review the details above before retrying any recipients.</p>}
           </section>}
         </CardContent>
       </Card>
    </>}
   </section>;
}