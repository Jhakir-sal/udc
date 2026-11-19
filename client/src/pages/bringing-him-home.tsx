import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@/pages/concierge.css";
import { usePageMetadata } from "@/hooks/use-page-metadata";

export default function BringingHimHomeStory() {
  usePageMetadata("Bringing Him Home | Steps After Life", "An anonymized family account of coordinating care, medical transport and practical support to bring a loved one home.");
  return <main className="sal-story-page">
    <Link href="/end-of-life-concierge" className="sal-story-back"><ArrowLeft /> End-of-Life Concierge</Link>
    <header className="sal-story-article-head"><p className="sal-eyebrow">A FAMILY STORY · SHARED ANONYMOUSLY</p><h1>Bringing him <em>home</em></h1><p className="sal-story-dek">When the time together felt precious, one family needed help bringing their loved one closer to home.</p></header>
    <div className="sal-story-article-image" role="img" aria-label="Two hands resting together in a quiet moment" />
    <article className="sal-story-prose">
      <p>Being far from home while someone you love is receiving care can make every decision feel heavier. For one family, the wish was simple: to be together at home.</p>
      <p>A Steps After Life concierge helped coordinate with the care team, organize transfer details and arrange transportation. Family travel and practical arrangements were handled alongside those conversations, so the family had fewer logistics to carry alone.</p>
      <p>Once home, the concierge helped coordinate hospice arrangements and the practical details of care. The family could spend their time together, with support around the work that still needed doing.</p>
      <blockquote>Every family's circumstances are different. Our role is to listen, understand what matters to you and help coordinate practical next steps within an agreed scope.</blockquote>
      <p>This account is intentionally broad and anonymized. Identifying details have been omitted. It reflects one family's experience and does not promise a particular timeline, availability or outcome.</p>
    </article>
    <section className="sal-story-next"><div><p className="sal-eyebrow">WHEN TIME IS SHORT</p><h2>Let's talk through<br /><em>what you need.</em></h2></div><div><p>A conversation is a place to start. We'll explain the scope and discuss availability before any engagement.</p><Button asChild className="sal-button"><Link href="/end-of-life-concierge#contact">Talk to a Concierge <ArrowRight /></Link></Button><a href="tel:8885572083" className="sal-story-phone"><Phone /> 888-557-2083</a></div></section>
  </main>;
}
