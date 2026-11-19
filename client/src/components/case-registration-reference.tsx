import { caseRegistrationReference } from "@shared/caseRegistrationReference";

export function CaseRegistrationReference({ caseId }: { caseId?: string | null }) {
  if (!caseId) return null;
  return (
    <div className="min-w-0 text-center text-[10px] leading-tight text-muted-foreground sm:text-xs" data-testid="case-registration-reference">
      <span className="block">Account registration</span>
      <span className="block break-all font-mono font-semibold text-foreground" title="Case reference only; not proof of death">
        {caseRegistrationReference(caseId)}
      </span>
    </div>
  );
}