import { useState, useEffect } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useApproval } from "@/hooks/use-approval";
import { customFetch } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type ClickSound,
  CLICK_SOUND_LABELS,
  getClickSoundEnabled,
  getClickSound,
  getClickVolume,
  setClickVolume,
  previewSound,
} from "@/hooks/use-mechanical-click";
import { type Theme, THEME_LABELS, useThemePreference } from "@/hooks/use-theme";
import { updatePassword, updateUserProfile } from "@/lib/supabase";

export default function Settings() {
  const { user, googleAuthStatus, connectGoogle, disconnectGoogle, recheckGoogleAuth, logout } = useAuth();
  const { toast } = useToast();
  const { isApproved } = useApproval();
  const [loading, setLoading] = useState(false);

  // Deletion states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (confirmEmail.toLowerCase().trim() !== user?.email?.toLowerCase().trim()) {
      toast({ title: "Email does not match", variant: "destructive" });
      return;
    }
    setDeleting(true);
    try {
      await customFetch("/api/me/delete-account", {
        method: "POST",
        body: JSON.stringify({ email: confirmEmail.trim() }),
      });
      toast({ title: "Account deleted successfully." });
      setDeleteConfirmOpen(false);
      await logout();
    } catch (err: any) {
      toast({
        title: "Deletion failed",
        description: err?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("google_auth");
    if (!status) return;
    window.history.replaceState({}, "", "/settings");
    if (status === "success") {
      recheckGoogleAuth();
      toast({ title: "Google account connected successfully." });
    } else {
      const reason = params.get("reason") ?? "Unknown error";
      toast({ title: "Failed to connect Google account", description: reason, variant: "destructive" });
    }
  }, []);

  // ── Click sound ──────────────────────────────────────────────────────────────
  const [soundEnabled, setSoundEnabled] = useState(getClickSoundEnabled);
  const [activeSound, setActiveSound] = useState<ClickSound>(getClickSound);
  const [volume, setVolume] = useState(getClickVolume);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('clickSoundEnabled', String(next));
  }

  function changeSound(s: ClickSound) {
    setActiveSound(s);
    localStorage.setItem('clickSound', s);
    previewSound(s);
  }

  // ── Theme ────────────────────────────────────────────────────────────────────
  const { theme, changeTheme } = useThemePreference();

  // ── Account ──────────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(
    () => (user?.user_metadata?.full_name as string | undefined) ?? ""
  );
  const [savingName, setSavingName] = useState(false);

  async function handleSaveName() {
    setSavingName(true);
    try {
      await updateUserProfile({ full_name: displayName.trim() });
      toast({ title: "Display name updated." });
    } catch (err: any) {
      toast({ title: "Failed to update name", description: err?.message, variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  }

  // ── Change password ───────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await updatePassword(newPassword);
      toast({ title: "Password updated." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Failed to update password", description: err?.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  }

  // ── Notification email ────────────────────────────────────────────────────────
  const [notificationEmail, setNotificationEmail] = useState(
    () => (user?.user_metadata?.notification_email as string | undefined) ?? ""
  );
  const [savingNotifEmail, setSavingNotifEmail] = useState(false);

  async function handleSaveNotifEmail() {
    setSavingNotifEmail(true);
    try {
      await updateUserProfile({ notification_email: notificationEmail.trim() });
      toast({ title: "Notification email saved." });
    } catch (err: any) {
      toast({ title: "Failed to save email", description: err?.message, variant: "destructive" });
    } finally {
      setSavingNotifEmail(false);
    }
  }

  // ── Google account ────────────────────────────────────────────────────────────
  const [scopeLoading, setScopeLoading] = useState<string | null>(null);

  const handleConnect = async (scope: "drive") => {
    setScopeLoading(scope);
    try {
      await connectGoogle(scope);
    } catch (err: any) {
      toast({ title: "Failed to connect", description: err?.message || "Unknown error", variant: "destructive" });
      setScopeLoading(null);
    }
  };

  const handleDisconnect = async (scope: "drive") => {
    setScopeLoading(scope);
    try {
      await disconnectGoogle();
      toast({ title: "Google connection removed" });
    } catch (err: any) {
      toast({ title: "Failed to disconnect", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setScopeLoading(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <SettingsIcon className="w-5 h-5" />
        <h1 className="text-sm font-bold uppercase tracking-widest">Settings</h1>
      </div>

      {/* ── Appearance ─────────────────────────────────────────────────────────── */}
      <section className="border-2 border-border mb-4">
        <div className="px-5 py-3 border-b-2 border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Appearance
          </span>
        </div>
        <div className="px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-wide mb-1">Theme</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            Choose your preferred color theme.
          </p>
          <div className="flex gap-2">
            {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`flex-1 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 transition-colors ${
                  theme === t
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground"
                }`}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Account ────────────────────────────────────────────────────────────── */}
      <section className="border-2 border-border mb-4">
        <div className="px-5 py-3 border-b-2 border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Account
          </span>
        </div>

        {/* Email (read-only) + display name */}
        <div className="px-5 py-5 border-b-2 border-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
            Email
          </p>
          <p className="text-xs font-bold mb-4">{user?.email}</p>

          <p className="text-xs font-bold uppercase tracking-wide mb-1">Display Name</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            Shown in the sidebar and on certificates.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="flex-1 px-3 py-2 text-xs border-2 border-border bg-background focus:outline-none focus:border-foreground"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName}
              className="shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {savingName ? "..." : "Save"}
            </button>
          </div>
        </div>

        {/* Change password */}
        <div className="px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-wide mb-1">Change Password</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            Set a new password for your account.
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="px-3 py-2 text-xs border-2 border-border bg-background focus:outline-none focus:border-foreground"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="px-3 py-2 text-xs border-2 border-border bg-background focus:outline-none focus:border-foreground"
            />
            <button
              onClick={handleChangePassword}
              disabled={savingPassword || !newPassword || !confirmPassword}
              className="self-start px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {savingPassword ? "..." : "Update Password"}
            </button>
          </div>
        </div>
      </section>

      {/* ── Notifications ───────────────────────────────────────────────────────── */}
      <section className="border-2 border-border mb-4">
        <div className="px-5 py-3 border-b-2 border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Notifications
          </span>
        </div>
        <div className="px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-wide mb-1">Notification Email</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
            Receive batch completion alerts at this address. Leave blank to use your account email.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder={user?.email ?? "your@email.com"}
              className="flex-1 px-3 py-2 text-xs border-2 border-border bg-background focus:outline-none focus:border-foreground"
            />
            <button
              onClick={handleSaveNotifEmail}
              disabled={savingNotifEmail}
              className="shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {savingNotifEmail ? "..." : "Save"}
            </button>
          </div>
        </div>
      </section>

      {/* ── Google Account ───────────────────────────────────────────────────────── */}
      <section className="border-2 border-border mb-4">
        <div className="px-5 py-3 border-b-2 border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Google Account
          </span>
        </div>

        {([
          {
            scope: "drive" as const,
            label: "Google Drive",
            description: "PDF uploads and folder creation.",
          },
        ]).map(({ scope, label, description }, i, arr) => {
          const connected = googleAuthStatus[scope];
          const busy = scopeLoading === scope;
          return (
            <div
              key={scope}
              className={`px-5 py-4 flex items-center justify-between gap-4${i < arr.length - 1 ? " border-b-2 border-border" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
                </div>
              </div>
              {connected ? (
                <button
                  onClick={() => handleDisconnect(scope)}
                  disabled={!!scopeLoading}
                  className="shrink-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-destructive hover:text-destructive transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {busy ? "..." : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={() => handleConnect(scope)}
                  disabled={!!scopeLoading}
                  className="shrink-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {busy ? "..." : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </section>

      {/* ── Click Sound ─────────────────────────────────────────────────────────── */}
      <section className="border-2 border-border">
        <div className="px-5 py-3 border-b-2 border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Click Sound
          </span>
        </div>
        <div className="px-5 py-5 flex items-center justify-between gap-4 border-b-2 border-border">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-1">Mechanical Click Sound</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Play a mechanical keyboard sound on every button click.
            </p>
          </div>
          <button
            onClick={toggleSound}
            className={`shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 transition-colors whitespace-nowrap ${
              soundEnabled
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:border-foreground"
            }`}
          >
            {soundEnabled ? "On" : "Off"}
          </button>
        </div>
        {soundEnabled && (
          <div className="px-5 py-4 border-b-2 border-border flex items-center gap-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Volume</p>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                setClickVolume(v);
              }}
              className="flex-1 h-1 appearance-none bg-border accent-foreground cursor-pointer"
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-8 text-right shrink-0">
              {Math.round(volume * 100)}%
            </span>
          </div>
        )}
        {soundEnabled && (
          <div className="px-5 py-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Sound Type</p>
            <div className="flex flex-col gap-2">
              {(Object.keys(CLICK_SOUND_LABELS) as ClickSound[]).map((s) => (
                <button
                  key={s}
                  onClick={() => changeSound(s)}
                  className={`flex items-center justify-between px-4 py-2.5 border-2 text-left transition-colors ${
                    activeSound === s
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground"
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wide">
                    {CLICK_SOUND_LABELS[s]}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest opacity-50">
                    {activeSound === s ? "Selected — click to preview" : "Click to preview"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Danger Zone ────────────────────────────────────────────────────────── */}
      <section className="border-2 border-destructive mb-4 mt-8">
        <div className="px-5 py-3 border-b-2 border-destructive bg-destructive/5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">
            Danger Zone
          </span>
        </div>
        <div className="px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-wide mb-1 text-destructive">Delete Account</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
            {isApproved
              ? "Wipes your admin access, draft batches, and wallets. Issued certificates remain active and verifiable by recipients."
              : "Permanently deletes your account, workspaces, and all certificates. This action is irreversible."}
          </p>
          <button
            onClick={() => setDeleteConfirmOpen(true)}
            className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors"
          >
            Delete Account
          </button>
        </div>
      </section>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              {isApproved
                ? "This will permanently delete your organizer admin access, draft batches, and wallets. Issued certificates will remain active and verifiable by recipients. This cannot be undone."
                : "This will permanently delete your account, workspaces, batches, and all certificates. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-2">
            <p className="text-[11px] text-muted-foreground">
              To confirm, please type your email address <strong>{user?.email}</strong> below:
            </p>
            <input
              type="text"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={user?.email}
              className="w-full px-3 py-2 text-xs border-2 border-border bg-background focus:outline-none focus:border-foreground"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => {
                setDeleteConfirmOpen(false);
                setConfirmEmail("");
              }}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-muted transition-colors mr-2"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting || confirmEmail.toLowerCase().trim() !== user?.email?.toLowerCase().trim()}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-destructive bg-destructive text-white hover:bg-destructive/95 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Permanently Delete My Account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
