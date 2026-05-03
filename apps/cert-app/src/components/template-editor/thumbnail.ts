import type { CanvasDocument } from "./types";
import { renderCanvasToPdf } from "./pdfRenderer";

/**
 * Render the canvas as a PNG using a Konva-equivalent approach via the existing
 * Stage. Since this module shouldn't depend on Konva refs directly, we render
 * the same JSON to PDF first, rasterise the first page using pdf.js. To avoid
 * adding pdf.js as a dependency, we instead render a lightweight HTML preview
 * to canvas using a pure 2d canvas implementation.
 *
 * Approach: build an offscreen canvas, draw background + each element using
 * the 2D context. This mirrors (approximately) what the editor canvas shows,
 * good enough for a thumbnail.
 */
export async function renderThumbnail(
  doc: CanvasDocument,
  maxSize = 800,
): Promise<Blob> {
  const scale = Math.min(maxSize / doc.width, maxSize / doc.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(doc.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = doc.backgroundColor || "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  if (doc.backgroundImage) {
    const img = await loadImage(doc.backgroundImage);
    if (img) ctx.drawImage(img, 0, 0, doc.width, doc.height);
  }

  for (const el of doc.elements) {
    if (el.hidden) continue;
    ctx.save();
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
    ctx.rotate(((el.rotation || 0) * Math.PI) / 180);
    ctx.translate(-el.width / 2, -el.height / 2);

    if (el.type === "text") {
      ctx.fillStyle = el.color;
      const weight = el.fontWeight === 700 ? "bold" : "normal";
      const style = el.italic ? "italic" : "normal";
      ctx.font = `${style} ${weight} ${el.fontSize}px "${el.fontFamily}"`;
      ctx.textBaseline = "top";
      const align: CanvasTextAlign =
        el.align === "center" ? "center" : el.align === "right" ? "right" : "left";
      ctx.textAlign = align;
      const xAnchor = align === "center" ? el.width / 2 : align === "right" ? el.width : 0;
      const lines = el.text.split(/\n/);
      const lh = el.fontSize * (el.lineHeight || 1.2);
      lines.forEach((line, i) => ctx.fillText(line, xAnchor, i * lh));
    } else if (el.type === "image") {
      const img = await loadImage(el.src);
      if (img) ctx.drawImage(img, 0, 0, el.width, el.height);
    } else if (el.type === "shape") {
      if (el.fill) {
        ctx.fillStyle = el.fill;
      }
      if (el.stroke) {
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
      }
      if (el.shape === "rect") {
        if (el.fill) ctx.fillRect(0, 0, el.width, el.height);
        if (el.stroke) ctx.strokeRect(0, 0, el.width, el.height);
      } else if (el.shape === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
        if (el.fill) ctx.fill();
        if (el.stroke) ctx.stroke();
      } else if (el.shape === "line") {
        ctx.beginPath();
        ctx.moveTo(0, el.height / 2);
        ctx.lineTo(el.width, el.height / 2);
        ctx.strokeStyle = el.stroke ?? "#000";
        ctx.lineWidth = el.strokeWidth || 2;
        ctx.stroke();
      }
    } else if (el.type === "qr") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, el.width, el.height);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(el.width * 0.1, el.height * 0.1, el.width * 0.8, el.height * 0.8);
      ctx.fillStyle = "#fff";
      ctx.fillRect(el.width * 0.18, el.height * 0.18, el.width * 0.16, el.height * 0.16);
      ctx.fillRect(el.width * 0.66, el.height * 0.18, el.width * 0.16, el.height * 0.16);
      ctx.fillRect(el.width * 0.18, el.height * 0.66, el.width * 0.16, el.height * 0.16);
    }

    ctx.restore();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode thumbnail"))), "image/png");
  });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

void renderCanvasToPdf;
