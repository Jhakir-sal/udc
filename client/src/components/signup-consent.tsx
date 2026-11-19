import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { HEARTPLAN_PRIVACY, HEARTPLAN_TCPA, HEARTPLAN_TERMS } from "@shared/heartPlanConsent";

interface SignupConsentProps {
  idPrefix: string;
  termsAccepted: boolean;
  onTermsChange: (value: boolean) => void;
  communicationsConsent: boolean;
  onCommunicationsChange: (value: boolean) => void;
}

export function SignupConsent({
  idPrefix, termsAccepted, onTermsChange, communicationsConsent, onCommunicationsChange,
}: SignupConsentProps) {
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Terms, privacy, and communications</legend>
      <div className="flex items-start gap-2.5">
        <Checkbox id={`${idPrefix}-terms`} checked={termsAccepted} onCheckedChange={(value) => onTermsChange(value === true)} className="mt-1" data-testid="checkbox-terms" />
        <Label htmlFor={`${idPrefix}-terms`} className="font-normal text-sm leading-5">
          <span className="mr-1.5 inline-block text-xs font-semibold text-muted-foreground">Required</span>
          I accept the <a href={HEARTPLAN_TERMS.path} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">Terms and Conditions</a> and acknowledge the <a href={HEARTPLAN_PRIVACY.path} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">Privacy Policy</a>.
        </Label>
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox id={`${idPrefix}-communications`} checked={communicationsConsent} onCheckedChange={(value) => onCommunicationsChange(value === true)} className="mt-1" data-testid="checkbox-communications" />
        <Label htmlFor={`${idPrefix}-communications`} className="font-normal text-sm leading-5">
          <span className="mr-1.5 inline-block text-xs font-semibold text-muted-foreground">Optional</span>
          I agree to the <a href={HEARTPLAN_TCPA.path} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">TCPA Disclosure</a>. {HEARTPLAN_TCPA.disclosure}
        </Label>
      </div>
    </fieldset>
  );
}