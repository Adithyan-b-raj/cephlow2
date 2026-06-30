import QRCode from "qrcode";

export async function generateQrPng(url: string): Promise<Uint8Array> {
  // qrcode.toBuffer works inside Cloudflare Workers under nodejs_compat.
  // We specify png type.
  const buffer = await QRCode.toBuffer(url, {
    type: "png",
    width: 300,
    margin: 2,
  });
  return new Uint8Array(buffer);
}

export async function generateQrSvg(url: string): Promise<string> {
  // Pure JS fallback that doesn't need canvas or nodejs_compat at all.
  const svg = await QRCode.toString(url, {
    type: "svg",
    width: 300,
    margin: 2,
  });
  return svg;
}
