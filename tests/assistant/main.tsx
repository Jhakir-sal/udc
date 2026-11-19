import React, { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConciergeAssistant } from "@/components/concierge-assistant";
import { SallyChat } from "@/components/sally-chat";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "@/lib/queryClient";
import "@/index.css";

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};

function Harness() {
  // Same component instance receives a new case, as in the real case route.
  // Never key it by case: that would hide stale-response regressions.
  const caseId = useSyncExternalStore(subscribe, () =>
    new URLSearchParams(window.location.search).get("case") || "synthetic-case-a",
  );
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <h1>Synthetic case workspace</h1>
        <ConciergeAssistant
          certId={caseId}
          deceasedName={caseId === "synthetic-case-a" ? "Alex Synthetic" : "Blair Synthetic"}
        />
      </main>
      <SallyChat />
      <Toaster />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
