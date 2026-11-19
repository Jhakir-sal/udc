import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ORSA_LEGACY_COMPLIMENTARY_END } from "@shared/orsaLegacyOffer";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

type LegacyOffer = {
  eligible: boolean;
  needsPlan: boolean;
  legacyIncluded: boolean;
  complimentaryUntil: string;
  paidThrough: string | null;
  priceCents: 5000;
  lifetimePriceCents: 14900;
  lifetimeOwned: boolean;
  canPurchase: boolean;
  canPurchaseLifetime: boolean;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function useCountdown(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Date.parse(until) - now);
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    expired: remaining <= 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function OrsaLegacyOfferCard({ showPurchase = true }: { showPurchase?: boolean }) {
  const offer = useQuery<LegacyOffer>({ queryKey: ["/api/orsa/legacy-offer"] });
  const [verifiedPaidThrough, setVerifiedPaidThrough] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const [returnStatus, setReturnStatus] = useState<"verifying" | "success" | "cancelled" | null>(null);
  const countdown = useCountdown(offer.data?.complimentaryUntil || ORSA_LEGACY_COMPLIMENTARY_END);

  useEffect(() => {
    if (!offer.data?.paidThrough) return;
    queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
    queryClient.invalidateQueries({ queryKey: ["/api/heartplan/storage"] });
  }, [offer.data?.paidThrough]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const offerStatus = params.get("orsa_offer");
    const sessionId = params.get("session_id");
    if (offerStatus !== "success" && offerStatus !== "cancelled") return;

    params.delete("orsa_offer");
    params.delete("session_id");
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
    if (offerStatus === "cancelled") {
      setReturnStatus("cancelled");
      return;
    }
    if (!sessionId) {
      setVerifyError("Checkout returned without a session identifier. Please refresh or contact support if you were charged.");
      return;
    }
    setReturnStatus("verifying");
    apiRequest("GET", `/api/orsa/legacy-offer/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((response) => response.json())
      .then((result: { purchased: boolean; paidThrough?: string | null }) => {
        if (!result.purchased || !result.paidThrough) {
          throw new Error("Your payment is still being confirmed. Please refresh your membership shortly; you will not need to pay again.");
        }
        setVerifiedPaidThrough(result.paidThrough);
        setVerifyError("");
        setReturnStatus("success");
        queryClient.invalidateQueries({ queryKey: ["/api/orsa/legacy-offer"] });
        queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
        queryClient.invalidateQueries({ queryKey: ["/api/heartplan/storage"] });
      })
      .catch((error: unknown) => {
        setVerifyError(error instanceof Error ? error.message : "We couldn’t confirm your payment. Please try again.");
        setReturnStatus(null);
      });
  }, []);

  const lifetimeCheckout = useMutation({
    mutationFn: async (expectedPriceCents: number) => (await apiRequest("POST", "/api/heartplan/upgrade/checkout", { tier: "legacy", expectedPriceCents })).json() as Promise<{ url?: string }>,
    onSuccess: (result) => {
      if (result.url) window.location.assign(result.url);
      else setVerifyError("Checkout did not return a secure payment link. Please try again.");
    },
    onError: (error: unknown) => {
      setVerifyError(error instanceof Error ? error.message : "Could not start lifetime checkout. Please try again.");
      queryClient.invalidateQueries({ queryKey: ["/api/orsa/legacy-offer"] });
    },
  });

  if (offer.isLoading) {
    if (!returnStatus && !verifyError) return null;
  }
  if (offer.isError) {
    return <div className="space-y-3">
      {verifyError && <Alert variant="destructive"><AlertTitle>Could not confirm payment</AlertTitle><AlertDescription>{verifyError}</AlertDescription></Alert>}
      <Alert variant="destructive"><AlertTitle>ORSA HeartPlan offer unavailable</AlertTitle><AlertDescription>Please refresh to check your eligibility.</AlertDescription></Alert>
    </div>;
  }
  if (!offer.data?.eligible) {
    if (verifyError) return <Alert variant="destructive"><AlertTitle>Could not confirm payment</AlertTitle><AlertDescription>{verifyError}</AlertDescription></Alert>;
    if (returnStatus === "verifying") return <Alert><AlertTitle>Confirming your payment</AlertTitle><AlertDescription>Please wait while we verify your 12-month HeartPlan Legacy extension.</AlertDescription></Alert>;
    if (returnStatus === "success") return <Alert className="border-accent/40"><AlertTitle>Payment confirmed</AlertTitle><AlertDescription>Your 12-month HeartPlan Legacy extension is active through {verifiedPaidThrough ? formatDate(verifiedPaidThrough) : "the date shown in your account"}.</AlertDescription></Alert>;
    if (returnStatus === "cancelled") return <Alert><AlertTitle>Checkout cancelled</AlertTitle><AlertDescription>No purchase was completed. Your complimentary and Free HeartPlan benefits are unchanged.</AlertDescription></Alert>;
    return null;
  }

  const data = offer.data;
  const canPurchase = data.canPurchase && !countdown.expired && showPurchase && returnStatus !== "verifying";
  const canPurchaseLifetime = (data.canPurchaseLifetime || (countdown.expired && data.canPurchase)) && showPurchase && returnStatus !== "verifying";
  const paidThrough = verifiedPaidThrough || data.paidThrough;

  return (
    <Card className="border-accent/40 bg-accent/5" data-testid="card-orsa-legacy-offer">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" />ORSA HeartPlan Legacy benefit</CardTitle>
        <CardDescription>
          {data.lifetimeOwned
            ? "Your lifetime HeartPlan Legacy purchase is active. ORSA case coverage remains separate."
            : data.legacyIncluded
              ? "HeartPlan Legacy is included with your verified ORSA membership at no additional cost through December 1, 2026 at 11:59 p.m. Eastern Time."
              : "Complimentary ORSA HeartPlan Legacy access ended December 1, 2026. The Free plan remains available."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {returnStatus === "verifying" && <Alert><AlertTitle>Confirming your payment</AlertTitle><AlertDescription>Please wait while we verify your 12-month HeartPlan Legacy extension.</AlertDescription></Alert>}
        {returnStatus === "success" && <Alert className="border-accent/40"><AlertTitle>Payment confirmed</AlertTitle><AlertDescription>Your 12-month HeartPlan Legacy extension is active through {verifiedPaidThrough ? formatDate(verifiedPaidThrough) : "the date shown in your account"}.</AlertDescription></Alert>}
        {returnStatus === "cancelled" && <Alert><AlertTitle>Checkout cancelled</AlertTitle><AlertDescription>No purchase was completed. Your complimentary and Free HeartPlan benefits are unchanged.</AlertDescription></Alert>}
        <div aria-live="off" className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {[
            ["Days", countdown.days],
            ["Hours", countdown.hours],
            ["Minutes", countdown.minutes],
            ["Seconds", countdown.seconds],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-background px-2 py-3">
              <div className="text-2xl font-semibold tabular-nums">{String(value).padStart(2, "0")}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        {countdown.expired && !data.lifetimeOwned && <p className="text-sm text-muted-foreground">The complimentary period and $50 member offer have ended.</p>}
        {paidThrough && !data.lifetimeOwned && <p className="text-sm font-medium">{countdown.expired ? "Your previously purchased 12-month extension runs through" : "Your previously purchased extension is secured for December 2, 2026 through"} {formatDate(paidThrough)}.</p>}
        {data.needsPlan && (
          <div className="space-y-2 rounded-lg border bg-background p-4">
            <p className="text-sm">Start your own HeartPlan before purchasing lifetime Legacy access. This does not affect your sponsor’s plan or billing.</p>
            <Button asChild variant="outline"><Link href="/heartplan">Start my HeartPlan</Link></Button>
          </div>
        )}
        {canPurchase && (
          <div className="space-y-3 rounded-lg border bg-background p-4">
            <div>
              <p className="font-medium">ORSA lifetime HeartPlan Legacy — ${(data.priceCents / 100).toFixed(0)} one time</p>
              <p className="mt-1 text-sm text-muted-foreground">Secure lifetime Legacy access at the member rate through December 1, 2026 at 11:59 p.m. Eastern Time. No subscription or renewal. ORSA case coverage and seat billing remain separate.</p>
            </div>
            <Button onClick={() => { setVerifyError(""); lifetimeCheckout.mutate(data.priceCents); }} disabled={lifetimeCheckout.isPending} className="w-full sm:w-auto" data-testid="button-orsa-legacy-checkout">
              {lifetimeCheckout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {lifetimeCheckout.isPending ? "Opening secure checkout…" : `Get lifetime Legacy — $${(data.priceCents / 100).toFixed(0)}`}
            </Button>
          </div>
        )}
        {canPurchaseLifetime && (
          <div className="space-y-3 rounded-lg border bg-background p-4">
            <div>
              <p className="font-medium">Lifetime HeartPlan Legacy — ${(data.lifetimePriceCents / 100).toFixed(0)} one time</p>
              <p className="mt-1 text-sm text-muted-foreground">The $50 ORSA lifetime offer ended December 1, 2026. Lifetime Legacy remains available with no subscription or renewal. ORSA membership and case coverage remain separate.</p>
            </div>
            <Button onClick={() => { setVerifyError(""); lifetimeCheckout.mutate(data.lifetimePriceCents); }} disabled={lifetimeCheckout.isPending} className="w-full sm:w-auto" data-testid="button-orsa-legacy-lifetime-checkout">
              {lifetimeCheckout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {lifetimeCheckout.isPending ? "Opening secure checkout…" : `Get lifetime Legacy — $${(data.lifetimePriceCents / 100).toFixed(0)}`}
            </Button>
          </div>
        )}
        {verifyError && <Alert variant="destructive"><AlertTitle>Could not complete the offer</AlertTitle><AlertDescription>{verifyError}</AlertDescription></Alert>}
      </CardContent>
    </Card>
  );
}

export function OrsaLegacyRegistrationCountdown() {
  const countdown = useCountdown(ORSA_LEGACY_COMPLIMENTARY_END);
  return (
    <Card className="border-accent/40 bg-accent/5" data-testid="card-orsa-registration-countdown">
      <CardHeader>
        <CardTitle>Complimentary ORSA HeartPlan Legacy</CardTitle>
        <CardDescription>{countdown.expired ? "Complimentary Legacy access ended December 1, 2026." : "Available through December 1, 2026 at 11:59 p.m. Eastern Time."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {[
            ["Days", countdown.days],
            ["Hours", countdown.hours],
            ["Minutes", countdown.minutes],
            ["Seconds", countdown.seconds],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-background px-2 py-3">
              <div className="text-2xl font-semibold tabular-nums">{String(value).padStart(2, "0")}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{countdown.expired ? "The complimentary Legacy period and $50 lifetime offer have ended. Verified ORSA members can buy lifetime Legacy access for $149 one time after sign-in." : "Secure lifetime Legacy for $50 one time through December 1 at 11:59 p.m. Eastern Time. Afterward, lifetime Legacy costs $149 one time. The date in your email is static; this countdown updates live. ORSA membership eligibility is verified separately."}</p>
      </CardContent>
    </Card>
  );
}