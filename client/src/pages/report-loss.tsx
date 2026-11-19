import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, MailCheck } from "lucide-react";

export default function ReportLossPage() {
  const { toast } = useToast();
  const [plannerName, setPlannerName] = useState("");
  const [plannerEmail, setPlannerEmail] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/heartplan/activation-requests", {
        plannerName: plannerName.trim(),
        plannerEmail: plannerEmail.trim(),
        requesterName: requesterName.trim(),
        requesterEmail: requesterEmail.trim(),
        requesterPhone: requesterPhone.trim() || undefined,
        message: message.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: (error: any) => {
      toast({
        title: "Could not submit report",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plannerName.trim() || !plannerEmail.trim() || !requesterName.trim() || !requesterEmail.trim()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  };

  return (
    <div className="family-shell min-h-[100dvh] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 py-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Heart className="h-5 w-5" />
            <span className="font-serif text-xl font-semibold">HeartPlan</span>
          </div>
        </div>

        {submitted ? (
          <Card className="family-card">
            <CardContent className="p-6 sm:p-8 flex flex-col items-center gap-4 text-center">
              <MailCheck className="h-10 w-10 text-primary" />
              <p className="font-medium" data-testid="text-report-submitted">Please check your email</p>
              <p className="text-sm text-muted-foreground">
                If the details match a HeartPlan, we sent a confirmation email to the address on file. Open that email and select the link to confirm your report.
              </p>
              <p className="text-xs text-muted-foreground">
                If you do not see it soon, check your spam folder. Make sure you used the email address listed in their plan.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="family-card">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Tell us about a loss</CardTitle>
              <CardDescription>
                We are sorry for your loss. Use this form if they made a HeartPlan and named you as a trusted contact. We will email you a link to confirm the report before our care team reviews it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="plannerName">Their full name *</Label>
                  <Input id="plannerName" value={plannerName} maxLength={200}
                    onChange={(e) => setPlannerName(e.target.value)}
                    placeholder="Name of the person who passed away"
                    data-testid="input-planner-name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plannerEmail">Their email address *</Label>
                  <Input id="plannerEmail" type="email" value={plannerEmail} maxLength={255}
                    onChange={(e) => setPlannerEmail(e.target.value)}
                    placeholder="The email they used for their HeartPlan"
                    data-testid="input-planner-email" />
                </div>
                <div className="border-t pt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="requesterName">Your full name *</Label>
                    <Input id="requesterName" value={requesterName} maxLength={200}
                      onChange={(e) => setRequesterName(e.target.value)}
                      data-testid="input-requester-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="requesterEmail">Your email address *</Label>
                    <Input id="requesterEmail" type="email" value={requesterEmail} maxLength={255}
                      onChange={(e) => setRequesterEmail(e.target.value)}
                      placeholder="The email the planner has on file for you"
                      data-testid="input-requester-email" />
                    <p className="text-xs text-muted-foreground">
                      This must match the email address on their trusted contact list.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="requesterPhone">Your phone number</Label>
                    <Input id="requesterPhone" type="tel" value={requesterPhone} maxLength={50}
                      onChange={(e) => setRequesterPhone(e.target.value)}
                      placeholder="Optional"
                      data-testid="input-requester-phone" />
                  </div>
                  <div className="space-y-1.5">
                  <Label htmlFor="message">What else should we know?</Label>
                    <Textarea id="message" value={message} maxLength={2000} rows={3}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Optional — e.g. date of passing, how to reach you"
                      data-testid="input-report-message" />
                  </div>
                </div>
                <Button type="submit" className="w-full min-h-12" disabled={submitMutation.isPending}
                  data-testid="button-submit-report">
                  {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send report
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Nothing happens automatically. We confirm every report by email and review it before we activate a plan.
        </p>
      </div>
    </div>
  );
}
