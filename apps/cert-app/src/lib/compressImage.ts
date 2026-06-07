/**
 * Downscales and re-encodes an image file using a canvas to keep upload sizes small.
 *
 * Output is always PNG or JPEG — the certificate PDF renderer (pdf-lib) only supports
 * embedding those two formats (it sniffs PNG magic bytes and otherwise assumes JPEG),
 * so emitting WebP/AVIF would silently fail to render on generated certificates.
 * Images with transparency are kept as PNG (lossless); opaque images are re-encoded
 * as JPEG, which compresses photos far more aggressively.
 *
 * Falls back to the original file if the image can't be decoded or the result isn't smaller.
 */
export async function compressImage(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  const { maxDimension = 1920, quality = 0.82 } = options;

  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image"));
      el.src = objectUrl;
    });

    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) return file;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const hasTransparency = canvasHasTransparency(ctx, targetWidth, targetHeight);
    const mimeType = hasTransparency ? "image/png" : "image/jpeg";

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, mimeType === "image/jpeg" ? quality : undefined),
    );
    if (!blob || blob.size >= file.size) return file;

    const ext = mimeType === "image/png" ? "png" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + `.${ext}`;
    return new File([blob], name, { type: mimeType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasHasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}
