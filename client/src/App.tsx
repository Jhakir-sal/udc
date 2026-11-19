import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CaseRegistrationReference } from "@/components/case-registration-reference";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import Dashboard from "@/pages/dashboard";
import UploadCertificate from "@/pages/upload-certificate";
import ConnectedAccounts from "@/pages/connected-accounts";
import Notifications from "@/pages/notifications";
import Benefits from "@/pages/benefits";
import AdminDashboard from "@/pages/admin-dashboard";
import FuneralHomePortal from "@/pages/funeral-home-portal";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import FamilyRegister from "@/pages/family-register";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import CompleteVerification from "@/pages/complete-verification";
import Onboarding from "@/pages/onboarding";
import SearchPage from "@/pages/search";
import CreditPullPage from "@/pages/credit-pull";
import EstatePlans from "@/pages/estate-plans";
import CaseDetailPage from "@/pages/case-detail";
import CasesPage from "@/pages/cases";
import AddDeceasedPage from "@/pages/add-deceased";
import BlockchainPortal from "@/pages/blockchain-portal";
import SettingsPage from "@/pages/settings";
import SmsConversationsPage from "@/pages/sms-conversations";
import PaymentSuccessPage from "@/pages/payment-success";
import HeartPlanRegister from "@/pages/heartplan-register";
import HeartPlanDashboard from "@/pages/heartplan/dashboard";
import PlanAheadPage from "@/pages/heartplan/plan-ahead";
import HeartPlanWishes from "@/pages/heartplan/wishes";
import HeartPlanVault from "@/pages/heartplan/vault";
import HeartPlanAssets from "@/pages/heartplan/assets";
import HeartPlanContacts from "@/pages/heartplan/contacts";
import HeartPlanLetters from "@/pages/heartplan/letters";
import AccountDiscovery from "@/pages/heartplan/account-discovery";
import AdminHeartPlansPage from "@/pages/admin-heartplans";
import AdminHeartPlanDetailPage from "@/pages/admin-heartplan-detail";
import { isPersonalHeartPlanPath } from "@/lib/heartplan-routes";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";
import { SallyChat, CaseSallyHelpButton } from "@/components/sally-chat";
import ReportLossPage from "@/pages/report-loss";
import ActivationConfirmPage from "@/pages/activation-confirm";
import LegalDocument from "@/pages/legal-document";
import { useEffect } from "react";
import Marketplace from "@/pages/marketplace";
import AdminMarketplace from "@/pages/admin-marketplace";
import HeartPlanWelcome from "@/pages/heartplan/welcome";
import HeartPlanAdvisorPage from "@/pages/heartplan/advisor";
import OrsaPage from "@/pages/orsa";
import OrsaMemberHeartPlanPage from "@/pages/orsa-member-heartplan";
import PrudentialHeartPlanPage from "@/pages/prudential-heartplan";
import AdminOrsaPage from "@/pages/admin-orsa";
import AdminOutreachPage from "@/pages/admin-outreach";
import OutreachUnsubscribe from "@/pages/outreach-unsubscribe";
import AdminHardAssetValuations from "@/pages/admin-hard-asset-valuations";
import {
  DEMO_EXPERIENCE_STORAGE_KEY,
  DemoExperienceSelector,
  DemoFamilyExperience,
  DemoHeartPlanExperience,
  DemoLpoaExperience,
  DemoPartnerExperience,
} from "@/pages/demo-experience";
import { DEMO_EXPERIENCE_SELECTOR_EMAIL } from "@shared/demoAccounts";
import { Button } from "@/components/ui/button";
import ReferralConfirmationPage from "@/pages/referral-confirmation";
import CompanyPortal from "@/pages/company-portal";
import AdminCompanies from "@/pages/admin-companies";
import FuneralHomeUploadPage from "@/pages/funeral-home-upload";
import PublicSiteShell from "@/components/public-site-shell/PublicSiteShell";
import FamilyAccessPage from "@/pages/family-access";
import EndOfLifeConciergePage from "@/pages/end-of-life-concierge";
import BringingHimHomeStory from "@/pages/bringing-him-home";

function CanonicalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/upload" component={UploadCertificate} />
      <Route path="/accounts" component={ConnectedAccounts} />
      <Route path="/benefits" component={Benefits} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/marketplace/:id" component={Marketplace} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/credit-pull" component={CreditPullPage} />
      <Route path="/estate-registry" component={EstatePlans} />
      <Route path="/search" component={SearchPage} />
      <Route path="/cases" component={CasesPage} />
      <Route path="/add-deceased" component={AddDeceasedPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/marketplace" component={AdminMarketplace} />
      <Route path="/admin/orsa" component={AdminOrsaPage} />
      <Route path="/admin/outreach" component={() => <AdminOutreachPage />} />
      <Route path="/admin/valuations" component={AdminHardAssetValuations} />
      <Route path="/admin/companies" component={AdminCompanies} />
      <Route path="/admin/case/:certId" component={CaseDetailPage} />
      <Route path="/heartplans" component={AdminHeartPlansPage} />
      <Route path="/admin/heartplan/:planId" component={AdminHeartPlanDetailPage} />
      {/* Existing family users can plan ahead without losing their case access */}
      <Route path="/heartplan" component={PlanAheadPage} />
      <Route path="/heartplan/wishes">
        <RequireHeartPlan component={HeartPlanWishes} />
      </Route>
      <Route path="/heartplan/vault">
        <RequireHeartPlan component={HeartPlanVault} />
      </Route>
      <Route path="/heartplan/assets">
        <RequireHeartPlan component={HeartPlanAssets} />
      </Route>
      <Route path="/heartplan/contacts">
        <RequireHeartPlan component={HeartPlanContacts} />
      </Route>
      <Route path="/heartplan/letters">
        <RequireHeartPlan component={HeartPlanLetters} />
      </Route>
      <Route path="/heartplan/discovery" component={AccountDiscovery} />
      <Route path="/heartplan/welcome">
        <RequireHeartPlan component={HeartPlanWelcome} />
      </Route>
      <Route path="/funeral-home" component={FuneralHomePortal} />
      <Route path="/sms" component={SmsConversationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/family-access" component={FamilyAccessPage} />
      <Route path="/orsa" component={OrsaPage} />
      <Route path="/payment-success" component={PaymentSuccessPage} />
      <Route path="/referral-confirmation/:id" component={ReferralConfirmationPage} />
      <Route path="/company-portal" component={CompanyPortal} />
      <Route path="/onboarding">
        <Redirect to="/" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

// Planner accounts get the HeartPlan workspace instead of the case dashboard
function PlannerRouter() {
  return (
    <Switch>
      <Route path="/" component={HeartPlanDashboard} />
      <Route path="/heartplan" component={HeartPlanDashboard} />
      <Route path="/heartplan/wishes" component={HeartPlanWishes} />
      <Route path="/heartplan/vault" component={HeartPlanVault} />
      <Route path="/heartplan/assets" component={HeartPlanAssets} />
      <Route path="/heartplan/contacts" component={HeartPlanContacts} />
      <Route path="/heartplan/letters" component={HeartPlanLetters} />
      <Route path="/heartplan/discovery" component={AccountDiscovery} />
      <Route path="/heartplan/welcome" component={HeartPlanWelcome} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/marketplace/:id" component={Marketplace} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/orsa" component={OrsaPage} />
      <Route path="/company-portal" component={CompanyPortal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp({ isPlanner, showDemoSwitcher, registrationCaseId }: { isPlanner: boolean; showDemoSwitcher: boolean; registrationCaseId?: string | null }) {
  const style = {
    "--sidebar-width": "280px",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-[100dvh] w-full min-w-0">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2 sm:px-4 sm:py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="h-10 w-10 shrink-0" data-testid="button-sidebar-toggle" />
            <div className="min-w-0 flex-1 basis-0">
              <CaseRegistrationReference caseId={registrationCaseId} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              {showDemoSwitcher && (
                <Button variant="outline" size="sm" onClick={() => window.location.href = "/demo/select"}>
                  Switch experience
                </Button>
              )}
              <CaseSallyHelpButton />
              <ThemeToggle />
            </div>
          </header>
          <main className="min-h-0 min-w-0 flex-1 overflow-auto">
            {isPlanner ? <PlannerRouter /> : <Router />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [path] = useLocation();
  const withPublicShell = (content: React.ReactNode) => (
    <PublicSiteShell
      signedInNonDemo={isAuthenticated && !(user as any)?.isDemoAccount}
      dashboardHref={user?.destination || "/"}
    >{content}</PublicSiteShell>
  );

  const isFamilyUser = isAuthenticated && (user as any)?.role === "user" && !(user as any)?.isDemoAccount;
  const isPlanner = isAuthenticated && (user as any)?.role === "planner";
  const onboardingQuery = useQuery<{
    complete: boolean;
    certificateId?: string | null;
    sharedMember?: boolean;
    memberSafeguardsRequired?: boolean;
    idVerificationStatus?: "not_started" | "pending" | "verified" | "failed";
    idVerificationFallbackAvailable?: boolean;
  }>({
    queryKey: ["/api/onboarding/status"],
    enabled: isFamilyUser,
  });
  const heartPlanWelcomeQuery = useQuery<{ required: boolean }>({
    queryKey: ["/api/heartplan/intake"],
    enabled: isPlanner,
  });

  if (isLoading || (isFamilyUser && onboardingQuery.isLoading) || (isPlanner && heartPlanWelcomeQuery.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // These pages are available regardless of auth state. Keep this after
  // loading so auth resolution cannot be bypassed.
  if (path.startsWith("/funeral-home-upload/")) return withPublicShell(<FuneralHomeUploadPage />);
  if (path === "/report-loss") return withPublicShell(<ReportLossPage />);
  if (path === "/activation-confirm") return withPublicShell(<ActivationConfirmPage />);
  if (path === "/legal/terms") return withPublicShell(<LegalDocument kind="terms" />);
  if (path === "/legal/privacy") return withPublicShell(<LegalDocument kind="privacy" />);
  if (path === "/legal/tcpa") return withPublicShell(<LegalDocument kind="tcpa" />);
  if (path === "/end-of-life-concierge") return withPublicShell(<EndOfLifeConciergePage />);
  if (path === "/stories/bringing-him-home") return withPublicShell(<BringingHimHomeStory />);
  if (path === "/orsa/heartplan") return withPublicShell(<OrsaMemberHeartPlanPage />);
  if (path === "/prudential" || path === "/prudential/heartplan") return withPublicShell(<PrudentialHeartPlanPage />);
  if (path.startsWith("/outreach/unsubscribe/")) return withPublicShell(<OutreachUnsubscribe />);

  if (!isAuthenticated) {
    if (path.startsWith("/referral-confirmation/")) return withPublicShell(<Login />);
    if (path.startsWith("/heartplan/advisor/")) return withPublicShell(<Login />);
    if (path === "/login" || path === "/team-login" || path === "/team-register" || path === "/auth/complete") return withPublicShell(<Login />);
    if (path === "/family-register") return withPublicShell(<FamilyRegister />);
    if (path === "/register") return withPublicShell(<Register />);
    if (path === "/heartplan") return withPublicShell(<HeartPlanRegister />);
    if (path === "/heartplan-register") return withPublicShell(<HeartPlanRegister />);
    if (path === "/forgot-password") return withPublicShell(<ForgotPassword />);
    if (path === "/blockchain") return withPublicShell(<BlockchainPortal />);
    if (path === "/demo") return withPublicShell(<DemoExperienceSelector />);
    if (path === "/demo/heartplan") return withPublicShell(<DemoHeartPlanExperience />);
    if (path === "/demo/family") return withPublicShell(<DemoFamilyExperience />);
    if (path === "/demo/partner") return withPublicShell(<DemoPartnerExperience />);
    if (path === "/demo/lpoa") return withPublicShell(<DemoLpoaExperience />);
    return withPublicShell(<Landing />);
  }

  const destination = user?.destination || "/";
  const role = user?.role;
  if (path.startsWith("/referral-confirmation/")) return withPublicShell(<ReferralConfirmationPage />);
  if (path.startsWith("/heartplan/advisor/")) return withPublicShell(<HeartPlanAdvisorPage />);
  const isDemoAccount = !!(user as any)?.isDemoAccount;
  if (isDemoAccount && path === "/") return withPublicShell(<Landing />);
  if (isDemoAccount && (path === "/demo" || path === "/demo/select")) return withPublicShell(<DemoExperienceSelector />);
  if (isDemoAccount && path === "/demo/heartplan") return withPublicShell(<DemoHeartPlanExperience />);
  if (isDemoAccount && path === "/demo/family") return withPublicShell(<DemoFamilyExperience />);
  if (isDemoAccount && path === "/demo/partner") return withPublicShell(<DemoPartnerExperience />);
  if (isDemoAccount && path === "/demo/lpoa") return withPublicShell(<DemoLpoaExperience />);
  // Preserve the demo account's public entry links without granting access to
  // signed-out-only registration or partner portal pages.
  if (isDemoAccount && (path === "/register" || path === "/family-register")) return <CanonicalRedirect to="/demo/family" />;
  if (isDemoAccount && path === "/heartplan-register") return <CanonicalRedirect to="/demo/heartplan" />;
  if (isDemoAccount && path === "/blockchain") return <CanonicalRedirect to="/demo/partner" />;
  // Invitation acceptance remains reachable for ordinary signed-in users too,
  // so the API can explain when the current account is not the invited member.
  if (path === "/family-register") return withPublicShell(<FamilyRegister />);
  const demoSelectorEligible =
    isDemoAccount &&
    user?.email?.trim().toLowerCase() === DEMO_EXPERIENCE_SELECTOR_EMAIL;
  const selectedDemoExperience = window.sessionStorage.getItem(DEMO_EXPERIENCE_STORAGE_KEY);

  if (demoSelectorEligible && path !== "/") {
    if (path === "/demo/select") return withPublicShell(<DemoExperienceSelector />);
    if (!selectedDemoExperience) return <CanonicalRedirect to="/demo/select" />;
  }

  const legacyAuthPaths = ["/login", "/team-login", "/team-register", "/auth/complete", "/forgot-password"];
  if (legacyAuthPaths.includes(path)) return <CanonicalRedirect to={destination} />;
  if ((path === "/admin" || path.startsWith("/admin/") || path === "/heartplans" || path === "/sms") && role !== "admin") {
    return <CanonicalRedirect to={destination} />;
  }
  if ((path === "/funeral-home") && role !== "admin" && role !== "funeral_home") {
    return <CanonicalRedirect to={destination} />;
  }
  if (isPersonalHeartPlanPath(path) && role !== "planner" && role !== "user" && !(user as any)?.isDemoAccount) {
    return <CanonicalRedirect to={destination} />;
  }
  const welcomeSupportPaths = ["/heartplan/vault", "/heartplan/assets", "/marketplace", "/orsa"];
  const isWelcomeSupportPath = welcomeSupportPaths.some(supportPath => path === supportPath || path.startsWith(`${supportPath}/`));
  if (isPlanner && heartPlanWelcomeQuery.data?.required && path !== "/heartplan/welcome" && !isWelcomeSupportPath) {
    return <CanonicalRedirect to="/heartplan/welcome" />;
  }

  // A new family may register before a case exists. Let them reach the
  // certificate-first dashboard and upload flow; case-specific authorization
  // remains gated once the case is linked.
  if (isFamilyUser) {
    if (onboardingQuery.isError || !onboardingQuery.data) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't verify your account status. Please check your connection and try again.
          </p>
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            onClick={() => onboardingQuery.refetch()}
            data-testid="button-retry-onboarding-status"
          >
            Try again
          </button>
        </div>
      );
    }
    if (onboardingQuery.data.sharedMember && onboardingQuery.data.memberSafeguardsRequired) {
      if (path === "/" || path === "/onboarding") return <CanonicalRedirect to="/family-access" />;
      if (path === "/complete-verification") return <CompleteVerification />;
      if (path === "/family-access" || path === "/settings") {
        return <AuthenticatedApp isPlanner={false} showDemoSwitcher={demoSelectorEligible} registrationCaseId={onboardingQuery.data.certificateId} />;
      }
      return <CanonicalRedirect to="/family-access" />;
    }
    const mayReturnToDashboardAfterIdFailure =
      path === "/" &&
      !!onboardingQuery.data.idVerificationFallbackAvailable;
    if (!onboardingQuery.data.certificateId && !onboardingQuery.data.complete) {
      if (path !== "/" && path !== "/upload") return <CanonicalRedirect to="/" />;
      return <AuthenticatedApp isPlanner={false} showDemoSwitcher={demoSelectorEligible} registrationCaseId={onboardingQuery.data.certificateId} />;
    }
    if (!onboardingQuery.data.complete && !mayReturnToDashboardAfterIdFailure) {
      return <Onboarding />;
    }
  }

  // Allow access to complete-verification page if user wants to verify
  if (path === "/complete-verification") {
    return <CompleteVerification />;
  }

  return <AuthenticatedApp isPlanner={role === "planner"} showDemoSwitcher={demoSelectorEligible} registrationCaseId={isFamilyUser ? onboardingQuery.data?.certificateId : null} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="steps-after-life-theme">
        <TooltipProvider>
          <AppContent />
          <SallyChat />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

function RequireHeartPlan({ component: Component }: { component: React.ComponentType }) {
  const { data: status, isLoading } = useQuery<{ eligible: boolean; hasPlan: boolean }>({
    queryKey: ["/api/heartplan/status"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.hasPlan) {
    return <Redirect to="/heartplan" />;
  }

  return <Component />;
}
