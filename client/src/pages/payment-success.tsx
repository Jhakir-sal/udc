import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { SERVICE_PLANS } from "@shared/schema";

export default function PaymentSuccessPage() {
  const [status, setStatus] = useState<"verifying" | "paid" | "failed">("verifying");
  const [details, setDetails] = useState<{ deceasedName?: string; servicePlan?: string }>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setStatus("failed");
      return;
    }
    fetch(`/api/payment/verify?session_id=${encodeURIComponent(sessionId)}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.paid) {
          setDetails({ deceasedName: data.deceasedName, servicePlan: data.servicePlan });
          setStatus("paid");
          queryClient.invalidateQueries({ queryKey: ["/api/certificates"] });
        } else {
          setStatus("failed");
        }
      })
      .catch(() => setStatus("failed"));
  }, []);

  const plan = SERVICE_PLANS.find(p => p.value === details.servicePlan);

  return (
    <div className="family-shell min-h-[100dvh] flex items-center justify-center p-4 sm:p-6">
      <Card className="family-card max-w-md w-full">
        <CardContent className="p-8 text-center">
          {status === "verifying" && (
            <>
              <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
              <h1 className="text-xl font-serif font-semibold mb-2">Confirming your payment…</h1>
                <p className="text-muted-foreground text-sm">This usually takes a few seconds. Please keep this page open.</p>
            </>
          )}
          {status === "paid" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-xl font-serif font-semibold mb-2" data-testid="text-payment-success">
                Payment received — thank you
              </h1>
              <p className="text-muted-foreground text-sm mb-6" data-testid="text-payment-details">
                {plan ? `Your ${plan.label} Service Plan (${plan.display})` : "Your payment"}
                {details.deceasedName ? ` for ${details.deceasedName}` : ""} has been confirmed.
                  Your care team will continue with the next steps.
              </p>
              <Button asChild className="w-full min-h-12" data-testid="button-back-to-dashboard">
                <Link href="/">
                  Back to Dashboard
                </Link>
              </Button>
            </>
          )}
          {status === "failed" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h1 className="text-xl font-serif font-semibold mb-2" data-testid="text-payment-pending">
                Payment not confirmed yet
              </h1>
              <p className="text-muted-foreground text-sm mb-6">
                We couldn't confirm your payment. If you completed checkout, it may take a moment —
                please check your dashboard shortly or contact your concierge.
              </p>
              <Button asChild variant="outline" className="w-full min-h-12" data-testid="button-back-home">
                <Link href="/">
                  Back to Dashboard
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
