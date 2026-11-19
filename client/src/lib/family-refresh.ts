/**
 * Refresh only mounted family-facing queries. TanStack pauses interval fetching
 * in hidden tabs/offline and rechecks immediately when the family returns.
 * Keep global/admin cache behavior unchanged.
 */
export const FAMILY_REFRESH_MS = 5_000;

export const familyRefreshOptions = {
  staleTime: FAMILY_REFRESH_MS,
  refetchInterval: FAMILY_REFRESH_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
  refetchOnMount: "always",
} as const;
