/**
 * Client-Side Certificate Generation Engine
 *
 * This module runs in the browser and performs certificate generation.
 * For approved workspaces, PDFs are uploaded directly to R2.
 * For unapproved (free-tier) workspaces, PDFs are uploaded to the user's Google Drive.
 */

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
  pdfFileId: string | null;
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
  const isApproved: boolean = initData.isApproved !== false;

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
  const profiles: Array<{
    email: string;
    name: string;
    certId: string;
    batchName: string;
    r2PdfUrl: string | null;
    pdfUrl: string | null;
    slideUrl: string | null;
  }> = [];

  try {
    // Step 2: Handle Google access token if needed (only for uploading to Google Drive on free tier)
    const needsGoogle = !isApproved;
    let googleToken = "";
    let tokenExpiresAt = 0;

    if (needsGoogle) {
      onProgress({
        phase: "preparing",
        current: 0,
        total: totalToProcess,
        currentCertName: "",
        message: "Getting Google access token...",
      });
      const tokenData = await getGoogleAccessToken(apiBaseUrl);
      googleToken = tokenData.accessToken;
      tokenExpiresAt = tokenData.expiresAt;
    }

    // Helper to refresh token if expired
    const ensureToken = async () => {
      if (!needsGoogle) return googleToken;
      if (Date.now() > tokenExpiresAt - 60_000) {
        const tokenData = await getGoogleAccessToken(apiBaseUrl);
        googleToken = tokenData.accessToken;
        tokenExpiresAt = tokenData.expiresAt;
      }
      return googleToken;
    };

    // Create Drive folder if needed for unapproved workspaces
    if (needsGoogle && !batch.pdfFolderId && !batch.driveFolderId) {
      onProgress({
        phase: "preparing",
        current: 0,
        total: totalToProcess,
        currentCertName: "",
        message: "Creating dedicated folder in Google Drive...",
      });
      try {
        const folderRes = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${googleToken}`,
          },
          body: JSON.stringify({
            name: batch.name || "Certificates",
            mimeType: "application/vnd.google-apps.folder",
          }),
        });
        if (folderRes.ok) {
          const folderData = await folderRes.json() as any;
          if (folderData.id) {
            batch.pdfFolderId = folderData.id;
            batch.driveFolderId = folderData.id;
            
            // Persist the newly created folder ID to the backend
            await fetch(`${apiBaseUrl}/api/batches/${batchId}`, {
              method: "PATCH",
              headers: await apiHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ pdfFolderId: folderData.id, driveFolderId: folderData.id }),
            });
          }
        }
      } catch (err: any) {
        console.warn("[CLIENT-GENERATE] Failed to create Google Drive folder:", err.message);
      }
    }

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

    if (!batch.builtinTemplate) {
      throw new Error("Builtin template data missing for this batch");
    }

    // Build a mutable map of all template canvases we have
    const templateCanvasById: Record<string, typeof batch.builtinTemplate> = {
      ...(batch.builtinTemplateDataById ?? {}),
      [batch.templateId]: batch.builtinTemplate,  // always seed with primary
    };

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
            // Free tier: Delete the old Google Drive PDF file if it exists to prevent duplication
            if (cert.pdfFileId) {
              try {
                const tok = await ensureToken();
                await gFetch(`${DRIVE_API}/${cert.pdfFileId}`, tok, { method: "DELETE" });
              } catch (e: any) {
                console.warn(`[CLIENT-BUILTIN] Failed to delete old Drive PDF ${cert.pdfFileId}:`, e.message);
              }
            }

            // Free tier: upload to the batch's Google Drive folder
            const safeName = (cert.recipientName || "cert").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "cert";
            const safeBatch = (batch.name || "batch").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "batch";
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

          chunkReports.push({
            certId: cert.id,
            recipientName: cert.recipientName,
            r2PdfUrl: r2PdfUrl || null,
            drivePdfFileId: drivePdfFileId || null,
            drivePdfUrl: drivePdfUrl || null,
          });
          if (cert.recipientEmail) {
            profiles.push({
              email: cert.recipientEmail,
              name: cert.recipientName,
              certId: cert.id,
              batchName: batch.name,
              r2PdfUrl: r2PdfUrl || null,
              pdfUrl: drivePdfUrl || null,
              slideUrl: null,
            });
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
  } finally {
    // No local temp files needed
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

// ── Drive-upload helper for unapproved (free-tier) builtin generation ─────
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
    throw new Error("Drive upload failed (" + res.status + "): " + text.slice(0, 200));
  }
  const j = await res.json();
  return { fileId: j.id, webViewLink: j.webViewLink || null };
}
