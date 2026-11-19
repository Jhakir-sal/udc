import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { readOutreachFile } from "@/lib/outreach-file";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileJson, FileUp, Loader2, RefreshCw, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { OrsaSmsCampaign } from "@/components/orsa-sms-campaign";
import { OrsaBulkSms } from "@/components/orsa-bulk-sms";
import { OrsaEmailCampaign } from "@/components/orsa-email-campaign";
import { OrsaAccountInvitations } from "@/components/orsa-account-invitations";
import { OrsaOutreachOverview } from "@/components/orsa-outreach-overview";
import type { RosterValidationIssue, ValidOrsaRosterRow } from "@shared/orsa";
import type { OutreachEmailAudience } from "@shared/orsaOutreach";
type Row = { id: string; normalizedEmail: string | null; sharedEligibilityEmail?: string | null; normalizedPhone?: string | null; externalMemberId?: string | null; displayName?: string | null; active: boolean; updatedAt?: string; deactivatedAt?: string | null; invitationAcceptedAt?: string | null; invitationStatus?: "pending" | "no_email" | "sending" | "sent" | "failed" | "needs_review" | "needs_attention" | "awaiting_verification" | "accepted" | "already_registered" };
type ImportPreview = { ok: boolean; totalRows: number; rows: ValidOrsaRosterRow[]; rowNumbers: number[]; issues: RosterValidationIssue[]; skippedDuplicates: number; skippedEmptyRows: number; sharedEmailRows: number; unusableEmailRows: number[]; unusablePhoneRows: number[] };
function rosterImportIssues(error: unknown): Array<{row:number;message:string}> {
 const message=error instanceof Error?error.message:"";
 const jsonStart=message.indexOf("{");
 if(jsonStart<0)return [];
 try {
  const response=JSON.parse(message.slice(jsonStart)) as {issues?:Array<{row:number;message:string}>};
  return Array.isArray(response.issues)?response.issues:[];
 } catch {return [];}
}
function rosterImportError(error: unknown): string {
 const message=error instanceof Error?error.message:"Unable to import roster";
 const issues=rosterImportIssues(error);
 if(issues.length)return issues.slice(0,5).map(issue=>`Row ${issue.row}: ${issue.message}`).join("; ")+(issues.length>5?`; ${issues.length-5} more issue(s)`:"");
 const jsonStart=message.indexOf("{");
 if(jsonStart<0)return message;
 try {
  const response=JSON.parse(message.slice(jsonStart)) as {error?:string};
  return response.error||message;
 } catch {return message;}
}
export default function AdminOrsaPage() {
  const [q,setQ]=useState(""); const [preview,setPreview]=useState(""); const [fileError,setFileError]=useState(""); const [sharedEmailContacts,setSharedEmailContacts]=useState(false); const [sharedEmailEligibility,setSharedEmailEligibility]=useState(false); const [firstColumnMemberName,setFirstColumnMemberName]=useState(false); const [memberPhoneEmailColumns,setMemberPhoneEmailColumns]=useState(false); const [firstRowIsHeader,setFirstRowIsHeader]=useState<boolean|null>(null); const input=useRef<HTMLInputElement>(null);
  const [isJson,setIsJson]=useState(false); const [mappedPreview,setMappedPreview]=useState<ImportPreview|null>(null); const [importPayload,setImportPayload]=useState<Record<string,unknown>|null>(null); const [previewLoading,setPreviewLoading]=useState(false); const [previewQuery,setPreviewQuery]=useState(""); const [previewPage,setPreviewPage]=useState(0); const [reviewedSharedGroups,setReviewedSharedGroups]=useState(false); const [showInactive,setShowInactive]=useState(false); const [rosterPage,setRosterPage]=useState(0); const previewRequest=useRef(0); const fileRequest=useRef(0);
  const [section,setSection]=useState<"outreach"|"email"|"invitations"|"sms"|"roster"|"import"|"billing">("outreach");
  const [emailAudience,setEmailAudience]=useState<OutreachEmailAudience>("never_emailed");
  const [audienceRequestId,setAudienceRequestId]=useState(0);
  const roster=useQuery<{roster:Row[]}>({queryKey:["/api/admin/orsa/roster"],enabled:section==="roster"});
  const billing=useQuery<{households:Array<{id:string;billingState:string;activeSeatCount:number;cancelAtPeriodEnd:boolean;hasPaymentIssue:boolean}>}>({queryKey:["/api/admin/orsa/household-billing"],enabled:section==="billing"});
 const write=useMutation({mutationFn:async({payload,mode}:{payload:Record<string, unknown>;mode:"replace"|"upsert"})=>{
  const response=await apiRequest(mode==="replace"?"PUT":"POST","/api/admin/orsa/roster",payload);
  return response.json() as Promise<{affectedCount:number;skippedDuplicates:number;skippedEmptyRows:number;sharedEmailRows:number;unusableEmailRows:number[];unusablePhoneRows:number[]}>;
  },onSuccess:()=>{setPreview("");setMappedPreview(null);setImportPayload(null);setRosterPage(0);queryClient.invalidateQueries({queryKey:["/api/admin/orsa/roster"]});queryClient.invalidateQueries({queryKey:["/api/admin/orsa/sms-campaign"]});queryClient.invalidateQueries({queryKey:["/api/admin/orsa/account-invitations"]})}});
  const toggle=useMutation({mutationFn:async({id,active}:{id:string;active:boolean})=>apiRequest("PATCH",`/api/admin/orsa/roster/${encodeURIComponent(id)}`,{active}),onSuccess:()=>{setRosterPage(0);queryClient.invalidateQueries({queryKey:["/api/admin/orsa/roster"]});queryClient.invalidateQueries({queryKey:["/api/admin/orsa/sms-campaign"]});queryClient.invalidateQueries({queryKey:["/api/admin/orsa/account-invitations"]})}});
  const rows=useMemo(()=>roster.data?.roster.filter(r=>(showInactive||r.active)&&[r.normalizedEmail,r.sharedEligibilityEmail,r.normalizedPhone,r.displayName,r.externalMemberId].some(v=>v?.toLowerCase().includes(q.toLowerCase())))??[],[roster.data,q,showInactive]);
  const rosterPageRows=rows.slice(rosterPage*100,(rosterPage+1)*100);
  const previewMatches=useMemo(()=>mappedPreview?.rows.map((row,index)=>({row,number:mappedPreview.rowNumbers[index]})).filter(({row})=>
    [row.displayName,row.normalizedPhone,row.normalizedEmail,row.sharedEligibilityEmail,row.externalMemberId].some(value=>value?.toLowerCase().includes(previewQuery.toLowerCase())))??[],[mappedPreview,previewQuery]);
  const previewPageRows=previewMatches.slice(previewPage*50,(previewPage+1)*50);
  const sharedGroups=useMemo(()=>{
    const groups=new Map<string, Array<{name:string;number:number}>>();
    mappedPreview?.rows.forEach((row,index)=>{
      if(!row.sharedEligibilityEmail)return;
      const members=groups.get(row.sharedEligibilityEmail)??[];
      members.push({name:row.displayName||"NA",number:mappedPreview.rowNumbers[index]});
      groups.set(row.sharedEligibilityEmail,members);
    });
    return Array.from(groups.entries());
  },[mappedPreview]);
 const importIssues=write.isError?rosterImportIssues(write.error):[];
 const importFile=async(file:File)=>{
   const request=++fileRequest.current;
    setPreview(""); setMappedPreview(null); setImportPayload(null); setFileError(""); setFirstColumnMemberName(false); setMemberPhoneEmailColumns(false); setFirstRowIsHeader(null); setSharedEmailContacts(false); setSharedEmailEligibility(false); setPreviewQuery(""); setPreviewPage(0); setReviewedSharedGroups(false); write.reset();
  try {
   const extension=file.name.split(".").pop()?.toLowerCase();
   if(!["csv","json","xlsx"].includes(extension||"")) throw new Error("Choose a CSV, JSON, or XLSX file");
   if(extension==="json"&&file.size>1_000_000) throw new Error("JSON must be smaller than 1 MB");
   const content=extension==="json"?await file.text():await readOutreachFile(file);
   if(!content.trim()) throw new Error("The selected file is empty");
   if(request===fileRequest.current){setIsJson(extension==="json");setPreview(content);}
  } catch(error) {
   if(request===fileRequest.current)setFileError(error instanceof Error?error.message:"Could not read this file");
  }
 };
 useEffect(()=>{
  const request=++previewRequest.current;
  setMappedPreview(null);setImportPayload(null);
   setReviewedSharedGroups(false);setPreviewPage(0);
  if(!preview){setPreviewLoading(false);return;}
  if(!isJson&&memberPhoneEmailColumns&&firstRowIsHeader===null){setPreviewLoading(false);return;}
  setPreviewLoading(true);setFileError("");
  try {
   const payload:Record<string,unknown>=isJson?{rows:JSON.parse(preview)}:{csv:preview,firstColumnMemberName,memberPhoneEmailColumns,firstRowIsHeader};
    payload.sharedEmailContacts=sharedEmailContacts;
    payload.sharedEmailEligibility=sharedEmailEligibility;
   void apiRequest("POST","/api/admin/orsa/roster/preview",payload).then(response=>response.json() as Promise<ImportPreview>).then(checked=>{
    if(request!==previewRequest.current)return;
    setMappedPreview(checked);setImportPayload(payload);setPreviewLoading(false);
   }).catch(error=>{
    if(request!==previewRequest.current)return;
    setFileError(rosterImportError(error));setPreviewLoading(false);
   });
  } catch(error) {
   if(request===previewRequest.current){setFileError(error instanceof Error?error.message:"Invalid JSON file");setPreviewLoading(false);}
  }
  return ()=>{if(request===previewRequest.current)previewRequest.current++;};
  },[preview,isJson,firstColumnMemberName,memberPhoneEmailColumns,firstRowIsHeader,sharedEmailContacts,sharedEmailEligibility]);
  const canSubmit=Boolean(mappedPreview?.ok&&importPayload&&!previewLoading&&(!sharedEmailEligibility||sharedGroups.length===0||reviewedSharedGroups));
  const submit=(mode:"replace"|"upsert")=>{if(!canSubmit||!importPayload)return; if(mode==="replace"&&!window.confirm(`Replace the entire ORSA roster with ${mappedPreview?.totalRows} mapped members? This deactivates members absent from the file; their history remains visible under Show inactive.${sharedEmailEligibility?` ${sharedGroups.length} reviewed shared-email groups receive one verified eligibility login each, without access to each other's private plans or primary billing controls.`:""}`))return;write.mutate({payload:importPayload,mode})};
   const navigation=[
    ["outreach","Outreach history"],
    ["email","Email campaigns"],
    ["invitations","Account invitations"],
    ["sms","Text campaigns"],
    ["roster","Eligibility roster"],
    ["import","Import members"],
    ["billing","Household billing"],
   ] as const;
   return <div className="mx-auto max-w-6xl min-w-0 space-y-6 p-4 sm:p-8"><header className="rounded-2xl border bg-card/70 p-5 sm:p-7"><div className="flex min-w-0 flex-wrap items-center gap-3"><ShieldCheck className="h-8 w-8 shrink-0 text-accent"/><h1 className="min-w-0 font-serif text-2xl font-semibold sm:text-3xl">ORSA membership operations</h1></div><p className="mt-2 max-w-3xl text-muted-foreground">A clear home for family outreach and account operations. Check contact history before reaching out; opt-outs and uncertain attempts are never treated as permission.</p></header>
   <nav aria-label="ORSA operations sections" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-y bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
    <div className="flex min-w-max gap-2">
     {navigation.map(([id,label])=><button key={id} type="button" aria-current={section===id?"page":undefined} onClick={()=>setSection(id)} className={`min-h-10 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${section===id?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</button>)}
    </div>
   </nav>
   <OrsaOutreachOverview active={section==="outreach"} onStartEmail={(audience)=>{setEmailAudience(audience);setAudienceRequestId(id=>id+1);setSection("email");}} />
   <section hidden={section!=="import"} aria-label="Import roster">
   <Card>
   <CardHeader>
    <CardTitle>Import roster</CardTitle>
      <CardDescription>Upload a JSON array, CSV, or XLSX workbook. For a file ordered Member, Phone, Email, select the column-order option below. Otherwise, labeled member and contact columns are mapped by header. Keep every named member even if email or phone is blank, NA, or unusable; unusable contacts are reported by row and never used for outreach. Name-only records cannot receive invitations or account benefits. Exact repeated rows with contact details are skipped, while conflicting usable identifiers still need review. Review the first worksheet, then choose upsert or replace. Importing does not send email or SMS.</CardDescription>
   </CardHeader>
   <CardContent className="space-y-4">
    <div className="flex flex-wrap gap-3">
     <Button variant="outline" onClick={()=>input.current?.click()}><FileUp className="mr-2 h-4 w-4"/>Choose CSV, JSON, or XLSX</Button>
     <input ref={input} className="hidden" type="file" accept=".csv,.json,.xlsx,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{if(e.target.files?.[0])void importFile(e.target.files[0]);e.currentTarget.value="";}}/>
      {preview&&<><Button onClick={()=>submit("upsert")} disabled={!canSubmit||write.isPending}><UserCheck className="mr-2 h-4 w-4"/>Upsert members</Button><Button variant="destructive" onClick={()=>submit("replace")} disabled={!canSubmit||write.isPending}><FileJson className="mr-2 h-4 w-4"/>Replace entire roster</Button></>}
    </div>
     {preview&&!preview.trim().startsWith("[")&&<label className="flex items-start gap-3 rounded-md border p-3 text-sm">
      <input type="checkbox" checked={memberPhoneEmailColumns} onChange={e=>{setMemberPhoneEmailColumns(e.target.checked);setFirstRowIsHeader(null);write.reset();}} disabled={write.isPending} className="mt-1 h-4 w-4 accent-primary" />
      <span><strong>Columns are Member, Phone, Email—in that order.</strong> Each data row is one member. Use the second column only for that member’s phone and the third only for that member’s email.</span>
     </label>}
     {preview&&!preview.trim().startsWith("[")&&memberPhoneEmailColumns&&<fieldset className="rounded-md border p-3 text-sm">
      <legend className="px-1 font-medium">What is in the first row?</legend>
      <div className="flex flex-wrap gap-4">
       <label className="flex items-center gap-2"><input type="radio" name="orsa-first-row" checked={firstRowIsHeader===true} onChange={()=>{setFirstRowIsHeader(true);write.reset();}} disabled={write.isPending}/>Column headings (Member, Phone, Email)</label>
       <label className="flex items-center gap-2"><input type="radio" name="orsa-first-row" checked={firstRowIsHeader===false} onChange={()=>{setFirstRowIsHeader(false);write.reset();}} disabled={write.isPending}/>The first member</label>
      </div>
     </fieldset>}
     {preview&&!preview.trim().startsWith("[")&&!memberPhoneEmailColumns&&<label className="flex items-start gap-3 rounded-md border p-3 text-sm">
      <input type="checkbox" checked={firstColumnMemberName} onChange={e=>{setFirstColumnMemberName(e.target.checked);write.reset();}} disabled={write.isPending} className="mt-1 h-4 w-4 accent-primary" />
      <span><strong>The first column contains each member’s full name.</strong> Select this only if those are member names, not the person who entered the file. This applies to CSV and XLSX files.</span>
     </label>}
    <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
     <input type="checkbox" checked={sharedEmailContacts} onChange={e=>{setSharedEmailContacts(e.target.checked);setSharedEmailEligibility(false);write.reset();}} disabled={write.isPending} className="mt-1 h-4 w-4 accent-primary" />
      <span><strong>Repeated email addresses are shared contacts, not member emails.</strong> When the same address belongs to different member rows, exclude it from <em>all</em> those member records. If that address already belongs to an active roster member, the upload will stop until its ownership is reviewed. If it belongs to one member, keep it only on that person’s row and use NA on the others instead of selecting this option. Named rows without an email cannot receive email invitations or email-based benefits.</span>
    </label>
    <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
     <input type="checkbox" checked={sharedEmailEligibility} onChange={e=>{setSharedEmailEligibility(e.target.checked);setSharedEmailContacts(false);write.reset();}} disabled={write.isPending} className="mt-1 h-4 w-4 accent-primary" />
     <span><strong>Repeated emails are a confirmed shared eligibility sign-in.</strong> Keep each person as a separate roster member, but allow one email-verified account to receive ORSA benefits. The shared account does not become either person's identity, gain access to their private plans, or manage primary billing. This is for addresses you have confirmed belong to the members, not an unrelated contact. Individual member invitations are not sent to shared addresses.</span>
    </label>
    {fileError&&<Alert variant="destructive"><AlertTitle>File could not be used</AlertTitle><AlertDescription>{fileError}</AlertDescription></Alert>}
    {previewLoading&&<p role="status" className="text-sm text-muted-foreground">Mapping and validating roster…</p>}
    {preview&&!isJson&&memberPhoneEmailColumns&&firstRowIsHeader===null&&<p className="text-sm text-muted-foreground">Choose what is in the first row to see the mapped preview.</p>}
    {mappedPreview&&<div className="space-y-3">
      <p className="text-sm font-medium">{mappedPreview.totalRows} mapped member records. Search or page through the whole file; confirm the first row is a person, not a heading. No changes have been saved.</p>
      <Input aria-label="Search mapped import" placeholder="Search mapped name, email, or phone" value={previewQuery} onChange={e=>{setPreviewQuery(e.target.value);setPreviewPage(0);}} className="max-w-md"/>
      <p className="text-xs text-muted-foreground">{previewMatches.length} matching rows · showing {previewMatches.length?previewPage*50+1:0}–{Math.min((previewPage+1)*50,previewMatches.length)}</p>
      {previewPageRows.length>0&&<div className="max-h-[440px] max-w-full overflow-auto"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>Member row</TableHead><TableHead>Member name</TableHead><TableHead>Member email</TableHead><TableHead>Phone</TableHead><TableHead>External member ID</TableHead><TableHead>Active</TableHead></TableRow></TableHeader><TableBody>{previewPageRows.map(({row,number})=><TableRow key={number}><TableCell>{number}</TableCell><TableCell>{row.displayName||"NA"}</TableCell><TableCell>{row.sharedEligibilityEmail?`${row.sharedEligibilityEmail} (shared eligibility)`:(row.normalizedEmail||"NA")}</TableCell><TableCell>{row.normalizedPhone||"NA"}</TableCell><TableCell>{row.externalMemberId||"NA"}</TableCell><TableCell>{row.active?"Yes":"No"}</TableCell></TableRow>)}</TableBody></Table></div>}
      {previewMatches.length>50&&<div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={previewPage===0} onClick={()=>setPreviewPage(page=>page-1)}>Previous</Button><span className="text-sm">Page {previewPage+1} of {Math.ceil(previewMatches.length/50)}</span><Button variant="outline" size="sm" disabled={(previewPage+1)*50>=previewMatches.length} onClick={()=>setPreviewPage(page=>page+1)}>Next</Button></div>}
      {sharedEmailEligibility&&sharedGroups.length>0&&<div className="space-y-2 rounded-md border p-3"><p className="font-medium text-sm">Review {sharedGroups.length} shared-email groups ({mappedPreview.sharedEmailRows} member rows)</p><p className="text-sm text-muted-foreground">Every listed address will give one verified account ORSA eligibility. If an address belongs to a staff contact rather than the members, correct those rows before importing.</p><details><summary className="cursor-pointer text-sm underline">See all addresses and member names</summary><div className="mt-2 max-h-72 space-y-2 overflow-auto text-sm">{sharedGroups.map(([email,members])=><div className="rounded border p-2" key={email}><strong>{email}</strong><div>{members.map(member=>`${member.name} (row ${member.number})`).join(" · ")}</div></div>)}</div></details><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewedSharedGroups} onChange={e=>setReviewedSharedGroups(e.target.checked)} className="mt-1 h-4 w-4 accent-primary"/><span>I reviewed the shared-email groups and confirm these addresses should grant shared eligibility. This does not grant access to either member’s private plan.</span></label></div>}
     {(mappedPreview.skippedDuplicates>0||mappedPreview.skippedEmptyRows>0||mappedPreview.sharedEmailRows>0||mappedPreview.unusableEmailRows.length>0||mappedPreview.unusablePhoneRows.length>0)&&<p className="text-sm text-muted-foreground">{mappedPreview.skippedDuplicates} repeated rows and {mappedPreview.skippedEmptyRows} empty rows skipped; {mappedPreview.sharedEmailRows} members with a repeated email {sharedEmailEligibility?"linked for shared eligibility":"excluded as shared contacts"}. Unusable email rows: {mappedPreview.unusableEmailRows.join(", ")||"none"}; unusable phone rows: {mappedPreview.unusablePhoneRows.join(", ")||"none"}.</p>}
     {mappedPreview.issues.length>0&&<Alert variant="destructive"><AlertTitle>{mappedPreview.issues.length} validation issue{mappedPreview.issues.length===1?"":"s"} — import blocked</AlertTitle><AlertDescription><ul className="max-h-64 list-inside list-disc overflow-auto">{mappedPreview.issues.map((issue,index)=><li key={index}>{issue.row?`Row ${issue.row}`:"File"} · {issue.field}: {issue.message}</li>)}</ul></AlertDescription></Alert>}
     {mappedPreview.ok&&<p className="text-sm text-muted-foreground">Upsert adds or updates these members. Replace also deactivates members absent from this file. Neither sends invitations or texts. Shared eligibility must be confirmed before import; existing named owners or invitation history cannot be silently reassigned.</p>}
    </div>}
    {write.isPending&&<p className="text-sm text-muted-foreground">Validating roster and saving changes…</p>}
    {write.isSuccess&&<p role="status" className="text-sm text-accent">Roster updated: {write.data.affectedCount} member record{write.data.affectedCount===1?"":"s"} processed; {write.data.skippedDuplicates} repeated file row{write.data.skippedDuplicates===1?"":"s"} skipped; {write.data.skippedEmptyRows} empty/NA row{write.data.skippedEmptyRows===1?"":"s"} skipped. {write.data.sharedEmailRows>0&&`${write.data.sharedEmailRows} member record${write.data.sharedEmailRows===1?"":"s"} processed with repeated contact details. `}No text messages or invitations were sent.</p>}
    {write.isSuccess&&(write.data.unusableEmailRows.length>0||write.data.unusablePhoneRows.length>0)&&<Alert><AlertTitle>Some contact details need review</AlertTitle><AlertDescription>{write.data.unusableEmailRows.length>0&&<p>{write.data.unusableEmailRows.length} unusable email{write.data.unusableEmailRows.length===1?"":"s"} saved as NA (row{write.data.unusableEmailRows.length===1?"":"s"} {write.data.unusableEmailRows.slice(0,20).join(", ")}{write.data.unusableEmailRows.length>20?", …":""}). No email invitations can be sent to these records.</p>}{write.data.unusablePhoneRows.length>0&&<p>{write.data.unusablePhoneRows.length} unusable phone number{write.data.unusablePhoneRows.length===1?"":"s"} saved as NA (row{write.data.unusablePhoneRows.length===1?"":"s"} {write.data.unusablePhoneRows.slice(0,20).join(", ")}{write.data.unusablePhoneRows.length>20?", …":""}). These numbers cannot receive texts.</p>}</AlertDescription></Alert>}
    {write.isError&&<Alert variant="destructive"><AlertTitle>Roster was not changed</AlertTitle><AlertDescription className="space-y-2"><p>{rosterImportError(write.error)}. Correct the flagged rows and try again.</p>{importIssues.length>5&&<details><summary className="cursor-pointer underline">View all {importIssues.length} row issues</summary><ul className="mt-2 max-h-64 list-disc space-y-1 overflow-auto pl-5">{importIssues.map((issue,index)=><li key={`${issue.row}-${index}`}>Row {issue.row}: {issue.message}</li>)}</ul></details>}</AlertDescription></Alert>}
   </CardContent>
   </Card>
   </section>
   <OrsaEmailCampaign active={section==="email"} requestedAudience={emailAudience} audienceRequestId={audienceRequestId} />
   {section==="invitations"&&<section aria-label="Account invitations"><OrsaAccountInvitations /></section>}
   {section==="sms"&&<section aria-label="Text campaigns" className="space-y-6"><OrsaBulkSms /><OrsaSmsCampaign /></section>}
   <section hidden={section!=="billing"} aria-label="Household billing">
   <Card><CardHeader><CardTitle>Sponsored household billing</CardTitle><CardDescription>Sanitized billing health only; Stripe identifiers are never shown.</CardDescription></CardHeader><CardContent className="space-y-2">{billing.isLoading?<span className="text-sm text-muted-foreground">Loading billing status…</span>:billing.isError?<Alert variant="destructive"><AlertTitle>Could not load billing status</AlertTitle><AlertDescription>Refresh the page to try again.</AlertDescription></Alert>:billing.data?.households.length?billing.data.households.map(h=><div key={h.id} className="flex items-center justify-between rounded border p-3 text-sm"><span>{h.activeSeatCount} active seat{h.activeSeatCount===1?"":"s"}</span><Badge variant={h.hasPaymentIssue?"destructive":"outline"}>{h.billingState.replace("_"," ")}</Badge></div>):<p className="text-sm text-muted-foreground">No sponsored household billing records.</p>}</CardContent></Card>
   </section>
   <section hidden={section!=="roster"} aria-label="Eligibility roster">
   <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Eligibility roster</CardTitle><CardDescription>{roster.data?.roster.filter(r=>r.active).length??0} active members · {roster.data?.roster.filter(r=>!r.active).length??0} inactive historical records</CardDescription></div><Button variant="outline" size="sm" onClick={()=>roster.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div></CardHeader>
   <CardContent>
    <div className="relative mb-4 max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search email, phone, name, or member ID" value={q} onChange={e=>{setQ(e.target.value);setRosterPage(0);}} aria-label="Search roster"/></div>
    <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={e=>{setShowInactive(e.target.checked);setRosterPage(0);}}/>Show inactive historical records</label>
    {roster.isLoading?<div className="animate-pulse py-8">Loading roster…</div>:roster.isError?<Alert variant="destructive"><AlertTitle>Could not load roster</AlertTitle><AlertDescription>Refresh to try again.</AlertDescription></Alert>:!rows.length?<p className="py-8 text-center text-muted-foreground">No roster records match this search.</p>:
     <div className="max-w-full overflow-x-auto"><Table className="min-w-[850px]">
     <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>External member ID</TableHead><TableHead>Membership</TableHead><TableHead>Account invitation</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
     <TableBody>{rosterPageRows.map(r=><TableRow key={r.id}>
      <TableCell><b>{r.displayName||"NA"}</b><div className="text-sm text-muted-foreground">Email: {r.sharedEligibilityEmail?`${r.sharedEligibilityEmail} (shared eligibility)`:(r.normalizedEmail||"NA")}</div><div className="text-sm text-muted-foreground">Phone: {r.normalizedPhone||"NA"}</div></TableCell>
      <TableCell className="font-mono text-xs">{r.externalMemberId||"NA"}</TableCell>
      <TableCell><Badge variant={r.active?"secondary":"outline"}>{r.active?"Active":"Inactive"}</Badge></TableCell>
      <TableCell><Badge variant={r.invitationStatus==="needs_review"||r.invitationStatus==="needs_attention"?"destructive":r.invitationStatus==="accepted"?"secondary":"outline"}>{r.sharedEligibilityEmail?"Shared eligibility — no individual invite":!r.normalizedEmail?(r.normalizedPhone?"See SMS campaign":"No contact method"):({pending:"Ready to invite",sending:"Sending",sent:"Email submitted",failed:"Needs review",needs_review:"Delivery uncertain",needs_attention:"Verify existing account",awaiting_verification:"Finish email verification",accepted:"Account accepted",already_registered:"Existing account"} as Record<string,string>)[r.invitationStatus||"pending"]||"Ready to invite"}</Badge>{r.invitationAcceptedAt&&<div className="mt-1 text-xs text-muted-foreground">{new Date(r.invitationAcceptedAt).toLocaleDateString()}</div>}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{r.updatedAt?new Date(r.updatedAt).toLocaleDateString():"—"}</TableCell>
       <TableCell className="text-right space-x-2"><Button size="sm" variant="outline" onClick={()=>toggle.mutate({id:r.id,active:!r.active})} disabled={toggle.isPending}>{r.active?<><UserX className="mr-2 h-4 w-4"/>Deactivate</>:<><UserCheck className="mr-2 h-4 w-4"/>Activate</>}</Button></TableCell>
     </TableRow>)}</TableBody>
     </Table></div>}
     {rows.length>100&&<div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" disabled={rosterPage===0} onClick={()=>setRosterPage(page=>page-1)}>Previous</Button><span className="text-sm">Showing {rosterPage*100+1}–{Math.min((rosterPage+1)*100,rows.length)} of {rows.length}</span><Button variant="outline" size="sm" disabled={(rosterPage+1)*100>=rows.length} onClick={()=>setRosterPage(page=>page+1)}>Next</Button></div>}
   </CardContent>
  </Card>
   </section>
 </div>
}