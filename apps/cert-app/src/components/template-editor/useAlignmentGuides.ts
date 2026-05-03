import type { CanvasDocument, CanvasElement } from "./types";

export interface Guide {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

const SNAP_THRESHOLD = 5;

interface Targets {
  vertical: Array<{ pos: number; start: number; end: number }>;
  horizontal: Array<{ pos: number; start: number; end: number }>;
}

function buildTargets(
  doc: CanvasDocument,
  excludeId: string | null,
): Targets {
  const v: Targets["vertical"] = [
    { pos: 0, start: 0, end: doc.height },
    { pos: doc.width / 2, start: 0, end: doc.height },
    { pos: doc.width, start: 0, end: doc.height },
  ];
  const h: Targets["horizontal"] = [
    { pos: 0, start: 0, end: doc.width },
    { pos: doc.height / 2, start: 0, end: doc.width },
    { pos: doc.height, start: 0, end: doc.width },
  ];
  for (const el of doc.elements) {
    if (el.id === excludeId || el.hidden) continue;
    v.push({ pos: el.x, start: el.y, end: el.y + el.height });
    v.push({ pos: el.x + el.width / 2, start: el.y, end: el.y + el.height });
    v.push({ pos: el.x + el.width, start: el.y, end: el.y + el.height });
    h.push({ pos: el.y, start: el.x, end: el.x + el.width });
    h.push({ pos: el.y + el.height / 2, start: el.x, end: el.x + el.width });
    h.push({ pos: el.y + el.height, start: el.x, end: el.x + el.width });
  }
  return { vertical: v, horizontal: h };
}

/**
 * Snap a moving element's top-left position against canvas + other elements.
 * Returns the corrected (x, y) plus any active guides for rendering.
 */
export function computeSnap(
  doc: CanvasDocument,
  moving: CanvasElement,
  desired: { x: number; y: number },
): SnapResult {
  const t = buildTargets(doc, moving.id);
  const cx = desired.x + moving.width / 2;
  const cy = desired.y + moving.height / 2;
  const right = desired.x + moving.width;
  const bottom = desired.y + moving.height;

  let bestVx: { delta: number; guide: Guide } | null = null;
  for (const target of t.vertical) {
    const candidates = [desired.x, cx, right];
    for (const c of candidates) {
      const d = target.pos - c;
      if (Math.abs(d) <= SNAP_THRESHOLD && (!bestVx || Math.abs(d) < Math.abs(bestVx.delta))) {
        bestVx = {
          delta: d,
          guide: {
            axis: "x",
            position: target.pos,
            start: Math.min(target.start, desired.y),
            end: Math.max(target.end, bottom),
          },
        };
      }
    }
  }

  let bestVy: { delta: number; guide: Guide } | null = null;
  for (const target of t.horizontal) {
    const candidates = [desired.y, cy, bottom];
    for (const c of candidates) {
      const d = target.pos - c;
      if (Math.abs(d) <= SNAP_THRESHOLD && (!bestVy || Math.abs(d) < Math.abs(bestVy.delta))) {
        bestVy = {
          delta: d,
          guide: {
            axis: "y",
            position: target.pos,
            start: Math.min(target.start, desired.x),
            end: Math.max(target.end, right),
          },
        };
      }
    }
  }

  const guides: Guide[] = [];
  let x = desired.x;
  let y = desired.y;
  if (bestVx) {
    x += bestVx.delta;
    guides.push(bestVx.guide);
  }
  if (bestVy) {
    y += bestVy.delta;
    guides.push(bestVy.guide);
  }
  return { x, y, guides };
}
