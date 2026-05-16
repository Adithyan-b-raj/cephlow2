import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  type ClickSound,
  CLICK_SOUND_LABELS,
  getClickSoundEnabled,
  getClickSound,
  getClickVolume,
  setClickVolume,
  previewSound,
} from "@/hooks/use-mechanical-click";

export default function Settings() {
  const { hasGoogleAuth, connectGoogle, disconnectGoogle } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectGoogle();
      toast({ title: "Google account disconnected" });
    } catch (err: any) {
      toast({ title: "Failed to disconnect", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      await connectGoogle();
    } catch (err: any) {
      toast({ title: "Failed to connect", description: err?.message || "Unknown error", variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <SettingsIcon className="w-5 h-5" />
        <h1 className="text-sm font-bold uppercase tracking-widest">Settings</h1>
      </div>

      <section className="border-2 border-border mb-4">
        <div className="px-5 py-3 border-b-2 border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Google Account
          </span>
        </div>
        <div className="px-5 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-1">
              {hasGoogleAuth ? "Connected" : "Not Connected"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hasGoogleAuth
                ? "Your Google account is linked. Cephlow can access Sheets, Slides, Drive, and Gmail on your behalf."
                : "Connect your Google account to enable certificate generation and delivery."}
            </p>
          </div>
          {hasGoogleAuth ? (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-destructive hover:text-destructive transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {loading ? "..." : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {loading ? "..." : "Connect"}
            </button>
          )}
        </div>
      </section>

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
    </div>
  );
}
