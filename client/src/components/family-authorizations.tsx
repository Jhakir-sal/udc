import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { familyRefreshOptions } from "@/lib/family-refresh";
import { AlertCircle, CheckCircle2, Clock, FileCheck2, Loader2, ShieldCheck, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FamilyAuthorizationDocuments } from "@/components/family-authorization-documents";
import { FamilySafeguardReminder } from "@/components/family-safeguard-reminder";

export interface FamilyAuthorizationMember {
  certificateId: string;
  caseLabel: string;
  memberUserId: string;
  memberName: string;
  idVerified: boolean;
  identityStatus: string;
  sharingAuthorized: boolean;
  memberAccepted: boolean;
  helperAccess: boolean;
  representativeAccess: boolean;
  authorityStatus: string;
  authorityExpiresAt: string | null;
  scope: "helper" | "representative" | null;
  grantId: string | null;
  agreementVersion: "case-sharing-v1";
  agreementText: string;
  ownerName: string | null;
  reviewStatus: string | null;
  membershipStatus?: string;
  email?: string;
  grant?: {
    ownerSignature?: string | null;
    memberSignature?: string | null;
    ownerSignedAt?: string | null;
    memberSignedAt?: string | null;
    reviewReason?: string | null;
    evidenceDocumentId?: string | null;
    reviewedAt?: string | null;
  } | null;
}

interface Props {
  certificateId: string;
  mode: "owner" | "admin";
}

const invalidateSafeguards = (certificateId: string) => {
  [
    ["/api/family-access/checklist"],
    [`/api/case/${certificateId}/family-authorizations`],
    [`/api/case/${certificateId}/family-authorization-documents`],
    [`/api/case/${certificateId}/family-invitations`],
    ["/api/onboarding/status"],
    ["/api/certificates"],
  ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
};

function sourceLabel(member: FamilyAuthorizationMember) {
  if (!member.idVerified) {
    const status = (member.identityStatus || "").toLowerCase();
    if (status === "pending") return "ID check in progress";
    if (status === "failed") return "ID check needs attention";
    return "ID not verified";
  }
  const source = (member.identityStatus || "").toLowerCase();
  if (source.includes("manual") || source.includes("staff")) return "ID approved by staff";
  if (source.includes("stripe") || source.includes("provider")) return "ID verified by identity provider";
  return "ID verified";
}

function sharingLabel(member: FamilyAuthorizationMember) {
  if (!member.sharingAuthorized) return "Owner sharing grant needed";
  if (!member.memberAccepted) return "Member acceptance needed";
  if (member.authorityStatus === "expired") return "Authority expired · helper sharing remains active";
  if (member.authorityStatus === "expiring") return "Authority expires within 30 days · staff re-review needed";
  if (member.authorityStatus === "revoked") return "Authority revoked · helper sharing remains active";
  if (member.authorityStatus === "needs_review") return "Authority end time missing · staff re-review needed";
  if (member.scope === "representative" && member.reviewStatus !== "approved") {
    if (member.reviewStatus === "rejected") return "Authority review not approved";
    return "Staff authority review pending";
  }
  if (member.scope === "representative" && !member.representativeAccess) return "Representative authority needs review";
  return `Sharing grant active · ${member.scope === "representative" ? "representative" : "helper"}`;
}

export function FamilyAuthorizations({ certificateId, mode }: Props) {
  const { toast } = useToast();
  const [typedNames, setTypedNames] = useState<Record<string, string>>({});
  const [scopes, setScopes] = useState<Record<string, "helper" | "representative">>({});
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const [editingGrants, setEditingGrants] = useState<Record<string, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [endTimes, setEndTimes] = useState<Record<string, string>>({});
  const endpoint = `/api/case/${certificateId}/family-authorizations`;
  const auths = useQuery<{ members: FamilyAuthorizationMember[]; ownerName?: string | null; ownerCanAuthorize?: boolean; agreementVersion?: string; agreementText?: string }>({
    queryKey: [endpoint],
    ...(mode === "owner" ? familyRefreshOptions : {}),
  });
  const docs = useQuery<any[]>({
    queryKey: [`/api/admin/case/${certificateId}/family-documents`],
    enabled: mode === "admin",
  });
  const caseDocuments: any[] = Array.isArray(docs.data) ? docs.data : (docs.data as any)?.documents || [];
  const members = auths.data?.members || [];

  const authorize = useMutation({
    mutationFn: ({ member, scope }: { member: FamilyAuthorizationMember; scope: "helper" | "representative" }) =>
      apiRequest("POST", `/api/case/${certificateId}/family-members/${member.memberUserId}/authorize`, {
        typedName: typedNames[member.memberUserId]?.trim(),
        confirmed: confirmations[member.memberUserId] === true,
        scope,
        agreementVersion: member.agreementVersion || auths.data?.agreementVersion || "case-sharing-v1",
      }),
    onSuccess: (_result, { member }) => {
      setConfirmations(current => ({ ...current, [member.memberUserId]: false }));
      setEditingGrants(current => ({ ...current, [member.memberUserId]: false }));
      invalidateSafeguards(certificateId);
      toast({ title: "Sharing authorization recorded" });
    },
    onError: (error: Error) => toast({ title: "Could not authorize sharing", description: error.message, variant: "destructive" }),
  });
  const review = useMutation({
    mutationFn: ({ member, decision }: { member: FamilyAuthorizationMember; decision: "approved" | "rejected" | "revoked" }) =>
      apiRequest("POST", `/api/admin/case/${certificateId}/family-members/${member.memberUserId}/review-authority`, {
        grantId: member.grantId,
        decision,
        reason: reasons[member.memberUserId]?.trim(),
        evidenceDocumentId: decision === "approved" ? evidence[member.memberUserId] : undefined,
        authorityExpiresAt: decision === "approved" ? new Date(endTimes[member.memberUserId]).toISOString() : undefined,
        expectedReviewedAt: member.grant?.reviewedAt || null,
      }),
    onSuccess: () => {
      invalidateSafeguards(certificateId);
      toast({ title: "Authority review recorded" });
    },
    onError: (error: Error) => toast({ title: "Could not record review", description: error.message, variant: "destructive" }),
  });

  if (auths.isLoading) return <Card data-testid={`family-authorizations-loading-${certificateId}`}><CardContent className="space-y-3 p-5"><Skeleton className="h-5 w-48" /><Skeleton className="h-16 w-full" /></CardContent></Card>;
  if (auths.isError) return <Card data-testid={`family-authorizations-error-${certificateId}`}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5"><p className="text-sm text-muted-foreground">Family safeguard details could not be loaded.</p><Button variant="outline" onClick={() => auths.refetch()}>Try again</Button></CardContent></Card>;

  return (
    <>
    <Card data-testid={`family-authorizations-${mode}-${certificateId}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Case member safeguards</CardTitle>
        <CardDescription>
          {mode === "admin"
            ? "Review identity and signed case-sharing status. Representative requests need separate staff review and case evidence."
            : "An accepted invitation alone does not grant access. Each member must verify ID and accept the case-sharing grant."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!members.length ? (
          <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground" data-testid={`family-authorizations-empty-${certificateId}`}>
            No invited case members to review yet.
          </div>
        ) : members.map((member) => {
          const active = member.helperAccess;
          const reviewPending = mode === "admin" && member.scope === "representative" && member.sharingAuthorized &&
            member.memberAccepted && member.idVerified;
          const scope = scopes[member.memberUserId] || member.scope || "helper";
          return (
            <section key={member.memberUserId} className="space-y-3 rounded-lg border p-4" data-testid={`family-member-safeguard-${member.memberUserId}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{member.memberName || member.email || "Invited member"}</p>
                  {member.email && <p className="text-xs text-muted-foreground">{member.email}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{member.caseLabel || "Case member"}</p>
                </div>
                <Badge variant={active ? "default" : "secondary"} data-testid={`family-access-state-${member.memberUserId}`}>
                  {active ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                  {member.representativeAccess ? "Reviewed representative access" : active ? "Helper access active" : "Access restricted"}
                </Badge>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" />{sourceLabel(member)}</p>
                <p className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-muted-foreground" />{sharingLabel(member)}</p>
              </div>
              {member.authorityExpiresAt && (
                <p className="text-sm" data-testid={`authority-expiry-${member.memberUserId}`}>
                  Representative authority ends {new Date(member.authorityExpiresAt).toLocaleString()} (exclusive).
                  {" "}ID verification is separate and is not changed by authority expiration.
                </p>
              )}
              {mode === "admin" && member.membershipStatus === "active" && !member.idVerified && member.email && (
                <FamilySafeguardReminder
                  certificateId={certificateId}
                  userId={member.memberUserId}
                  recipientName={member.memberName}
                  recipientEmail={member.email}
                  kind="id"
                />
              )}
              {mode === "admin" && member.membershipStatus === "active" && !member.sharingAuthorized && (
                <FamilySafeguardReminder
                  certificateId={certificateId}
                  userId={member.memberUserId}
                  recipientName={member.memberName}
                  recipientEmail={member.email}
                  kind="owner_approval"
                />
              )}
              {member.scope === "representative" && member.reviewStatus === "rejected" && member.grant?.reviewReason && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid={`family-review-reason-${member.memberUserId}`}>
                  Review not approved: {member.grant.reviewReason}
                </p>
              )}

              {mode === "owner" && member.sharingAuthorized && !editingGrants[member.memberUserId] && auths.data?.ownerCanAuthorize && (
                <Button variant="outline" onClick={() => {
                  setConfirmations(current => ({ ...current, [member.memberUserId]: false }));
                  setEditingGrants(current => ({ ...current, [member.memberUserId]: true }));
                }} data-testid={`button-change-sharing-${member.memberUserId}`}>Review or change sharing permission</Button>
              )}
              {mode === "owner" && (!member.sharingAuthorized || editingGrants[member.memberUserId]) && auths.data?.ownerCanAuthorize && (
                <div className="space-y-3 rounded-md bg-muted/50 p-3">
                  {member.sharingAuthorized && <p role="status" className="text-sm">Signing replaces the current permission. The member must accept again before private access resumes, and representative requests need a new staff review. Earlier signatures remain in the history.</p>}
                  <p className="text-sm font-medium">Choose the access requested for this member</p>
                  <Select value={scope} onValueChange={(value) => setScopes((current) => ({ ...current, [member.memberUserId]: value as "helper" | "representative" }))}>
                    <SelectTrigger aria-label={`Access scope for ${member.memberName}`} data-testid={`select-family-scope-${member.memberUserId}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="helper">Helper — view and upload after safeguards</SelectItem>
                      <SelectItem value="representative">Representative — requires staff authority review and evidence</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-3 text-sm whitespace-pre-wrap" data-testid={`text-sharing-agreement-${member.memberUserId}`}>
                    {member.agreementText || auths.data?.agreementText}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`owner-name-${member.memberUserId}`}>Your typed legal name</Label>
                    <Input id={`owner-name-${member.memberUserId}`} value={typedNames[member.memberUserId] || ""} onChange={(event) => setTypedNames((current) => ({ ...current, [member.memberUserId]: event.target.value }))} data-testid={`input-owner-legal-name-${member.memberUserId}`} />
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 text-sm" data-testid={`label-owner-confirm-${member.memberUserId}`}>
                    <Checkbox checked={confirmations[member.memberUserId] === true} onCheckedChange={(value) => setConfirmations((current) => ({ ...current, [member.memberUserId]: value === true }))} />
                    <span>I confirm I want to share this case under the agreement shown above. This is a case-sharing grant, not a Limited Power of Attorney.</span>
                  </label>
                  <Button onClick={() => authorize.mutate({ member, scope })} disabled={authorize.isPending || !typedNames[member.memberUserId]?.trim() || !confirmations[member.memberUserId]} data-testid={`button-authorize-family-${member.memberUserId}`}>
                    {authorize.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign sharing grant
                  </Button>
                  {editingGrants[member.memberUserId] && <Button variant="ghost" onClick={() => setEditingGrants(current => ({ ...current, [member.memberUserId]: false }))} disabled={authorize.isPending}>Cancel</Button>}
                </div>
              )}
              {mode === "owner" && !member.sharingAuthorized && !auths.data?.ownerCanAuthorize && (
                <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground" data-testid={`text-owner-authorization-needed-${member.memberUserId}`}>
                  The case owner must sign this sharing grant. Staff cannot sign in the owner’s place.
                </p>
              )}
              {reviewPending && (
                <div className="space-y-3 rounded-md border border-amber-300/70 bg-amber-50/60 p-3 dark:bg-amber-950/20">
                  <p className="text-sm font-medium">{member.grant?.reviewedAt ? "Re-review / renew representative authority" : "Representative authority review"}</p>
                  <p className="text-xs text-muted-foreground">Review is not a legal determination. Every approval or renewal requires a reason, case evidence, and a future end time supported by that evidence. Counsel must define document-specific rules; do not assume indefinite authority. Renewing or revoking authority does not change signed helper sharing.</p>
                  {member.grant?.reviewReason && <p className="text-sm">Previous review note: {member.grant.reviewReason}</p>}
                  <div className="space-y-1"><Label htmlFor={`review-reason-${member.memberUserId}`}>Review reason</Label><Textarea id={`review-reason-${member.memberUserId}`} value={reasons[member.memberUserId] || ""} onChange={(event) => setReasons((current) => ({ ...current, [member.memberUserId]: event.target.value }))} data-testid={`input-review-reason-${member.memberUserId}`} /></div>
                  <div className="space-y-1">
                    <Label htmlFor={`review-evidence-${member.memberUserId}`}>Case evidence document (required to approve)</Label>
                    <Select value={evidence[member.memberUserId] || ""} onValueChange={(value) => setEvidence((current) => ({ ...current, [member.memberUserId]: value }))}>
                      <SelectTrigger id={`review-evidence-${member.memberUserId}`} data-testid={`select-review-evidence-${member.memberUserId}`}><SelectValue placeholder={docs.isLoading ? "Loading case documents…" : "Select an existing case document"} /></SelectTrigger>
                    <SelectContent>{caseDocuments.map((doc: any) => <SelectItem key={doc.id} value={doc.id}>{doc.name || doc.fileName || doc.documentType || "Case document"}{doc.uploadedAt ? ` · ${new Date(doc.uploadedAt).toLocaleDateString()}` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                    {docs.isError && <p className="text-xs text-destructive">Case documents could not be loaded. Retry this page before approving.</p>}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`authority-end-${member.memberUserId}`}>Authority end date and time (your local time, required to approve)</Label>
                    <Input id={`authority-end-${member.memberUserId}`} type="datetime-local" value={endTimes[member.memberUserId] || ""} onChange={(event) => setEndTimes((current) => ({ ...current, [member.memberUserId]: event.target.value }))} data-testid={`input-authority-end-${member.memberUserId}`} />
                    <p className="text-xs text-muted-foreground">Access ends at this exact instant, not at the end of that day. Confirm the evidence’s time zone before entering it.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => review.mutate({ member, decision: "rejected" })} disabled={review.isPending || !reasons[member.memberUserId]?.trim()} data-testid={`button-reject-authority-${member.memberUserId}`}><AlertCircle className="mr-2 h-4 w-4" />Not approved</Button>
                    {member.reviewStatus === "approved" && <Button variant="destructive" onClick={() => review.mutate({ member, decision: "revoked" })} disabled={review.isPending || !reasons[member.memberUserId]?.trim()} data-testid={`button-revoke-authority-${member.memberUserId}`}>Revoke authority only</Button>}
                    <Button onClick={() => review.mutate({ member, decision: "approved" })} disabled={review.isPending || !reasons[member.memberUserId]?.trim() || !evidence[member.memberUserId] || !(new Date(endTimes[member.memberUserId]).getTime() > Date.now())} data-testid={`button-approve-authority-${member.memberUserId}`}><CheckCircle2 className="mr-2 h-4 w-4" />{member.grant?.reviewedAt ? "Approve renewed authority" : "Approve with evidence"}</Button>
                  </div>
                </div>
              )}
              {mode === "admin" && member.grant?.reviewedAt && (
                <p className="text-xs text-muted-foreground">Reviewed {new Date(member.grant.reviewedAt).toLocaleString()}{member.grant.reviewReason ? ` · ${member.grant.reviewReason}` : ""}</p>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
    {mode === "owner" && <FamilyAuthorizationDocuments certificateId={certificateId} />}
    </>
  );
}
