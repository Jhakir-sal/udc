import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { ThemeLogo } from "@/components/theme-logo";

const publicLinks = [
  { href: "/login", label: "Family sign in", cta: "login", desktopTestId: "button-family-login", mobileTestId: "button-family-login-menu" },
  { href: "/blockchain", label: "Partner portal", cta: "partner_portal", desktopTestId: "button-blockchain-portal", mobileTestId: "button-blockchain-mobile" },
  { href: "/heartplan-register", label: "Make a HeartPlan", cta: "heartplan", desktopTestId: "button-heartplan-header", mobileTestId: "button-heartplan-header-mobile" },
  { href: "/end-of-life-concierge", label: "End-of-Life Concierge", cta: null, desktopTestId: "link-concierge-header", mobileTestId: "link-concierge-header-mobile" },
  { href: "/register", label: "Create account", cta: "register", desktopTestId: "button-family-register-desktop", mobileTestId: "button-family-register-mobile" },
  { href: "/team-login", label: "Team sign in", cta: "team_login", desktopTestId: "button-login", mobileTestId: "button-team-login-mobile" },
  { href: "/demo", label: "View demo", cta: "demo", desktopTestId: "button-demo", mobileTestId: "button-demo-mobile" },
] as const;

const publicPagePaths = new Set([
  "/", "/login", "/team-login", "/team-register", "/auth/complete",
  "/family-register", "/register", "/heartplan", "/heartplan-register",
  "/forgot-password", "/blockchain", "/demo", "/demo/select",
  "/demo/heartplan", "/demo/family", "/demo/partner", "/demo/lpoa",
  "/report-loss", "/activation-confirm", "/legal/terms", "/legal/privacy",
  "/legal/tcpa", "/orsa/heartplan", "/end-of-life-concierge", "/stories/bringing-him-home",
]);

function isPublicPage(path: string) {
  return publicPagePaths.has(path)
    || path.startsWith("/funeral-home-upload/")
    || path.startsWith("/outreach/unsubscribe/")
    || path.startsWith("/heartplan/advisor/")
    || path.startsWith("/referral-confirmation/");
}

function trackHeaderClick(cta: typeof publicLinks[number]["cta"] | null, placement: "header_desktop" | "header_mobile") {
  if (cta && window.location.pathname === "/") {
    trackAnalyticsEvent("landing_cta_click", { cta, placement });
  }
}

function PublicSiteHeader({ signedInNonDemo, dashboardHref }: { signedInNonDemo: boolean; dashboardHref: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [path] = useLocation();

  useEffect(() => setMenuOpen(false), [path]);
  const links = signedInNonDemo
    ? [
        { href: dashboardHref, label: "Dashboard", cta: null, desktopTestId: "button-public-dashboard", mobileTestId: "button-public-dashboard-mobile" },
        { href: "/report-loss", label: "Report a loss", cta: null, desktopTestId: "button-public-report-loss", mobileTestId: "button-public-report-loss-mobile" },
      ]
    : publicLinks;
  const primaryHref = signedInNonDemo ? dashboardHref : "/login";
  const primaryLabel = signedInNonDemo ? "Dashboard" : "Family sign in";

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background">
      <div className="mx-auto flex min-h-[4.5rem] max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={signedInNonDemo ? dashboardHref : "/"} className="min-w-0 rounded-sm" aria-label="Steps After Life home">
          <ThemeLogo className="h-auto max-h-9 w-auto max-w-full object-contain sm:max-h-10" />
        </Link>

        <nav aria-label="Public navigation" className="hidden items-center gap-1 2xl:flex">
          {links.map(({ href, label, cta, desktopTestId }) => (
            <Button key={href} asChild variant="ghost" size="sm" className="whitespace-nowrap px-3 text-sm" data-testid={desktopTestId}>
              <Link href={href} onClick={() => trackHeaderClick(cta, "header_desktop")}>{label}</Link>
            </Button>
          ))}
          <ThemeToggle />
        </nav>

        <div className="flex shrink-0 items-center gap-2 2xl:hidden">
          <ThemeToggle />
          <Button asChild variant="outline" size="sm" className="hidden min-h-10 text-sm sm:inline-flex" data-testid={signedInNonDemo ? "button-public-dashboard-compact" : "button-family-login-mobile"}>
            <Link href={primaryHref} onClick={() => trackHeaderClick(signedInNonDemo ? null : "login", "header_mobile")}>{primaryLabel}</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-10 min-w-10"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="public-mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="public-mobile-navigation"
          aria-label="Public navigation"
          className="border-t border-border/70 bg-background px-4 py-3 sm:px-6 2xl:hidden"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-2 sm:grid-cols-2">
            {links.map(({ href, label, cta, mobileTestId }) => (
              <Button
                key={href}
                asChild
                variant="outline"
                className="min-h-11 justify-start"
                data-testid={mobileTestId}
              >
                <Link href={href} onClick={() => {
                  trackHeaderClick(cta, "header_mobile");
                  setMenuOpen(false);
                }}>{label}</Link>
              </Button>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

function PublicSiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/80 bg-muted/35">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="max-w-md">
          <ThemeLogo className="h-8 w-auto sm:h-9" />
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Practical support for families, before a loss and through the steps that follow.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Steps After Life. All rights reserved.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
          <Link className="rounded-sm text-foreground/80 underline-offset-4 hover:text-primary hover:underline" href="/report-loss">
            Report a loss
          </Link>
          <Link className="rounded-sm text-foreground/80 underline-offset-4 hover:text-primary hover:underline" href="/end-of-life-concierge">
            End-of-Life Concierge
          </Link>
          <Link className="rounded-sm text-foreground/80 underline-offset-4 hover:text-primary hover:underline" href="/legal/terms">
            Terms
          </Link>
          <Link className="rounded-sm text-foreground/80 underline-offset-4 hover:text-primary hover:underline" href="/legal/privacy">
            Privacy
          </Link>
          <Link className="rounded-sm text-foreground/80 underline-offset-4 hover:text-primary hover:underline" href="/legal/tcpa">
            Communications terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export default function PublicSiteShell({ children, signedInNonDemo = false, dashboardHref = "/" }: { children: ReactNode; signedInNonDemo?: boolean; dashboardHref?: string }) {
  const [path, navigate] = useLocation();
  const previousPath = useRef(path);

  useEffect(() => {
    if (previousPath.current !== path) {
      previousPath.current = path;
      window.scrollTo(0, 0);
    }
  }, [path]);

  // Page content still has ordinary anchors. Handle same-tab links to public
  // pages here without intercepting downloads, external links, or new tabs.
  function handlePublicLinkClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link || !event.currentTarget.contains(link) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname || !isPublicPage(destination.pathname)) return;
    event.preventDefault();
    navigate(`${destination.pathname}${destination.search}${destination.hash}`);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground" onClick={handlePublicLinkClick}>
      <a
        href="#public-page-content"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <PublicSiteHeader signedInNonDemo={signedInNonDemo} dashboardHref={dashboardHref} />
      <div key={path} id="public-page-content" tabIndex={-1} className="flex flex-1 flex-col [&>*]:flex-1">
        {children}
      </div>
      <PublicSiteFooter />
    </div>
  );
}
