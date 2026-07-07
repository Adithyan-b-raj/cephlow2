import { useLocation, useRoute } from "wouter";
import { ShieldCheck } from "lucide-react";
import WorkspacesList from "./WorkspacesList";
import WorkspaceDetail from "./WorkspaceDetail";
import Approvals from "./Approvals";
import AuditLog from "./AuditLog";

type Tab = "workspaces" | "approvals" | "audit-log";

const TABS: { key: Tab; label: string }[] = [
  { key: "workspaces", label: "Workspaces" },
  { key: "approvals", label: "Approvals" },
  { key: "audit-log", label: "Audit Log" },
];

export default function AdminLayout() {
  const [location, setLocation] = useLocation();
  const [isWorkspaceDetail, workspaceParams] = useRoute("/admin/workspaces/:id");

  if (isWorkspaceDetail) {
    return (
      <div className="min-h-screen bg-background font-mono">
        <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
          <Header />
          <WorkspaceDetail workspaceId={workspaceParams.id} />
        </div>
      </div>
    );
  }

  // Tab is derived from the URL (not local state) so reload/back/forward keep
  // the right tab selected; bare /admin defaults to the workspaces tab.
  const tab: Tab = TABS.some((t) => location === `/admin/${t.key}`)
    ? (location.slice("/admin/".length) as Tab)
    : "workspaces";

  return (
    <div className="min-h-screen bg-background font-mono">
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
        <Header />

        <div className="flex border-2 border-foreground w-fit overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setLocation(`/admin/${t.key}`)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap
                ${tab === t.key ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "workspaces" && <WorkspacesList />}
        {tab === "approvals" && <Approvals />}
        {tab === "audit-log" && <AuditLog />}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-foreground text-background p-2.5 shrink-0">
        <ShieldCheck className="w-5 h-5" />
      </div>
      <div>
        <h1 className="text-lg font-black uppercase tracking-widest">Platform Admin</h1>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Manage organizations, credits, features &amp; access
        </p>
      </div>
    </div>
  );
}
