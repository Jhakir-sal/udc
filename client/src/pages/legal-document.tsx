import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/hooks/use-auth";
import { HEARTPLAN_PRIVACY, HEARTPLAN_TCPA, HEARTPLAN_TERMS } from "@shared/heartPlanConsent";
import { HEARTPLAN_PRIVACY_SNAPSHOT } from "@shared/legalPolicySnapshots";
import { HEARTPLAN_TERMS_CURRENT_SNAPSHOT } from "@shared/heartPlanTerms2026";

const documents = {
  terms: {
    ...HEARTPLAN_TERMS,
    content: HEARTPLAN_TERMS_CURRENT_SNAPSHOT,
  },
  privacy: {
    ...HEARTPLAN_PRIVACY,
    content: HEARTPLAN_PRIVACY_SNAPSHOT,
  },
  tcpa: {
    ...HEARTPLAN_TCPA,
    content: [
      HEARTPLAN_TCPA.disclosure,
      "By selecting the optional communications checkbox, you provide your electronic signature and agree that Steps After Life and its affiliates may contact you at the contact information you provide, including using automated technology where permitted.",
      "Consent is optional and is not required to create a HeartPlan, buy any product, or receive account and service notices. Message frequency may vary.",
    ].join("\n\n"),
  },
} as const;

export default function LegalDocument({ kind }: { kind: keyof typeof documents }) {
  const document = documents[kind];
  const { user, isAuthenticated } = useAuth();
  const isDemoAccount = isAuthenticated && !!(user as any)?.isDemoAccount;
  const backHref = !isAuthenticated ? "/heartplan-register" : isDemoAccount ? "/demo" : user?.destination || "/";
  const backLabel = !isAuthenticated ? "Back to HeartPlan registration" : isDemoAccount ? "Back to demo" : "Back to dashboard";
  return (
    <main className="min-h-[100dvh] bg-background px-4 py-10 sm:px-6">
      <article className="mx-auto max-w-3xl">
        <Link href={backHref} className="text-sm font-medium text-primary underline underline-offset-4">
          {backLabel}
        </Link>
        <h1 className="mt-6 font-serif text-3xl font-semibold">{document.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Version {document.version}</p>
        {"publishedUrl" in document && document.publishedUrl.startsWith("https://") && (
          <p className="mt-2 text-sm">
            <a href={document.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              View the publisher's current source
            </a>
          </p>
        )}
        <div className="mt-8 min-w-0 break-words text-base leading-7 [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-2 [&_a]:break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_hr]:my-8">
          <ReactMarkdown>{document.content}</ReactMarkdown>
        </div>
      </article>
    </main>
  );
}