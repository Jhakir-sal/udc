import { Link } from "wouter";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
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
import prudentialLogo from "../assets/prudential-logo.svg";
import salLogo from "@assets/logo-horizontal.png";
import {
  PRUDENTIAL_ACCESS_MESSAGE,
  PRUDENTIAL_FREE_ACCESS_DAYS,
  PRUDENTIAL_LIFETIME_PRICE_CENTS,
} from "@shared/prudentialOffer";
import "./prudential-heartplan.css";

const planSections = [
  {
    number: "01",
    icon: FileText,
    title: "Your wishes",
    description: "Put the choices and details you want loved ones to understand into your own words.",
  },
  {
    number: "02",
    icon: LockKeyhole,
    title: "Important information",
    description: "Bring practical details together in one personal, organized place.",
  },
  {
    number: "03",
    icon: UsersRound,
    title: "People you trust",
    description: "Keep the names and relationships that matter close to your plan.",
  },
  {
    number: "04",
    icon: MessageCircle,
    title: "Personal messages",
    description: "Leave stories, guidance, and words you would like your family to have.",
  },
];

function BrandPair() {
  return (
    <div className="ph-brand-pair" aria-label="Prudential and Steps After Life">
      <img src={prudentialLogo} alt="Prudential" className="ph-prudential-logo" />
      <span className="ph-brand-divider" aria-hidden="true" />
      <img src={salLogo} alt="Steps After Life" className="ph-sal-logo" />
    </div>
  );
}

function HeartPlanPreview() {
  return (
    <div className="ph-preview-wrap" aria-label="Illustration of a HeartPlan">
      <div className="ph-orbit ph-orbit-one" aria-hidden="true" />
      <div className="ph-orbit ph-orbit-two" aria-hidden="true" />
      <div className="ph-preview-card">
        <div className="ph-preview-heading">
          <div>
            <p className="ph-eyebrow">A place for what matters</p>
            <h2>Your HeartPlan</h2>
          </div>
          <span className="ph-heart-mark" aria-hidden="true"><Heart size={21} /></span>
        </div>
        <div className="ph-preview-list">
          {[
            { icon: FileText, title: "Your wishes", detail: "What matters to you" },
            { icon: UsersRound, title: "People you trust", detail: "Names and ways to reach them" },
            { icon: MessageCircle, title: "Personal messages", detail: "Words to keep close" },
          ].map(({ icon: Icon, title, detail }, index) => (
            <div className="ph-preview-row" key={title}>
              <span className={`ph-row-icon ph-row-icon-${index}`}><Icon size={17} /></span>
              <span className="ph-row-copy">
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <Check className="ph-row-check" size={17} aria-hidden="true" />
            </div>
          ))}
        </div>
        <div className="ph-preview-note">
          <LockKeyhole size={16} />
          You decide what to add and who to share it with.
        </div>
      </div>
      <p className="ph-preview-caption">A thoughtful space to organize the details you choose.</p>
    </div>
  );
}

export default function PrudentialHeartPlanPage() {
  const lifetimePrice = PRUDENTIAL_LIFETIME_PRICE_CENTS / 100;
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(lifetimePrice);

  return (
    <main className="ph-page">
      <section className="ph-hero">
        <div className="ph-hero-inner">
          <header className="ph-header">
            <BrandPair />
            <nav className="ph-header-nav" aria-label="Page navigation">
              <Link href="/login" className="ph-login-link">Already have an account?</Link>
              <a href="#offer" className="ph-nav-cta">Explore the offer <ArrowDown size={15} /></a>
            </nav>
          </header>

          <div className="ph-hero-grid">
            <div className="ph-hero-copy">
              <p className="ph-partnership-kicker">
                <span className="ph-kicker-dot" aria-hidden="true" />
                A HeartPlan resource through Prudential and Steps After Life
              </p>
              <h1>Make space for <em>what matters.</em></h1>
              <p className="ph-hero-description">
                HeartPlan gives you a thoughtful place to organize your wishes, important information,
                trusted people, and personal messages—for the people you love.
              </p>
              <div className="ph-hero-actions">
                <Link href="/heartplan-register?partner=prudential" className="ph-button ph-button-primary">
                  Start your {PRUDENTIAL_FREE_ACCESS_DAYS} days free <ArrowRight size={18} />
                </Link>
                <span className="ph-start-note"><LockKeyhole size={15} /> Private by default. Start at your own pace.</span>
              </div>
              <p className="ph-service-disclosure">
                HeartPlan is provided by Steps After Life (SAL). Prudential does not access your HeartPlan.
                {PRUDENTIAL_ACCESS_MESSAGE}
              </p>
            </div>
            <HeartPlanPreview />
          </div>
          <a className="ph-scroll-cue" href="#what-you-can-organize">
            <span>Get to know HeartPlan</span><ChevronDown size={16} />
          </a>
        </div>
      </section>

      <section className="ph-trust-strip" aria-label="HeartPlan principles">
        <div className="ph-trust-inner">
          <div><LockKeyhole size={19} /><span><strong>Your plan is personal</strong><small>You choose what to include.</small></span></div>
          <div><Heart size={19} /><span><strong>Make it your own</strong><small>Build it at a pace that feels right.</small></span></div>
          <div><ShieldCheck size={19} /><span><strong>Service by SAL</strong><small>Free for {PRUDENTIAL_FREE_ACCESS_DAYS} days. No offer review required.</small></span></div>
        </div>
      </section>

      <section id="what-you-can-organize" className="ph-organize">
        <div className="ph-section-inner ph-organize-grid">
          <div className="ph-section-intro">
            <p className="ph-eyebrow">A little more clarity</p>
            <h2>The important things, gathered in one place.</h2>
            <p>No need to have every answer today. Add what you know, return when you are ready, and keep your plan in your hands.</p>
          </div>
          <div className="ph-plan-sections">
            {planSections.map(({ number, icon: Icon, title, description }) => (
              <article className="ph-plan-item" key={number}>
                <span className="ph-plan-icon"><Icon size={20} strokeWidth={1.8} /></span>
                <div>
                  <span className="ph-plan-number">{number}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="offer" className="ph-offer">
        <div className="ph-section-inner ph-offer-grid">
          <div className="ph-offer-copy">
            <p className="ph-eyebrow">Your Prudential partnership offer</p>
            <h2>A little more room to plan.</h2>
            <p>
              HeartPlan Legacy is free for {PRUDENTIAL_FREE_ACCESS_DAYS} days, then {formattedPrice} one time
              for lifetime access. <strong>This partnership offer has no expiration.</strong>
            </p>
            <p className="ph-offer-detail">
              No offer review is required. Start with {PRUDENTIAL_FREE_ACCESS_DAYS} days free, then choose
              lifetime access with a single payment. No subscription is required.
            </p>
            <div className="ph-assurance">
              <ShieldCheck size={20} />
              <span>{PRUDENTIAL_ACCESS_MESSAGE}</span>
            </div>
          </div>
          <aside className="ph-price-card" aria-label="HeartPlan lifetime access offer">
            <div className="ph-price-card-top">
              <span className="ph-offer-chip">Lifetime access after {PRUDENTIAL_FREE_ACCESS_DAYS} days free</span>
              <span className="ph-price-mark"><Heart size={17} /></span>
            </div>
            <div className="ph-price-line">
              <strong>{formattedPrice}</strong><span>one time</span>
            </div>
            <p className="ph-price-explainer">
              {PRUDENTIAL_ACCESS_MESSAGE}
              No offer review. No expiration date for this partnership offer.
            </p>
            <div className="ph-card-rule" />
            <p className="ph-price-inclusion"><Check size={17} /> One-time payment for lifetime HeartPlan access</p>
            <Link href="/heartplan-register?partner=prudential" className="ph-button ph-button-secondary">
              Start your {PRUDENTIAL_FREE_ACCESS_DAYS} days free <ArrowRight size={17} />
            </Link>
            <p className="ph-price-footnote">A single payment for lifetime access, not a recurring subscription.</p>
          </aside>
        </div>
      </section>

      <section className="ph-steps">
        <div className="ph-section-inner ph-steps-grid">
          <div className="ph-section-intro">
            <p className="ph-eyebrow">Getting started is simple</p>
            <h2>Free for {PRUDENTIAL_FREE_ACCESS_DAYS} days. Then {formattedPrice} for lifetime access.</h2>
            <p>Create your HeartPlan account and start planning for your family. No offer review required.</p>
          </div>
          <div className="ph-step-list">
            <article className="ph-step">
              <span className="ph-step-number">1</span>
              <div><h3>Create your HeartPlan account.</h3><p>Sign up with your email address and verify it to secure your account.</p></div>
            </article>
            <article className="ph-step">
              <span className="ph-step-number">2</span>
              <div><h3>Plan free for {PRUDENTIAL_FREE_ACCESS_DAYS} days.</h3><p>Organize your wishes, important details, and personal messages at your own pace.</p></div>
            </article>
            <article className="ph-step">
              <span className="ph-step-number">3</span>
              <div><h3>Choose lifetime access for {formattedPrice}.</h3><p>After your free {PRUDENTIAL_FREE_ACCESS_DAYS} days, continue with a one-time payment for lifetime access. No recurring subscription.</p></div>
            </article>
          </div>
        </div>
        <div className="ph-section-inner ph-create-row">
          <div>
            <h3>Ready to begin?</h3>
            <p>Start with {PRUDENTIAL_FREE_ACCESS_DAYS} days free. Then choose lifetime access for {formattedPrice} one time.</p>
          </div>
          <div className="ph-create-actions">
            <Link href="/heartplan-register?partner=prudential" className="ph-button ph-button-primary">
              Start your {PRUDENTIAL_FREE_ACCESS_DAYS} days free <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section className="ph-privacy">
        <div className="ph-section-inner ph-privacy-grid">
          <div className="ph-privacy-heading">
            <span className="ph-privacy-icon"><LockKeyhole size={22} /></span>
            <p className="ph-eyebrow">Your plan. Your choices.</p>
            <h2>Private planning, on your terms.</h2>
          </div>
          <div className="ph-privacy-copy">
            <p>
              HeartPlan is a service provided by Steps After Life. Your personal plan is not shared with
              Prudential, and Prudential does not review or manage what you put in it. You decide what
              information to record and whether to share it with people you trust.
            </p>
            <p>
              Keep passwords and one-time verification codes to yourself. For questions about the offer,
              contact SAL directly; you never need to provide Prudential account credentials or policy numbers.
            </p>
            <div className="ph-privacy-links">
              <a href="/legal/privacy">Read the Privacy Policy <ArrowRight size={14} /></a>
              <a href="/legal/terms">Read the Terms <ArrowRight size={14} /></a>
            </div>
          </div>
        </div>
      </section>

      <section className="ph-help">
        <div className="ph-section-inner ph-help-inner">
          <div className="ph-help-copy">
            <span className="ph-help-icon"><CircleHelp size={21} /></span>
            <p className="ph-eyebrow">A question about the offer?</p>
            <h2>We’re here to help with the next step.</h2>
            <p>Reach Steps After Life for help getting started. Please do not send passwords, verification codes, or policy numbers.</p>
          </div>
          <div className="ph-contact-actions">
            <a href="mailto:hello@stepsafterlife.com" className="ph-contact-link"><Mail size={17} /> hello@stepsafterlife.com</a>
            <a href="tel:8885572083" className="ph-contact-link"><Phone size={17} /> 888-557-2083</a>
          </div>
        </div>
      </section>

      <footer className="ph-footer">
        <div className="ph-section-inner ph-footer-inner">
          <div className="ph-footer-brands">
            <img src={prudentialLogo} alt="Prudential" className="ph-prudential-logo" />
            <span aria-hidden="true">×</span>
            <img src={salLogo} alt="Steps After Life" className="ph-sal-logo" />
          </div>
          <div className="ph-footer-meta">
            <p>HeartPlan is provided by Steps After Life. Prudential does not access family plans. {PRUDENTIAL_ACCESS_MESSAGE}</p>
            <div><a href="/legal/terms">Terms</a><a href="/legal/privacy">Privacy</a><a href="mailto:hello@stepsafterlife.com">Contact SAL</a></div>
          </div>
        </div>
      </footer>
    </main>
  );
}
