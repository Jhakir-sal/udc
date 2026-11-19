import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, FileSignature, Loader2, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { FamilyAuthorizationMember } from "@/components/family-authorizations";
import { Link } from "wouter";

interface Checklist { members: FamilyAuthorizationMember[] }

export default function FamilyAccessPage() {
  const { toast } = useToast();
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const renderedGrantIds = useRef<Record<string, string | null>>({});
  const checklist = useQuery<Checklist>({
    queryKey: ["/api/family-access/checklist"],
    refetchInterval: 5000,
  });
  useEffect(() => {
    const nextGrantIds: Record<string, string | null> = {};
    for (const member of checklist.data?.members || []) {
      const key = member.certificateId;
      const previousGrantId = renderedGrantIds.current[key];
      if (previousGrantId !== member.grantId) {
        setNames(current => ({ ...current, [key]: "" }));
        setConfirmed(current => ({ ...current, [key]: false }));
      }
      nextGrantIds[key] = member.grantId;
    }
    renderedGrantIds.current = nextGrantIds;
  }, [checklist.data?.members]);
  const onboarding = useQuery<any>({
    queryKey: ["/api/onboarding/status"],
    refetchInterval: 5000,
  });
  const startId = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/create-id-verification-existing-user", { returnPath: "/" })).json(),
    onSuccess: (data) => {
      if (data.alreadyVerified) {
        queryClient.invalidateQueries({ queryKey: ["/api/family-access/checklist"] });
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      } else if (data.url) {
        window.location.assign(data.url);
      } else if (data.devMode) {
        toast({ title: "Local test ID check started", description: "This development-only simulation is not a real government-ID check." });
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      } else {
        toast({ title: "Verification could not be started", description: "No identity verification link was returned. Please contact staff for help; this check cannot be skipped.", variant: "destructive" });
      }
    },
    onError: (error: Error) => toast({ title: "Could not start ID verification", description: `${error.message} Please contact staff for help; this check cannot be skipped.`, variant: "destructive" }),
  });
  const accept = useMutation({
    mutationFn: ({ member, grantId }: { member: FamilyAuthorizationMember; grantId: string }) => {
      if (renderedGrantIds.current[member.certificateId] !== grantId) {
        throw new Error("This sharing agreement has changed. Review the current agreement and enter your name and acceptance again.");
      }
      return apiRequest("POST", `/api/case/${member.certificateId}/family-members/${member.memberUserId}/accept-sharing`, {
        grantId,
        typedName: names[member.certificateId]?.trim(),
        confirmed: confirmed[member.certificateId] === true,
        agreementVersion: member.agreementVersion,
      });
    },
    onSuccess: async (_result, { member }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/family-access/checklist"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/case/${member.certificateId}/family-authorizations`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/case/${member.certificateId}/family-invitations`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/certificates"] }),
      ]);
      toast({ title: "Sharing grant accepted" });
    },
    onError: (error: Error) => toast({ title: "Could not accept sharing grant", description: error.message, variant: "destructive" }),
  });

  const members = checklist.data?.members || [];
  const idNeeded = members.some((member) => !member.idVerified);
  if (checklist.isLoading) return <main className="mx-auto min-h-[70dvh] max-w-3xl space-y-4 p-4 sm:p-8" data-testid="family-access-loading"><Skeleton className="h-10 w-64" /><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></main>;

  return (
    <main className="mx-auto min-h-[70dvh] max-w-3xl space-y-5 p-4 sm:p-8" data-testid="page-family-access">
      <header className="space-y-2">
        <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3.5 w-3.5" />Private case access</Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">A few checks before case access</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">We verify each member and record the case owner’s sharing permission before sensitive case information is available. Pending checks do not expose private documents.</p>
      </header>
      {checklist.isError && <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm"><span>We couldn’t load your case checklist. Your private case information remains restricted.</span><Button variant="outline" onClick={() => checklist.refetch()} data-testid="button-retry-family-checklist">Try again</Button></div>}
      {onboarding.isError && <p role="status" className="text-sm text-muted-foreground">Verification status is temporarily unavailable. This page will retry automatically.</p>}
      {!members.length && !checklist.isError && <Card data-testid="family-access-empty"><CardContent className="space-y-3 p-6"><h2 className="font-medium">No linked case memberships found</h2><p className="text-sm text-muted-foreground">If you expected a case invitation, contact the case owner or support team.</p></CardContent></Card>}
      {idNeeded && (
        <Card data-testid="family-id-checklist">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Verify your identity</CardTitle><CardDescription>Government ID verification is required for every case membership. A manual attestation is not a substitute.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {members.filter((member) => !member.idVerified).map((member) => <p key={member.certificateId} className="text-sm text-muted-foreground">{member.caseLabel || "Case"} · {member.identityStatus === "pending" ? "ID check in progress" : member.identityStatus === "failed" ? "ID check needs attention" : "ID check not started"}</p>)}
            <Button onClick={() => startId.mutate()} disabled={startId.isPending || members.some((member) => member.identityStatus === "pending")} data-testid="button-family-start-id">
              {startId.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{members.some((member) => member.identityStatus === "pending") ? "ID check in progress" : "Start ID verification"}
            </Button>
            {(members.some((member) => member.identityStatus === "failed") || startId.isError) && <p role="alert" className="text-sm text-destructive">We could not complete verification. Please retry or contact staff for help. There is no skip or attestation option.</p>}
            <p className="text-xs text-muted-foreground">If verification cannot start or complete, contact staff. No private documents are available until checks finish.</p>
          </CardContent>
        </Card>
      )}
      {members.map((member) => {
        const canAccept = !!member.sharingAuthorized && !!member.grantId && !member.memberAccepted && member.idVerified;
        const active = member.helperAccess;
        const grantIsCurrent = renderedGrantIds.current[member.certificateId] === member.grantId;
        return (
          <Card key={`${member.certificateId}-${member.memberUserId}`} data-testid={`family-access-case-${member.certificateId}`}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><CardTitle className="text-lg">{member.caseLabel || "Shared case"}</CardTitle><CardDescription>Case membership safeguards</CardDescription></div>
                 <Badge variant={active ? "default" : "secondary"}>{active ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}{active ? "Helper access active" : member.representativeAccess ? "Representative review approved" : "Private access restricted"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">{member.idVerified ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-muted-foreground" />}Identity: {member.idVerified ? ((member.identityStatus || "").toLowerCase().includes("manual") || (member.identityStatus || "").toLowerCase().includes("staff") ? "approved by staff" : (member.identityStatus || "").toLowerCase().includes("stripe") ? "verified by identity provider" : "verified") : "verification required"}</li>
                <li className="flex items-center gap-2">{member.sharingAuthorized ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-muted-foreground" />}Case owner sharing permission: {member.sharingAuthorized ? "recorded" : "needed"}</li>
                <li className="flex items-center gap-2">{member.memberAccepted ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-muted-foreground" />}Your acceptance: {member.memberAccepted ? "recorded" : "needed"}</li>
                {member.scope === "representative" && <li className="flex items-center gap-2">{member.representativeAccess ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}Representative authority: {member.authorityStatus.replaceAll("_", " ")}{member.authorityExpiresAt ? ` · ends ${new Date(member.authorityExpiresAt).toLocaleString()}` : ""}</li>}
              </ul>
              {member.scope === "representative" && ["expired", "expiring", "needs_review", "revoked", "rejected"].includes(member.authorityStatus) && (
                <p role="status" className="rounded-md bg-muted p-3 text-sm">
                  {member.authorityStatus === "expiring" ? "Authority expires within 30 days." : "Representative actions are not available."} Contact staff to re-review current supporting documents.
                  {" "}Authority expiration or revocation does not change verified ID or remove otherwise valid helper sharing.
                </p>
              )}
              {!member.sharingAuthorized && <p className="rounded-md bg-muted p-3 text-sm" data-testid={`text-owner-consent-needed-${member.certificateId}`}>The case owner must review and sign the sharing grant before you can accept it. You can return here later; no private documents are shown while this is pending.</p>}
              {member.scope === "representative" && member.reviewStatus === "pending" && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" data-testid={`text-authority-review-pending-${member.certificateId}`}>Your request is awaiting staff review. The review is separate from the owner’s sharing permission and does not guarantee legal authority.</p>}
              {member.scope === "representative" && member.reviewStatus === "rejected" && <p role="status" className="rounded-md bg-muted p-3 text-sm" data-testid={`text-authority-review-rejected-${member.certificateId}`}>Staff did not approve the representative request. Contact the case owner or staff to discuss next steps.</p>}
              {canAccept && (
                <div className="space-y-3 border-t pt-4" data-testid={`member-accept-grant-${member.certificateId}`}>
                  <h3 className="flex items-center gap-2 font-medium"><FileSignature className="h-4 w-4" />Review and accept case sharing</h3>
                  <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap" data-testid={`member-agreement-text-${member.certificateId}`}>{member.agreementText}</div>
                  <p className="text-xs text-muted-foreground">This grant is for case sharing only. It is not a Limited Power of Attorney and does not make a legal-authority determination.</p>
                   <div className="space-y-1"><Label htmlFor={`member-typed-name-${member.certificateId}`}>Your verified name</Label><Input id={`member-typed-name-${member.certificateId}`} autoComplete="off" value={names[member.certificateId] || ""} onChange={(event) => setNames((current) => ({ ...current, [member.certificateId]: event.target.value }))} data-testid={`input-member-legal-name-${member.certificateId}`} /><p className="text-xs text-muted-foreground">Type your name exactly as it appears on your verified account. It is not filled in automatically.</p></div>
                  <label className="flex cursor-pointer items-start gap-3 text-sm" data-testid={`label-member-consent-${member.certificateId}`}>
                    <Checkbox checked={confirmed[member.certificateId] === true} onCheckedChange={(value) => setConfirmed((current) => ({ ...current, [member.certificateId]: value === true }))} />
                    <span>I have reviewed the agreement above and accept this case-sharing grant.</span>
                  </label>
                  {accept.isError && <p role="alert" className="text-sm text-destructive" data-testid={`error-accept-sharing-${member.certificateId}`}>{(accept.error as Error)?.message || "We couldn’t accept this sharing permission. Please review the current agreement and try again."}</p>}
                  <Button onClick={() => member.grantId && renderedGrantIds.current[member.certificateId] === member.grantId && accept.mutate({ member, grantId: member.grantId })} disabled={!member.grantId || !grantIsCurrent || !names[member.certificateId]?.trim() || !confirmed[member.certificateId] || accept.isPending} data-testid={`button-accept-sharing-${member.certificateId}`}>
                    {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Accept sharing permission
                  </Button>
                </div>
              )}
              {active && member.scope === "helper" && <p className="text-sm text-muted-foreground" data-testid={`text-member-access-ready-${member.certificateId}`}>Your verified membership and sharing grant are complete. You may view and upload case information; this grant does not provide legal authority or act as a Limited Power of Attorney.</p>}
              {member.scope === "representative" && member.representativeAccess && <p className="text-sm text-muted-foreground" data-testid={`text-member-access-ready-${member.certificateId}`}>Staff approved the representative request. This is not a legal determination and does not guarantee authority under applicable law; helper access controls view and upload access.</p>}
            </CardContent>
          </Card>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {members.some(member => member.helperAccess) && <Button asChild data-testid="button-open-my-case"><Link href="/">Open my case</Link></Button>}
        <Button variant="outline" onClick={() => { checklist.refetch(); onboarding.refetch(); }} data-testid="button-refresh-family-access">Refresh checklist</Button><Link href="/settings" className="inline-flex h-10 items-center rounded-md px-4 text-sm underline-offset-4 hover:underline">Account settings</Link>
      </div>
    </main>
  );
}
