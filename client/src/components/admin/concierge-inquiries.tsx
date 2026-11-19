import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Mail, Phone, RefreshCw } from "lucide-react";
import type { ConciergeInquiryRecord, ConciergeInquiryStatus } from "@shared/conciergeInquiry";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface InquiryPage { items: ConciergeInquiryRecord[]; hasMore: boolean }

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function ConciergeInquiries() {
  const [page, setPage] = useState(0);
  const queryKey = ["/api/admin/concierge-inquiries", page];
  const query = useQuery<InquiryPage>({
    queryKey,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/concierge-inquiries?page=${page}`);
      return response.json();
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ConciergeInquiryStatus }) => {
      const response = await apiRequest("PATCH", `/api/admin/concierge-inquiries/${encodeURIComponent(id)}`, { status });
      return response.json() as Promise<ConciergeInquiryRecord>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const items = query.data?.items || [];

  return <Card className="min-w-0 break-words">
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
      <div><CardTitle>Concierge requests</CardTitle><CardDescription>Inquiry contacts and email alert acceptance status. Accepted does not mean delivered.</CardDescription></div>
      <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
    </CardHeader>
    <CardContent>
      {query.isLoading ? <div className="space-y-3" aria-label="Loading concierge requests">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : query.isError ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5" role="alert"><div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" />Could not load concierge requests</div><p className="my-2 text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : "Please try again."}</p><Button type="button" variant="outline" onClick={() => query.refetch()}>Try again</Button></div>
          : items.length === 0 ? <div className="rounded-md border border-dashed p-10 text-center"><Mail className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><h3 className="font-medium">No requests on this page</h3><p className="mt-1 text-sm text-muted-foreground">{page > 0 ? "There are no more requests to show." : "New concierge inquiries will appear here."}</p></div>
            : <div className="space-y-3">{items.map(item => <article key={item.id} className="grid gap-4 rounded-md border border-border/80 p-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
              <div className="min-w-0"><p className="font-semibold">{item.name}</p><a className="inline-flex max-w-full items-center gap-1.5 truncate text-sm text-primary underline-offset-4 hover:underline" href={`mailto:${item.email}`}><Mail className="h-3.5 w-3.5 shrink-0" />{item.email}</a><a className="mt-1 flex w-fit items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline" href={`tel:${item.phone}`}><Phone className="h-3.5 w-3.5" />{item.phone}</a></div>
              <div className="text-sm"><p><span className="font-medium">Care location:</span> {item.careLocation || "Not provided"}</p><p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Best time:</span> {item.bestTime || "Not provided"}</p></div>
              <div className="space-y-2 text-sm"><p className="text-muted-foreground">{dateLabel(item.createdAt)}</p><Badge variant={item.notificationStatus === "accepted" ? "secondary" : item.notificationStatus === "failed" ? "destructive" : "outline"}>Email alert {item.notificationStatus}</Badge></div>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">Request status<select aria-label={`Status for ${item.name}`} value={item.status} disabled={update.isPending} onChange={event => update.mutate({ id: item.id, status: event.target.value as ConciergeInquiryStatus })} className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></label>
            </article>)}</div>}
      {update.isError && <p role="alert" className="mt-4 text-sm text-destructive">Could not update request status: {update.error instanceof Error ? update.error.message : "Please try again."}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-sm text-muted-foreground">Page {page + 1} · 50 requests per page</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0 || query.isFetching}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button type="button" variant="outline" size="sm" onClick={() => setPage(value => value + 1)} disabled={!query.data?.hasMore || query.isFetching}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
    </CardContent>
  </Card>;
}
