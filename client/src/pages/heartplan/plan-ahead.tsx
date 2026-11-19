import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Heart, Loader2, Sparkles, FileText, Landmark, Users, Mail, ShieldCheck,
} from "lucide-react";
import HeartPlanDashboard from "@/pages/heartplan/dashboard";

interface PlanStatus {
  eligible: boolean;
  hasPlan: boolean;
}

const HIGHLIGHTS = [
  { icon: Sparkles, title: "Your wishes", description: "Write down the kind of service and arrangements you would want." },
  { icon: FileText, title: "Important documents", description: "Keep your will, insurance, and other important papers together." },
  { icon: Landmark, title: "Property and accounts", description: "List what you have and add helpful details for your family." },
  { icon: Users, title: "People you trust", description: "Choose who our team should contact when the time comes." },
  { icon: Mail, title: "Messages for loved ones", description: "Prepare private written, audio, or video messages for later." },
];

// Entry point for existing family accounts: shows a start screen until they
// opt in, then renders the same HeartPlan dashboard planners use. Starting a
// plan never affects their access to the family case they already manage.
export default function PlanAheadPage() {
  const { toast } = useToast();
  const { data: status, isLoading } = useQuery<PlanStatus>({
    queryKey: ["/api/heartplan/status"],
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/heartplan/start");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      toast({ title: "Your HeartPlan is ready", description: "Start with your personal information, then work through each section at your own pace." });
    },
    onError: (error: any) => {
      toast({ title: "Couldn't start your HeartPlan", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status?.hasPlan) {
    return <HeartPlanDashboard />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-7 sm:p-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <h1 className="font-serif text-2xl font-semibold" data-testid="text-plan-ahead-title">
            Make a plan for your family
          </h1>
        </div>
        <p className="text-muted-foreground">
          You are already caring for someone you love. HeartPlan helps you write down your own
          wishes, documents, and messages so your family has clear guidance later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What you can add</CardTitle>
          <CardDescription>Go at your own pace. Your plan stays private until it is activated after your death.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {HIGHLIGHTS.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <item.icon className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-4">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          Starting your plan will not change the family case you manage today. You can open
          either one from the main menu.
        </p>
      </div>

      <Button
        size="lg"
        onClick={() => startMutation.mutate()}
        disabled={startMutation.isPending}
        data-testid="button-start-heartplan"
      >
        {startMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Heart className="h-4 w-4" />
        )}
        Start my plan
      </Button>
    </div>
  );
}
