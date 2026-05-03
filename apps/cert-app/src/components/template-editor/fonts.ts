/**
 * Font runtime for the builtin template editor.
 *
 * Strategy:
 *   - 6 "core" fonts are bundled via @fontsource (instant load, offline-safe)
 *   - The full catalog (~80 fonts) is loaded on-demand from jsDelivr's
 *     @fontsource CDN. Each font's WOFF file is fetched once and cached as
 *     both an object URL (for canvas @font-face) and an ArrayBuffer (for
 *     pdf-lib embedding).
 */

import { findCatalogFont, fontFileUrl, FONT_CATALOG } from "./fontCatalog";

import interRegular from "@fontsource/inter/files/inter-latin-400-normal.woff?url";
import interBold from "@fontsource/inter/files/inter-latin-700-normal.woff?url";
import robotoRegular from "@fontsource/roboto/files/roboto-latin-400-normal.woff?url";
import robotoBold from "@fontsource/roboto/files/roboto-latin-700-normal.woff?url";
import loraRegular from "@fontsource/lora/files/lora-latin-400-normal.woff?url";
import loraBold from "@fontsource/lora/files/lora-latin-700-normal.woff?url";
import playfairRegular from "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url";
import playfairBold from "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url";
import montserratRegular from "@fontsource/montserrat/files/montserrat-latin-400-normal.woff?url";
import montserratBold from "@fontsource/montserrat/files/montserrat-latin-700-normal.woff?url";
import dancingRegular from "@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff?url";
import dancingBold from "@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?url";

interface BundledEntry {
  family: string;
  weight: number;
  url: string;
}

const BUNDLED: BundledEntry[] = [
  { family: "Inter",            weight: 400, url: interRegular },
  { family: "Inter",            weight: 700, url: interBold },
  { family: "Roboto",           weight: 400, url: robotoRegular },
  { family: "Roboto",           weight: 700, url: robotoBold },
  { family: "Lora",             weight: 400, url: loraRegular },
  { family: "Lora",             weight: 700, url: loraBold },
  { family: "Playfair Display", weight: 400, url: playfairRegular },
  { family: "Playfair Display", weight: 700, url: playfairBold },
  { family: "Montserrat",       weight: 400, url: montserratRegular },
  { family: "Montserrat",       weight: 700, url: montserratBold },
  { family: "Dancing Script",   weight: 400, url: dancingRegular },
  { family: "Dancing Script",   weight: 700, url: dancingBold },
];

const BUNDLED_KEY = (family: string, weight: number) => `${family}::${weight}`;
const BUNDLED_LOOKUP = new Map(
  BUNDLED.map((e) => [BUNDLED_KEY(e.family, e.weight), e.url]),
);

/** All fonts the user can pick — bundled + catalog. Catalog covers bundled. */
export const FONT_FAMILIES = FONT_CATALOG.map((f) => f.family);

// In-memory caches for fetched buffers + injected styles
const bufferCache = new Map<string, Promise<ArrayBuffer>>();
const styleInjected = new Set<string>();

let bundledStylesInjected = false;

/** Inject @font-face for the 6 bundled fonts (instant). Idempotent. */
export function ensureBundledFontStyles() {
  if (bundledStylesInjected || typeof document === "undefined") return;
  bundledStylesInjected = true;
  const css = BUNDLED.map(
    (e) =>
      `@font-face { font-family: "${e.family}"; src: url("${e.url}") format("woff"); font-weight: ${e.weight}; font-style: normal; font-display: swap; }`,
  ).join("\n");
  const style = document.createElement("style");
  style.setAttribute("data-builtin-template-fonts", "true");
  style.textContent = css;
  document.head.appendChild(style);
}

/** Backwards-compat alias used by older imports */
export const ensureFontStylesInjected = ensureBundledFontStyles;

function pickWeight(family: string, requested: number): number {
  const cat = findCatalogFont(family);
  if (!cat) return requested;
  if (cat.weights.includes(requested)) return requested;
  // Snap to the closest available weight
  return cat.weights.reduce((best, w) =>
    Math.abs(w - requested) < Math.abs(best - requested) ? w : best,
  );
}

function urlForFont(family: string, weight: number): string | null {
  const w = pickWeight(family, weight);
  const bundled = BUNDLED_LOOKUP.get(BUNDLED_KEY(family, w));
  if (bundled) return bundled;
  const cat = findCatalogFont(family);
  if (!cat) return null;
  return fontFileUrl(cat.slug, w);
}

/** Fetch a font's raw bytes (cached). Used by both pdf-lib and css loading. */
export function fetchFontBufferForFamily(
  family: string,
  weight = 400,
): Promise<ArrayBuffer> {
  const w = pickWeight(family, weight);
  const url = urlForFont(family, w);
  if (!url) return Promise.reject(new Error(`Unknown font: ${family}`));
  const cacheKey = `${family}::${w}::${url}`;
  let p = bufferCache.get(cacheKey);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch font ${family} ${w}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .catch((err) => {
        bufferCache.delete(cacheKey);
        throw err;
      });
    bufferCache.set(cacheKey, p);
  }
  return p;
}

/**
 * Ensure a (family, weight) is available in the document. Injects @font-face
 * pointing at the cached blob URL and waits for document.fonts to confirm.
 */
export async function loadFont(family: string, weight = 400): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const w = pickWeight(family, weight);
  const url = urlForFont(family, w);
  if (!url) return false;

  // Bundled fonts already have @font-face from ensureBundledFontStyles
  const isBundled = BUNDLED_LOOKUP.has(BUNDLED_KEY(family, w));
  if (isBundled) {
    ensureBundledFontStyles();
  } else {
    const styleKey = `${family}::${w}`;
    if (!styleInjected.has(styleKey)) {
      styleInjected.add(styleKey);
      const css = `@font-face { font-family: "${family}"; src: url("${url}") format("woff"); font-weight: ${w}; font-style: normal; font-display: swap; }`;
      const style = document.createElement("style");
      style.setAttribute("data-builtin-template-fonts-dyn", `${family}-${w}`);
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  if (!document.fonts) return true;
  try {
    await document.fonts.load(`${w} 16px "${family}"`);
    return document.fonts.check(`${w} 16px "${family}"`);
  } catch {
    return false;
  }
}

/**
 * Backwards-compat: older code imports ensureFontLoaded(family, weight).
 */
export const ensureFontLoaded = loadFont;

/**
 * Backwards-compat: pdf-lib renderer used to call fetchFontBuffer(url).
 * Re-export so existing imports keep working.
 */
export async function fetchFontBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Helper retained for legacy callers that want a {regular,bold} pair.
 */
export interface BundledFont {
  family: string;
  regular: string;
  bold: string;
}
export const BUNDLED_FONTS: BundledFont[] = [
  { family: "Inter",            regular: interRegular,    bold: interBold },
  { family: "Roboto",           regular: robotoRegular,   bold: robotoBold },
  { family: "Lora",             regular: loraRegular,     bold: loraBold },
  { family: "Playfair Display", regular: playfairRegular, bold: playfairBold },
  { family: "Montserrat",       regular: montserratRegular, bold: montserratBold },
  { family: "Dancing Script",   regular: dancingRegular,  bold: dancingBold },
];
export function getFontByFamily(family: string): BundledFont {
  return BUNDLED_FONTS.find((f) => f.family === family) || BUNDLED_FONTS[0];
}
