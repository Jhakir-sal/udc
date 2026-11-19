import { Link } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  CircleHelp,
  FileText,
  Heart,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import orsaLogo from "../../../previews/orsa-approved-logo.png";
import salLogo from "@assets/logo-horizontal.png";
import { complimentaryOrsaLegacyIsActive } from "@shared/orsaLegacyOffer";

const planSections = [
  {
    number: "01",
    icon: FileText,
    title: "Your wishes",
    description: "Record the choices and details you want your loved ones to understand.",
  },
  {
    number: "02",
    icon: LockKeyhole,
    title: "Important information",
    description: "Gather practical information in one private, organized place.",
  },
  {
    number: "03",
    icon: UsersRound,
    title: "Trusted people",
    description: "Name the people you trust and make it clear how they fit into your plan.",
  },
  {
    number: "04",
    icon: MessageCircle,
    title: "Personal messages",
    description: "Leave words, stories, and guidance for the people who matter to you.",
  },
];

function BrandPair() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-4" aria-label="ORSA Credit Union and Steps After Life">
      <img src={orsaLogo} alt="ORSA Credit Union" className="h-11 w-auto max-w-[190px] object-contain sm:h-12" />
      <span className="h-9 w-px bg-[#d9d4cc]" aria-hidden="true" />
      <img src={salLogo} alt="Steps After Life" className="h-8 w-auto max-w-[180px] object-contain sm:h-9" />
    </div>
  );
}

export default function OrsaMemberHeartPlanPage() {
  const registerHref = "/heartplan-register?orsa_offer=1";
  const [hasMemberOffer, setHasMemberOffer] = useState(complimentaryOrsaLegacyIsActive);
  useEffect(() => {
    const timer = window.setInterval(() => setHasMemberOffer(complimentaryOrsaLegacyIsActive()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#f7f5ef] text-[#29243a]">
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_88%_6%,rgba(236,119,27,0.10),transparent_34%),linear-gradient(180deg,#fbfaf7_0%,#f7f5ef_100%)]" />
        <div className="mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-12 lg:px-12">
          <div className="mb-12 flex flex-col items-start gap-7 sm:mb-16 sm:flex-row sm:items-center sm:justify-between">
            <BrandPair />
            <a href="#offer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9d4cc] bg-[#fbfaf7]/80 px-4 text-sm font-semibold text-[#392047] transition-colors hover:border-[#392047] hover:bg-white">
              See your member offer <ArrowDownRight className="h-4 w-4" />
            </a>
          </div>

          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div className="max-w-2xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#dfd6e1] bg-white/70 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#5b3863]">
                <Heart className="h-3.5 w-3.5 text-[#e77724]" strokeWidth={2.3} />
                A planning resource for ORSA members
              </p>
              <h1 className="font-serif text-[2.85rem] font-medium leading-[1.05] tracking-[-0.045em] text-[#2c2037] sm:text-6xl lg:text-[4.35rem]">
                Make space for what matters.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#5d5862] sm:text-xl sm:leading-9">
                HeartPlan helps you organize your wishes, important information, trusted contacts, and personal messages—in one thoughtful place for the people you love.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href={registerHref}
                  className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-[#392047] px-6 py-3.5 text-base font-semibold text-white shadow-[0_10px_22px_rgba(57,32,71,0.17)] transition-all hover:-translate-y-0.5 hover:bg-[#4b2c58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e77724] focus-visible:ring-offset-2"
                >
                  Create your HeartPlan
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <p className="text-sm leading-6 text-[#6e6870]">Private by default. Start at your own pace.</p>
              </div>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[#716c73]">
                You arrived at this page after a Steps After Life message. A text or phone number—and this page—does not verify ORSA membership or unlock member benefits.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[520px]">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-[#e77724]/25 sm:-right-12 sm:-top-12 sm:h-44 sm:w-44" aria-hidden="true" />
              <div className="absolute -bottom-6 -left-8 h-28 w-28 rounded-full bg-[#e77724]/10 sm:-bottom-8 sm:-left-10 sm:h-36 sm:w-36" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[2rem] border border-[#e5e0d8] bg-[#eee9f0] p-4 shadow-[0_26px_70px_rgba(48,35,52,0.12)] sm:p-6">
                <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[#f0b26a]/20 blur-3xl" aria-hidden="true" />
                <div className="relative rounded-[1.45rem] border border-white/80 bg-[#fbfaf7] p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4 border-b border-[#ebe6df] pb-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7a667e]">A plan that feels like you</p>
                      <p className="mt-2 font-serif text-2xl text-[#30223a]">Your HeartPlan</p>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8eadc] text-[#a44f1e]">
                      <Heart className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="space-y-3 pt-5">
                    {[
                      ["Your wishes", "What matters to you"],
                      ["People you trust", "Names and ways to reach them"],
                      ["Messages", "Words to keep close"],
                    ].map(([label, note], index) => (
                      <div key={label} className="flex items-center gap-3 rounded-xl border border-[#ebe6df] bg-white px-4 py-3.5">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${index === 1 ? "bg-[#f8eadc] text-[#a44f1e]" : "bg-[#eee8f0] text-[#573f60]"}`}>
                          {index === 0 ? <FileText className="h-4 w-4" /> : index === 1 ? <UsersRound className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-[#342b39]">{label}</span>
                          <span className="mt-0.5 block text-xs text-[#77717a]">{note}</span>
                        </span>
                        <Check className="h-4 w-4 text-[#627b68]" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#f4f1eb] px-3.5 py-3 text-xs leading-5 text-[#655f67]">
                    <LockKeyhole className="h-4 w-4 shrink-0 text-[#5b3863]" />
                    Your plan is yours to shape and share.
                  </div>
                </div>
              </div>
              <p className="relative mt-4 text-center text-xs tracking-wide text-[#7b747d]">A calm place to gather the details you choose.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e5e0d8] bg-[#fbfaf7]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
            <div className="max-w-md">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#aa5a29]">A little more clarity</p>
              <h2 className="mt-4 font-serif text-3xl leading-tight tracking-[-0.03em] text-[#30223a] sm:text-4xl">The important things, gathered in one place.</h2>
              <p className="mt-4 text-base leading-7 text-[#68616c]">No need to have every answer today. Add what you know, come back when you are ready, and keep the plan in your hands.</p>
            </div>
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {planSections.map(({ number, icon: Icon, title, description }) => (
                <article key={number} className="flex gap-4 border-t border-[#e5e0d8] pt-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eee8f0] text-[#573f60]">
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.14em] text-[#a05b37]">{number}</p>
                    <h3 className="mt-1 font-serif text-xl text-[#34283b]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#6b6570]">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="offer" className="scroll-mt-24 bg-[#eee9f0]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:gap-16 lg:px-12">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a65b2c]">For ORSA members</p>
            <h2 className="mt-4 font-serif text-3xl leading-tight tracking-[-0.03em] text-[#30223a] sm:text-4xl">A one-time offer for a plan that stays with you.</h2>
            <p className="mt-4 text-base leading-7 text-[#625c67]">
              HeartPlan is provided by Steps After Life. Verified, eligible ORSA members receive complimentary Legacy access through December 1, 2026 at 11:59 p.m. Eastern Time. A lifetime purchase is optional. Membership is confirmed separately before member-only pricing or access is granted.
            </p>
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#d9d0dc] bg-white/65 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#5c765f]" />
              <p className="text-sm leading-6 text-[#5f5963]">
                No subscription. No pressure to finish at once. Your plan is personal, and you choose what to include.
              </p>
            </div>
          </div>

          <div className="rounded-[1.65rem] border border-[#ded5e0] bg-[#fbfaf7] p-6 shadow-[0_18px_48px_rgba(56,38,62,0.08)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <span className="rounded-full bg-[#eee8f0] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[#573f60]">{hasMemberOffer ? "Optional ORSA lifetime purchase" : "Standard lifetime purchase"}</span>
              <ShieldCheck className="h-5 w-5 text-[#647b68]" />
            </div>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-serif text-6xl tracking-[-0.05em] text-[#30223a]">{hasMemberOffer ? "$50" : "$149"}</p>
              <p className="text-sm text-[#6c6570]">one time</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#625c67]">
              {hasMemberOffer
                ? "Optional one-time lifetime access for verified, eligible ORSA members through December 1, 2026 at 11:59 p.m. Eastern Time. Complimentary Legacy access lasts through that deadline without this purchase."
                : "The $50 member offer ended December 1, 2026. The standard lifetime price is $149 one time."}
            </p>
            <div className="my-6 h-px bg-[#e8e2da]" />
            <p className="flex items-start gap-2.5 text-sm leading-6 text-[#5d5862]">
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#637b68]" />
              Lifetime HeartPlan access after checkout; member pricing requires verified eligibility
            </p>
            <Link href={registerHref} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#392047] px-5 text-base font-semibold text-white transition-colors hover:bg-[#4b2c58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e77724] focus-visible:ring-offset-2">
              Continue to secure registration <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-center text-xs leading-5 text-[#77717a]">Your account begins with a verified email address.</p>
          </div>
        </div>
      </section>

      <section className="bg-[#fbfaf7]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a65b2c]">A careful verification step</p>
              <h2 className="mt-4 font-serif text-3xl leading-tight tracking-[-0.03em] text-[#30223a] sm:text-4xl">Your membership deserves a real check.</h2>
              <p className="mt-4 text-base leading-7 text-[#68616c]">
                A text message, phone number, or visit to this page is not proof of ORSA membership and does not unlock ORSA benefits. Steps After Life must match your verified account email to the ORSA member roster.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex gap-4 rounded-2xl border border-[#e5e0d8] bg-white p-5 sm:p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eee8f0] font-serif text-lg text-[#573f60]">1</span>
                <div>
                  <h3 className="font-semibold text-[#34283b]">Create your account with an email you can verify.</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b6570]">Registration requires an email address you can access. Do not send passwords or verification codes to anyone.</p>
                </div>
              </div>
              <div className="flex gap-4 rounded-2xl border border-[#e5e0d8] bg-white p-5 sm:p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f8eadc] font-serif text-lg text-[#a44f1e]">2</span>
                <div>
                  <h3 className="font-semibold text-[#34283b]">If ORSA has no email for you, contact Steps After Life support.</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b6570]">Tell support the email you verified so they can help match it to your ORSA membership. Member-only access and pricing remain unavailable until the match is confirmed.</p>
                </div>
              </div>
              <div className="flex gap-4 rounded-2xl border border-[#e5e0d8] bg-white p-5 sm:p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8eee8] font-serif text-lg text-[#536b58]">3</span>
                <div>
                  <h3 className="font-semibold text-[#34283b]">Check ORSA through its official main site.</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b6570]">For questions about your credit-union membership, open the ORSA Credit Union website using the address you normally use or contact ORSA directly through its official channels.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e0d8] bg-[#f3f0e9]">
        <div className="mx-auto grid max-w-7xl gap-9 px-5 py-14 sm:px-8 md:grid-cols-[1fr_auto] md:items-center lg:px-12">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[#573f60]">
              <CircleHelp className="h-5 w-5" />
              <p className="text-xs font-bold uppercase tracking-[0.15em]">Need help with the email match?</p>
            </div>
            <h2 className="mt-3 font-serif text-2xl text-[#30223a]">We can help you find the right next step.</h2>
            <p className="mt-2 text-sm leading-6 text-[#6b6570]">Contact Steps After Life support. Please do not include a password or one-time verification code in your message.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <a href="mailto:hello@stepsafterlife.com" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d8d0da] bg-[#fbfaf7] px-4 text-sm font-semibold text-[#392047] transition-colors hover:bg-white">
              <Mail className="h-4 w-4" /> hello@stepsafterlife.com
            </a>
            <a href="tel:8885572083" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d8d0da] bg-[#fbfaf7] px-4 text-sm font-semibold text-[#392047] transition-colors hover:bg-white">
              <Phone className="h-4 w-4" /> 888-557-2083
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-[#30223a] text-[#f6f1e9]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <img src={orsaLogo} alt="ORSA Credit Union" className="h-8 w-auto max-w-[140px] rounded-sm bg-white object-contain px-1" />
            <span className="text-[#a89aa9]" aria-hidden="true">×</span>
            <img src={salLogo} alt="Steps After Life" className="h-7 w-auto max-w-[145px] brightness-0 invert" />
          </div>
          <p className="max-w-xl text-xs leading-5 text-[#d1c8d2]">
            HeartPlan is provided by Steps After Life. ORSA membership and any member benefit are verified separately. This page does not collect ORSA login information.
          </p>
        </div>
      </footer>
    </main>
  );
}