import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type ConfirmState = "confirming" | "confirmed" | "error";

export default function ActivationConfirmPage() {
  const [state, setState] = useState<ConfirmState>("confirming");
  const [errorMessage, setErrorMessage] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setErrorMessage("This confirmation link is invalid.");
      setState("error");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/heartplan/activation-requests/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMessage(data.error || "We couldn't confirm your report. Please try again.");
          setState("error");
          return;
        }
        setState("confirmed");
      } catch {
        setErrorMessage("We couldn't confirm your report. Please check your connection and try again.");
        setState("error");
      }
    })();
  }, []);

  return (
    <div className="family-shell min-h-[100dvh] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Heart className="h-5 w-5" />
            <span className="font-serif text-xl font-semibold">HeartPlan</span>
          </div>
        </div>

        <Card className="family-card">
          <CardContent className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center">
            {state === "confirming" && (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium">Confirming your report</p>
                <p className="text-sm text-muted-foreground">Please keep this page open for a moment.</p>
              </>
            )}
            {state === "confirmed" && (
              <>
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="font-medium" data-testid="text-confirm-success">Your report has been confirmed</p>
                <p className="text-sm text-muted-foreground">
                  Thank you. Our care team will review the report. We will contact you if we need anything else. No plan is activated until the review is complete.
                </p>
              </>
            )}
            {state === "error" && (
              <>
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <p className="font-medium" data-testid="text-confirm-error">We couldn't confirm your report</p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
                <Button asChild variant="outline" className="mt-2 min-h-12" data-testid="button-new-report">
                  <a href="/report-loss">Submit a new report</a>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Questions? Contact us at support@stepsafterlife.com.
        </p>
      </div>
    </div>
  );
}
