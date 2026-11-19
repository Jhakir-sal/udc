import { useState } from "react";
import { Calculator, Info, Sparkles } from "lucide-react";
import {
  DEMO_VALUATION_CONDITIONS,
  DEMO_VALUATION_ITEMS,
  getDemoAssetEstimate,
} from "@shared/demoAssetValuation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const INITIAL_ITEM = DEMO_VALUATION_ITEMS[0].id;
const INITIAL_CONDITION = DEMO_VALUATION_CONDITIONS[1].id;
type Estimate = ReturnType<typeof getDemoAssetEstimate>;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function DemoValueEstimator({ variant = "button" }: { variant?: "button" | "card" }) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState<string>(INITIAL_ITEM);
  const [conditionId, setConditionId] = useState<string>(INITIAL_CONDITION);
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  const reset = () => {
    setItemId(INITIAL_ITEM);
    setConditionId(INITIAL_CONDITION);
    setEstimate(null);
  };

  const launch = () => {
    reset();
    setOpen(true);
  };

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  return (
    <>
      {variant === "card" ? (
        <Card className="border-primary/20 bg-primary/[.035] shadow-sm">
          <CardHeader className="pb-3">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calculator className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle className="font-serif text-2xl">Try the AI value estimator demo</CardTitle>
            <CardDescription className="max-w-2xl leading-6">
              Explore how an illustrative estimate is presented using fictional items. No personal details are needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              This is a scripted demo, not a live AI estimate, appraisal, market lookup, or verified sale.
            </p>
            <Button onClick={launch} data-testid="demo-value-estimator-launcher" className="shrink-0">
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Try the estimator
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={launch}
          variant="outline"
          size="sm"
          data-testid="demo-value-estimator-launcher"
          className="shrink-0"
        >
          <Calculator className="mr-1.5 h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">AI value estimator</span>
          <span className="sm:hidden">AI estimator</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90dvh] w-[92vw] max-w-2xl overflow-y-auto p-5 sm:w-full sm:p-7">
          <DialogHeader className="pr-7 text-left">
            <Badge variant="secondary" className="w-fit">Synthetic demo</Badge>
            <DialogTitle className="mt-2 font-serif text-2xl sm:text-3xl">
              AI value estimator demo
            </DialogTitle>
            <DialogDescription className="leading-6">
              See how a simple estimate could be organized for a family conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50/75 p-3.5 text-sm leading-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <strong>Illustrative results only.</strong> This demo uses scripted examples, not live AI, an appraisal, live market lookup, or verified sales. Do not use these figures to make financial decisions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="demo-estimator-item">Fictional sample item</Label>
              <select
                id="demo-estimator-item"
                data-testid="demo-value-estimator-item"
                value={itemId}
                onChange={(event) => {
                  setItemId(event.target.value);
                  setEstimate(null);
                }}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DEMO_VALUATION_ITEMS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-estimator-condition">Condition</Label>
              <select
                id="demo-estimator-condition"
                data-testid="demo-value-estimator-condition"
                value={conditionId}
                onChange={(event) => {
                  setConditionId(event.target.value);
                  setEstimate(null);
                }}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DEMO_VALUATION_CONDITIONS.map((condition) => (
                  <option key={condition.id} value={condition.id}>{condition.label}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            {DEMO_VALUATION_ITEMS.find((item) => item.id === itemId)?.description}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setEstimate(getDemoAssetEstimate(itemId, conditionId))}
              data-testid="demo-value-estimator-show"
              className="flex-1 sm:flex-none"
            >
              Show sample estimate
            </Button>
            <Button variant="outline" onClick={reset} data-testid="demo-value-estimator-reset">
              Start over
            </Button>
          </div>

          {estimate && (
            <section
              aria-live="polite"
              aria-labelledby="demo-estimator-result-title"
              data-testid="demo-value-estimator-results"
              className="space-y-4 rounded-2xl border border-primary/20 bg-card p-4 sm:p-5"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Scripted sample result</p>
                <h3 id="demo-estimator-result-title" className="mt-1 font-serif text-xl font-semibold">
                  {estimate.item.name} · {estimate.condition} condition
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/70 p-3.5">
                  <p className="text-xs text-muted-foreground">Illustrative range</p>
                  <p className="mt-1 font-semibold tabular-nums">{money(estimate.lowCents)}–{money(estimate.highCents)}</p>
                </div>
                <div className="rounded-xl bg-primary/5 p-3.5">
                  <p className="text-xs text-muted-foreground">Range midpoint</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{money(estimate.midpointCents)}</p>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3.5">
                  <p className="text-xs text-muted-foreground">Optional purchase target · 80% of midpoint</p>
                  <p className="mt-1 font-semibold tabular-nums">{money(estimate.purchaseTargetCents)}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/80 p-4">
                <p className="text-sm font-semibold">Evidence still needed</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-muted-foreground">
                  {estimate.item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                </ul>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {estimate.source}. These figures are not a valuation, appraisal, market lookup, or verified sale evidence.
              </p>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
