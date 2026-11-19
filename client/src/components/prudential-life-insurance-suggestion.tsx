import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import prudentialLogo from "@/assets/prudential-logo.svg";
import { PRUDENTIAL_LIFE_INSURANCE_URL, shouldSuggestPrudentialLifeInsurance } from "@shared/heartPlanLifeInsurance";

type PrudentialLifeInsuranceSuggestionProps = {
  coverage: string | null | undefined;
  className?: string;
};

export function PrudentialLifeInsuranceSuggestion({ coverage, className }: PrudentialLifeInsuranceSuggestionProps) {
  if (!shouldSuggestPrudentialLifeInsurance(coverage)) return null;

  const employerOnly = coverage === "employer_only";
  return (
    <Card className={`border-primary/20 bg-primary/[0.035] ${className ?? ""}`} data-testid="card-prudential-life-insurance-suggestion">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">An optional resource for your family</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {employerOnly
                ? "Workplace coverage can change or end when you change jobs. It may be useful to review your policy terms and learn what other options are available."
                : "If you’d like, you can explore information about life insurance as one possible way to plan for your family."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-primary/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <img src={prudentialLogo} alt="Prudential" className="h-7 w-auto max-w-[125px]" />
            <span className="sr-only">Life insurance information</span>
          </div>
          <a
            href={PRUDENTIAL_LIFE_INSURANCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-md border border-primary/25 bg-background px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
            data-testid="link-prudential-life-insurance"
          >
            Explore life insurance with Prudential
            <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Completely optional. No insurance purchase is required to use HeartPlan. SAL does not send your signup answers or HeartPlan details through this link. Prudential’s privacy policy applies on its site. This is not insurance advice or a guarantee of coverage; availability, eligibility, and underwriting terms apply.
        </p>
      </CardContent>
    </Card>
  );
}
