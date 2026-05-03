import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Type as TypeIcon, Image as ImageIcon, Square, Circle, Minus, QrCode } from "lucide-react";
import type { CanvasElement } from "./types";
import type { EditorStore } from "./useEditorStore";

interface Props {
  store: EditorStore;
}

export function LayersPanel({ store }: Props) {
  // Display top-most first (last in array = front)
  const reversed = [...store.doc.elements].slice().reverse();

  return (
    <div className="border-t">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        Layers
      </div>
      <div className="themed-scroll max-h-64 overflow-y-auto">
        {reversed.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground italic">No elements yet</div>
        )}
        {reversed.map((el, displayIdx) => {
          const realIdx = store.doc.elements.length - 1 - displayIdx;
          const isSelected = store.selectedIds.includes(el.id);
          return (
            <div
              key={el.id}
              onClick={(e) => {
                if (e.shiftKey) {
                  store.setSelected(
                    isSelected
                      ? store.selectedIds.filter((s) => s !== el.id)
                      : [...store.selectedIds, el.id],
                  );
                } else {
                  store.setSelected([el.id]);
                }
              }}
              className={`group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer ${
                isSelected ? "bg-primary/10 text-primary" : "hover:bg-secondary/50"
              }`}
            >
              <ElementIcon el={el} />
              <span className="flex-1 truncate">{layerLabel(el)}</span>
              <button
                className="opacity-0 group-hover:opacity-100 p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  store.reorderElement(el.id, realIdx + 1);
                }}
                title="Bring forward"
                disabled={realIdx === store.doc.elements.length - 1}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  store.reorderElement(el.id, realIdx - 1);
                }}
                title="Send backward"
                disabled={realIdx === 0}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  store.updateElement(el.id, { hidden: !el.hidden });
                }}
                title={el.hidden ? "Show" : "Hide"}
              >
                {el.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                className="p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  store.updateElement(el.id, { locked: !el.locked });
                }}
                title={el.locked ? "Unlock" : "Lock"}
              >
                {el.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ElementIcon({ el }: { el: CanvasElement }) {
  const cls = "w-3.5 h-3.5 shrink-0";
  if (el.type === "text") return <TypeIcon className={cls} />;
  if (el.type === "image") return <ImageIcon className={cls} />;
  if (el.type === "qr") return <QrCode className={cls} />;
  if (el.type === "shape") {
    if (el.shape === "rect") return <Square className={cls} />;
    if (el.shape === "ellipse") return <Circle className={cls} />;
    if (el.shape === "line") return <Minus className={cls} />;
  }
  return <Square className={cls} />;
}

function layerLabel(el: CanvasElement): string {
  if (el.type === "text") return el.text.slice(0, 40) || "Text";
  if (el.type === "image") return "Image";
  if (el.type === "qr") return "QR Code";
  if (el.type === "shape") return el.shape[0].toUpperCase() + el.shape.slice(1);
  return "Element";
}
