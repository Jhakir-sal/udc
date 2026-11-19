import { useMutation, useQuery } from "@tanstack/react-query";
import { PRIORITY_COMPANY_REPORTING_RESEARCH } from "@shared/companyReportingResearch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DirectoryEntry = { id: string; name: string; officialDomain: string; source?: string | null; notes?: string | null };

export function CompanyReportingResearch() {
  const { toast } = useToast();
  // Unfiltered directory: search results must not make an existing company appear missing.
  const directory = useQuery<DirectoryEntry[]>({ queryKey: ["/api/admin/company-directory"] });
  const record = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/company-directory/priority-research", { confirm: "record-research-only" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/company-directory"] });
      toast({ title: "Research recorded", description: "Missing companies added; existing details preserved. Nothing sent and no routing approved." });
    },
    onError: (error: Error) => toast({ title: "Research could not be recorded", description: error.message, variant: "destructive" }),
  });
  return <Card>
    <CardHeader>
      <CardTitle>Priority companies: official reporting methods</CardTitle>
      <CardDescription>
        Source-checked October 18, 2026. All findings remain pending staff routing review.
        No accepted death-reporting email was found in these sources. Phone, portal, branch and mail instructions are not email approval.
        This is directory research only: notices remain case-by-case with explicit send confirmation, and documents still need separate release approval.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Review the eight findings below, then record them. This adds missing companies and fills only empty source/notes fields; it never replaces existing records, email addresses or routing decisions. Where staff notes already exist, these findings remain available here separately.</p>
      {directory.isError && <p role="alert" className="text-sm text-destructive">Could not load directory status. Retry before recording research.</p>}
      <Button disabled={directory.isLoading || directory.isError || record.isPending} onClick={() => {
        if (window.confirm("Record research for these eight companies? Missing companies will be added, existing details preserved, and only empty source/notes fields filled. No routing approval, outreach or document release will occur.")) record.mutate();
      }}>{record.isPending ? "Recording…" : "Record reviewed research and add missing companies"}</Button>
      <div className="grid gap-3 md:grid-cols-2">
        {PRIORITY_COMPANY_REPORTING_RESEARCH.map((research) => {
          const entry = directory.data?.find((company) => company.officialDomain.toLowerCase() === research.officialDomain);
          return <details className="rounded-lg border p-4" key={research.officialDomain}>
            <summary className="cursor-pointer font-medium">{research.name}<span className="mt-1 block text-xs font-normal text-muted-foreground">{directory.isSuccess ? entry ? "In directory" : "Missing — will be added" : "Directory status unavailable"} · Research pending staff review · Not email-ready</span></summary>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="font-medium">Checked</dt><dd>{research.checkedOn}</dd></div>
              <div><dt className="font-medium">Department</dt><dd>{research.department}</dd></div>
              <div><dt className="font-medium">Official channels</dt><dd>{research.channels}</dd></div>
              <div><dt className="font-medium">Documents and information</dt><dd>{research.documents}</dd></div>
              <div><dt className="font-medium">Limits / staff confirmation needed</dt><dd>{research.limitations}</dd></div>
              <div><dt className="font-medium">Official sources</dt><dd><ul className="space-y-2">{research.sources.map((source) => <li key={source.url}><a className="text-primary underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul></dd></div>
              {entry?.source && <div><dt className="font-medium">Saved directory source (preserved)</dt><dd className="whitespace-pre-wrap break-words">{entry.source}</dd></div>}
              {entry?.notes && <div><dt className="font-medium">Saved directory notes (preserved)</dt><dd className="whitespace-pre-wrap break-words">{entry.notes}</dd></div>}
            </dl>
          </details>;
        })}
      </div>
    </CardContent>
  </Card>;
}
