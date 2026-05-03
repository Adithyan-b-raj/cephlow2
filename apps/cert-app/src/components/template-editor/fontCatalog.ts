/**
 * Curated font catalog for the builtin template editor.
 *
 * "Bundled" fonts are imported via @fontsource at build time (instant load).
 * "Catalog" fonts are loaded on-demand from jsDelivr's @fontsource CDN —
 * the same .woff files we already bundle for the defaults, just fetched
 * lazily so we don't balloon the bundle size.
 *
 * URL pattern (jsDelivr):
 *   https://cdn.jsdelivr.net/npm/@fontsource/{slug}/files/{slug}-latin-{weight}-normal.woff
 */

export type FontCategory =
  | "Sans Serif"
  | "Serif"
  | "Display"
  | "Handwriting"
  | "Monospace";

export interface CatalogFont {
  family: string;
  /** kebab-case @fontsource slug, e.g. "open-sans" */
  slug: string;
  category: FontCategory;
  /** Weights available in the @fontsource package. Always includes 400. */
  weights: number[];
}

export const FONT_CATALOG: CatalogFont[] = [
  // ─── Sans Serif ────────────────────────────────────────────────────────
  { family: "Inter",              slug: "inter",              category: "Sans Serif", weights: [400, 700] },
  { family: "Roboto",             slug: "roboto",             category: "Sans Serif", weights: [400, 700] },
  { family: "Open Sans",          slug: "open-sans",          category: "Sans Serif", weights: [400, 700] },
  { family: "Lato",               slug: "lato",               category: "Sans Serif", weights: [400, 700] },
  { family: "Montserrat",         slug: "montserrat",         category: "Sans Serif", weights: [400, 700] },
  { family: "Poppins",            slug: "poppins",            category: "Sans Serif", weights: [400, 700] },
  { family: "Raleway",            slug: "raleway",            category: "Sans Serif", weights: [400, 700] },
  { family: "Nunito",             slug: "nunito",             category: "Sans Serif", weights: [400, 700] },
  { family: "Source Sans 3",      slug: "source-sans-3",      category: "Sans Serif", weights: [400, 700] },
  { family: "Work Sans",          slug: "work-sans",          category: "Sans Serif", weights: [400, 700] },
  { family: "Oswald",             slug: "oswald",             category: "Sans Serif", weights: [400, 700] },
  { family: "Bebas Neue",         slug: "bebas-neue",         category: "Sans Serif", weights: [400] },
  { family: "Anton",              slug: "anton",              category: "Sans Serif", weights: [400] },
  { family: "Archivo",            slug: "archivo",            category: "Sans Serif", weights: [400, 700] },
  { family: "Barlow",             slug: "barlow",             category: "Sans Serif", weights: [400, 700] },
  { family: "DM Sans",            slug: "dm-sans",            category: "Sans Serif", weights: [400, 700] },
  { family: "Plus Jakarta Sans",  slug: "plus-jakarta-sans",  category: "Sans Serif", weights: [400, 700] },
  { family: "Manrope",            slug: "manrope",            category: "Sans Serif", weights: [400, 700] },
  { family: "Karla",              slug: "karla",              category: "Sans Serif", weights: [400, 700] },
  { family: "Quicksand",          slug: "quicksand",          category: "Sans Serif", weights: [400, 700] },
  { family: "Fira Sans",          slug: "fira-sans",          category: "Sans Serif", weights: [400, 700] },
  { family: "IBM Plex Sans",      slug: "ibm-plex-sans",      category: "Sans Serif", weights: [400, 700] },
  { family: "Mulish",             slug: "mulish",             category: "Sans Serif", weights: [400, 700] },
  { family: "Rubik",              slug: "rubik",              category: "Sans Serif", weights: [400, 700] },
  { family: "Noto Sans",          slug: "noto-sans",          category: "Sans Serif", weights: [400, 700] },
  { family: "Hind",               slug: "hind",               category: "Sans Serif", weights: [400, 700] },
  { family: "Cabin",              slug: "cabin",              category: "Sans Serif", weights: [400, 700] },
  { family: "Heebo",              slug: "heebo",              category: "Sans Serif", weights: [400, 700] },
  { family: "Asap",               slug: "asap",               category: "Sans Serif", weights: [400, 700] },
  { family: "Titillium Web",      slug: "titillium-web",      category: "Sans Serif", weights: [400, 700] },

  // ─── Serif ─────────────────────────────────────────────────────────────
  { family: "Lora",               slug: "lora",               category: "Serif", weights: [400, 700] },
  { family: "Playfair Display",   slug: "playfair-display",   category: "Serif", weights: [400, 700] },
  { family: "Merriweather",       slug: "merriweather",       category: "Serif", weights: [400, 700] },
  { family: "PT Serif",           slug: "pt-serif",           category: "Serif", weights: [400, 700] },
  { family: "Crimson Text",       slug: "crimson-text",       category: "Serif", weights: [400, 700] },
  { family: "EB Garamond",        slug: "eb-garamond",        category: "Serif", weights: [400, 700] },
  { family: "Cormorant Garamond", slug: "cormorant-garamond", category: "Serif", weights: [400, 700] },
  { family: "Libre Baskerville",  slug: "libre-baskerville",  category: "Serif", weights: [400, 700] },
  { family: "Bitter",             slug: "bitter",             category: "Serif", weights: [400, 700] },
  { family: "Source Serif 4",     slug: "source-serif-4",     category: "Serif", weights: [400, 700] },
  { family: "Noto Serif",         slug: "noto-serif",         category: "Serif", weights: [400, 700] },
  { family: "Spectral",           slug: "spectral",           category: "Serif", weights: [400, 700] },
  { family: "Cardo",              slug: "cardo",              category: "Serif", weights: [400, 700] },
  { family: "Domine",             slug: "domine",             category: "Serif", weights: [400, 700] },
  { family: "Old Standard TT",    slug: "old-standard-tt",    category: "Serif", weights: [400, 700] },
  { family: "Vollkorn",           slug: "vollkorn",           category: "Serif", weights: [400, 700] },

  // ─── Display ───────────────────────────────────────────────────────────
  { family: "Abril Fatface",      slug: "abril-fatface",      category: "Display", weights: [400] },
  { family: "Bungee",             slug: "bungee",             category: "Display", weights: [400] },
  { family: "Pacifico",           slug: "pacifico",           category: "Display", weights: [400] },
  { family: "Lobster",            slug: "lobster",            category: "Display", weights: [400] },
  { family: "Righteous",          slug: "righteous",          category: "Display", weights: [400] },
  { family: "Press Start 2P",     slug: "press-start-2p",     category: "Display", weights: [400] },
  { family: "Russo One",          slug: "russo-one",          category: "Display", weights: [400] },
  { family: "Fredoka",            slug: "fredoka",            category: "Display", weights: [400, 700] },
  { family: "Black Ops One",      slug: "black-ops-one",      category: "Display", weights: [400] },
  { family: "Bowlby One",         slug: "bowlby-one",         category: "Display", weights: [400] },
  { family: "Alfa Slab One",      slug: "alfa-slab-one",      category: "Display", weights: [400] },
  { family: "Yeseva One",         slug: "yeseva-one",         category: "Display", weights: [400] },
  { family: "Faster One",         slug: "faster-one",         category: "Display", weights: [400] },
  { family: "Bungee Inline",      slug: "bungee-inline",      category: "Display", weights: [400] },
  { family: "Ultra",              slug: "ultra",              category: "Display", weights: [400] },

  // ─── Handwriting ───────────────────────────────────────────────────────
  { family: "Dancing Script",     slug: "dancing-script",     category: "Handwriting", weights: [400, 700] },
  { family: "Great Vibes",        slug: "great-vibes",        category: "Handwriting", weights: [400] },
  { family: "Sacramento",         slug: "sacramento",         category: "Handwriting", weights: [400] },
  { family: "Allura",             slug: "allura",             category: "Handwriting", weights: [400] },
  { family: "Parisienne",         slug: "parisienne",         category: "Handwriting", weights: [400] },
  { family: "Kaushan Script",     slug: "kaushan-script",     category: "Handwriting", weights: [400] },
  { family: "Satisfy",            slug: "satisfy",            category: "Handwriting", weights: [400] },
  { family: "Yellowtail",         slug: "yellowtail",         category: "Handwriting", weights: [400] },
  { family: "Permanent Marker",   slug: "permanent-marker",   category: "Handwriting", weights: [400] },
  { family: "Caveat",             slug: "caveat",             category: "Handwriting", weights: [400, 700] },
  { family: "Shadows Into Light", slug: "shadows-into-light", category: "Handwriting", weights: [400] },
  { family: "Indie Flower",       slug: "indie-flower",       category: "Handwriting", weights: [400] },
  { family: "Amatic SC",          slug: "amatic-sc",          category: "Handwriting", weights: [400, 700] },
  { family: "Homemade Apple",     slug: "homemade-apple",     category: "Handwriting", weights: [400] },
  { family: "Marck Script",       slug: "marck-script",       category: "Handwriting", weights: [400] },
  { family: "Cookie",             slug: "cookie",             category: "Handwriting", weights: [400] },
  { family: "Tangerine",          slug: "tangerine",          category: "Handwriting", weights: [400, 700] },
  { family: "Pinyon Script",      slug: "pinyon-script",      category: "Handwriting", weights: [400] },
  { family: "Mr Dafoe",           slug: "mr-dafoe",           category: "Handwriting", weights: [400] },

  // ─── Monospace ─────────────────────────────────────────────────────────
  { family: "Roboto Mono",        slug: "roboto-mono",        category: "Monospace", weights: [400, 700] },
  { family: "JetBrains Mono",     slug: "jetbrains-mono",     category: "Monospace", weights: [400, 700] },
  { family: "Source Code Pro",    slug: "source-code-pro",    category: "Monospace", weights: [400, 700] },
  { family: "Fira Code",          slug: "fira-code",          category: "Monospace", weights: [400, 700] },
  { family: "Inconsolata",        slug: "inconsolata",        category: "Monospace", weights: [400, 700] },
  { family: "Space Mono",         slug: "space-mono",         category: "Monospace", weights: [400, 700] },
  { family: "Cousine",            slug: "cousine",            category: "Monospace", weights: [400, 700] },
];

export const FONT_CATEGORIES: FontCategory[] = [
  "Sans Serif",
  "Serif",
  "Display",
  "Handwriting",
  "Monospace",
];

const BY_FAMILY = new Map(FONT_CATALOG.map((f) => [f.family, f]));
export function findCatalogFont(family: string): CatalogFont | undefined {
  return BY_FAMILY.get(family);
}

export function fontFileUrl(slug: string, weight: number): string {
  return `https://cdn.jsdelivr.net/npm/@fontsource/${slug}/files/${slug}-latin-${weight}-normal.woff`;
}
