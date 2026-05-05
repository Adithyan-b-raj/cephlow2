import { useEffect, useRef, useState } from "react";
import { uploadAssetToR2 } from "@workspace/api-client-react";
import { ensureFontStylesInjected, BUNDLED_FONTS, ensureFontLoaded } from "./fonts";
import { useEditorStore } from "./useEditorStore";
import { Gamepad2 } from "lucide-react";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar } from "./EditorToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { LayersPanel } from "./LayersPanel";
import { JoystickPad } from "./JoystickPad";
import type { CanvasDocument } from "./types";
import { newId } from "./types";

interface Props {
  initialDoc: CanvasDocument;
  initialName?: string;
  saving: boolean;
  onSave: (params: { name: string; canvas: CanvasDocument }) => void;
  onBack: () => void;
}

export function TemplateEditor({ initialDoc, initialName = "", saving, onSave, onBack }: Props) {
  const store = useEditorStore(initialDoc);
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 1;
    const w = window.innerWidth;
    if (w < 640) return 0.25;
    if (w < 1024) return 0.35;
    return 1;
  });
  const [templateName, setTemplateName] = useState(initialName);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [joystickVisible, setJoystickVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevZoomRef = useRef(zoom);

  useEffect(() => {
    const onChange = () => {
      const inFS = !!document.fullscreenElement;
      setIsFullscreen(inFS);
      if (!inFS) (screen.orientation as any).unlock?.();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Android back button pops history instead of navigating away when in fullscreen
  useEffect(() => {
    const onPopState = () => {
      if (document.fullscreenElement) {
        (screen.orientation as any).unlock?.();
        document.exitFullscreen().catch(() => {});
        setZoom(prevZoomRef.current);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      prevZoomRef.current = zoom;
      // Push a history entry so Android back button exits fullscreen, not the page
      history.pushState({ fsEditor: true }, "");
      containerRef.current?.requestFullscreen()
        .then(() => {
          setZoom(0.40);
          (screen.orientation as any).lock?.("landscape")?.catch?.(() => {});
        })
        .catch(() => {
          history.back(); // remove the pushed state if fullscreen was denied
        });
    } else {
      (screen.orientation as any).unlock?.();
      document.exitFullscreen()
        .then(() => history.back()) // clean up the history entry we pushed
        .catch(() => {});
      setZoom(prevZoomRef.current);
    }
  };

  useEffect(() => {
    ensureFontStylesInjected();
    // Trigger loading so the canvas measures correctly
    Promise.all(BUNDLED_FONTS.flatMap((f) => [ensureFontLoaded(f.family, 400), ensureFontLoaded(f.family, 700)]));
  }, []);

  // Lazy-load any non-bundled fonts referenced by the current document
  useEffect(() => {
    const families = new Set<string>();
    for (const el of store.doc.elements) {
      if (el.type === "text") families.add(el.fontFamily);
    }
    families.forEach((f) => {
      void ensureFontLoaded(f, 400);
      void ensureFontLoaded(f, 700);
    });
  }, [store.doc.elements]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isFormField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        store.redo();
      } else if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (store.selectedIds.length > 0) store.duplicateElements(store.selectedIds);
      } else if ((e.key === "Delete" || e.key === "Backspace") && !isFormField) {
        if (store.selectedIds.length > 0) {
          e.preventDefault();
          store.removeElements(store.selectedIds);
        }
      } else if (!isFormField && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (store.selectedIds.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        store.updateMany(
          store.selectedIds.map((id) => {
            const el = store.doc.elements.find((x) => x.id === id);
            if (!el) return { id, patch: {} };
            return { id, patch: { x: el.x + dx, y: el.y + dy } };
          }),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const handleAddImage = async (file: File) => {
    try {
      const url = await uploadAssetToR2(file, file.name, "image");
      const naturalDims = await readImageSize(file);
      const maxDim = 400;
      const ratio = naturalDims.width / naturalDims.height;
      let w = maxDim;
      let h = maxDim;
      if (ratio > 1) h = maxDim / ratio;
      else w = maxDim * ratio;
      store.addElement({
        id: newId("image"),
        type: "image",
        x: store.doc.width / 2 - w / 2,
        y: store.doc.height / 2 - h / 2,
        width: w,
        height: h,
        rotation: 0,
        src: url,
      });
    } catch (err: any) {
      alert(`Failed to upload image: ${err.message}`);
    }
  };

  return (
    <div ref={containerRef} className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      <EditorToolbar
        store={store}
        zoom={zoom}
        setZoom={setZoom}
        templateName={templateName}
        setTemplateName={setTemplateName}
        onSave={() => onSave({ name: templateName.trim(), canvas: store.doc })}
        saving={saving}
        onBack={onBack}
        onAddImage={handleAddImage}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
      />
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 relative">
          <EditorCanvas store={store} zoom={zoom} setZoom={setZoom} />
          {isFullscreen && (
            <button
              onClick={() => setJoystickVisible((v) => !v)}
              title={joystickVisible ? "Hide joystick" : "Show joystick"}
              style={{ position: "absolute", top: 8, right: 8, zIndex: 50 }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border shadow-md backdrop-blur-sm ${joystickVisible ? "bg-primary text-primary-foreground border-primary" : "bg-background/90 text-foreground border-border"}`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              {joystickVisible ? "Hide pad" : "Show pad"}
            </button>
          )}
          {isFullscreen && joystickVisible && store.selectedIds.length > 0 && (
            <JoystickPad
              onMove={(dx, dy) => {
                store.beginTransient();
                store.updateMany(
                  store.selectedIds.map((id) => {
                    const el = store.doc.elements.find((x) => x.id === id);
                    if (!el) return { id, patch: {} };
                    return { id, patch: { x: el.x + dx, y: el.y + dy } };
                  }),
                );
              }}
              onMoveEnd={() => store.endTransient()}
            />
          )}
        </div>
        <div className={`w-full md:w-72 border-t md:border-t-0 md:border-l flex flex-col bg-background max-h-[45vh] md:max-h-none shrink-0${isFullscreen ? " hidden md:flex" : ""}`}>
          <div className="flex-1 min-h-0">
            <PropertiesPanel store={store} />
          </div>
          <LayersPanel store={store} />
        </div>
      </div>
    </div>
  );
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 400, height: 400 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
