import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import type { CanvasDocument, CanvasElement, ImageElement, QrElement, ShapeElement, TextElement } from "./types";
import { BUNDLED_FONTS, fetchFontBufferForFamily } from "./fonts";

interface FontEntry {
  regular: PDFFont;
  bold: PDFFont;
}

interface ResourceCache {
  fonts: Map<string, FontEntry>;
  images: Map<string, PDFImage>;
}

export interface BatchAssetCache {
  imageBuffers: Map<string, { buf: ArrayBuffer; kind: "png" | "jpg" }>;
}

export function createBatchAssetCache(): BatchAssetCache {
  return { imageBuffers: new Map() };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function applyTemplateText(input: string, replacements: Record<string, string>): string {
  return input.replace(/<<\s*([^<>]+?)\s*>>/g, (_, key) => {
    const k = `<<${String(key).trim()}>>`;
    if (k in replacements) return replacements[k];
    const direct = String(key).trim();
    return direct in replacements ? replacements[direct] : `<<${direct}>>`;
  });
}

async function ensureFont(
  pdf: PDFDocument,
  cache: ResourceCache,
  family: string,
): Promise<FontEntry> {
  const cached = cache.fonts.get(family);
  if (cached) return cached;
  const [reg, boldRaw] = await Promise.all([
    fetchFontBufferForFamily(family, 400),
    // Fall back to regular if the family has no bold weight (e.g. Pacifico)
    fetchFontBufferForFamily(family, 700).catch(() => null),
  ]);
  const regular = await pdf.embedFont(reg, { subset: true });
  const boldFont = boldRaw
    ? await pdf.embedFont(boldRaw, { subset: true })
    : regular;
  const entry: FontEntry = { regular, bold: boldFont };
  cache.fonts.set(family, entry);
  return entry;
}

async function ensureImage(
  pdf: PDFDocument,
  cache: ResourceCache,
  src: string,
  batchCache?: BatchAssetCache,
): Promise<PDFImage | null> {
  const cached = cache.images.get(src);
  if (cached) return cached;
  try {
    let entry = batchCache?.imageBuffers.get(src);
    if (!entry) {
      const res = await fetch(src);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const ct = res.headers.get("content-type") || "";
      const lower = src.toLowerCase();
      let kind: "png" | "jpg";
      if (ct.includes("png") || lower.endsWith(".png")) kind = "png";
      else if (ct.includes("jpeg") || ct.includes("jpg") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) kind = "jpg";
      else {
        // Sniff: PNG magic bytes start with 89 50 4E 47
        const head = new Uint8Array(buf.slice(0, 4));
        kind = head[0] === 0x89 && head[1] === 0x50 ? "png" : "jpg";
      }
      entry = { buf, kind };
      batchCache?.imageBuffers.set(src, entry);
    }
    let img: PDFImage;
    try {
      img = entry.kind === "png" ? await pdf.embedPng(entry.buf) : await pdf.embedJpg(entry.buf);
    } catch {
      // Fallback if our sniff was wrong
      img = entry.kind === "png" ? await pdf.embedJpg(entry.buf) : await pdf.embedPng(entry.buf);
    }
    cache.images.set(src, img);
    return img;
  } catch (err) {
    console.warn("[PDF] Failed to embed image:", src, err);
    return null;
  }
}

function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const candidate = line + w;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width <= maxWidth || line.trim() === "") {
        line = candidate;
      } else {
        lines.push(line.trimEnd());
        line = w.replace(/^\s+/, "");
      }
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines;
}

function fitFontSize(
  text: string,
  font: PDFFont,
  initial: number,
  maxWidth: number,
  maxHeight: number,
  lineHeight: number,
): number {
  let size = initial;
  for (let i = 0; i < 30; i++) {
    const lines = wrapTextLines(text, font, size, maxWidth);
    const totalH = lines.length * size * lineHeight;
    if (totalH <= maxHeight && lines.every((l) => font.widthOfTextAtSize(l, size) <= maxWidth)) {
      return size;
    }
    size *= 0.92;
    if (size < 6) return 6;
  }
  return size;
}

interface RenderContext {
  pdf: PDFDocument;
  page: PDFPage;
  cache: ResourceCache;
  doc: CanvasDocument;
  batchCache?: BatchAssetCache;
}

async function drawText(ctx: RenderContext, el: TextElement, replacements: Record<string, string>) {
  const text = applyTemplateText(el.text, replacements);
  const fonts = await ensureFont(ctx.pdf, ctx.cache, el.fontFamily);
  const font = el.fontWeight === 700 ? fonts.bold : fonts.regular;
  const lineHeight = el.lineHeight || 1.2;

  const finalSize = fitFontSize(text, font, el.fontSize, el.width, el.height, lineHeight);
  const lines = wrapTextLines(text, font, finalSize, el.width);

  const [r, g, b] = hexToRgb(el.color);
  const totalLines = lines.length;
  const lineGap = finalSize * lineHeight;

  // Convert top-left coordinates (canvas) to bottom-left (PDF)
  // Page height from doc dims
  const pageH = ctx.doc.height;

  // Vertical center of the box (in canvas space)
  const boxYTop = el.y;
  const boxBottom = boxYTop + el.height;

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i];
    const w = font.widthOfTextAtSize(line, finalSize);
    let xOffset = 0;
    if (el.align === "center") xOffset = (el.width - w) / 2;
    else if (el.align === "right") xOffset = el.width - w;

    const lineYTop = boxYTop + i * lineGap;
    const baseline = lineYTop + finalSize; // approximate baseline as top + ascender

    ctx.page.drawText(line, {
      x: el.x + xOffset,
      y: pageH - baseline,
      size: finalSize,
      font,
      color: rgb(r, g, b),
      rotate: el.rotation ? degrees(-el.rotation) : undefined,
    });

    if (el.underline) {
      ctx.page.drawLine({
        start: { x: el.x + xOffset, y: pageH - lineYTop - finalSize - 2 },
        end: { x: el.x + xOffset + w, y: pageH - lineYTop - finalSize - 2 },
        thickness: Math.max(1, finalSize * 0.05),
        color: rgb(r, g, b),
      });
    }
  }
  void boxBottom;
}

async function drawImage(ctx: RenderContext, el: ImageElement) {
  const img = await ensureImage(ctx.pdf, ctx.cache, el.src, ctx.batchCache);
  if (!img) return;
  const pageH = ctx.doc.height;
  ctx.page.drawImage(img, {
    x: el.x,
    y: pageH - el.y - el.height,
    width: el.width,
    height: el.height,
    rotate: el.rotation ? degrees(-el.rotation) : undefined,
  });
}

function drawShape(ctx: RenderContext, el: ShapeElement) {
  const pageH = ctx.doc.height;
  const fillRgb = el.fill ? hexToRgb(el.fill) : null;
  const strokeRgb = el.stroke ? hexToRgb(el.stroke) : null;
  const fill = fillRgb ? rgb(...fillRgb) : undefined;
  const stroke = strokeRgb ? rgb(...strokeRgb) : undefined;

  if (el.shape === "rect") {
    ctx.page.drawRectangle({
      x: el.x,
      y: pageH - el.y - el.height,
      width: el.width,
      height: el.height,
      color: fill,
      borderColor: stroke,
      borderWidth: el.stroke ? el.strokeWidth : 0,
      rotate: el.rotation ? degrees(-el.rotation) : undefined,
    });
  } else if (el.shape === "ellipse") {
    ctx.page.drawEllipse({
      x: el.x + el.width / 2,
      y: pageH - el.y - el.height / 2,
      xScale: el.width / 2,
      yScale: el.height / 2,
      color: fill,
      borderColor: stroke,
      borderWidth: el.stroke ? el.strokeWidth : 0,
      rotate: el.rotation ? degrees(-el.rotation) : undefined,
    });
  } else if (el.shape === "line") {
    const yMid = pageH - el.y - el.height / 2;
    ctx.page.drawLine({
      start: { x: el.x, y: yMid },
      end: { x: el.x + el.width, y: yMid },
      thickness: el.strokeWidth || 2,
      color: stroke ?? rgb(0, 0, 0),
    });
  }
}

async function drawQr(
  ctx: RenderContext,
  el: QrElement,
  qrUrl: string,
) {
  const dataUrl = await QRCode.toDataURL(qrUrl, {
    width: 600,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const buf = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  const img = await ctx.pdf.embedPng(buf);
  const pageH = ctx.doc.height;
  ctx.page.drawImage(img, {
    x: el.x,
    y: pageH - el.y - el.height,
    width: el.width,
    height: el.height,
    rotate: el.rotation ? degrees(-el.rotation) : undefined,
  });
}

export interface RenderOptions {
  doc: CanvasDocument;
  replacements: Record<string, string>;
  qrUrl: string | null;
  batchCache?: BatchAssetCache;
}

export async function renderCanvasToPdf(options: RenderOptions): Promise<Uint8Array> {
  const { doc, replacements, qrUrl, batchCache } = options;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const cache: ResourceCache = { fonts: new Map(), images: new Map() };
  const page = pdf.addPage([doc.width, doc.height]);

  // Background fill
  if (doc.backgroundColor && doc.backgroundColor !== "#ffffff" && doc.backgroundColor !== "#FFFFFF") {
    const [r, g, b] = hexToRgb(doc.backgroundColor);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
      color: rgb(r, g, b),
    });
  }

  if (doc.backgroundImage) {
    const img = await ensureImage(pdf, cache, doc.backgroundImage, batchCache);
    if (img) {
      page.drawImage(img, { x: 0, y: 0, width: doc.width, height: doc.height });
    }
  }

  const ctx: RenderContext = { pdf, page, cache, doc, batchCache };

  for (const el of doc.elements) {
    if (el.hidden) continue;
    if (el.type === "text") await drawText(ctx, el, replacements);
    else if (el.type === "image") await drawImage(ctx, el);
    else if (el.type === "shape") drawShape(ctx, el as ShapeElement);
    else if (el.type === "qr" && qrUrl) await drawQr(ctx, el, qrUrl);
  }

  return pdf.save();
}

/** Pre-warm the font + image cache (useful for batch rendering). */
export async function preloadCanvasResources(doc: CanvasDocument): Promise<void> {
  // Touch each unique font family so the woff is in HTTP cache
  const families = new Set<string>();
  for (const el of doc.elements) {
    if (el.type === "text") families.add((el as TextElement).fontFamily);
  }
  await Promise.all(
    [...families].map((f) =>
      Promise.all([
        fetchFontBufferForFamily(f, 400).catch(() => null),
        fetchFontBufferForFamily(f, 700).catch(() => null),
      ]),
    ),
  );
  // Pre-fetch images
  const imgs = new Set<string>();
  for (const el of doc.elements) {
    if (el.type === "image") imgs.add((el as ImageElement).src);
  }
  if (doc.backgroundImage) imgs.add(doc.backgroundImage);
  await Promise.all([...imgs].map((s) => fetch(s).catch(() => null)));
}

void BUNDLED_FONTS;
