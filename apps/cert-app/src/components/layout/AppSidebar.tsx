import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FilePlus2,
  History,
  Award,
  Presentation,
  LogOut,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "New Template", url: "/templates/new", icon: Presentation },
  { title: "New Batch", url: "/batches/new", icon: FilePlus2 },
  { title: "History", url: "/history", icon: History },
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
      <SidebarHeader className="p-4 flex flex-row items-center gap-2">
        <div className="bg-foreground text-background p-2 rounded-sm">
          <Award className="w-6 h-6" />
        </div>
        <div className="flex flex-col">
          <span className="font-display font-bold text-lg leading-tight text-foreground">Cephlow</span>
          <span className="text-xs text-muted-foreground font-medium">Automation</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="mt-2 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location === item.url ||
                  (item.url !== "/" && location.startsWith(item.url));

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 hover:bg-accent data-[active=true]:bg-foreground data-[active=true]:text-background"
                    >
                      <Link href={item.url}>
                        <item.icon className="w-5 h-5 text-muted-foreground group-data-[active=true]:text-background transition-colors" />
                        <span className="font-medium text-sm text-foreground/80 group-data-[active=true]:text-background group-data-[active=true]:font-semibold transition-colors">
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
      {user && (
        <SidebarFooter className="p-3 border-t border-border/40">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? "User"} />
              <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {user.displayName ?? "User"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {user.email}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
