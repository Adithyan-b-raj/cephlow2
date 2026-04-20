import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FilePlus2,
  History,
  Award,
  Presentation,
  LogOut,
  Wallet,
  MessageSquareWarning,
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
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";


const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "New Template", url: "/templates/new", icon: Presentation },
  { title: "New Batch", url: "/batches/new", icon: FilePlus2 },
  { title: "History", url: "/history", icon: History },
  { title: "Wallet", url: "/wallet", icon: Wallet },
  { title: "Reports", url: "/reports", icon: MessageSquareWarning },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <Sidebar>
      {/* Logo */}
      <SidebarHeader className="p-4 border-b-2 border-border">
        <div className="flex flex-row items-center gap-3">
          <div className="bg-foreground text-background p-2">
            <Award className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-black text-base leading-tight tracking-widest uppercase">Cephlow</span>
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">Automation</span>
          </div>
        </div>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 pt-4 pb-1">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="mt-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.url ||
                  (item.url !== "/" && location.startsWith(item.url));

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-none border-b border-border/30 hover:bg-muted data-[active=true]:bg-foreground data-[active=true]:text-background rounded-none"
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4 shrink-0 text-muted-foreground group-data-[active=true]:text-background" />
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground group-data-[active=true]:text-background">
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* User footer */}
      {user && (
        <SidebarFooter className="p-4 border-t-2 border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 shrink-0 bg-foreground text-background flex items-center justify-center text-xs font-black">
              {initials}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wide truncate">
                {user.displayName ?? "User"}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {user.email}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-muted-foreground hover:text-foreground border border-border hover:border-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
