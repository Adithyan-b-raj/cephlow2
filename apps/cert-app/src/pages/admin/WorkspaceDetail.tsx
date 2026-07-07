import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Gift, ShieldOff, ShieldAlert, BadgeCheck, BadgeX } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FeatureKey = "whatsapp_delivery" | "custom_event_banners" | "google_slides_templates" | "qr_codes";

const FEATURE_LABELS: Record<FeatureKey, string> = {
  whatsapp_delivery: "WhatsApp delivery",
  custom_event_banners: "Custom event banners",
  google_slides_templates: "Google Slides templates",
  qr_codes: "QR codes",
};

interface WorkspaceDetailData {
  workspace: {
    id: string;
    name: string;
    ownerId: string;
    ownerEmail: string | null;
    ownerApproved: boolean;
    currentBalance: number;
    suspended: boolean;
    suspendedReason: string | null;
    createdAt: string;
  };
  members: { userId: string; role: string; email: string | null }[];
  batchCount: number;
  features: Record<FeatureKey, boolean>;
}

export default function WorkspaceDetail({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<WorkspaceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    customFetch<WorkspaceDetailData>(`/api/admin/workspaces/${workspaceId}`)
      .then(setData)
      .catch((err: any) => {
        if (err?.status === 403) setUnauthorized(true);
        else toast({ title: "Failed to load workspace", description: err.message, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const toggleFeature = async (featureKey: FeatureKey, enabled: boolean) => {
    try {
      await customFetch(`/api/admin/workspaces/${workspaceId}/features/${featureKey}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      toast({ title: `${FEATURE_LABELS[featureKey]} ${enabled ? "enabled" : "disabled"}` });
      load();
    } catch (err: any) {
      toast({ title: "Failed to update feature", description: err.message, variant: "destructive" });
    }
  };

  const setOwnerApproved = async (approved: boolean) => {
    if (!data) return;
    try {
      await customFetch(`/api/admin/approvals/${data.workspace.ownerId}`, {
        method: "PATCH",
        body: JSON.stringify({ approved }),
      });
      toast({ title: approved ? "Organization approved" : "Organization unapproved" });
      load();
    } catch (err: any) {
      toast({ title: "Failed to update approval", description: err.message, variant: "destructive" });
    }
  };

  const toggleSuspend = async (suspended: boolean) => {
    const reason = suspended ? window.prompt("Reason for suspending this workspace (optional):") ?? "" : undefined;
    try {
      await customFetch(`/api/admin/workspaces/${workspaceId}/suspend`, {
        method: "PATCH",
        body: JSON.stringify({ suspended, reason }),
      });
      toast({ title: suspended ? "Workspace suspended" : "Workspace re-enabled" });
      load();
    } catch (err: any) {
      toast({ title: "Failed to update suspension", description: err.message, variant: "destructive" });
    }
  };

  if (unauthorized) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="border-2 border-foreground p-8 flex flex-col items-center gap-4 text-center max-w-sm">
          <ShieldOff className="w-8 h-8" />
          <p className="text-sm font-black uppercase tracking-widest">Access Denied</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { workspace, members, batchCount, features } = data;

  return (
    <div className="space-y-6">
      <button
        onClick={() => setLocation("/admin/workspaces")}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to workspaces
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-black">{workspace.name}</h2>
            {workspace.ownerApproved ? (
              <span className="flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 border border-green-600 text-green-600">
                <BadgeCheck className="w-3 h-3" /> APPROVED
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 border border-yellow-500 text-yellow-500">
                <BadgeX className="w-3 h-3" /> NOT APPROVED
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{workspace.ownerEmail ?? workspace.ownerId}</p>
          {workspace.suspended && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mt-1">
              Suspended{workspace.suspendedReason ? `: ${workspace.suspendedReason}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {workspace.ownerApproved ? (
            <Button size="sm" variant="outline" onClick={() => setOwnerApproved(false)}>
              <BadgeX className="w-3.5 h-3.5 mr-1.5" /> Unapprove
            </Button>
          ) : (
            <Button size="sm" onClick={() => setOwnerApproved(true)}>
              <BadgeCheck className="w-3.5 h-3.5 mr-1.5" /> Approve organization
            </Button>
          )}
          <Button size="sm" onClick={() => setCreditsOpen(true)} disabled={!workspace.ownerApproved} title={!workspace.ownerApproved ? "Approve this organization first" : undefined}>
            <Gift className="w-3.5 h-3.5 mr-1.5" /> Grant credits
          </Button>
          <Button
            size="sm"
            variant={workspace.suspended ? "outline" : "destructive"}
            onClick={() => toggleSuspend(!workspace.suspended)}
          >
            <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
            {workspace.suspended ? "Re-enable" : "Suspend"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Balance" value={workspace.currentBalance} />
        <Stat label="Members" value={members.length} />
        <Stat label="Batches" value={batchCount} />
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Feature access</p>
        {!workspace.ownerApproved && (
          <p className="text-[10px] text-yellow-500 mb-2">
            Approve this organization before granting feature access — until then these toggles have no effect.
          </p>
        )}
        <div className="border-2 border-border divide-y divide-border">
          {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-bold">{FEATURE_LABELS[key]}</span>
              <Switch
                checked={features[key]}
                onCheckedChange={(v) => toggleFeature(key, v)}
                disabled={!workspace.ownerApproved}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Members</p>
        <div className="border-2 border-border divide-y divide-border">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs">{m.email ?? m.userId}</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{m.role}</span>
            </div>
          ))}
        </div>
      </div>

      <GrantCreditsDialog
        open={creditsOpen}
        onOpenChange={setCreditsOpen}
        workspaceId={workspaceId}
        onGranted={load}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-border p-3">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}

function GrantCreditsDialog({
  open, onOpenChange, workspaceId, onGranted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onGranted: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0 || !Number.isInteger(parsedAmount)) {
      toast({ title: "Amount must be a positive whole number", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "A reason is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await customFetch(`/api/admin/workspaces/${workspaceId}/credits`, {
        method: "POST",
        body: JSON.stringify({ amount: parsedAmount, reason: reason.trim() }),
      });
      toast({ title: `Granted ${parsedAmount} credits` });
      setAmount("");
      setReason("");
      onOpenChange(false);
      onGranted();
    } catch (err: any) {
      toast({ title: "Failed to grant credits", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant free credits</DialogTitle>
          <DialogDescription>
            Credits added here bypass payment and are recorded in the ledger and audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="number"
            min={1}
            step={1}
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Textarea
            placeholder="Reason (required — e.g. goodwill credit, onboarding promo)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Gift className="w-4 h-4 mr-1.5" />}
            Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
