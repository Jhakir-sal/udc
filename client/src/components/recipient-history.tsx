import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { OutreachHistory } from "@shared/outreachTracking";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw } from "lucide-react";

function historyDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

export function RecipientHistory({ contactId, contactName }: { contactId: string; contactName: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (open) setPage(1);
  }, [open, contactId]);

  const history = useQuery<OutreachHistory>({
    queryKey: ["/api/admin/outreach/contacts", contactId, "history", page],
    queryFn: async () => (await apiRequest("GET", `/api/admin/outreach/contacts/${encodeURIComponent(contactId)}/history?page=${page}`)).json() as Promise<OutreachHistory>,
    enabled: open,
  });
  const totalPages = history.data ? Math.max(1, Math.ceil(history.data.total / history.data.pageSize)) : 1;

  return <>
    <Button type="button" size="sm" variant="outline" data-testid={`outreach-history-open-${contactId}`} onClick={() => setOpen(true)}>View history</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-testid="outreach-history-dialog" className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Outreach history</DialogTitle>
          <DialogDescription>Previous delivery attempts for {contactName}. “Sent” means accepted by the provider, not confirmed in the recipient’s inbox.</DialogDescription>
        </DialogHeader>
        {history.isLoading && <div className="py-10 text-center text-sm text-muted-foreground" role="status">Loading delivery history…</div>}
        {history.isError && <Alert variant="destructive">
          <AlertTitle>History could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">{history.error instanceof Error ? history.error.message : "Please try again."}
            <Button type="button" size="sm" variant="outline" onClick={() => history.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
          </AlertDescription>
        </Alert>}
        {history.data && history.data.total === 0 && <div data-testid="outreach-history-empty" className="rounded-md border border-dashed px-4 py-10 text-center">
          <p className="font-medium">No delivery history</p>
          <p className="mt-1 text-sm text-muted-foreground">There are no recorded attempts for this contact.</p>
        </div>}
        {history.data && history.data.total > 0 && <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Subject</TableHead><TableHead>Template</TableHead><TableHead>Sender</TableHead></TableRow></TableHeader>
              <TableBody>{history.data.deliveries.map((delivery) => <TableRow key={delivery.id}>
                <TableCell className="font-medium">{delivery.status}</TableCell>
                <TableCell className="min-w-40 text-sm">{historyDate(delivery.sentAt || delivery.createdAt)}</TableCell>
                <TableCell className="min-w-48">{delivery.subject || "—"}</TableCell>
                <TableCell className="min-w-36">{delivery.templateLabel || "Archived template"}</TableCell>
                <TableCell className="min-w-44 break-all text-sm">{delivery.senderEmail || "—"}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Page {history.data.page} of {totalPages} · {history.data.total} attempt{history.data.total === 1 ? "" : "s"}</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={page <= 1 || history.isFetching} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <Button type="button" size="sm" variant="outline" disabled={page >= totalPages || history.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
