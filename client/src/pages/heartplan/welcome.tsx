import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, ShieldCheck, Store } from "lucide-react";
import { LIFE_INSURANCE_COVERAGE_OPTIONS } from "@shared/heartPlanLifeInsurance";
import { PrudentialLifeInsuranceSuggestion } from "@/components/prudential-life-insurance-suggestion";

type Answers = {
  firstName: string; lastName: string; relationshipStatus: string;
  hasChildrenOrDependents: string; phoneType: string; hasWillOrTrust: string;
  hasPowerOfAttorney: string; hasHealthcareDirective: string; hasLifeInsurance: string;
  hasInvestmentAccounts: string; hasTollAccounts: string; hasStorageUnit: string;
  hasBettingApps: string; hasCryptoApps: string; hasFinalArrangementPlans: string;
  hasPrepaidFuneralPlan: string;
};
type IntakeResponse = { intake: (Partial<Answers> & { currentStep?: number; completedAt?: string; skippedAt?: string }) | null; profile: { firstName: string; lastName: string }; required: boolean };
const EMPTY: Answers = { firstName: "", lastName: "", relationshipStatus: "", hasChildrenOrDependents: "", phoneType: "", hasWillOrTrust: "", hasPowerOfAttorney: "", hasHealthcareDirective: "", hasLifeInsurance: "", hasInvestmentAccounts: "", hasTollAccounts: "", hasStorageUnit: "", hasBettingApps: "", hasCryptoApps: "", hasFinalArrangementPlans: "", hasPrepaidFuneralPlan: "" };
const CHOICES = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_sure", label: "Not sure" }, { value: "skipped", label: "Skip this question" }];
const STEP_QUESTION_KEYS: Record<number, (keyof Answers)[]> = {
  1: ["relationshipStatus", "hasChildrenOrDependents", "phoneType"],
  2: ["hasWillOrTrust", "hasPowerOfAttorney", "hasHealthcareDirective"],
  3: ["hasLifeInsurance", "hasInvestmentAccounts", "hasTollAccounts", "hasStorageUnit", "hasBettingApps", "hasCryptoApps", "hasFinalArrangementPlans", "hasPrepaidFuneralPlan"],
};

function Choice({ name, value, onChange, options = CHOICES }: { name: string; value: string; onChange: (v: string) => void; options?: { value: string; label: string }[] }) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = buttons[(current + direction + buttons.length) % buttons.length];
    next?.focus();
    next?.click();
  };
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={name} onKeyDown={handleKeyDown}>
    {options.map((option, index) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
      tabIndex={value === option.value || (!value && index === 0) ? 0 : -1}
      onClick={() => onChange(option.value)}
      data-testid={`choice-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${option.value}`}
      className={`min-h-12 rounded-md border px-4 py-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === option.value ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted"}`}>
      {option.label}
    </button>)}
  </div>;
}

export default function HeartPlanWelcome() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { data, isLoading } = useQuery<IntakeResponse>({ queryKey: ["/api/heartplan/intake"] });
  const [answers, setAnswers] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (data && !loaded) {
      const savedAnswers = Object.fromEntries(
        Object.keys(EMPTY).map(key => [key, data.intake?.[key as keyof Answers] ?? ""])
      ) as Answers;
      setAnswers({
        ...EMPTY,
        ...savedAnswers,
        firstName: data.intake?.firstName ?? data.profile.firstName,
        lastName: data.intake?.lastName ?? data.profile.lastName,
      });
      setStep(data.intake?.completedAt || data.intake?.skippedAt ? 0 : Math.min(data.intake?.currentStep ?? 0, 3));
      setLoaded(true);
    }
  }, [data, loaded]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);
  const set = (key: keyof Answers, value: string) => setAnswers(a => ({ ...a, [key]: value }));
  const answerAndAdvance = (key: keyof Answers, value: string) => {
    set(key, value);
    const questions = STEP_QUESTION_KEYS[step] || [];
    const nextKey = questions[questions.indexOf(key) + 1];
    if (!nextKey) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const nextQuestion = document.querySelector<HTMLElement>(`[data-question-key="${nextKey}"]`);
      nextQuestion?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
      nextQuestion?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus({ preventScroll: true });
    }));
  };
  const requestAnswers = () => Object.fromEntries(
    Object.entries(answers).filter(([, value]) => value !== "")
  );
  const save = useMutation({
    mutationFn: async (body: object) => (await apiRequest("PUT", "/api/heartplan/intake", body)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/heartplan/intake"] });
    },
    onError: (error: any) => toast({ title: "We couldn't save your answers", description: error.message, variant: "destructive" }),
  });
  const next = async () => {
    if (step === 0 && (!answers.firstName.trim() || !answers.lastName.trim())) {
      toast({ title: "Please add your name", description: "First and last name are needed to identify your plan.", variant: "destructive" }); return;
    }
    try {
      if (step < 3) {
        await save.mutateAsync({ ...requestAnswers(), currentStep: step + 1 });
        setStep(step + 1);
      } else {
        await save.mutateAsync({ ...requestAnswers(), currentStep: 4, complete: true });
        toast({ title: "Your welcome answers are saved", description: "We've put the most useful next steps first. You can change these answers anytime." });
        navigate("/");
      }
    } catch { /* The mutation callback presents the error. */ }
  };
  const goToNextStep = async (destination: string) => {
    try {
      await save.mutateAsync({ ...requestAnswers(), currentStep: step });
      navigate(destination);
    } catch { /* The mutation callback presents the error. */ }
  };
  const skip = async () => {
    try {
      await save.mutateAsync({ ...requestAnswers(), currentStep: step, skip: true });
      navigate("/");
    } catch { /* The mutation callback presents the error. */ }
  };
  if (isLoading || !loaded) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  const editing = !!(data?.intake?.completedAt || data?.intake?.skippedAt);
  return <main className="mx-auto max-w-2xl px-4 py-6 sm:p-6">
    <div className="mb-6 space-y-2">
      <p className="text-sm font-medium text-primary">{editing ? "Review your answers" : `Welcome · Step ${step + 1} of 4`}</p>
      <Progress value={(step + 1) * 25} aria-label={`Step ${step + 1} of 4`} />
    </div>
    <Card>
      <CardHeader>
        <CardTitle ref={headingRef} tabIndex={-1} className="font-serif text-2xl outline-none">
          {["Let’s get to know you", "Who is part of your life?", "Documents you may already have", "Financial and final plans"][step]}
        </CardTitle>
        <CardDescription>
          {step === 0 ? "We use your name to identify your plan. The remaining questions are optional." : "Choose what fits today, select Not sure, or skip any personal question. This is planning guidance, not legal, tax, insurance, or investment advice."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 0 && <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="welcome-first-name">First name</Label><Input id="welcome-first-name" autoComplete="given-name" value={answers.firstName} onChange={e => set("firstName", e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="welcome-last-name">Last name</Label><Input id="welcome-last-name" autoComplete="family-name" value={answers.lastName} onChange={e => set("lastName", e.target.value)} /></div>
        </div>}
        {step === 1 && <>
          <Question questionKey="relationshipStatus" title="What is your relationship status?"><Choice name="Relationship status" value={answers.relationshipStatus} onChange={v => answerAndAdvance("relationshipStatus", v)} options={[{value:"single",label:"Single"},{value:"partnered",label:"Partnered"},{value:"married",label:"Married"},{value:"separated",label:"Separated"},{value:"divorced",label:"Divorced"},{value:"widowed",label:"Widowed"},{value:"prefer_not_to_say",label:"Prefer not to say"}]} /></Question>
          <Question questionKey="hasChildrenOrDependents" title="Do you have children or anyone who depends on you?"><Choice name="Children or dependents" value={answers.hasChildrenOrDependents} onChange={v => answerAndAdvance("hasChildrenOrDependents", v)} /></Question>
          <Question questionKey="phoneType" title="What kind of phone do you use?"><Choice name="Phone type" value={answers.phoneType} onChange={v => answerAndAdvance("phoneType", v)} options={[{value:"iphone",label:"iPhone"},{value:"android",label:"Android"},{value:"other",label:"Other"},{value:"not_sure",label:"Not sure"},{value:"skipped",label:"Skip this question"}]} /></Question>
        </>}
        {step === 2 && <>
          <Question questionKey="hasWillOrTrust" title="Do you have a will or trust?">
            <Choice name="Will or trust" value={answers.hasWillOrTrust} onChange={v => answerAndAdvance("hasWillOrTrust", v)} />
            {answers.hasWillOrTrust === "yes" && <Directive
              title="Register it with the National Estate Registry"
              body="Start NER enrollment so your will or trust can be located when your family needs it. Registry enrollment is separate from keeping a private copy in your Heart Plan."
              action="Start NER registration"
              icon={ShieldCheck}
              onClick={() => goToNextStep("/orsa#ner-registration")}
            />}
            {answers.hasWillOrTrust === "yes" && <Directive
              title="Keep a private copy in your Heart Plan"
              body="After starting registry enrollment, upload a copy to your private document vault for your trusted people."
              action="Upload a will or trust"
              icon={FileUp}
              onClick={() => goToNextStep("/heartplan/vault")}
            />}
            {["no", "not_sure"].includes(answers.hasWillOrTrust) && <Directive
              title="Make an estate-planning next step"
              body="Write down who should make decisions and receive important property, then speak with a qualified estate-planning professional. Check the Marketplace for vetted support as listings become available."
              action="Check estate-planning support"
              icon={Store}
              onClick={() => goToNextStep("/marketplace?q=wills%20trusts")}
            />}
          </Question>
          <Question questionKey="hasPowerOfAttorney" title="Do you have a power of attorney?"><Choice name="Power of attorney" value={answers.hasPowerOfAttorney} onChange={v => answerAndAdvance("hasPowerOfAttorney", v)} /></Question>
          <Question questionKey="hasHealthcareDirective" title="Do you have a healthcare directive?"><Choice name="Healthcare directive" value={answers.hasHealthcareDirective} onChange={v => answerAndAdvance("hasHealthcareDirective", v)} /></Question>
        </>}
        {step === 3 && <>
          <Question questionKey="hasLifeInsurance" title="Do you have life insurance?">
            <Choice name="Life insurance" value={answers.hasLifeInsurance} onChange={v => set("hasLifeInsurance", v)} options={LIFE_INSURANCE_COVERAGE_OPTIONS} />
            {answers.hasLifeInsurance === "yes" && <Directive
              title="Record the policy for your family"
              body="Add the insurer, policy hint, beneficiary, and instructions without entering a full account number."
              action="Add life insurance details"
              icon={FileUp}
              onClick={() => goToNextStep("/heartplan/assets")}
            />}
            {answers.hasLifeInsurance === "not_sure" && <Directive
              title="Check coverage before deciding"
              body="Review employer benefits and any existing family policies, then discuss your needs with a licensed insurance professional. Check the Marketplace for vetted support as listings become available."
              action="Check insurance support"
              icon={Store}
              onClick={() => goToNextStep("/marketplace?q=life%20insurance")}
            />}
            {answers.hasLifeInsurance === "employer_only" && <Directive
              title="Record your workplace policy"
              body="Save the insurer, policy hint, beneficiary, and instructions without entering a full account number."
              action="Add life insurance details"
              icon={FileUp}
              onClick={() => goToNextStep("/heartplan/assets")}
            />}
            {(answers.hasLifeInsurance === "no" || answers.hasLifeInsurance === "employer_only") && (
              <PrudentialLifeInsuranceSuggestion coverage={answers.hasLifeInsurance} />
            )}
          </Question>
          <Question questionKey="hasInvestmentAccounts" title="Do you have investment accounts?"><Choice name="Investment accounts" value={answers.hasInvestmentAccounts} onChange={v => answerAndAdvance("hasInvestmentAccounts", v)} /></Question>
          <Question questionKey="hasTollAccounts" title="Do you have a toll account, such as SunPass, E-ZPass, or Peach Pass?"><Choice name="Toll accounts" value={answers.hasTollAccounts} onChange={v => answerAndAdvance("hasTollAccounts", v)} /></Question>
          <Question questionKey="hasStorageUnit" title="Do you rent a storage unit?"><Choice name="Storage unit" value={answers.hasStorageUnit} onChange={v => answerAndAdvance("hasStorageUnit", v)} /></Question>
          <Question questionKey="hasBettingApps" title="Do you use any sports betting or betting apps?"><Choice name="Betting apps" value={answers.hasBettingApps} onChange={v => answerAndAdvance("hasBettingApps", v)} /></Question>
          <Question questionKey="hasCryptoApps" title="Do you use any crypto apps, exchanges, or digital wallets?"><Choice name="Crypto apps" value={answers.hasCryptoApps} onChange={v => answerAndAdvance("hasCryptoApps", v)} /></Question>
          <Question questionKey="hasFinalArrangementPlans" title="Have you made plans for your final arrangements?"><Choice name="Final arrangements" value={answers.hasFinalArrangementPlans} onChange={v => answerAndAdvance("hasFinalArrangementPlans", v)} /></Question>
          <Question questionKey="hasPrepaidFuneralPlan" title="Do you have a prepaid funeral plan?"><Choice name="Prepaid funeral plan" value={answers.hasPrepaidFuneralPlan} onChange={v => answerAndAdvance("hasPrepaidFuneralPlan", v)} /></Question>
        </>}
        <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center">
          {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)} disabled={save.isPending}><ArrowLeft className="h-4 w-4" />Back</Button>}
          <Button variant="ghost" onClick={skip} disabled={save.isPending} className="sm:mr-auto">Skip for now</Button>
          <Button onClick={next} disabled={save.isPending} data-testid="button-welcome-continue">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 3 ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            {step === 3 ? "Finish" : "Save and continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  </main>;
}

function Question({ questionKey, title, children }: { questionKey: keyof Answers; title: string; children: React.ReactNode }) {
  return <fieldset className="scroll-mt-24 space-y-3" data-question-key={questionKey}><legend className="text-base font-medium">{title}</legend>{children}</fieldset>;
}

function Directive({ title, body, action, icon: Icon, onClick }: { title: string; body: string; action: string; icon: typeof FileUp; onClick: () => void }) {
  return <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClick}>{action}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
  </div>;
}