import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  FONT_CATALOG,
  FONT_CATEGORIES,
  type CatalogFont,
  type FontCategory,
} from "./fontCatalog";
import { loadFont } from "./fonts";

interface Props {
  value: string;
  onChange: (family: string) => void;
}

const PANEL_WIDTH = 288;
const PANEL_HEIGHT = 380;

export function FontPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<FontCategory | "All">("All");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the floating panel under the trigger
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    let left = r.left;
    let top = r.bottom + 4;
    if (left + PANEL_WIDTH + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - PANEL_WIDTH - margin);
    }
    if (top + PANEL_HEIGHT + margin > window.innerHeight) {
      top = Math.max(margin, r.top - PANEL_HEIGHT - 4);
    }
    setPos({ top, left });
  }, [open]);

  // Close on outside click / escape / scroll
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !panelRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      // Don't close if the scroll happened inside the dropdown panel itself
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FONT_CATALOG.filter((f) => {
      if (activeCat !== "All" && f.category !== activeCat) return false;
      if (q && !f.family.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, activeCat]);

  const handleSelect = (f: CatalogFont) => {
    onChange(f.family);
    setOpen(false);
    void loadFont(f.family, 400);
    void loadFont(f.family, 700);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
        style={{ fontFamily: value }}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[100] rounded-md border bg-popover text-popover-foreground shadow-lg p-2"
            style={{
              top: pos.top,
              left: pos.left,
              width: PANEL_WIDTH,
              maxHeight: PANEL_HEIGHT,
            }}
          >
            <div className="flex items-center gap-2 px-2 pb-2 border-b">
              <Search className="h-4 w-4 opacity-60" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search fonts..."
                className="h-8 border-0 px-0 focus-visible:ring-0 shadow-none"
              />
            </div>
            <div className="flex gap-1 flex-wrap py-2 px-1 border-b text-xs">
              {(["All", ...FONT_CATEGORIES] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCat(c as FontCategory | "All")}
                  className={`px-2 py-1 rounded ${
                    activeCat === c
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="themed-scroll overflow-y-auto py-1" style={{ maxHeight: PANEL_HEIGHT - 110 }}>
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No fonts match "{query}"
                </div>
              )}
              {filtered.map((f) => (
                <FontRow
                  key={f.family}
                  font={f}
                  selected={f.family === value}
                  onSelect={() => handleSelect(f)}
                />
              ))}
            </div>
          </div>,
          (document.fullscreenElement as HTMLElement | null) ?? document.body,
        )}
    </>
  );
}

function FontRow({
  font,
  selected,
  onSelect,
}: {
  font: CatalogFont;
  selected: boolean;
  onSelect: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || loaded) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            void loadFont(font.family, 400).then(() => setLoaded(true));
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "100px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [font.family, loaded]);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 hover:bg-accent rounded ${
        selected ? "bg-accent" : ""
      }`}
    >
      <div
        className="text-base truncate"
        style={{ fontFamily: loaded ? font.family : "inherit" }}
      >
        {font.family}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {font.category}
      </div>
    </button>
  );
}
