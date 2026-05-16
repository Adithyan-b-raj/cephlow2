import { useEffect, useState } from "react";
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
  Moon,
  Sun,
  Users,
  Palette,
  Lock,
  MessageCircle,
  MailOpen,
  Network,
  Settings,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useApproval } from "@/hooks/use-approval";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const APPROVAL_EMAIL =
  import.meta.env.VITE_APPROVAL_CONTACT_EMAIL || "approvals@cephlow.online";
const APPROVAL_WA_NUMBER = import.meta.env.VITE_APPROVAL_WA_NUMBER || "";
const APPROVAL_WA_LINK = APPROVAL_WA_NUMBER
  ? `https://wa.me/${APPROVAL_WA_NUMBER.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("hi")}`
  : "";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, approvedOnly: false },
  { title: "Templates", url: "/templates", icon: Presentation, approvedOnly: false },
  { title: "New Batch", url: "/batches/new", icon: FilePlus2, approvedOnly: false },
  { title: "History", url: "/history", icon: History, approvedOnly: false },
  { title: "Wallet", url: "/wallet", icon: Wallet, approvedOnly: true },
  { title: "Reports", url: "/reports", icon: MessageSquareWarning, approvedOnly: false },
  { title: "Settings", url: "/settings", icon: Settings, approvedOnly: false },
];

const ADVANCED_NAV_ITEMS = [
  { title: "Advanced", url: "/advanced", icon: Network, approvedOnly: false },
];

// Visible to all users, never locked
const WORKSPACE_PUBLIC_ITEMS = [
  { title: "Invitations", url: "/workspace/invitations", icon: MailOpen },
];

// Visible to workspace admins/owners only, locked when unapproved
const ADMIN_NAV_ITEMS = [
  { title: "Members", url: "/workspace/members", icon: Users },
  { title: "Brand Kit", url: "/workspace/brand", icon: Palette },
];

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { role } = useWorkspace();
  const { isApproved } = useApproval();
  const [dark, setDark] = useDarkMode();
  const [lockedModal, setLockedModal] = useState<string | null>(null);

  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";
  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  const isAdmin = role === "owner" || role === "admin";

  const btnClass =
    "group flex items-center gap-3 px-4 py-2.5 transition-none border-b border-border/30 hover:bg-muted data-[active=true]:bg-foreground data-[active=true]:text-background rounded-none w-full";

  function renderNavItem(
    title: string,
    url: string,
    Icon: React.ElementType,
    locked: boolean,
    isActive: boolean,
  ) {
    if (locked) {
      return (
        <SidebarMenuButton
          onClick={() => setLockedModal(title)}
          data-active={false}
          className={btnClass}
        >
          <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-foreground flex-1">
            {title}
          </span>
          <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
        </SidebarMenuButton>
      );
    }
    return (
      <SidebarMenuButton asChild data-active={isActive} className={btnClass}>
        <Link href={url}>
          <Icon className="w-4 h-4 shrink-0 text-muted-foreground group-data-[active=true]:text-background" />
          <span className="text-xs font-bold uppercase tracking-widest text-foreground group-data-[active=true]:text-background">
            {title}
          </span>
        </Link>
      </SidebarMenuButton>
    );
  }

  return (
    <>
      <Sidebar>
        {/* Logo + workspace switcher */}
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
          <div className="mt-3">
            <WorkspaceSwitcher />
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
                  const locked = item.approvedOnly && !isApproved;
                  return (
                    <SidebarMenuItem key={item.title}>
                      {renderNavItem(item.title, item.url, item.icon, locked, isActive)}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 pt-4 pb-1">
              Advanced
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="mt-1">
                {ADVANCED_NAV_ITEMS.map((item) => {
                  const isActive = location.startsWith(item.url);
                  const locked = item.approvedOnly && !isApproved;
                  return (
                    <SidebarMenuItem key={item.title}>
                      {renderNavItem(item.title, item.url, item.icon, locked, isActive)}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 pt-4 pb-1">
              Workspace
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="mt-1">
                {WORKSPACE_PUBLIC_ITEMS.map((item) => {
                  const isActive = location.startsWith(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      {renderNavItem(item.title, item.url, item.icon, false, isActive)}
                    </SidebarMenuItem>
                  );
                })}
                {isAdmin && ADMIN_NAV_ITEMS.map((item) => {
                  const isActive = location.startsWith(item.url);
                  const locked = !isApproved;
                  return (
                    <SidebarMenuItem key={item.title}>
                      {renderNavItem(item.title, item.url, item.icon, locked, isActive)}
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
                  {displayName || "User"}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {user.email}
                </span>
              </div>
              <button
                onClick={() => setDark(!dark)}
                className="p-1.5 text-muted-foreground hover:text-foreground border border-border hover:border-foreground transition-colors"
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
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

      {/* Approval modal for locked nav items */}
      <Dialog open={lockedModal !== null} onOpenChange={(o) => !o && setLockedModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> {lockedModal} is locked
            </DialogTitle>
            <DialogDescription>
              This feature is available to <strong>approved organizations</strong> only.
              <br /><br />
              To request approval, message our WhatsApp bot and pick the{" "}
              <strong>💬 Talk to Developer</strong> option. Share your organization name,
              website, signup email, and a short description of your use case. We'll review
              and approve usually within one business day.
              <br /><br />
              Prefer email? Reach us at{" "}
              <a href={`mailto:${APPROVAL_EMAIL}`} className="underline">{APPROVAL_EMAIL}</a>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {APPROVAL_WA_LINK && (
              <Button asChild variant="default">
                <a href={APPROVAL_WA_LINK} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" /> Open WhatsApp
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setLockedModal(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
