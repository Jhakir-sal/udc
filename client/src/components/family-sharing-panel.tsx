import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { familyRefreshOptions } from "@/lib/family-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Scope = "helper" | "representative";
type AuthorizationSchema = {
  ownerCanAuthorize: boolean;
  ownerName: string | null;
  agreementVersion: string;
  agreementText: string;
  members?: Array<{
    memberUserId: string;
    sharingAuthorized: boolean;
    helperAccess: boolean;
    representativeAccess: boolean;
    scope: Scope | null;
    reviewStatus?: string | null;
  }>;
};
type AuthorizationMember = NonNullable<AuthorizationSchema["members"]>[number];
type Invitation = {
  id: string;
  recipientName?: string;
  email: string;
  phoneNumber?: string;
  deceasedRelationshipToRecipient?: string;
  status: string;
  emailSent?: boolean;
  sharingAuthorized?: boolean;
  memberUserId?: string | null;
  membershipStatus?: string | null;
  scope?: Scope | null;
};

const invalidateSharing = async (certificateId: string) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [`/api/case/${certificateId}/family-invitations`] }),
    queryClient.invalidateQueries({ queryKey: [`/api/case/${certificateId}/family-authorizations`] }),
    queryClient.invalidateQueries({ queryKey: ["/api/family-access/checklist"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/certificates"] }),
  ]);
};

function invitationState(item: Invitation, access?: AuthorizationMember) {
  const status = (item.status || "").toLowerCase();
  if (status === "revoked" || status === "cancelled" || status === "canceled") {
    return { label: "Invitation revoked", detail: "No case access is active.", variant: "outline" as const };
  }
  if (status === "accepted") {
    if (item.membershipStatus === "revoked") {
      return { label: "Invitation accepted · access removed", detail: "The member must complete the safeguards again before access can resume.", variant: "outline" as const };
    }
    if (access?.helperAccess) return { label: "Helper access active", detail: "The required identity, owner permission, and member acceptance are complete.", variant: "default" as const };
    if (access?.representativeAccess) return { label: "Representative review approved", detail: "Staff approved the representative request. Helper view and upload access is not active.", variant: "secondary" as const };
    return { label: "Invitation accepted", detail: "Member access is not active yet. Identity and sharing checks are still required.", variant: "secondary" as const };
  }
  if (item.emailSent === false) {
    return { label: "Invitation saved · email not sent", detail: "Retry sending the invitation. The recipient cannot accept until they receive the email.", variant: "destructive" as const };
  }
  if (status === "pending") {
    return { label: "Invitation pending", detail: "Waiting for the invited person to accept and complete the case safeguards.", variant: "secondary" as const };
  }
  return { label: status || "Invitation saved", detail: "Case access remains restricted until the required checks are complete.", variant: "outline" as const };
}

export function FamilySharingPanel({ certificateId }: { certificateId: string }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [scope, setScope] = useState<Scope>("helper");
  const [typedName, setTypedName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [deliveryRetryId, setDeliveryRetryId] = useState<string | null>(null);
  const sharing = useQuery<Invitation[]>({ queryKey: [`/api/case/${certificateId}/family-invitations`], ...familyRefreshOptions });
  const authorization = useQuery<AuthorizationSchema>({
    queryKey: [`/api/case/${certificateId}/family-authorizations`],
    ...familyRefreshOptions,
  });
  const authorizationSchemaReady = typeof authorization.data?.ownerCanAuthorize === "boolean" &&
    !!authorization.data.agreementVersion && !!authorization.data.agreementText;
  const canSubmit = authorizationSchemaReady && authorization.data?.ownerCanAuthorize === true &&
    !authorization.isLoading && !authorization.isError;

  const invite = useMutation({
    mutationFn: async () => {
      if (!authorization.data || !canSubmit) throw new Error("Owner signing eligibility is still being checked. Please retry before inviting.");
      if (!confirmed || !typedName.trim()) throw new Error("Type your legal name and confirm sharing permission before sending.");
      const response = await apiRequest("POST", `/api/case/${certificateId}/family-invitations`, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        relationship,
        sharingConsent: {
          typedName: typedName.trim(),
          confirmed,
          scope,
          agreementVersion: authorization.data.agreementVersion,
        },
      });
      return response.json() as Promise<{ emailSent: boolean; sharingAuthorized: boolean }>;
    },
    onSuccess: async (result) => {
      await invalidateSharing(certificateId);
      setName(""); setEmail(""); setPhone(""); setRelationship(""); setTypedName(""); setConfirmed(false); setScope("helper"); setFormError("");
      if (result.emailSent) {
        setDeliveryNotice("");
        setDeliveryRetryId(null);
        toast({ title: result.sharingAuthorized ? "Invitation sent and permission recorded" : "Invitation sent", description: "The invited person must accept and complete ID verification before private case access." });
      } else {
        const response = result as typeof result & { id?: string; invitation?: { id?: string } };
        setDeliveryRetryId(response.id || response.invitation?.id || null);
        setDeliveryNotice("Invitation saved, but email was not sent. The recipient has not accepted and cannot proceed until the invitation reaches them.");
        toast({ title: "Invitation saved, but email was not sent", description: "The invite is not in the recipient’s inbox. Use Retry email below." });
      }
    },
    onError: (error: Error) => setFormError(error.message || "Could not save this invitation."),
  });

  const action = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: "revoke" | "resend" }) => {
      const response = await apiRequest(
        "POST",
        kind === "revoke" ? `/api/case/${certificateId}/family-invitations/${id}/revoke` : `/api/case/${certificateId}/family-invitations/${id}/resend`,
      );
      return kind === "resend" ? (response.status === 204 ? {} : response.json()) as Promise<{ emailSent?: boolean }> : undefined;
    },
    onSuccess: async (result, variables) => {
      await invalidateSharing(certificateId);
      setActionError("");
      if (variables.kind === "resend" && result?.emailSent === false) {
        setActionError("The invitation remains saved, but email still could not be sent. Please retry later or contact support.");
      } else if (variables.kind === "resend" && result?.emailSent === true && deliveryRetryId === variables.id) {
        setDeliveryNotice("");
        setDeliveryRetryId(null);
      }
    },
    onError: (error: Error) => setActionError(error.message || "This invitation action could not be completed."),
  });

  const removeAccess = useMutation({
    mutationFn: (memberUserId: string) => apiRequest("POST", `/api/case/${certificateId}/family-members/${memberUserId}/revoke`),
    onSuccess: async () => { await invalidateSharing(certificateId); setActionError(""); },
    onError: (error: Error) => setActionError(error.message || "Could not remove case access."),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!name.trim() || !email.trim() || !relationship.trim()) {
      setFormError("Enter the family member’s name, email, and relationship to your loved one.");
      return;
    }
    if (!canSubmit || !authorization.data?.agreementText || !authorization.data.agreementVersion) {
      setFormError("We could not confirm the current sharing agreement. Retry loading it before sending an invitation.");
      return;
    }
    if (!typedName.trim() || !confirmed) {
      setFormError("Type your verified name and confirm the sharing agreement to continue.");
      return;
    }
    invite.mutate();
  };

  return (
    <Card className="mb-6" data-testid="family-sharing-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Invite family to this case</CardTitle>
        <CardDescription>Invite a trusted person and, if you are eligible, record your case-sharing permission in the same step.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {(sharing.isLoading || authorization.isLoading) && <div className="space-y-2" data-testid="family-sharing-loading"><Skeleton className="h-5 w-48" /><Skeleton className="h-20 w-full" /></div>}
        {authorization.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span>We couldn’t load your owner signing eligibility or the current agreement. No permission will be signed until this is confirmed.</span>
          <Button variant="outline" size="sm" onClick={() => authorization.refetch()}>Retry</Button>
        </div>}
        {!authorization.isLoading && !authorization.isError && authorization.data && !authorizationSchemaReady && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><span>The owner signing details are incomplete. No permission has been signed; reload the agreement before continuing.</span><Button variant="outline" size="sm" onClick={() => authorization.refetch()}>Retry</Button></div>}
        {!authorization.isLoading && !authorization.isError && authorizationSchemaReady && authorization.data?.ownerCanAuthorize === false && (
          <div className="space-y-2 rounded-md border border-amber-300/70 bg-amber-50/60 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" data-testid="owner-authorization-unavailable">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Owner permission cannot be signed yet</p>
            <p>Complete your identity verification and case authorization in onboarding first. Only the case owner can sign this sharing permission; staff cannot sign in your place.</p>
            <Link href="/onboarding" className="inline-flex font-medium underline underline-offset-4">Continue onboarding</Link>
          </div>
        )}
        {canSubmit && authorization.data && (
          <form onSubmit={submit} autoComplete="on" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor={`share-family-name-${certificateId}`}>Family member name</Label><Input id={`share-family-name-${certificateId}`} autoComplete="name" placeholder="Full name" value={name} onChange={event => setName(event.target.value)} required data-testid="input-family-invite-name" /></div>
              <div className="space-y-1"><Label htmlFor={`share-family-email-${certificateId}`}>Email</Label><Input id={`share-family-email-${certificateId}`} autoComplete="email" placeholder="name@example.com" type="email" value={email} onChange={event => setEmail(event.target.value)} required data-testid="input-family-invite-email" /></div>
              <div className="space-y-1"><Label htmlFor={`share-family-phone-${certificateId}`}>Phone number <span className="text-muted-foreground">(optional)</span></Label><Input id={`share-family-phone-${certificateId}`} placeholder="(555) 123-4567" type="tel" autoComplete="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)} data-testid="input-family-invite-phone" /></div>
              <div className="space-y-1">
                <Label htmlFor={`share-family-relationship-${certificateId}`}>Relationship to your loved one</Label>
                <Select value={relationship} onValueChange={setRelationship}>
                  <SelectTrigger id={`share-family-relationship-${certificateId}`} data-testid="select-family-invite-relationship"><SelectValue placeholder="Choose a relationship" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spouse">Spouse</SelectItem><SelectItem value="partner">Partner</SelectItem><SelectItem value="parent">Parent</SelectItem><SelectItem value="child">Child</SelectItem><SelectItem value="sibling">Sibling</SelectItem><SelectItem value="grandparent">Grandparent</SelectItem><SelectItem value="relative">Other relative</SelectItem><SelectItem value="friend">Friend</SelectItem><SelectItem value="loved one">Loved one</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <section className="space-y-3 rounded-lg border bg-muted/20 p-4" aria-labelledby={`sharing-consent-title-${certificateId}`} data-testid="owner-sharing-consent">
              <div>
                <h3 id={`sharing-consent-title-${certificateId}`} className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-primary" />Your sharing permission</h3>
                <p className="mt-1 text-sm text-muted-foreground">This permission lets the invited person view and upload case information only after their ID is verified and they accept the permission. It is not a Limited Power of Attorney.</p>
              </div>
              <Select value={scope} onValueChange={value => setScope(value as Scope)}>
                <SelectTrigger aria-label="Requested case access" data-testid="select-invite-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="helper">Helper — view and upload after required checks</SelectItem>
                  <SelectItem value="representative">Representative — optional, requires separate staff review</SelectItem>
                </SelectContent>
              </Select>
              {scope === "representative" && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">Representative access stays restricted unless staff separately reviews and approves it. This is not a legal determination.</p>}
              <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-3 text-sm whitespace-pre-wrap" data-testid="text-invite-sharing-agreement">{authorization.data.agreementText}</div>
              <div className="space-y-1">
                <Label htmlFor={`owner-signature-${certificateId}`}>Type your verified name to sign</Label>
                <Input id={`owner-signature-${certificateId}`} autoComplete="off" value={typedName} onChange={event => setTypedName(event.target.value)} placeholder={authorization.data.ownerName || "Type your name"} data-testid="input-owner-invite-signature" />
                <p className="text-xs text-muted-foreground">Enter the name exactly as verified. It is not filled in for you.</p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm" data-testid="label-owner-invite-consent">
                <Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} />
                <span>I have reviewed this agreement and intentionally authorize the selected case sharing for this invited person.</span>
              </label>
            </section>
            {formError && <p role="alert" className="text-sm text-destructive" data-testid="family-invite-error">{formError}</p>}
            <Button type="submit" disabled={invite.isPending || !canSubmit || !name.trim() || !email.trim() || !relationship || !typedName.trim() || !confirmed} data-testid="button-send-family-invitation">
              {invite.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              {invite.isPending ? "Saving invitation and permission…" : "Send invitation and approve sharing"}
            </Button>
          </form>
        )}

        {sharing.isError && <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><span>Invitations could not be loaded. Their access status is unknown.</span><Button variant="outline" size="sm" onClick={() => sharing.refetch()}>Retry</Button></div>}
        {actionError && <p role="alert" className="text-sm text-destructive" data-testid="family-invitation-action-error">{actionError}</p>}
        {deliveryNotice && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" data-testid="family-invitation-email-not-sent"><span>{deliveryNotice}</span>{deliveryRetryId && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: deliveryRetryId, kind: "resend" })} disabled={action.isPending} data-testid="button-retry-invitation-email">Retry email</Button>}</div>}
        {!!sharing.data?.length && <div className="divide-y rounded-lg border" data-testid="family-invitation-list">
          {sharing.data.map(item => {
            const access = authorization.data?.members?.find(member => member.memberUserId === item.memberUserId);
            const state = invitationState(item, access);
            const active = item.status === "accepted" && !!access?.helperAccess;
            const hasAccessRecord = !!(access?.helperAccess || access?.representativeAccess);
            const pendingInvite = item.status === "pending";
            return <section key={item.id} className="space-y-3 p-4 text-sm" data-testid={`family-invitation-${item.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{item.recipientName || "Invited family member"}</p>
                  <p className="break-all text-muted-foreground">{item.email}{item.phoneNumber ? ` · ${item.phoneNumber}` : ""}{item.deceasedRelationshipToRecipient ? ` · ${item.deceasedRelationshipToRecipient}` : ""}</p>
                </div>
                <Badge variant={state.variant} data-testid={`family-invitation-status-${item.id}`}>{active ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}{state.label}</Badge>
              </div>
              <p className="text-muted-foreground">{state.detail}</p>
              {item.status === "pending" && <p className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-muted-foreground"><Mail className="mt-0.5 h-4 w-4 shrink-0" />{item.emailSent === false ? "Email delivery failed. The invitation is saved but has not reached the recipient." : item.sharingAuthorized ? "Your permission is signed. The member still needs to accept, verify ID, and accept sharing before access becomes active." : "The invitation is pending, but owner sharing permission is not recorded. Case access remains restricted until the owner and member complete their safeguards."}</p>}
              {item.status === "accepted" && !active && <p className="rounded-md bg-muted/60 p-3 text-muted-foreground">{access?.representativeAccess ? "Staff approved the representative request. This is separate from helper view and upload access, which is not active." : access?.sharingAuthorized || item.sharingAuthorized ? "Owner permission is signed. The invited person must still verify identity and accept sharing. Representative access also awaits staff review." : "The invitation is accepted, but owner sharing permission is still needed. Private case access remains restricted."}</p>}
              <div className="flex flex-wrap gap-2">
                {pendingInvite && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: item.id, kind: "resend" })} disabled={action.isPending} data-testid={`button-resend-family-invitation-${item.id}`}>{action.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}{item.emailSent === false ? "Retry email" : "Resend invitation"}</Button>}
                {pendingInvite && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Revoke this invitation? The recipient will no longer be able to accept it.")) action.mutate({ id: item.id, kind: "revoke" }); }} disabled={action.isPending} data-testid={`button-revoke-family-invitation-${item.id}`}>Revoke invitation</Button>}
                {hasAccessRecord && item.memberUserId && <Button size="sm" variant="outline" onClick={() => { if (window.confirm("Remove this person’s case access? They will need identity verification and a new owner and member sharing acceptance before access can resume.")) removeAccess.mutate(item.memberUserId!); }} disabled={removeAccess.isPending} data-testid={`button-remove-family-access-${item.id}`}>{removeAccess.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Remove access</Button>}
              </div>
            </section>;
          })}
        </div>}
      </CardContent>
    </Card>
  );
}
