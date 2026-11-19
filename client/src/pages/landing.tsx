import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, FileCheck, Bell, CheckCircle, Link2, Heart, Users, Mail } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics";

export default function Landing() {
  return (
    <div className="flex flex-col">
      <main className="flex-1">
        <section className="container mx-auto px-4 py-10 sm:py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
            <div className="space-y-7">
              <p className="text-sm font-semibold tracking-wide text-primary">PRACTICAL CARE, WHEN IT MATTERS</p>
              <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Support for the tasks that follow a loss.
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg max-w-lg">
                We help families handle important accounts, notices, and documents after someone dies. You can also make a HeartPlan now, so the people you love have clear guidance later.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                <Button size="lg" className="w-full sm:w-auto" asChild data-testid="button-sign-in-hero">
                   <a href="/register" onClick={() => trackAnalyticsEvent("landing_cta_click", { cta: "register", placement: "hero" })}>Create a family account</a>
                </Button>
                <Button size="lg" variant="ghost" className="w-full sm:w-auto" asChild data-testid="button-demo-hero">
                   <a href="/demo" onClick={() => trackAnalyticsEvent("landing_cta_click", { cta: "demo", placement: "hero" })}>Explore the demo</a>
                </Button>
              </div>
               <p className="text-sm text-muted-foreground">
                 Planning ahead? <a href="/heartplan-register" className="font-medium text-primary underline underline-offset-4">Start a free HeartPlan</a>
               </p>
                <p className="text-sm text-muted-foreground">
                  Facing the final weeks? <a href="/end-of-life-concierge" className="font-medium text-primary underline underline-offset-4">Meet our End-of-Life Concierge</a>
                </p>
               <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <a
                  href="/login"
                   onClick={() => trackAnalyticsEvent("landing_cta_click", { cta: "login", placement: "hero" })}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                  data-testid="link-family-sign-in"
                >
                  Sign in here
                </a>
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:text-sm">
                <span className="flex items-center gap-2">
                  <img
                    src="/soc2-badge.png"
                    alt="SOC 2 Compliant — Advantage Partners"
                    className="h-9 w-auto"
                  />
                  <span>SOC 2 Compliant</span>
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Records protected
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-4 w-4" />
                  Personal information protected
                </span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-primary/5 rounded-lg" />
              <div className="relative bg-card border rounded-lg p-4 shadow-lg sm:p-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                    <Link2 className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">A secure record number keeps personal details private</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                    <FileCheck className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">Documents are checked and stored securely</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                    <Bell className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">Providers receive only the information they need</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-md border border-green-500/20">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Each task has a clear next step</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30 py-12 sm:py-16" aria-labelledby="after-death-support-heading">
          <div className="container mx-auto grid gap-6 px-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-semibold tracking-wide text-primary">SUPPORT THROUGH THE NEXT CHAPTER</p>
              <h2 id="after-death-support-heading" className="mt-2 font-serif text-3xl font-bold tracking-tight">Help for the weeks before and the steps after.</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">If your family is navigating a loved one's final weeks, our concierge can help coordinate practical details alongside the care team.</p>
            </div>
            <Button size="lg" className="w-full sm:w-auto" asChild data-testid="button-end-of-life-concierge">
              <a href="/end-of-life-concierge">Explore End-of-Life Concierge</a>
            </Button>
          </div>
        </section>

        <section className="border-t py-12 sm:py-16 md:py-20" id="heartplan">
          <div className="container mx-auto px-4">
            <div className="grid gap-12 lg:grid-cols-2 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm font-medium">
                  <Heart className="h-4 w-4 text-primary" />
                  HeartPlan
                </div>
                <h2 className="font-serif text-3xl font-bold tracking-tight md:text-4xl">
                  Plan Ahead with HeartPlan
                </h2>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Put your wishes, important documents, and messages in one secure place. Choose the people who should be contacted. They will have clear information when they need it.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button size="lg" className="w-full sm:w-auto" asChild data-testid="button-heartplan-register">
                    <a href="/heartplan-register">Start a free HeartPlan</a>
                  </Button>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild data-testid="button-heartplan-signin">
                    <a href="/login">Sign in to your plan</a>
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="hover-elevate">
                  <CardContent className="pt-6 space-y-2">
                    <FileCheck className="h-6 w-6 text-primary" />
                    <h3 className="font-semibold">Your Wishes, Documented</h3>
                    <p className="text-sm text-muted-foreground">
                      Write down funeral preferences and other instructions in one secure place.
                    </p>
                  </CardContent>
                </Card>
                <Card className="hover-elevate">
                  <CardContent className="pt-6 space-y-2">
                    <Mail className="h-6 w-6 text-primary" />
                    <h3 className="font-semibold">Legacy Messages</h3>
                    <p className="text-sm text-muted-foreground">
                      Leave written, audio, or video messages for the people you choose.
                    </p>
                  </CardContent>
                </Card>
                <Card className="hover-elevate">
                  <CardContent className="pt-6 space-y-2">
                    <Users className="h-6 w-6 text-primary" />
                    <h3 className="font-semibold">Trusted Contacts</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose who is notified and who we contact first.
                    </p>
                  </CardContent>
                </Card>
                <Card className="hover-elevate">
                  <CardContent className="pt-6 space-y-2">
                    <Shield className="h-6 w-6 text-primary" />
                  <h3 className="font-semibold">A clear handoff</h3>
                    <p className="text-sm text-muted-foreground">
                      Your plan gives your chosen people a clear place to begin.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30 py-12 sm:py-16">
          <div className="container mx-auto px-4">
            <h2 className="font-serif text-3xl font-bold text-center mb-4">
              How It Works
            </h2>
            <p className="text-center text-sm leading-relaxed text-muted-foreground mb-8 sm:mb-12 sm:text-base max-w-2xl mx-auto">
              An approved partner organization creates a secure record number.
              Our care team uses that number to find the case without sharing personal information.
            </p>
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="hover-elevate">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">1</div>
                    <h3 className="font-semibold text-lg">Create a secure record number</h3>
                    <p className="text-sm text-muted-foreground">
                      An approved partner enters the certificate details. The portal creates a
                      Blockchain ID, which is a secure record number used in place of personal details.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">2</div>
                    <h3 className="font-semibold text-lg">Find the right case</h3>
                    <p className="text-sm text-muted-foreground">
                      Our care team uses the secure record number to find the case. Names,
                      Social Security numbers, and other personal details stay protected.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">3</div>
                    <h3 className="font-semibold text-lg">Take care of the next steps</h3>
                    <p className="text-sm text-muted-foreground">
                      With the family's permission, our team finds open accounts, contacts
                      service providers, helps protect credit, and tracks the work.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-2 lg:grid-cols-4">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">100%</div>
                <div className="text-sm text-muted-foreground mt-1">Personal details protected</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">24/7</div>
                <div className="text-sm text-muted-foreground mt-1">Secure service</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">256-bit</div>
                <div className="text-sm text-muted-foreground mt-1">Strong encryption</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">
                  <Shield className="h-8 w-8 mx-auto" />
                </div>
                <div className="text-sm text-muted-foreground mt-1">Records can be verified</div>
              </div>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
