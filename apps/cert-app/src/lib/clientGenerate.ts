/**
 * Client-Side Certificate Generation Engine
 *
 * This module runs in the browser and performs certificate generation using
 * the user's own Google OAuth token. All Google API calls happen directly
 * from the client — the server is only used for R2 uploads and DB writes.
 */

import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import {
  renderCanvasToPdf,
  preloadCanvasResources,
  createBatchAssetCache,
} from "@/components/template-editor/pdfRenderer";
import type { CanvasDocument } from "@/components/template-editor/types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CertData {
  id: string;
  recipientName: string;
  recipientEmail: string;
  status: string;
  rowData: Record<string, string>;
  slideFileId: string | null;
  requiresVisualRegen: boolean;
  r2PdfUrl: string | null;
}

export interface BatchConfig {
  id: string;
  name: string;
  templateId: string;
  templateKind?: "slides" | "builtin";
  columnMap: Record<string, string>;
  driveFolderId: string | null;
  pdfFolderId: string | null;
  categoryColumn: string | null;
  categoryTemplateMap: Record<string, { templateId: string; columnMap?: Record<string, string> }> | null;
  categorySlideMap: Record<string, number> | null;
  builtinTemplate?: {
    id: string;
    name: string;
    canvas: CanvasDocument;
    placeholders: string[];
  } | null;
  builtinTemplateDataById?: Record<string, {
    id: string;
    name: string;
    canvas: CanvasDocument;
    placeholders: string[];
  }> | null;
}

export interface GenerationProgress {
  phase: "preparing" | "generating" | "uploading" | "done" | "error";
  current: number;
  total: number;
  currentCertName: string;
  message: string;
}

type ProgressCallback = (progress: GenerationProgress) => void;

// Google APIs use service-specific hostnames that support CORS from browsers.
// Using www.googleapis.com for Slides will fail CORS preflight checks.
const SLIDES_API = "https://slides.googleapis.com/v1/presentations";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

async function gFetch(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

async function gJson<T = any>(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await gFetch(url, token, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  return res.json();
}

// ── Adaptive chunk size ────────────────────────────────────────────────────

function getOptimalChunkSize(): number {
  const memory = (navigator as any).deviceMemory;
  if (memory && memory <= 2) return 15;
  if (memory && memory <= 4) return 25;
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) return 30;
  return 50;
}

// ── Template resolution ────────────────────────────────────────────────────

function resolveTemplate(
  cert: CertData,
  batch: BatchConfig
): { templateId: string; slideIndex: number | null } {
  const rowData = cert.rowData || {};
  let templateId = batch.templateId;
  let slideIndex: number | null = null;

  if (batch.categoryColumn && batch.categorySlideMap) {
    const val = rowData[batch.categoryColumn] || "";
    if (val && val in batch.categorySlideMap) slideIndex = batch.categorySlideMap[val];
    else if ("_default" in batch.categorySlideMap)
      slideIndex = batch.categorySlideMap["_default"];
    else slideIndex = 0;
  } else if (batch.categoryColumn && batch.categoryTemplateMap) {
    const val = rowData[batch.categoryColumn];
    if (val && batch.categoryTemplateMap[val])
      templateId = batch.categoryTemplateMap[val].templateId;
  }

  return { templateId, slideIndex };
}

// ── QR Code generation ────────────────────────────────────────────────────

async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

// ── Font scaling helpers (mirrors server logic) ────────────────────────────

const EMU_PER_PT = 12700;
const CHAR_WIDTH_FACTOR = 0.62;
const DEFAULT_INSET_EMU = 91440;

function getEffectiveLength(text: string): number {
  let len = 0;
  for (const char of text) {
    if (["W", "M"].includes(char)) len += 1.4;
    else if (/[A-Z]/.test(char)) len += 1.2;
    else if (["w", "m"].includes(char)) len += 1.2;
    else if (
      ["i", "j", "l", "f", "1", ".", ",", ";", ":", "'", '"', "|"].includes(
        char
      )
    )
      len += 0.35;
    else if (["t", "r"].includes(char)) len += 0.6;
    else if (char === " ") len += 0.35;
    else len += 1.0;
  }
  return len;
}

// ── Core generation for a chunk of certs ───────────────────────────────────

interface ChunkResult {
  certId: string;
  pdfBuffer: Uint8Array;
}

async function generateChunk(
  token: string,
  templateId: string,
  slideIndex: number | null,
  certs: CertData[],
  batch: BatchConfig,
  baseUrl: string,
  onProgress: (certName: string) => void
): Promise<{ results: ChunkResult[]; tempFileId: string }> {
  // Step 1: Copy template
  const copy = await gJson(
    `${DRIVE_API}/${templateId}/copy?fields=id`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name: `_batch_client_${Date.now()}`,
        parents: batch.driveFolderId ? [batch.driveFolderId] : undefined,
      }),
    }
  );
  const batchFileId = copy.id;

  try {
    // Step 2: Delete unwanted slides if slideIndex is set
    if (slideIndex != null) {
      const presData = await gJson(
        `${SLIDES_API}/${batchFileId}?fields=slides(objectId)`,
        token
      );
      const slides = presData.slides || [];
      if (slides.length > 1 && slideIndex >= 0 && slideIndex < slides.length) {
        const delRequests = slides
          .map((s: any, i: number) =>
            i !== slideIndex ? { deleteObject: { objectId: s.objectId } } : null
          )
          .filter(Boolean)
          .reverse();
        if (delRequests.length > 0) {
          await gJson(
            `${SLIDES_API}/${batchFileId}:batchUpdate`,
            token,
            {
              method: "POST",
              body: JSON.stringify({ requests: delRequests }),
            }
          );
        }
      }
    }

    // Step 3: Get base slide
    const baseData = await gJson(
      `${SLIDES_API}/${batchFileId}?fields=slides(objectId)`,
      token
    );
    const baseSlideObjectId = baseData.slides[0].objectId;

    // Step 4: Duplicate slide N-1 times
    if (certs.length > 1) {
      const dupRequests = Array.from({ length: certs.length - 1 }, () => ({
        duplicateObject: { objectId: baseSlideObjectId },
      }));
      await gJson(`${SLIDES_API}/${batchFileId}:batchUpdate`, token, {
        method: "POST",
        body: JSON.stringify({ requests: dupRequests }),
      });
    }

    // Step 5: Fetch full presentation with all elements
    const fullData = await gJson(
      `${SLIDES_API}/${batchFileId}?fields=slides(objectId,pageElements(objectId,title,size,transform,shape(text(textElements))))`,
      token
    );
    const allSlides = fullData.slides || [];

    // Step 6: Pre-generate QR codes as data URLs and upload to a public host
    // For the Slides API to use them, we need publicly accessible URLs.
    // We use the qrserver.com fallback since we can't use R2 from the client.
    const qrUrlByCertId = new Map<string, string>();
    for (const cert of certs) {
      const qrCodeUrl = `${baseUrl}/verify/${batch.id}/${cert.id}`;
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeUrl)}`;
      qrUrlByCertId.set(cert.id, url);
    }

    // Step 7: Build one giant batchUpdate for all certs
    const allRequests: any[] = [];

    for (let ci = 0; ci < certs.length; ci++) {
      const cert = certs[ci];
      const slide = allSlides[ci];
      if (!slide) continue;
      const slideObjId = slide.objectId;
      onProgress(cert.recipientName);

      // Build replacements
      const replacements: Record<string, string> = {};
      for (const [placeholder, column] of Object.entries(batch.columnMap || {})) {
        replacements[placeholder] = cert.rowData[column] || "";
      }

      // Text replacements scoped to this slide
      for (const [placeholder, value] of Object.entries(replacements)) {
        allRequests.push({
          replaceAllText: {
            containsText: { text: placeholder, matchCase: true },
            replaceText: value,
            pageObjectIds: [slideObjId],
          },
        });
      }

      // Font scaling — account for transform.scaleX to get actual visual width
      const processedObjectIds = new Set<string>();
      for (const el of slide.pageElements || []) {
        if (processedObjectIds.has(el.objectId)) continue;
        const textEls = el.shape?.text?.textElements || [];
        const content = textEls.map((te: any) => te.textRun?.content || "").join("");
        for (const [placeholder, value] of Object.entries(replacements)) {
          if (content.includes(placeholder) && !processedObjectIds.has(el.objectId)) {
            // Visual width = intrinsic width × scaleX
            const shapeWidthEmu = el.size?.width?.magnitude || 0;
            const scaleX = Math.abs(el.transform?.scaleX ?? 1);
            const visualWidthEmu = shapeWidthEmu * scaleX;
            const shapeWidth = (visualWidthEmu - DEFAULT_INSET_EMU * 2) / EMU_PER_PT;
            const runFontEl = textEls.find(
              (te: any) => te.textRun?.style?.fontSize?.magnitude
            );
            const currentFontSize =
              runFontEl?.textRun?.style?.fontSize?.magnitude || 28;
            const estimatedWidth =
              getEffectiveLength(value) * currentFontSize * CHAR_WIDTH_FACTOR;
            if (estimatedWidth > shapeWidth * 0.9) {
              const scaled = Math.max(
                6,
                Math.floor(
                  currentFontSize * ((shapeWidth * 0.9) / estimatedWidth)
                )
              );
              processedObjectIds.add(el.objectId);
              allRequests.push({
                updateTextStyle: {
                  objectId: el.objectId,
                  style: { fontSize: { magnitude: scaled, unit: "PT" } },
                  fields: "fontSize",
                  textRange: { type: "ALL" },
                },
              });
            }
          }
        }
      }

      // QR code — text-based {{qr_code}} replacement
      const qrImageUrl = qrUrlByCertId.get(cert.id)!;
      allRequests.push({
        replaceAllShapesWithImage: {
          imageUrl: qrImageUrl,
          imageReplaceMethod: "CENTER_INSIDE",
          containsText: { text: "{{qr_code}}", matchCase: true },
          pageObjectIds: [slideObjId],
        },
      });

      // QR code — alt-text based <<qr_code>> shapes
      const qrShapes = (slide.pageElements || []).filter(
        (el: any) => el.title === "<<qr_code>>"
      );
      for (let qi = 0; qi < qrShapes.length; qi++) {
        const shape = qrShapes[qi];
        const newObjId = `qr_${ci}_${qi}_${Date.now()}`;
        allRequests.push({ deleteObject: { objectId: shape.objectId } });
        allRequests.push({
          createImage: {
            objectId: newObjId,
            url: qrImageUrl,
            elementProperties: {
              pageObjectId: slideObjId,
              size: shape.size,
              transform: shape.transform,
            },
          },
        });
        allRequests.push({
          updatePageElementsZOrder: {
            pageElementObjectIds: [newObjId],
            operation: "BRING_TO_FRONT",
          },
        });
      }
    }

    // Flush requests in chunks of 500 to stay under API limits
    const SLIDES_BATCH_LIMIT = 500;
    for (let i = 0; i < allRequests.length; i += SLIDES_BATCH_LIMIT) {
      await gJson(`${SLIDES_API}/${batchFileId}:batchUpdate`, token, {
        method: "POST",
        body: JSON.stringify({
          requests: allRequests.slice(i, i + SLIDES_BATCH_LIMIT),
        }),
      });
    }

    // Step 8: Export as PDF
    const pdfRes = await gFetch(
      `${DRIVE_API}/${batchFileId}/export?mimeType=application/pdf`,
      token
    );
    const fullPdfBuffer = new Uint8Array(await pdfRes.arrayBuffer());

    // Step 9: Split PDF by page
    const srcDoc = await PDFDocument.load(fullPdfBuffer);
    const results: ChunkResult[] = [];
    for (let i = 0; i < certs.length; i++) {
      const singleDoc = await PDFDocument.create();
      const [page] = await singleDoc.copyPages(srcDoc, [i]);
      singleDoc.addPage(page);
      results.push({
        certId: certs[i].id,
        pdfBuffer: await singleDoc.save(),
      });
    }

    return { results, tempFileId: batchFileId };
  } catch (err) {
    // Clean up batch file on error
    try {
      await gFetch(`${DRIVE_API}/${batchFileId}`, token, { method: "DELETE" });
    } catch {}
    throw err;
  }
}

// ── Token management ───────────────────────────────────────────────────────

async function getGoogleAccessToken(apiBaseUrl: string): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
  const res = await fetch(`${apiBaseUrl}/api/auth/google/access-token`, {
    headers: await apiHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to get Google access token");
  }
  return res.json();
}

// Helper to get the Supabase session token
async function getSupabaseToken(): Promise<string> {
  // Dynamically import to avoid circular deps with supabase client
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

// Helper to get the active workspace ID from localStorage
function getActiveWorkspaceId(): string | null {
  return localStorage.getItem("cephlow_active_workspace");
}

// Build standard headers for API calls (auth + workspace)
async function apiHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getSupabaseToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
  const wsId = getActiveWorkspaceId();
  if (wsId) headers["x-workspace-id"] = wsId;
  return headers;
}

// ── Report per-cert results to server ──────────────────────────────────────

type CertReport = {
  certId: string;
  recipientName: string;
  r2PdfUrl: string | null;
  drivePdfFileId?: string | null;
  drivePdfUrl?: string | null;
  driveSlideFileId?: string | null;
  driveSlideUrl?: string | null;
};

async function reportCertResults(
  apiBaseUrl: string,
  batchId: string,
  certs: CertReport[],
): Promise<void> {
  if (certs.length === 0) return;
  const res = await fetch(`${apiBaseUrl}/api/batches/${batchId}/client-report`, {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ certs }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to report cert results");
  }
}

async function reportBatchComplete(
  apiBaseUrl: string,
  batchId: string,
  generated: number,
  failed: number,
  profiles: Array<{ email: string; name: string; certId: string; batchName: string; r2PdfUrl: string | null; pdfUrl: string | null; slideUrl: string | null }>
): Promise<void> {
  await fetch(`${apiBaseUrl}/api/batches/${batchId}/client-complete`, {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ generated, failed, profiles }),
  });
}

async function cleanupTempFiles(
  apiBaseUrl: string,
  batchId: string,
  tempFileIds: string[]
): Promise<void> {
  if (tempFileIds.length === 0) return;
  const supabaseToken = await getSupabaseToken();
  const wsId = getActiveWorkspaceId();
  // Use sendBeacon for reliability on tab close, fall back to fetch
  const body = JSON.stringify({ tempFileIds });
  const url = `${apiBaseUrl}/api/batches/${batchId}/client-cleanup`;
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    // sendBeacon doesn't support custom headers, so we pass token + workspace in the URL
    const params = new URLSearchParams({ token: supabaseToken });
    if (wsId) params.set("workspaceId", wsId);
    navigator.sendBeacon(`${url}?${params}`, blob);
  } else {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseToken}`,
    };
    if (wsId) headers["x-workspace-id"] = wsId;
    fetch(url, {
      method: "POST",
      headers,
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

// ── Drive-upload helper for unapproved (free-tier) builtin generation ─────
// Uploads the rendered PDF directly to the user's Google Drive using a
// multipart request. Returns { fileId, webViewLink } to report back.
async function uploadPdfToDrive(
  googleToken: string,
  pdfBytes: Uint8Array,
  filename: string,
  parentFolderId: string | null,
): Promise<{ fileId: string; webViewLink: string | null }> {
  const boundary = "cephlow_drive_upload_" + Math.random().toString(36).slice(2);
  const metadata: Record<string, any> = { name: filename, mimeType: "application/pdf" };
  if (parentFolderId) metadata.parents = [parentFolderId];

  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/pdf\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tail);
  const body = new Uint8Array(headBytes.length + pdfBytes.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(pdfBytes, headBytes.length);
  body.set(tailBytes, headBytes.length + pdfBytes.length);

  const res = await fetch(
    `${UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: body as unknown as BodyInit,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const j = await res.json();
  return { fileId: j.id, webViewLink: j.webViewLink || null };
}

// ── Main generation function ───────────────────────────────────────────────

export interface ClientGenerateOptions {
  apiBaseUrl: string;
  batchId: string;
  selectedCertIds?: string[];
  onProgress: ProgressCallback;
  abortSignal?: AbortSignal;
}

export interface ClientGenerateResult {
  generated: number;
  failed: number;
  status: "generated" | "partial" | "draft";
}

export async function clientGenerate(
  options: ClientGenerateOptions
): Promise<ClientGenerateResult> {
  const { apiBaseUrl, batchId, selectedCertIds, onProgress, abortSignal } =
    options;

  // Step 1: Request generation start from server (wallet deduction)
  onProgress({
    phase: "preparing",
    current: 0,
    total: 0,
    currentCertName: "",
    message: "Validating and preparing generation...",
  });

  const initRes = await fetch(
    `${apiBaseUrl}/api/batches/${batchId}/client-generate`,
    {
      method: "POST",
      headers: await apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ selectedCertIds }),
    }
  );
  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({}));
    throw new Error(data.error || `Server returned ${initRes.status}`);
  }

  const initData = await initRes.json();
  const batch: BatchConfig = initData.batch;
  const allCerts: CertData[] = initData.certificates;
  const baseUrl: string = initData.baseUrl;
  const isApproved: boolean = initData.isApproved !== false; // default to approved if missing

  // Certs that need a full visual re-render (new, failed, or outdated with visual changes)
  const toGenerate = allCerts.filter(
    (c) =>
      c.status !== "generated" &&
      c.status !== "sent" &&
      (c.requiresVisualRegen !== false || !c.r2PdfUrl)
  );
  // Certs that are outdated but only metadata changed — no re-render, just a DB update
  const metadataOnly = allCerts.filter(
    (c) =>
      c.status !== "generated" &&
      c.status !== "sent" &&
      c.requiresVisualRegen === false &&
      !!c.r2PdfUrl
  );

  const totalToProcess = toGenerate.length + metadataOnly.length;
  let generated = 0;
  let failed = 0;
  const tempFileIds: string[] = [];
  const profiles: Array<{
    email: string;
    name: string;
    certId: string;
    batchName: string;
    r2PdfUrl: string | null;
    pdfUrl: string | null;
    slideUrl: string | null;
  }> = [];

  // Cached synchronously for the pagehide beacon (set once auth is ready)
  let beaconParams = "";

  // Send beacon when page actually unloads (close, reload, navigate away)
  const pageHideHandler = (event: PageTransitionEvent) => {
    if (event.persisted) return; // going into bfcache, not truly unloading
    cleanupTempFiles(apiBaseUrl, batchId, tempFileIds);
    if (beaconParams) {
      navigator.sendBeacon(
        `${apiBaseUrl}/api/batches/${batchId}/client-complete?${beaconParams}`,
        new Blob(
          [JSON.stringify({ generated, failed, cancelled: true, profiles: [] })],
          { type: "application/json" }
        )
      );
    }
  };

  window.addEventListener("pagehide", pageHideHandler);

  try {
    // Cache auth params for the beforeunload beacon. getSession() hits the
    // in-memory Supabase cache so this adds no network round-trip.
    {
      const _tok = await getSupabaseToken();
      const _wsId = getActiveWorkspaceId();
      const _p = new URLSearchParams({ token: _tok });
      if (_wsId) _p.set("workspaceId", _wsId);
      beaconParams = _p.toString();
    }

    // Step 2: Get Google access token
    onProgress({
      phase: "preparing",
      current: 0,
      total: totalToProcess,
      currentCertName: "",
      message: "Getting Google access token...",
    });
    let tokenData = await getGoogleAccessToken(apiBaseUrl);
    let googleToken = tokenData.accessToken;
    let tokenExpiresAt = tokenData.expiresAt;

    // Helper to refresh token if expired
    const ensureToken = async () => {
      if (Date.now() > tokenExpiresAt - 60_000) {
        tokenData = await getGoogleAccessToken(apiBaseUrl);
        googleToken = tokenData.accessToken;
        tokenExpiresAt = tokenData.expiresAt;
      }
      return googleToken;
    };

    // Step 3: Handle metadata-only certs (no re-render needed)
    const metadataReports: CertReport[] = [];
    for (const cert of metadataOnly) {
      if (abortSignal?.aborted) throw new Error("Generation cancelled");
      metadataReports.push({ certId: cert.id, recipientName: cert.recipientName, r2PdfUrl: cert.r2PdfUrl || null });
      if (cert.recipientEmail) {
        profiles.push({ email: cert.recipientEmail, name: cert.recipientName, certId: cert.id, batchName: batch.name, r2PdfUrl: cert.r2PdfUrl || null, pdfUrl: null, slideUrl: null });
      }
      generated++;
      onProgress({
        phase: "generating",
        current: generated + failed,
        total: totalToProcess,
        currentCertName: cert.recipientName,
        message: `Metadata update: ${cert.recipientName}`,
      });
    }
    if (metadataReports.length > 0) {
      await reportCertResults(apiBaseUrl, batchId, metadataReports).catch(() => {
        generated -= metadataReports.length;
        failed += metadataReports.length;
      });
    }

    // Builtin path — render PDFs entirely client-side via pdf-lib, no Slides API
    if (batch.templateKind === "builtin") {
      if (!batch.builtinTemplate) {
        throw new Error("Builtin template data missing for this batch");
      }

      // Build a mutable map of all template canvases we have
      const templateCanvasById: Record<string, typeof batch.builtinTemplate> = {
        ...(batch.builtinTemplateDataById ?? {}),
        [batch.templateId]: batch.builtinTemplate,  // always seed with primary
      };

      // Collect any routed template IDs that are missing canvas data and fetch them
      if (batch.categoryColumn && batch.categoryTemplateMap) {
        const missingIds = [...new Set(
          Object.values(batch.categoryTemplateMap)
            .map((v) => v.templateId)
            .filter((id) => id && !templateCanvasById[id])
        )];
        if (missingIds.length > 0) {
          console.warn("[CLIENT-BUILTIN] builtinTemplateDataById missing for:", missingIds, "— fetching individually");
          await Promise.all(missingIds.map(async (tplId) => {
            try {
              const res = await fetch(`${apiBaseUrl}/api/builtin-templates/${tplId}`, {
                headers: await apiHeaders(),
              });
              if (res.ok) {
                const data = await res.json();
                // Endpoint returns the template object directly (id, name, canvas, placeholders)
                if (data?.canvas) templateCanvasById[tplId] = data;
              }
            } catch (e) {
              console.error("[CLIENT-BUILTIN] Failed to fetch template canvas for", tplId, e);
            }
          }));
        }
      }

      // Resolve which builtin template canvas + column map each cert should use
      function resolveBuiltinTemplate(cert: CertData): { canvas: CanvasDocument; columnMap: Record<string, string> } {
        if (batch.categoryColumn && batch.categoryTemplateMap) {
          const val = (cert.rowData || {})[batch.categoryColumn];
          const entry = val ? batch.categoryTemplateMap[val] : null;
          if (entry) {
            const tplData = templateCanvasById[entry.templateId];
            if (tplData) {
              return {
                canvas: tplData.canvas as CanvasDocument,
                columnMap: (entry.columnMap as Record<string, string>) ?? batch.columnMap ?? {},
              };
            }
          }
        }
        return { canvas: batch.builtinTemplate!.canvas, columnMap: batch.columnMap ?? {} };
      }

      // Preload resources for all unique canvases used in this batch
      const seenCanvases = new Set<CanvasDocument>();
      const preloadPromises: Promise<void>[] = [];
      for (const cert of toGenerate) {
        const { canvas } = resolveBuiltinTemplate(cert);
        if (!seenCanvases.has(canvas)) {
          seenCanvases.add(canvas);
          preloadPromises.push(preloadCanvasResources(canvas).catch(() => {}));
        }
      }
      await Promise.all(preloadPromises);

      // Shared across the whole batch so we fetch each image only once.
      const batchAssetCache = createBatchAssetCache();

      // Get presigned URLs for the whole set in chunks to keep payload bounded
      const PRESIGN_CHUNK = 25;
      for (let off = 0; off < toGenerate.length; off += PRESIGN_CHUNK) {
        if (abortSignal?.aborted) throw new Error("Generation cancelled");

        const chunk = toGenerate.slice(off, off + PRESIGN_CHUNK);
        // Approved orgs upload to R2 (presigned URLs).
        // Free-tier (unapproved) skips R2 entirely and uploads directly to
        // the user's Google Drive folder using their access token.
        let presignedUrls: Array<{ certId: string; uploadUrl: string; r2PdfUrl: string | null }> = [];
        if (isApproved) {
          const presignedRes = await fetch(
            `${apiBaseUrl}/api/batches/${batchId}/presigned-urls`,
            {
              method: "POST",
              headers: await apiHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({
                certificates: chunk.map((c) => ({
                  certId: c.id,
                  recipientName: c.recipientName,
                  rowData: c.rowData,
                })),
                batchName: batch.name,
              }),
            },
          );
          const j = await presignedRes.json();
          presignedUrls = j.presignedUrls || [];
        }

        // Sliding window of CONCURRENCY workers pulling from a shared queue.
        // CPU-bound render interleaves with the network-bound upload + report
        // of other in-flight certs, so total chunk time ≈ max(render, network)
        // instead of render + network per cert.
        const CONCURRENCY = 6;
        let nextIdx = 0;
        const chunkReports: CertReport[] = [];

        const processCert = async (cert: CertData) => {
          onProgress({
            phase: "generating",
            current: generated + failed,
            total: totalToProcess,
            currentCertName: cert.recipientName,
            message: `Rendering: ${cert.recipientName}`,
          });

          try {
            // Resolve the correct template canvas + column map for this cert
            const { canvas: certCanvas, columnMap: certColumnMap } = resolveBuiltinTemplate(cert);

            const replacements: Record<string, string> = {};
            for (const [placeholder, column] of Object.entries(certColumnMap)) {
              replacements[placeholder] = (cert.rowData || {})[column] || "";
            }
            const qrUrl = `${baseUrl}/verify/${batch.id}/${cert.id}`;

            const pdfBuffer = await renderCanvasToPdf({
              doc: certCanvas,
              replacements,
              qrUrl,
              batchCache: batchAssetCache,
            });

            let r2PdfUrl: string | null = null;
            let drivePdfFileId: string | null = null;
            let drivePdfUrl: string | null = null;

            if (isApproved) {
              const urlInfo = presignedUrls?.find((u: any) => u.certId === cert.id);
              if (urlInfo?.uploadUrl) {
                let ok = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    const upRes = await fetch(urlInfo.uploadUrl, {
                      method: "PUT",
                      headers: { "Content-Type": "application/pdf" },
                      body: pdfBuffer as unknown as BodyInit,
                    });
                    if (!upRes.ok) throw new Error(`R2 upload HTTP ${upRes.status}`);
                    ok = true;
                    break;
                  } catch (uErr) {
                    console.warn(
                      `[CLIENT-BUILTIN] R2 upload attempt ${attempt}/3 failed for ${cert.recipientName}:`,
                      uErr,
                    );
                    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
                  }
                }
                if (!ok) throw new Error("R2 upload failed after 3 attempts");
                r2PdfUrl = urlInfo.r2PdfUrl;
              }
            } else {
              // Free tier: upload to the batch's Google Drive folder
              const safeName = (cert.recipientName || "cert").replace(/[^a-zA-Z0-9]/g, "_");
              const safeBatch = (batch.name || "batch").replace(/[^a-zA-Z0-9]/g, "_");
              const filename = `${safeName}_${safeBatch}.pdf`;
              let lastErr: any = null;
              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  const tok = await ensureToken();
                  const { fileId, webViewLink } = await uploadPdfToDrive(
                    tok,
                    pdfBuffer,
                    filename,
                    batch.pdfFolderId || batch.driveFolderId || null,
                  );
                  drivePdfFileId = fileId;
                  drivePdfUrl = webViewLink;
                  lastErr = null;
                  break;
                } catch (e) {
                  lastErr = e;
                  if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
                }
              }
              if (lastErr) throw lastErr;
            }

            chunkReports.push({ certId: cert.id, recipientName: cert.recipientName, r2PdfUrl: r2PdfUrl || null, drivePdfFileId: drivePdfFileId || null, drivePdfUrl: drivePdfUrl || null });
            if (cert.recipientEmail) {
              profiles.push({ email: cert.recipientEmail, name: cert.recipientName, certId: cert.id, batchName: batch.name, r2PdfUrl: r2PdfUrl || null, pdfUrl: drivePdfUrl || null, slideUrl: null });
            }
            generated++;
          } catch (err: any) {
            console.error(`[CLIENT-BUILTIN] cert ${cert.recipientName} failed:`, err);
            failed++;
          }

          onProgress({
            phase: "uploading",
            current: generated + failed,
            total: totalToProcess,
            currentCertName: cert.recipientName,
            message: `Uploaded: ${cert.recipientName} (${generated + failed}/${totalToProcess})`,
          });
        };

        const runWorker = async () => {
          while (true) {
            if (abortSignal?.aborted) throw new Error("Generation cancelled");
            const i = nextIdx++;
            if (i >= chunk.length) return;
            await processCert(chunk[i]);
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, chunk.length) }, runWorker),
        );

        // Batch-report all certs that succeeded in this chunk
        await reportCertResults(apiBaseUrl, batchId, chunkReports).catch(() => {
          generated -= chunkReports.length;
          failed += chunkReports.length;
        });
      }

      const status =
        failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
      await reportBatchComplete(apiBaseUrl, batchId, generated, failed, profiles);
      onProgress({
        phase: "done",
        current: totalToProcess,
        total: totalToProcess,
        currentCertName: "",
        message:
          failed === 0
            ? `All ${generated} certificates generated successfully!`
            : `${generated} generated, ${failed} failed.`,
      });
      return { generated, failed, status: status as any };
    }

    // Step 4: Group visual-regen certs by (templateId, slideIndex)
    const groups = new Map<
      string,
      { templateId: string; slideIndex: number | null; certs: CertData[] }
    >();
    for (const cert of toGenerate) {
      const { templateId, slideIndex } = resolveTemplate(cert, batch);
      const key = `${templateId}__${slideIndex ?? "null"}`;
      if (!groups.has(key))
        groups.set(key, { templateId, slideIndex, certs: [] });
      groups.get(key)!.certs.push(cert);
    }

    // Step 5: Process each group in sub-batches
    const chunkSize = getOptimalChunkSize();

    for (const { templateId, slideIndex, certs: groupCerts } of groups.values()) {
      for (let offset = 0; offset < groupCerts.length; offset += chunkSize) {
        if (abortSignal?.aborted) throw new Error("Generation cancelled");

        const chunk = groupCerts.slice(offset, offset + chunkSize);
        await ensureToken();

        onProgress({
          phase: "generating",
          current: generated + failed,
          total: totalToProcess,
          currentCertName: chunk[0].recipientName,
          message: `Generating certificates (${generated + failed + 1}-${Math.min(generated + failed + chunk.length, totalToProcess)} of ${totalToProcess})...`,
        });

        try {
          const { results, tempFileId } = await generateChunk(
            googleToken,
            templateId,
            slideIndex,
            chunk,
            batch,
            baseUrl,
            (name) => {
              onProgress({
                phase: "generating",
                current: generated + failed,
                total: totalToProcess,
                currentCertName: name,
                message: `Processing: ${name}`,
              });
            }
          );
          tempFileIds.push(tempFileId);

          // 1. Get presigned URLs for this chunk (approved orgs only — free tier skips R2)
          let presignedUrls: Array<{ certId: string; uploadUrl: string; r2PdfUrl: string | null }> = [];
          if (isApproved) {
            const presignedRes = await fetch(`${apiBaseUrl}/api/batches/${batchId}/presigned-urls`, {
              method: "POST",
              headers: await apiHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ certificates: chunk.map(c => ({ certId: c.id, recipientName: c.recipientName, rowData: c.rowData })), batchName: batch.name })
            });
            const j = await presignedRes.json();
            presignedUrls = j.presignedUrls || [];
          }

          // 2. Upload results directly to R2 and report to server
          onProgress({
            phase: "uploading",
            current: generated + failed,
            total: totalToProcess,
            currentCertName: "",
            message: "Uploading PDFs to cloud storage...",
          });

          const slideChunkReports: CertReport[] = [];
          for (const result of results) {
            if (abortSignal?.aborted) throw new Error("Generation cancelled");
            await ensureToken();

            const cert = chunk.find((c) => c.id === result.certId)!;
            try {
              const urlInfo = presignedUrls?.find((u: any) => u.certId === cert.id);

              if (urlInfo && urlInfo.uploadUrl) {
                // Direct upload to Cloudflare R2 with retry (3 attempts)
                let uploadSuccess = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    const uploadRes = await fetch(urlInfo.uploadUrl, {
                      method: "PUT",
                      headers: { "Content-Type": "application/pdf" },
                      body: result.pdfBuffer as unknown as BodyInit,
                    });
                    if (!uploadRes.ok) throw new Error(`R2 upload HTTP ${uploadRes.status}`);
                    uploadSuccess = true;
                    break;
                  } catch (uploadErr) {
                    console.warn(`[CLIENT] R2 upload attempt ${attempt}/3 failed for ${cert.recipientName}:`, uploadErr);
                    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s backoff
                  }
                }
                if (!uploadSuccess) throw new Error("Direct R2 upload failed after 3 attempts");
              }

              slideChunkReports.push({ certId: result.certId, recipientName: cert.recipientName, r2PdfUrl: urlInfo?.r2PdfUrl || null });
              if (cert.recipientEmail) {
                profiles.push({ email: cert.recipientEmail, name: cert.recipientName, certId: result.certId, batchName: batch.name, r2PdfUrl: urlInfo?.r2PdfUrl || null, pdfUrl: null, slideUrl: null });
              }
              generated++;
            } catch (err: any) {
              console.error(`[CLIENT] Upload failed for ${cert.recipientName}:`, err);
              failed++;
            }
            onProgress({
              phase: "uploading",
              current: generated + failed,
              total: totalToProcess,
              currentCertName: cert.recipientName,
              message: `Uploaded: ${cert.recipientName} (${generated + failed}/${totalToProcess})`,
            });
          }

          // Batch-report all certs that uploaded successfully in this chunk
          await reportCertResults(apiBaseUrl, batchId, slideChunkReports).catch(() => {
            generated -= slideChunkReports.length;
            failed += slideChunkReports.length;
          });

          // Clean up temp batch presentation
          try {
            await gFetch(`${DRIVE_API}/${tempFileId}`, googleToken, {
              method: "DELETE",
            });
            // Remove from cleanup list since we already cleaned it
            const idx = tempFileIds.indexOf(tempFileId);
            if (idx >= 0) tempFileIds.splice(idx, 1);
          } catch {}
        } catch (err: any) {
          console.error("[CLIENT] Chunk generation failed:", err);
          // Mark all certs in chunk as failed
          failed += chunk.length;
        }
      }
    }

    // Step 6: Report batch completion
    const status =
      failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
    await reportBatchComplete(apiBaseUrl, batchId, generated, failed, profiles);

    onProgress({
      phase: "done",
      current: totalToProcess,
      total: totalToProcess,
      currentCertName: "",
      message:
        failed === 0
          ? `All ${generated} certificates generated successfully!`
          : `${generated} generated, ${failed} failed.`,
    });

    return { generated, failed, status: status as any };
  } finally {
    window.removeEventListener("pagehide", pageHideHandler);
    // Clean up any remaining temp files
    if (tempFileIds.length > 0) {
      cleanupTempFiles(apiBaseUrl, batchId, tempFileIds);
    }
  }
}
