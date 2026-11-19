import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function OutreachUnsubscribe() {
  const token = window.location.pathname.split("/").pop() || "";
  const { toast } = useToast();
  const status = useQuery<{ unsubscribed: boolean }>({
    queryKey: [`/api/outreach/unsubscribe/${encodeURIComponent(token)}`],
    retry: false,
  });
  const unsubscribe = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/outreach/unsubscribe/${encodeURIComponent(token)}`)).json(),
    onSuccess: () => status.refetch(),
    onError: (error: Error) => toast({ title: "Could not unsubscribe", description: error.message, variant: "destructive" }),
  });
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Partnership emails</CardTitle>
        <CardDescription>Steps After Life</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /> :
          status.isError ? <p>This link is invalid or unavailable. Please contact Help@stepsafterlife.com.</p> :
          status.data?.unsubscribed ? <p>You have been unsubscribed from partnership emails. You will not receive further outreach from this list.</p> :
          <>
            <p>Do you want to stop receiving partnership emails from Steps After Life?</p>
            <Button onClick={() => unsubscribe.mutate()} disabled={unsubscribe.isPending}>
              {unsubscribe.isPending ? "Unsubscribing…" : "Unsubscribe"}
            </Button>
          </>}
      </CardContent>
    </Card>
  </main>;
}