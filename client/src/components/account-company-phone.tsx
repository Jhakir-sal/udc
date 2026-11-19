import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Globe2, Phone, RefreshCw, Search } from "lucide-react";
import type { AccountCompanyPhoneResult } from "@shared/accountCompanyPhone";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

interface AccountCompanyPhoneProps {
  accountId: string | number;
  accountName: string;
  accountType?: string;
}

function endpointFor(accountId: string | number) {
  return `/api/accounts/${encodeURIComponent(String(accountId))}/company-phone`;
}

function errorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) return error.message;
  return null;
}

function isHttpWebsite(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("?") || trimmed.includes("#")) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:"
      && !!url.hostname
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && (!url.port || url.port === "443");
  } catch {
    return false;
  }
}

function friendlyDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function AccountCompanyPhone({ accountId, accountName, accountType = "" }: AccountCompanyPhoneProps) {
  const queryClientForComponent = useQueryClient();
  const endpoint = endpointFor(accountId);
  const queryKey = [endpoint, accountName, accountType] as const;
  const identity = JSON.stringify([String(accountId), accountName, accountType]);
  const identityRef = useRef(identity);
  const requestSequenceRef = useRef(0);
  if (identityRef.current !== identity) {
    identityRef.current = identity;
    requestSequenceRef.current += 1;
  }
  const [form, setForm] = useState({
    identity,
    website: "",
    confirmed: false,
    editingWebsite: false,
  });
  if (form.identity !== identity) {
    setForm({ identity, website: "", confirmed: false, editingWebsite: false });
  }
  const currentForm = form.identity === identity
    ? form
    : { identity, website: "", confirmed: false, editingWebsite: false };

  const phoneQuery = useQuery<AccountCompanyPhoneResult>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", endpoint)).json(),
    retry: false,
    staleTime: 15 * 60 * 1000,
  });

  type LookupVariables = {
    endpoint: string;
    identity: string;
    requestId: number;
    queryKey: readonly [string, string, string];
    body: { officialWebsite?: string; confirmedOfficialWebsite?: true };
  };

  const lookupMutation = useMutation({
    mutationFn: async (variables: LookupVariables) => {
      const response = await apiRequest("POST", variables.endpoint, variables.body);
      return response.json() as Promise<AccountCompanyPhoneResult>;
    },
    onSuccess: (result, variables) => {
      queryClientForComponent.setQueryData(variables.queryKey, result);
      if (
        identityRef.current === variables.identity
        && requestSequenceRef.current === variables.requestId
        && result.status === "verified"
      ) {
        setForm((current) => current.identity === variables.identity
          ? { ...current, website: "", confirmed: false, editingWebsite: false }
          : current);
      }
    },
  });

  const mutationVariables = lookupMutation.variables;
  const mutationIsCurrent = mutationVariables?.identity === identity
    && mutationVariables?.requestId === requestSequenceRef.current;
  const activeMutationPending = mutationIsCurrent && lookupMutation.isPending;
  const activeMutationError = mutationIsCurrent && lookupMutation.isError;
  const result = phoneQuery.isError || activeMutationError ? undefined : phoneQuery.data;
  const date = friendlyDate(result?.verifiedAt ?? null);
  const canManage = phoneQuery.data?.canManage === true;
  const websiteIsValid = isHttpWebsite(currentForm.website);
  const lookupError = (activeMutationError ? errorMessage(lookupMutation.error) : null)
    ?? errorMessage(phoneQuery.error);

  const updateForm = (patch: Partial<Omit<typeof currentForm, "identity">>) => {
    setForm((current) => current.identity === identity ? { ...current, ...patch } : current);
  };

  const launchLookup = (body: LookupVariables["body"]) => {
    lookupMutation.reset();
    const requestId = ++requestSequenceRef.current;
    updateForm({ confirmed: false });
    lookupMutation.mutate({ endpoint, identity, requestId, queryKey, body });
  };

  return (
    <div
      className="mt-1 min-w-0 max-w-full space-y-1 text-xs"
      data-testid={`account-company-phone-${accountId}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      aria-live="polite"
    >
      {phoneQuery.isLoading ? (
        <p className="text-muted-foreground">Checking company phone…</p>
      ) : result?.status === "verified" && result.phone ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={`tel:${result.phone}`}
              className="inline-flex min-w-0 items-center gap-1 font-medium text-primary hover:underline"
              data-testid={`link-company-call-${accountId}`}
            >
              <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="break-all">{result.phone}</span>
              <span className="sr-only">Call {result.companyName || accountName}</span>
            </a>
            {result.sourceUrl && (
              <a
                href={result.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                data-testid={`company-phone-source-${accountId}`}
              >
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{result.sourceKind === "staff_confirmed" ? "Website confirmed by staff" : "Company directory website"}</span>
              </a>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            {date && <span>Checked {date}</span>}
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs"
                disabled={activeMutationPending}
                onClick={() => launchLookup({})}
                data-testid={`button-recheck-company-phone-${accountId}`}
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${activeMutationPending ? "animate-spin" : ""}`} />
                Recheck
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="font-medium text-muted-foreground">No verified phone available</p>
          {(result?.message || lookupError) && (
            <p className="min-w-0 break-words text-muted-foreground">{result?.message || lookupError}</p>
          )}
          {phoneQuery.isError && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => {
                lookupMutation.reset();
                phoneQuery.refetch();
              }}
              data-testid={`button-retry-company-phone-${accountId}`}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          )}
          {canManage && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  disabled={activeMutationPending}
                  onClick={() => launchLookup({})}
                  data-testid={`button-find-company-phone-${accountId}`}
                >
                  <Search className="mr-1 h-3 w-3" />
                  {activeMutationPending ? "Checking…" : "Check again"}
                </Button>
                {!currentForm.editingWebsite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs"
                    disabled={activeMutationPending}
                    onClick={() => updateForm({ editingWebsite: true })}
                    data-testid={`button-use-company-website-${accountId}`}
                  >
                    <Globe2 className="mr-1 h-3 w-3" />
                    Use official website
                  </Button>
                )}
              </div>
              {currentForm.editingWebsite && (
                <div className="max-w-sm space-y-1.5">
                  <Input
                    type="url"
                    value={currentForm.website}
                    disabled={activeMutationPending}
                    onChange={(event) => updateForm({ website: event.target.value, confirmed: false })}
                    placeholder="https://company.example"
                    className="h-8 text-xs"
                    data-testid={`input-company-website-${accountId}`}
                  />
                  <label className="flex cursor-pointer items-start gap-2 text-muted-foreground">
                    <Checkbox
                      checked={currentForm.confirmed}
                      disabled={activeMutationPending}
                      onCheckedChange={(checked) => updateForm({ confirmed: checked === true })}
                      className="mt-0.5"
                      data-testid={`checkbox-company-website-${accountId}`}
                    />
                    <span>I checked that this is the company’s official website</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!websiteIsValid || !currentForm.confirmed || activeMutationPending}
                      onClick={() => {
                        launchLookup({
                          officialWebsite: currentForm.website.trim(),
                          confirmedOfficialWebsite: true,
                        });
                      }}
                      data-testid={`button-confirm-company-website-${accountId}`}
                    >
                      {activeMutationPending ? "Checking…" : "Confirm and check"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={activeMutationPending}
                      onClick={() => {
                        updateForm({ editingWebsite: false, website: "", confirmed: false });
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
