import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  ArrowDown, ArrowRight, Check, ChevronDown, ClipboardList, Cross, HeartHandshake,
  MapPin, Phone, Plane, ShieldCheck, Sparkles, Users, Wallet,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import "@/pages/concierge.css";
import { usePageMetadata } from "@/hooks/use-page-metadata";

const phone = "888-557-2083";
const groups = [
  { icon: Plane, title: "Medical coordination & transport", items: ["Coordinate with doctors, nurses and discharge teams on safe next steps", "Research and compare private air-medical transport", "Arrange ground ambulance transport", "Help complete discharge and transfer paperwork"] },
  { icon: Cross, title: "Hospice & care at home", items: ["Coordinate hospice setup and paperwork", "Schedule and confirm needed appointments", "Be a practical point of contact across providers and family"] },
  { icon: Users, title: "Family travel & support", items: ["Arrange housing for visiting family", "Coordinate airport transfers and local transportation", "Help keep relatives informed, with your permission"] },
  { icon: Wallet, title: "Household, finances & paperwork", items: ["Help keep essential bills and payments organized", "Organize account information through authorized channels", "Coordinate packing, shipping and practical household details"] },
  { icon: HeartHandshake, title: "Spiritual & emotional support", items: ["Contact a clergy member or chaplain on your behalf", "Offer a steady, caring presence", "Coordinate in-person support when available and agreed"] },
];
const faqs = [
  ["What does End-of-Life Concierge cost?", "Every family's needs are different. We will discuss the scope of support and any costs with you before you decide whether to engage us."],
  ["Do you work outside Naples?", "Yes. We serve families nationwide, with a local team in Naples, Florida."],
  ["How soon can support begin?", "Timing depends on your needs and our availability. We will talk through what is happening and confirm what we can take on before any engagement."],
  ["Will a concierge come to the hospital in person?", "In-person support and travel depend on availability, location and our agreement with you. We will be clear about what is possible and any related costs."],
  ["Can I hire you for a parent who lives in another state?", "Yes. We can coordinate remotely with you and your family, and discuss whether in-person support is available."],
  ["Do you provide medical care?", "No. We coordinate logistics alongside your loved one's medical team; we do not provide medical care or medical advice."],
  ["What happens after my loved one passes?", "If you wish, our after-death concierge can continue with practical next steps, including notifying companies and helping organize account matters."],
];

export default function EndOfLifeConciergePage() {
  usePageMetadata(
    "End-of-Life Concierge Services | Steps After Life — Nationwide & Naples, FL",
    "When a loved one's time is short, Steps After Life takes on the logistics, from hospital discharge and medical transport to hospice paperwork and family travel, so you can be present.",
  );
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<null | { notificationAccepted: boolean }>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setError("");
    const data = new FormData(form);
    const payload = {
      requestId,
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      phone: String(data.get("phone") || ""),
      careLocation: String(data.get("careLocation") || ""),
      bestTime: String(data.get("bestTime") || ""),
      contactPermission: data.get("contactPermission") === "on",
      website: String(data.get("website") || ""),
    };
    try {
      const response = await apiRequest("POST", "/api/concierge-inquiries", payload);
      const saved = await response.json() as { saved: boolean; notificationAccepted: boolean };
      if (!saved.saved) throw new Error("We couldn't confirm that your request was recorded. Please try again.");
      setResult({ notificationAccepted: saved.notificationAccepted });
      setRequestId(crypto.randomUUID());
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send your request. Your details are still here—please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="sal-concierge">
      <section className="sal-hero">
        <div className="sal-hero-copy">
          <p className="sal-eyebrow">STEPS AFTER LIFE · END-OF-LIFE CONCIERGE</p>
          <h1>When time is short,<br /><em>we handle everything else.</em></h1>
          <p className="sal-hero-lede">Our concierge steps in during the hardest weeks of your life. We coordinate hospitals, travel, paperwork and practical details, so you can spend more time with the person you love.</p>
          <div className="sal-hero-actions">
            <Button asChild size="lg" className="sal-button"><a href="#contact">Talk to a Concierge <ArrowRight aria-hidden="true" /></a></Button>
            <a className="sal-phone" href="tel:8885572083"><Phone aria-hidden="true" /> {phone}</a>
          </div>
          <p className="sal-hero-note">A real person to talk through what comes next.</p>
        </div>
        <div className="sal-hero-image" role="img" aria-label="A loved one gently holding a family member's hand" />
        <a className="sal-scroll-cue" href="#trust" aria-label="Scroll to learn more"><ArrowDown /></a>
      </section>

      <section id="trust" className="sal-trust" aria-label="Our service">
        <div><MapPin /> Nationwide support, local Naples team</div><span className="sal-trust-dot" />
        <div><Users /> One dedicated concierge</div><span className="sal-trust-dot" />
        <div><ShieldCheck /> Your choices, your permission</div>
      </section>

      <section className="sal-section sal-why">
        <div className="sal-copy">
          <p className="sal-eyebrow">THE SPACE BETWEEN CARE AND HOME</p>
          <h2>Why families<br /><em>call us</em></h2>
          <p>A serious illness can bring a second full-time job: phone calls, forms, insurance, travel, bills and decisions that cannot wait. Families are asked to take it all on while exhausted, grieving and often far from home.</p>
          <p>You shouldn't have to carry every detail alone. One dedicated concierge helps coordinate the practical work, from the first conversation through the next steps, nationwide with a local team in Naples, Florida.</p>
        </div>
        <div className="sal-why-image" role="img" aria-label="A hand held with care at a bedside" />
      </section>

      <section className="sal-section sal-services">
        <header className="sal-section-heading"><p className="sal-eyebrow">PRACTICAL HELP, PERSON BY PERSON</p><h2>What we <em>handle</em></h2><p>We take on logistics so you can keep your attention where it belongs.</p></header>
        <div className="sal-service-grid">
          {groups.map(({ icon: Icon, title, items }, index) => <article className={`sal-service-card sal-service-${index + 1}`} key={title}>
            <div className="sal-service-icon"><Icon aria-hidden="true" /></div><h3>{title}</h3>
            <ul>{items.map(item => <li key={item}><Check aria-hidden="true" />{item}</li>)}</ul>
          </article>)}
        </div>
      </section>

      <section className="sal-story">
        <div className="sal-story-photo" role="img" aria-label="A quiet moment of comfort beside a loved one" />
        <div className="sal-story-content">
          <p className="sal-eyebrow">A FAMILY STORY, SHARED WITH CARE</p>
          <h2>Bringing him <em>home</em></h2>
          <p>When a loved one's care was far from home and time became precious, one family wanted to bring him closer. A concierge helped coordinate with the care team, arrange transport and family travel, and prepare for hospice at home.</p>
          <p>With the logistics moving forward, the family could be together and focus on what mattered most.</p>
          <ol className="sal-story-timeline" aria-label="Bringing him home, step by step">
            <li>Care far from home</li><li>A coordinated plan</li><li>Medical transport home</li><li>Hospice at home</li>
          </ol>
          <Link href="/stories/bringing-him-home" className="sal-text-link">Read the anonymized story <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="sal-section sal-steps">
        <header className="sal-section-heading"><p className="sal-eyebrow">A STEADY HAND THROUGH EACH NEXT STEP</p><h2>How it <em>works</em></h2></header>
        <div className="sal-step-list">
          {[
            ["01", "Call us", "Tell us what's happening and where your loved one is being cared for."],
            ["02", "Meet your concierge", "One dedicated person learns your situation, priorities and family."],
            ["03", "We take on the logistics", "By phone, online or in person when agreed and available, we coordinate calls, bookings, paperwork and follow-up."],
            ["04", "We stay with you", "If the time comes, we can continue with after-death concierge support and practical next steps."],
          ].map(([n, title, text]) => <article className="sal-step" key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}
        </div>
      </section>

      <section className="sal-journey">
        <header><p className="sal-eyebrow">SUPPORT FOR THE WHOLE JOURNEY</p><h2>Here before, during<br />and <em>after.</em></h2></header>
        <div className="sal-journey-line">
          <Link href="/heartplan-register" className="sal-journey-card"><span>01 · PLAN AHEAD</span><h3>HeartPlan</h3><p>Record wishes and share guidance with the people you trust.</p><b>Explore HeartPlan <ArrowRight /></b></Link>
          <Link href="/end-of-life-concierge" className="sal-journey-card sal-journey-current"><span>02 · THE FINAL WEEKS</span><h3>End-of-Life Concierge</h3><p>Let us coordinate the practical details while you focus on your loved one.</p><b>You are here <Check /></b></Link>
          <Link href="/report-loss" className="sal-journey-card"><span>03 · AFTER A LOSS</span><h3>After-death support</h3><p>Help with notifications, accounts and the many steps that follow.</p><b>See after-death support <ArrowRight /></b></Link>
        </div>
      </section>

      <section className="sal-section sal-faq">
        <div className="sal-faq-intro"><p className="sal-eyebrow">CLEAR ANSWERS, NO PRESSURE</p><h2>Questions families<br /><em>often ask</em></h2><p>If you don't see your question here, we're happy to talk.</p><a href="tel:8885572083" className="sal-text-link">{phone} <ArrowRight /></a></div>
        <div className="sal-faq-list">{faqs.map(([question, answer], index) => <div className="sal-faq-item" key={question}>
          <button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)}><span>{question}</span><ChevronDown aria-hidden="true" /></button>
          {openFaq === index && <p>{answer}</p>}
        </div>)}</div>
      </section>

      <section id="contact" className="sal-contact">
        <div className="sal-contact-intro">
          <p className="sal-eyebrow">START WITH A CONVERSATION</p><h2>You don't have<br />to do this <em>alone.</em></h2>
          <p>Tell us how to reach you. We'll use these details only to respond to your request.</p>
          <a className="sal-contact-phone" href="tel:8885572083"><Phone /> {phone}</a>
          <a className="sal-contact-email" href="mailto:hello@stepsafterlife.com">hello@stepsafterlife.com</a>
          <small>For time-sensitive help, please call. Submitting this form is not an urgent-response service.</small>
        </div>
        <div className="sal-form-wrap">
          {result ? <div className="sal-success" role="status"><div className="sal-success-icon"><Check /></div><h3>Your request is recorded.</h3><p>Thank you for reaching out. {result.notificationAccepted ? "We have accepted your request for follow-up." : "We could not confirm an email alert, but your request was recorded."} For time-sensitive help, call <a href="tel:8885572083">{phone}</a>.</p><button type="button" className="sal-text-link" onClick={() => setResult(null)}>Send another request <ArrowRight /></button></div> :
            <form className="sal-form" onSubmit={submit}>
              <div className="sal-form-heading"><Sparkles aria-hidden="true" /><div><h3>Ask us to call you</h3><p>We'll take it one step at a time.</p></div></div>
              <label>Your name <input name="name" autoComplete="name" required minLength={2} maxLength={120} /></label>
              <div className="sal-form-row"><label>Email address <input type="email" name="email" autoComplete="email" required maxLength={254} /></label><label>Phone number <input type="tel" name="phone" autoComplete="tel" required minLength={7} maxLength={30} /></label></div>
              <label>Where is your loved one being cared for? <input name="careLocation" placeholder="City, state or care setting (optional)" maxLength={200} /></label>
              <label>Best time to call <input name="bestTime" placeholder="For example, mornings or after 4 pm" maxLength={120} /></label>
              <label className="sal-consent"><input type="checkbox" name="contactPermission" required /><span>I agree that Steps After Life may contact me about this request. This is not consent to marketing messages.</span></label>
              <div className="sal-honeypot" aria-hidden="true"><label>Leave blank<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <p className="sal-privacy-note">Please don't include medical records, Social Security numbers or financial details. Read our <Link href="/legal/privacy">Privacy Notice</Link>.</p>
              {error && <p className="sal-form-error" role="alert">{error}</p>}
              <Button type="submit" size="lg" className="sal-button sal-submit" disabled={pending}>{pending ? "Sending your request…" : "Request a conversation"} <ArrowRight aria-hidden="true" /></Button>
              <p className="sal-form-foot">We coordinate logistics and support. We are not a medical or legal care provider.</p>
            </form>}
        </div>
      </section>

      <aside className="sal-disclaimer"><ClipboardList aria-hidden="true" /><p>Steps After Life coordinates logistics and support. We do not provide medical care or legal advice; we work alongside your medical team and trusted advisors. Account information is handled only through authorized channels.</p></aside>
    </main>
  );
}
