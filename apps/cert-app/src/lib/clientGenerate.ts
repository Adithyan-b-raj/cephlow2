/**
 * Client-Side Certificate Generation Engine
 *
 * This module runs in the browser and performs certificate generation using
 * the user's own Google OAuth token. All Google API calls happen directly
 * from the client — the server is only used for R2 uploads and DB writes.
 */

import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";

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
  columnMap: Record<string, string>;
  driveFolderId: string | null;
  pdfFolderId: string | null;
  categoryColumn: string | null;
  categoryTemplateMap: Record<string, { templateId: string }> | null;
  categorySlideMap: Record<string, number> | null;
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

      // Font scaling
      for (const el of slide.pageElements || []) {
        const textEls = el.shape?.text?.textElements || [];
        const content = textEls.map((te: any) => te.textRun?.content || "").join("");
        for (const [placeholder, value] of Object.entries(replacements)) {
          if (content.includes(placeholder)) {
            const shapeWidthEmu = el.size?.width?.magnitude || 0;
            const shapeWidth = (shapeWidthEmu - DEFAULT_INSET_EMU * 2) / EMU_PER_PT;
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
  const supabaseToken = await getSupabaseToken();
  const res = await fetch(`${apiBaseUrl}/api/auth/google/access-token`, {
    headers: { Authorization: `Bearer ${supabaseToken}` },
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

// ── Report per-cert results to server ──────────────────────────────────────

async function reportCertResult(
  apiBaseUrl: string,
  batchId: string,
  certId: string,
  pdfBuffer: Uint8Array,
  cert: CertData,
  batchName: string,
  drivePdfFileId?: string,
  drivePdfUrl?: string,
): Promise<{ r2PdfUrl: string | null }> {
  const supabaseToken = await getSupabaseToken();

  // Convert to base64
  let binary = "";
  const bytes = pdfBuffer;
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.slice(i, i + chunkSize))
    );
  }
  const pdfBase64 = btoa(binary);

  const res = await fetch(`${apiBaseUrl}/api/batches/${batchId}/client-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseToken}`,
    },
    body: JSON.stringify({
      certId,
      recipientName: cert.recipientName,
      recipientEmail: cert.recipientEmail,
      pdfBase64,
      drivePdfFileId: drivePdfFileId || null,
      drivePdfUrl: drivePdfUrl || null,
      rowData: cert.rowData,
      batchName,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to report cert result");
  }
  return res.json();
}

async function reportBatchComplete(
  apiBaseUrl: string,
  batchId: string,
  generated: number,
  failed: number
): Promise<void> {
  const supabaseToken = await getSupabaseToken();
  await fetch(`${apiBaseUrl}/api/batches/${batchId}/client-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseToken}`,
    },
    body: JSON.stringify({ generated, failed }),
  });
}

async function cleanupTempFiles(
  apiBaseUrl: string,
  batchId: string,
  tempFileIds: string[]
): Promise<void> {
  if (tempFileIds.length === 0) return;
  const supabaseToken = await getSupabaseToken();
  // Use sendBeacon for reliability on tab close, fall back to fetch
  const body = JSON.stringify({ tempFileIds });
  const url = `${apiBaseUrl}/api/batches/${batchId}/client-cleanup`;
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    // sendBeacon doesn't support custom headers, so we pass token in the URL
    navigator.sendBeacon(`${url}?token=${supabaseToken}`, blob);
  } else {
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseToken}`,
      },
      body,
      keepalive: true,
    }).catch(() => {});
  }
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

  const supabaseToken = await getSupabaseToken();
  const initRes = await fetch(
    `${apiBaseUrl}/api/batches/${batchId}/client-generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseToken}`,
      },
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

  // Filter out certs that don't need rendering
  const toGenerate = allCerts.filter(
    (c) => c.requiresVisualRegen !== false || !c.slideFileId
  );
  const metadataOnly = allCerts.filter(
    (c) => c.requiresVisualRegen === false && c.slideFileId
  );

  const totalToProcess = toGenerate.length + metadataOnly.length;
  let generated = 0;
  let failed = 0;
  const tempFileIds: string[] = [];

  // Set up cleanup on tab close
  const cleanupHandler = () => {
    cleanupTempFiles(apiBaseUrl, batchId, tempFileIds);
  };
  window.addEventListener("beforeunload", cleanupHandler);

  try {
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
    for (const cert of metadataOnly) {
      if (abortSignal?.aborted) throw new Error("Generation cancelled");
      try {
        await reportCertResult(
          apiBaseUrl,
          batchId,
          cert.id,
          new Uint8Array(0), // No PDF buffer for metadata-only
          cert,
          batch.name
        );
        generated++;
      } catch {
        failed++;
      }
      onProgress({
        phase: "generating",
        current: generated + failed,
        total: totalToProcess,
        currentCertName: cert.recipientName,
        message: `Metadata update: ${cert.recipientName}`,
      });
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

          // Upload results to server one at a time
          onProgress({
            phase: "uploading",
            current: generated + failed,
            total: totalToProcess,
            currentCertName: "",
            message: "Uploading PDFs to cloud storage...",
          });

          for (const result of results) {
            if (abortSignal?.aborted) throw new Error("Generation cancelled");
            await ensureToken();

            const cert = chunk.find((c) => c.id === result.certId)!;
            try {
              await reportCertResult(
                apiBaseUrl,
                batchId,
                result.certId,
                result.pdfBuffer,
                cert,
                batch.name
              );
              generated++;
            } catch (err: any) {
              console.error(`[CLIENT] Report failed for ${cert.recipientName}:`, err);
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
          for (const cert of chunk) {
            failed++;
          }
        }
      }
    }

    // Step 6: Report batch completion
    const status =
      failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
    await reportBatchComplete(apiBaseUrl, batchId, generated, failed);

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
    window.removeEventListener("beforeunload", cleanupHandler);
    // Clean up any remaining temp files
    if (tempFileIds.length > 0) {
      cleanupTempFiles(apiBaseUrl, batchId, tempFileIds);
    }
  }
}
