import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trackAnalyticsEvent } from "@/lib/analytics";

type Confirmation = {
  id: string;
  status: "pending_family_confirmation" | "confirmed" | "declined" | "revoked";
  companyName: string;
};

export default function ReferralConfirmationPage() {
  const [, params] = useRoute("/referral-confirmation/:id");
  const id = params?.id || "";
  const query = useQuery<Confirmation>({
    queryKey: [`/api/referrals/${id}/confirmation`],
    enabled: !!id,
    retry: false,
  });
  const decision = useMutation({
    mutationFn: (value: "confirmed" | "declined") =>
      apiRequest("POST", `/api/referrals/${id}/decision`, { decision: value }).then((response) => response.json()),
    onSuccess: (_, value) => {
      trackAnalyticsEvent("referral_decision", { decision: value });
      queryClient.invalidateQueries({ queryKey: [`/api/referrals/${id}/confirmation`] });
    },
  });

  if (query.isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card><CardHeader><CardTitle>Unable to open this request</CardTitle>
          <CardDescription>This request may not belong to your account, or it may no longer exist.</CardDescription>
        </CardHeader></Card>
      </div>
    );
  }
  if (query.data.status !== "pending_family_confirmation") {
    const approved = query.data.status === "confirmed";
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card><CardHeader>
          <CardTitle className="flex items-center gap-2">
            {approved ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-muted-foreground" />}
            Request already decided
          </CardTitle>
          <CardDescription>
            {approved
              ? `You approved limited progress sharing with ${query.data.companyName}.`
              : `Progress sharing with ${query.data.companyName} is not active (${query.data.status}).`}
          </CardDescription>
        </CardHeader></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck /> Your permission is required</CardTitle>
          <CardDescription>
            Steps After Life recorded {query.data.companyName} as the company that referred your family.
            Nothing has been shared with them yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">If you confirm, we will share only:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Broad case milestones</li>
              <li>Overall completed milestone count and percentage</li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-medium">We will not share:</p>
            <p className="mt-1 text-muted-foreground">
              Certificate images or data, Social Security numbers, dates of birth, addresses, account or provider names,
              beneficiaries, documents, notes, messages, government, credit or insurance details, or financial or payment data.
            </p>
          </div>
          {decision.isError && <p className="text-sm text-destructive">{decision.error.message}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={decision.isPending} onClick={() => decision.mutate("declined")}>
              Decline
            </Button>
            <Button disabled={decision.isPending} onClick={() => decision.mutate("confirmed")}>
              {decision.isPending ? "Saving…" : "Confirm limited sharing"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}