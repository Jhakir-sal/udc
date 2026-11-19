import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, CloudOff, LoaderCircle, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FamilyUpdateQuery = {
  dataUpdatedAt: number;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

export interface FamilyUpdateStatusProps {
  queries: FamilyUpdateQuery[];
  className?: string;
}

const STALE_AFTER_MS = 20_000;
const CLOCK_TICK_MS = 5_000;

function formatCheckedAt(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function FamilyUpdateStatus({ queries, className }: FamilyUpdateStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [isCheckingNow, setIsCheckingNow] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const successfulTimestamps = useMemo(
    () => queries.map((query) => query.dataUpdatedAt).filter((timestamp) => timestamp > 0),
    [queries],
  );
  const lastChecked = successfulTimestamps.length === queries.length && queries.length > 0
    ? Math.min(...successfulTimestamps)
    : null;
  const isFetching = queries.some((query) => query.isFetching);
  const hasError = queries.some((query) => query.isError);
  const isStale = lastChecked !== null && now - lastChecked > STALE_AFTER_MS;

  const checkNow = useCallback(async () => {
    if (isCheckingNow) return;
    setIsCheckingNow(true);
    try {
      await Promise.allSettled(queries.map((query) => Promise.resolve().then(() => query.refetch())));
    } finally {
      setIsCheckingNow(false);
      setNow(Date.now());
    }
  }, [isCheckingNow, queries]);

  const isBusy = isCheckingNow || isFetching;
  const isDelayed = hasError || isStale;
  const statusText = !online
    ? "You’re offline"
    : isDelayed
      ? "Updates delayed"
      : lastChecked === null
        ? "Checking for updates"
        : "Updates checked";
  const StatusIcon = !online ? CloudOff : isDelayed ? CircleAlert : isBusy || lastChecked === null ? LoaderCircle : Check;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border/80 bg-muted/35 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4",
        className,
      )}
      aria-label="Family case update status"
      data-testid="family-update-status"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            !online ? "bg-muted text-muted-foreground" : isDelayed ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary",
          )}
          aria-hidden="true"
        >
          <StatusIcon className={cn("h-4 w-4", (isBusy || lastChecked === null) && online && !isDelayed && "animate-spin")} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5">{statusText}</p>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
            {!online ? "Reconnect to check the latest case details." : isDelayed ? "Previous information is still available, but may be outdated." : lastChecked === null ? "Checking your case information across all sections." : `Last checked ${formatCheckedAt(lastChecked, now)}. Refreshes automatically every 5 seconds.`}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10 w-full shrink-0 sm:w-auto"
        onClick={checkNow}
        disabled={!online || isBusy || queries.length === 0}
        aria-label={isBusy ? "Checking for updates" : "Check for updates now"}
        data-testid="button-family-check-updates"
      >
        {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : online ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <Wifi className="h-4 w-4" aria-hidden="true" />}
        <span>{isBusy ? "Checking…" : "Check now"}</span>
      </Button>
    </section>
  );
}
