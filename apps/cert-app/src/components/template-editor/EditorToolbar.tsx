import { Button } from "@/components/ui/button";
import {
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Minus,
  QrCode,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Expand,
  Shrink,
  Save,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LockedFeature } from "@/components/LockedFeature";
import type { EditorStore } from "./useEditorStore";
import { DEFAULT_PRESETS, type PresetKey, newId } from "./types";

interface Props {
  store: EditorStore;
  zoom: number;
  setZoom: (z: number) => void;
  templateName: string;
  setTemplateName: (n: string) => void;
  onSave: () => void;
  saving: boolean;
  onBack: () => void;
  onAddImage: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

export function EditorToolbar({
  store,
  zoom,
  setZoom,
  templateName,
  setTemplateName,
  onSave,
  saving,
  onBack,
  onAddImage,
  isFullscreen,
  toggleFullscreen,
}: Props) {
  const addText = () => {
    const id = newId("text");
    store.addElement({
      id,
      type: "text",
      x: store.doc.width / 2 - 200,
      y: store.doc.height / 2 - 30,
      width: 400,
      height: 60,
      rotation: 0,
      text: "Double‑click to edit",
      fontFamily: "Inter",
      fontSize: 36,
      fontWeight: 400,
      italic: false,
      underline: false,
      color: "#0f172a",
      align: "center",
      lineHeight: 1.2,
    });
  };

  const addPlaceholder = () => {
    const id = newId("text");
    store.addElement({
      id,
      type: "text",
      x: store.doc.width / 2 - 200,
      y: store.doc.height / 2 - 30,
      width: 400,
      height: 60,
      rotation: 0,
      text: "<<Name>>",
      fontFamily: "Playfair Display",
      fontSize: 48,
      fontWeight: 700,
      italic: false,
      underline: false,
      color: "#0f172a",
      align: "center",
      lineHeight: 1.2,
    });
  };

  const addRect = () => {
    store.addElement({
      id: newId("shape"),
      type: "shape",
      shape: "rect",
      x: store.doc.width / 2 - 100,
      y: store.doc.height / 2 - 50,
      width: 200,
      height: 100,
      rotation: 0,
      fill: "#3b82f6",
      stroke: null,
      strokeWidth: 0,
      cornerRadius: 8,
    });
  };

  const addEllipse = () => {
    store.addElement({
      id: newId("shape"),
      type: "shape",
      shape: "ellipse",
      x: store.doc.width / 2 - 80,
      y: store.doc.height / 2 - 80,
      width: 160,
      height: 160,
      rotation: 0,
      fill: "#10b981",
      stroke: null,
      strokeWidth: 0,
    });
  };

  const addLine = () => {
    store.addElement({
      id: newId("shape"),
      type: "shape",
      shape: "line",
      x: store.doc.width / 2 - 150,
      y: store.doc.height / 2,
      width: 300,
      height: 4,
      rotation: 0,
      fill: null,
      stroke: "#0f172a",
      strokeWidth: 4,
    });
  };

  const addQr = () => {
    store.addElement({
      id: newId("qr"),
      type: "qr",
      x: store.doc.width - 220,
      y: store.doc.height - 220,
      width: 180,
      height: 180,
      rotation: 0,
    });
  };

  const onImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAddImage(file);
    e.target.value = "";
  };

  return (
    <div className={`flex items-center border-b bg-background/95 backdrop-blur sticky top-0 z-30 ${isFullscreen ? "flex-nowrap gap-1 px-2 py-1 overflow-x-auto" : "flex-wrap gap-2 sm:gap-3 px-2 sm:px-4 py-2"}`}>
      <Button variant="ghost" size="sm" onClick={isFullscreen ? toggleFullscreen : onBack} className="px-2 sm:px-3 shrink-0">
        <ArrowLeft className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Back</span>
      </Button>

      {!isFullscreen && (
        <>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
            className="h-8 flex-1 min-w-[140px] sm:flex-none sm:w-56"
          />
        </>
      )}

      <div className="h-6 w-px bg-border hidden sm:block" />

      {/* Add elements */}
      <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
        <ToolButton onClick={addText} icon={<Type className="w-4 h-4" />} label="Text" />
        <ToolButton onClick={addPlaceholder} icon={<span className="text-xs font-mono">{"<<>>"}</span>} label="Placeholder" />
        <label>
          <input type="file" accept="image/*" className="hidden" onChange={onImageInput} />
          <span
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm hover:bg-accent cursor-pointer text-foreground"
            title="Image"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden md:inline">Image</span>
          </span>
        </label>
        <ToolButton onClick={addRect} icon={<Square className="w-4 h-4" />} label="Rectangle" />
        <ToolButton onClick={addEllipse} icon={<Circle className="w-4 h-4" />} label="Ellipse" />
        <ToolButton onClick={addLine} icon={<Minus className="w-4 h-4" />} label="Line" />
        <LockedFeature feature="QR codes" inline>
          <ToolButton onClick={addQr} icon={<QrCode className="w-4 h-4" />} label="QR" />
        </LockedFeature>
      </div>

      <div className="h-6 w-px bg-border hidden sm:block" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={store.undo} disabled={!store.canUndo} title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={store.redo} disabled={!store.canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border hidden sm:block" />

      {/* Page size preset — hidden on phones, shown from md up; on phones it's in the properties panel instead */}
      <div className="hidden sm:block">
        <Select
          value={presetForDoc(store.doc.width, store.doc.height)}
          onValueChange={(v) => {
            const preset = DEFAULT_PRESETS[v as PresetKey];
            if (preset) store.patchDoc({ width: preset.width, height: preset.height });
          }}
        >
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a4_landscape">A4 Landscape</SelectItem>
            <SelectItem value="a4_portrait">A4 Portrait</SelectItem>
            <SelectItem value="letter_landscape">Letter Landscape</SelectItem>
            <SelectItem value="letter_portrait">Letter Portrait</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="md:hidden"
        >
          {isFullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} title="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs w-10 sm:w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={() => setZoom(Math.min(4, zoom + 0.1))} title="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(1)} title="Reset zoom" className="hidden sm:inline-flex">
          <Maximize2 className="w-4 h-4" />
        </Button>
        {!isFullscreen && (
          <>
            <div className="h-6 w-px bg-border mx-1" />
            <Button onClick={onSave} disabled={saving || !templateName.trim()} size="sm">
              {saving ? <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" /> : <Save className="w-4 h-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">Save</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function presetForDoc(w: number, h: number): string {
  for (const [k, v] of Object.entries(DEFAULT_PRESETS)) {
    if (v.width === w && v.height === h) return k;
  }
  return "custom";
}

function ToolButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} title={label}>
      {icon}
      <span className="hidden md:inline ml-1.5">{label}</span>
    </Button>
  );
}
