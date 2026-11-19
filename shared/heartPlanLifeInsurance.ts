export const LIFE_INSURANCE_COVERAGE_VALUES = ["yes", "no", "employer_only", "not_sure", "skipped"] as const;
export type LifeInsuranceCoverage = typeof LIFE_INSURANCE_COVERAGE_VALUES[number];

export const LIFE_INSURANCE_COVERAGE_OPTIONS = [
  { value: "yes", label: "Individual coverage (with or without employer coverage)" },
  { value: "employer_only", label: "Employer coverage only" },
  { value: "no", label: "No life insurance" },
  { value: "not_sure", label: "Not sure" },
  { value: "skipped", label: "Skip this question" },
] satisfies { value: LifeInsuranceCoverage; label: string }[];

// Official public information page, not a lead submission or policy application.
export const PRUDENTIAL_LIFE_INSURANCE_URL = "https://www.prudential.com/personal/life-insurance";

export function shouldSuggestPrudentialLifeInsurance(coverage?: string | null): boolean {
  return coverage === "no" || coverage === "employer_only";
}
