import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from "lucide-react";
import type { EditorStore } from "./useEditorStore";
import { FontPicker } from "./FontPicker";
import type { CanvasElement, ImageElement, ShapeElement, TextElement } from "./types";
import { DEFAULT_PRESETS, type PresetKey } from "./types";

function presetForDoc(w: number, h: number): string {
  for (const [k, v] of Object.entries(DEFAULT_PRESETS)) {
    if (v.width === w && v.height === h) return k;
  }
  return "custom";
}

interface Props {
  store: EditorStore;
}

export function PropertiesPanel({ store }: Props) {
  const selected = store.doc.elements.filter((el) => store.selectedIds.includes(el.id));

  if (selected.length === 0) {
    return <DocumentProps store={store} />;
  }

  if (selected.length > 1) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {selected.length} elements selected
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => store.duplicateElements(selected.map((e) => e.id))}>
            <Copy className="w-4 h-4 mr-1.5" />
            Duplicate
          </Button>
          <Button size="sm" variant="outline" onClick={() => store.removeElements(selected.map((e) => e.id))}>
            <Trash2 className="w-4 h-4 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  const el = selected[0];
  return (
    <div className="themed-scroll p-4 space-y-4 overflow-y-auto h-full">
      <CommonProps store={store} el={el} />
      {el.type === "text" && <TextProps store={store} el={el as TextElement} />}
      {el.type === "shape" && <ShapeProps store={store} el={el as ShapeElement} />}
      {el.type === "image" && <ImageProps store={store} el={el as ImageElement} />}
    </div>
  );
}

function DocumentProps({ store }: Props) {
  return (
    <div className="themed-scroll p-4 space-y-4 overflow-y-auto h-full">
      {/* Page size — shown on all screens; on phones this replaces the toolbar select */}
      <div className="sm:hidden">
        <Label>Page size</Label>
        <Select
          value={presetForDoc(store.doc.width, store.doc.height)}
          onValueChange={(v) => {
            const preset = DEFAULT_PRESETS[v as PresetKey];
            if (preset) store.patchDoc({ width: preset.width, height: preset.height });
          }}
        >
          <SelectTrigger className="h-9 mt-1.5 w-full">
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
      <div>
        <Label>Document size</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <Input
            type="number"
            value={store.doc.width}
            onChange={(e) => store.patchDoc({ width: Math.max(100, Number(e.target.value) || 0) })}
          />
          <Input
            type="number"
            value={store.doc.height}
            onChange={(e) => store.patchDoc({ height: Math.max(100, Number(e.target.value) || 0) })}
          />
        </div>
      </div>
      <div>
        <Label>Background color</Label>
        <Input
          type="color"
          value={store.doc.backgroundColor}
          onChange={(e) => store.patchDoc({ backgroundColor: e.target.value })}
          className="h-10 mt-1.5"
        />
      </div>
      <div>
        <Label>Background image URL</Label>
        <Input
          type="url"
          placeholder="https://…"
          value={store.doc.backgroundImage ?? ""}
          onChange={(e) => store.patchDoc({ backgroundImage: e.target.value || null })}
          className="mt-1.5"
        />
      </div>
      <p className="text-xs text-muted-foreground pt-4 border-t">
        Click an element on the canvas to edit its properties.
      </p>
    </div>
  );
}

function CommonProps({ store, el }: { store: EditorStore; el: CanvasElement }) {
  const update = (patch: Partial<CanvasElement>) => store.updateElement(el.id, patch);
  return (
    <div className="space-y-3 pb-3 border-b">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {el.type === "shape" ? `Shape · ${(el as ShapeElement).shape}` : el.type}
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => update({ locked: !el.locked })}
            title={el.locked ? "Unlock" : "Lock"}
          >
            {el.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => update({ hidden: !el.hidden })}
            title={el.hidden ? "Show" : "Hide"}
          >
            {el.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => store.duplicateElements([el.id])}
            title="Duplicate"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={() => store.removeElements([el.id])}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="X" value={el.x} onChange={(v) => update({ x: v })} />
        <NumberInput label="Y" value={el.y} onChange={(v) => update({ y: v })} />
        <NumberInput label="W" value={el.width} onChange={(v) => update({ width: v })} />
        <NumberInput label="H" value={el.height} onChange={(v) => update({ height: v })} />
        <NumberInput label="Rot" value={el.rotation} onChange={(v) => update({ rotation: v })} />
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="h-8 mt-0.5"
      />
    </div>
  );
}

function TextProps({ store, el }: { store: EditorStore; el: TextElement }) {
  const update = (patch: Partial<TextElement>) => store.updateElement(el.id, patch);
  return (
    <div className="space-y-3">
      <div>
        <Label>Text</Label>
        <Textarea
          value={el.text}
          onChange={(e) => update({ text: e.target.value })}
          rows={3}
          className="mt-1.5 font-mono text-sm"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Use <code>{"<<Name>>"}</code> for placeholders.
        </p>
      </div>

      <div>
        <Label>Font family</Label>
        <div className="mt-1.5">
          <FontPicker
            value={el.fontFamily}
            onChange={(v) => update({ fontFamily: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Size" value={el.fontSize} onChange={(v) => update({ fontSize: v })} />
        <NumberInput label="Line height" value={el.lineHeight} onChange={(v) => update({ lineHeight: v })} />
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant={el.fontWeight === 700 ? "default" : "outline"}
          className="h-8 w-8"
          onClick={() => update({ fontWeight: el.fontWeight === 700 ? 400 : 700 })}
          title="Bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={el.italic ? "default" : "outline"}
          className="h-8 w-8"
          onClick={() => update({ italic: !el.italic })}
          title="Italic"
        >
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={el.underline ? "default" : "outline"}
          className="h-8 w-8"
          onClick={() => update({ underline: !el.underline })}
          title="Underline"
        >
          <Underline className="w-3.5 h-3.5" />
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        <Button
          size="icon"
          variant={el.align === "left" ? "default" : "outline"}
          className="h-8 w-8"
          onClick={() => update({ align: "left" })}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={el.align === "center" ? "default" : "outline"}
          className="h-8 w-8"
          onClick={() => update({ align: "center" })}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={el.align === "right" ? "default" : "outline"}
          className="h-8 w-8"
          onClick={() => update({ align: "right" })}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div>
        <Label>Color</Label>
        <Input type="color" value={el.color} onChange={(e) => update({ color: e.target.value })} className="h-10 mt-1.5" />
      </div>
    </div>
  );
}

function ShapeProps({ store, el }: { store: EditorStore; el: ShapeElement }) {
  const update = (patch: Partial<ShapeElement>) => store.updateElement(el.id, patch);
  return (
    <div className="space-y-3">
      {el.shape !== "line" && (
        <div>
          <Label>Fill</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <Input
              type="color"
              value={el.fill ?? "#000000"}
              onChange={(e) => update({ fill: e.target.value })}
              className="h-10 w-16"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => update({ fill: el.fill ? null : "#000000" })}
            >
              {el.fill ? "Remove" : "Add"}
            </Button>
          </div>
        </div>
      )}
      <div>
        <Label>Stroke</Label>
        <div className="flex items-center gap-2 mt-1.5">
          <Input
            type="color"
            value={el.stroke ?? "#000000"}
            onChange={(e) => update({ stroke: e.target.value })}
            className="h-10 w-16"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => update({ stroke: el.stroke ? null : "#000000" })}
          >
            {el.stroke ? "Remove" : "Add"}
          </Button>
        </div>
      </div>
      <NumberInput label="Stroke width" value={el.strokeWidth} onChange={(v) => update({ strokeWidth: v })} />
      {el.shape === "rect" && (
        <NumberInput label="Corner radius" value={el.cornerRadius ?? 0} onChange={(v) => update({ cornerRadius: v })} />
      )}
    </div>
  );
}

function ImageProps({ store, el }: { store: EditorStore; el: ImageElement }) {
  const update = (patch: Partial<ImageElement>) => store.updateElement(el.id, patch);
  const fillCanvas = () =>
    update({ x: 0, y: 0, width: store.doc.width, height: store.doc.height, rotation: 0 });
  return (
    <div className="space-y-3">
      <div>
        <Label>Image URL</Label>
        <Input value={el.src} onChange={(e) => update({ src: e.target.value })} className="mt-1.5" />
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={fillCanvas}>
        Fill canvas
      </Button>
    </div>
  );
}
