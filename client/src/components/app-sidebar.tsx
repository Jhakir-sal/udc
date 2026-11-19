import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileUp, 
  Users, 
  Bell, 
  ChevronRight,
  Building2,
  LogOut,
  Scale,
  FolderOpen,
  Activity,
  CreditCard,
  Settings,
  UserPlus,
  MessageSquare,
  Heart,
  Sparkles,
  FileText,
  Landmark,
  Mail,
  Search,
  HandHeart,
  ShieldCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { SalNotifications } from "@/components/sal-notifications";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import logoHorizontalWhite from "@assets/logo-horizontal-white.png";
import logoIconWhite from "@assets/logo-icon-white.png";

interface UserRole {
  role: "user" | "admin" | "funeral_home" | "planner";
  funeralHomeId?: string;
}

const caseManagementItems = [
  { title: "My case", url: "/", icon: LayoutDashboard },
  { title: "Add a death certificate", url: "/upload", icon: FileUp },
  { title: "Accounts and services", url: "/accounts", icon: Users },
  { title: "Benefits and government", url: "/benefits", icon: Building2 },
  { title: "Updates", url: "/notifications", icon: Bell },
];

const toolsItems = [
  { title: "Find accounts", url: "/credit-pull", icon: CreditCard },
  { title: "Find estate plans", url: "/estate-registry", icon: Scale },
  { title: "Vetted providers", url: "/marketplace", icon: HandHeart },
];

const adminConciergeItems = [
  { title: "Concierge Dashboard", url: "/", icon: LayoutDashboard },
  { title: "All Cases", url: "/cases", icon: FolderOpen },
  { title: "HeartPlans", url: "/heartplans", icon: Heart },
  { title: "Add Deceased", url: "/add-deceased", icon: UserPlus },
  { title: "Text Messages", url: "/sms", icon: MessageSquare },
  { title: "Marketplace review", url: "/admin/marketplace", icon: HandHeart },
  { title: "Admin Dashboard", url: "/admin", icon: Activity },
  { title: "ORSA membership", url: "/admin/orsa", icon: ShieldCheck },
  { title: "Email outreach", url: "/admin/outreach", icon: Mail },
  { title: "Asset valuations", url: "/admin/valuations", icon: Landmark },
];

const plannerItems = [
  { title: "My HeartPlan", url: "/", icon: Heart },
  { title: "Wishes", url: "/heartplan/wishes", icon: Sparkles },
  { title: "Document Vault", url: "/heartplan/vault", icon: FileText },
  { title: "Assets & Accounts", url: "/heartplan/assets", icon: Landmark },
  { title: "Trusted Contacts", url: "/heartplan/contacts", icon: Users },
  { title: "Legacy Messages", url: "/heartplan/letters", icon: Mail },
  { title: "Vetted providers", url: "/marketplace", icon: HandHeart },
  { title: "ORSA membership", url: "/orsa", icon: ShieldCheck },
];

// Family users who started their own plan get the same workspace, but the
// dashboard lives at /heartplan ("/" stays their family-case dashboard)
const familyPlannerItems = [
  { title: "My HeartPlan", url: "/heartplan", icon: Heart },
  ...plannerItems.slice(1),
];
const orsaItem = { title: "ORSA membership", url: "/orsa", icon: ShieldCheck };

const adminToolsItems = [
  { title: "Funeral Homes", url: "/funeral-home", icon: Building2 },
  { title: "Company directory", url: "/admin/companies", icon: ShieldCheck },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  const { data: roleData } = useQuery<UserRole>({
    queryKey: ["/api/user/role"],
    enabled: !!user,
  });

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "User";
    
  const isAdmin = roleData?.role === "admin";
  const isFuneralHome = roleData?.role === "funeral_home";
  const isPlanner = roleData?.role === "planner";

  const { data: smsUnread } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/sms/unread-count"],
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  const { data: myCertificates } = useQuery<{ id: string }[]>({
    queryKey: ["/api/certificates"],
    enabled: !!user && roleData?.role === "user",
  });

  // Family users can also hold their own HeartPlan (planning ahead)
  const { data: planStatus } = useQuery<{ eligible: boolean; hasPlan: boolean }>({
    queryKey: ["/api/heartplan/status"],
    enabled: !!user && roleData?.role === "user",
  });
  const hasOwnPlan = !!planStatus?.hasPlan;
  const isDemoAccount = !!(user as any)?.isDemoAccount;
  const { data: discoveryStatus } = useQuery<{ enabled: boolean; isActivated: boolean }>({
    queryKey: ["/api/heartplan/discovery/status"],
    enabled: !!user && isDemoAccount,
  });
  const discoveryItem = { title: "Account Discovery", url: "/heartplan/discovery", icon: Search };
  const visiblePlannerItems = discoveryStatus?.enabled ? [...plannerItems, discoveryItem] : plannerItems;
  const visibleFamilyPlannerItems = discoveryStatus?.enabled ? [...familyPlannerItems, discoveryItem] : familyPlannerItems;
  const visibleAdminConciergeItems = discoveryStatus?.enabled ? [...adminConciergeItems, discoveryItem] : adminConciergeItems;
  const familyPlanningItems = hasOwnPlan
    ? visibleFamilyPlannerItems
    : (discoveryStatus?.enabled ? [discoveryItem] : []);
  const hasCertificate = (myCertificates?.length || 0) > 0;
  const visibleCaseItems = caseManagementItems.filter(
    (item) => !(item.url === "/upload" && hasCertificate)
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:!p-3.5">
        <div className="flex items-center gap-3">
          {isCollapsed ? (
            <img
              src={logoIconWhite}
              alt="Steps After Life"
              className="h-9 w-9 shrink-0 rounded-md bg-[#32453A] p-0.5 object-contain dark:bg-transparent"
            />
          ) : (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="w-fit rounded-md bg-[#32453A] px-2 py-1 dark:bg-transparent">
                <img src={logoHorizontalWhite} alt="Steps After Life" className="h-7 w-auto max-w-full" />
              </div>
              <span className="text-xs text-sidebar-foreground/70 truncate">
                {isAdmin ? "Concierge Platform" : isPlanner ? "HeartPlan" : "Family support"}
              </span>
            </div>
          )}
          {!isCollapsed && isAdmin && <SalNotifications />}
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {isAdmin ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Concierge
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleAdminConciergeItems.map((item) => {
                    const isActive = location === item.url || 
                      (item.url !== "/" && location.startsWith(item.url));
                    const unreadCount = item.url === "/sms" ? (smsUnread?.count || 0) : 0;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title} className="group">
                          <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">{item.title}</span>
                            {unreadCount > 0 && (
                              <Badge className="h-5 min-w-[20px] flex items-center justify-center text-xs px-1.5 rounded-full" data-testid="badge-sms-unread">
                                {unreadCount}
                              </Badge>
                            )}
                            <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Management
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminToolsItems.map((item) => {
                    const isActive = location === item.url || 
                      (item.url !== "/" && location.startsWith(item.url));
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title} className="group">
                          <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">{item.title}</span>
                            <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : isPlanner ? (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              Planning Ahead
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visiblePlannerItems.map((item) => {
                  const isActive = location === item.url ||
                    (item.url !== "/" && location.startsWith(item.url));
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title} className="group">
                        <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.title}</span>
                          <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Your family’s case
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleCaseItems.map((item) => {
                    const isActive = location === item.url || 
                      (item.url !== "/" && location.startsWith(item.url));
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title} className="group">
                          <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">{item.title}</span>
                            <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                Helpful searches
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {toolsItems.map((item) => {
                    const isActive = location === item.url || 
                      (item.url !== "/" && location.startsWith(item.url));
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title} className="group">
                          <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                            <item.icon className="h-4 w-4" />
                            <span className="flex-1">{item.title}</span>
                            <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {roleData?.role === "user" && familyPlanningItems.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                  Planning Ahead
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {familyPlanningItems.map((item) => {
                      const isActive = item.url === "/heartplan"
                        ? location === "/heartplan"
                        : location === item.url || location.startsWith(item.url);
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild isActive={isActive} tooltip={item.title} className="group">
                            <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                              <item.icon className="h-4 w-4" />
                              <span className="flex-1">{item.title}</span>
                              <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            {roleData?.role === "user" && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">Membership</SidebarGroupLabel>
                <SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={location === "/orsa"} tooltip={orsaItem.title}><Link href={orsaItem.url}><orsaItem.icon className="h-4 w-4" /><span>{orsaItem.title}</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent>
              </SidebarGroup>
            )}
            {isFuneralHome && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                  Funeral Home
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location === "/funeral-home"} tooltip="Portal" className="group">
                        <Link href="/funeral-home" data-testid="nav-funeral-home-portal">
                          <Building2 className="h-4 w-4" />
                          <span className="flex-1">Portal</span>
                          <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        {isCollapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                    <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{userName}</TooltipContent>
            </Tooltip>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Settings">
                  <Link href="/settings" data-testid="button-settings">
                    <Settings className="h-4 w-4" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Sign Out">
                  <a href="/api/logout" onClick={() => { try { sessionStorage.removeItem("sal-greet-lock"); } catch {} }} data-testid="button-logout">
                    <LogOut className="h-4 w-4" />
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-2 rounded-md bg-sidebar-accent/30">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-sidebar-foreground truncate" data-testid="text-username">
                  {userName}
                </span>
                <span className="text-xs text-sidebar-foreground/60 truncate">
                  {user?.email || ""}
                </span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
              asChild
              data-testid="button-settings"
            >
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Account settings</span>
              </Link>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
              asChild
              data-testid="button-logout"
            >
              <a href="/api/logout" onClick={() => { try { sessionStorage.removeItem("sal-greet-lock"); } catch {} }}>
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </a>
            </Button>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
