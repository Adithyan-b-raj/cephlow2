export type ElementId = string;

export interface BaseElement {
  id: ElementId;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked?: boolean;
  hidden?: boolean;
}

export type FontWeight = 400 | 500 | 600 | 700;
export type TextAlign = "left" | "center" | "right" | "justify";

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  lineHeight: number;
  letterSpacing?: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
}

export type ShapeKind = "rect" | "ellipse" | "line";

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius?: number;
}

export interface QrElement extends BaseElement {
  type: "qr";
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | QrElement;

export interface CanvasDocument {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage: string | null;
  elements: CanvasElement[];
}

export const DEFAULT_PRESETS = {
  a4_landscape: { width: 1123, height: 794 },
  a4_portrait: { width: 794, height: 1123 },
  letter_landscape: { width: 1100, height: 850 },
  letter_portrait: { width: 850, height: 1100 },
} as const;

export type PresetKey = keyof typeof DEFAULT_PRESETS;

export function newId(prefix = "el"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function emptyDocument(preset: PresetKey = "a4_landscape"): CanvasDocument {
  const { width, height } = DEFAULT_PRESETS[preset];
  return {
    width,
    height,
    backgroundColor: "#ffffff",
    backgroundImage: null,
    elements: [],
  };
}
