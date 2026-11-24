import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics";

export type HeartPlanSectionKey = "profile" | "wishes" | "documents" | "assets" | "contacts" | "letters";

function analyticsSection(section: HeartPlanSectionKey) {
  return section === "letters" ? "legacy_messages" as const : section;
}

const SECTIONS: Array<{ key: HeartPlanSectionKey; path: string }> = [
  { key: "profile", path: "/" },
  { key: "wishes", path: "/heartplan/wishes" },
  { key: "documents", path: "/heartplan/vault" },
  { key: "assets", path: "/heartplan/assets" },
  { key: "contacts", path: "/heartplan/contacts" },
  { key: "letters", path: "/heartplan/letters" },
];

function dashboardPath() {
  // Both planner and family routers expose this path, while only planner
  // accounts use "/" for their HeartPlan dashboard.
  return "/heartplan";
}

export function useSectionPageFocus<T extends HTMLElement>(isReady = true) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstControlRef = useRef<T>(null);

  useEffect(() => {
    if (!isReady) return;
    const frame = window.requestAnimationFrame(() => {
      // Aligning the heading to the viewport top puts it beneath the
      // authenticated app's sticky header. Start the page itself at the top
      // instead, regardless of whether the window or <main> owns the scroll.
      const main = headingRef.current?.closest("main");
      if (main) main.scrollTop = 0;
      window.scrollTo(0, 0);
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isReady]);

  return { headingRef, firstControlRef };
}

export function useHeartPlanAdvance(current: HeartPlanSectionKey) {
  const [, navigate] = useLocation();
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [saved, setSaved] = useState(false);

  const goToNextIncomplete = async (markCurrentComplete: boolean) => {
    setIsAdvancing(true);
    if (markCurrentComplete) {
      setSaved(true);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }

    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      const response = await apiRequest("GET", "/api/heartplan");
      const overview = await response.json() as { progress?: { sections?: Record<string, boolean> } };
      const currentIndex = SECTIONS.findIndex((section) => section.key === current);
      const next = SECTIONS
        .slice(currentIndex + 1)
        .find((section) => !overview.progress?.sections?.[section.key]);
      trackAnalyticsEvent("heartplan_section_nav", {
        section: analyticsSection(current),
        action: markCurrentComplete ? "continue" : "defer",
      });
      navigate(next?.path ?? dashboardPath());
    } finally {
      setIsAdvancing(false);
    }
  };

  return {
    saved,
    isAdvancing,
    advanceAfterSave: () => goToNextIncomplete(true),
    deferSection: () => goToNextIncomplete(false),
  };
}

interface SectionNavigationProps {
  section: HeartPlanSectionKey;
  onSave?: () => void;
  saveLabel?: string;
  isSaving?: boolean;
  canSave?: boolean;
  saved?: boolean;
  isAdvancing?: boolean;
  onDefer: () => void;
}

export function SectionNavigation({
  section,
  onSave,
  saveLabel = "Save and continue",
  isSaving = false,
  canSave = true,
  saved = false,
  isAdvancing = false,
  onDefer,
}: SectionNavigationProps) {
  const [, navigate] = useLocation();
  const index = SECTIONS.findIndex((item) => item.key === section);
  const previous = SECTIONS[index - 1];
  const busy = isSaving || isAdvancing;

  return (
    <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center" aria-live="polite">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => {
          trackAnalyticsEvent("heartplan_section_nav", { section: analyticsSection(section), action: "back" });
          navigate(!previous || previous.key === "profile" ? dashboardPath() : previous.path);
        }}
        disabled={busy}
        data-testid="button-section-back"
      >
        <ChevronLeft className="h-4 w-4 mr-2" />
        Go back
      </Button>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={onDefer}
          disabled={busy}
          data-testid="button-section-defer"
        >
          Save this for later
        </Button>
        {onSave && (
          <Button
            type="button"
            className="min-h-11"
            onClick={onSave}
            disabled={busy || !canSave}
            data-testid="button-section-save"
          >
            {busy && !saved && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {saved && <Check className="h-4 w-4 mr-2" />}
            {saved ? "Saved" : saveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}