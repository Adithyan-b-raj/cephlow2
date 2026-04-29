import { google } from "googleapis";
import { Readable } from "stream";
import QRCode from "qrcode";
import { getAuthClientForUser } from "./googleAuth.js";
import { uploadBufferToR2, getR2PublicUrl, isR2Configured, deleteR2Objects } from "./cloudflareR2.js";

export async function getDriveClient(uid: string) {
  const auth = await getAuthClientForUser(uid);
  return google.drive({ version: "v3", auth });
}

async function getSlidesClient(uid: string) {
  const auth = await getAuthClientForUser(uid);
  return google.slides({ version: "v1", auth });
}

export async function listSlideTemplates(uid: string) {
  const drive = await getDriveClient(uid);
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.presentation' and trashed=false",
    fields: "files(id,name,modifiedTime,thumbnailLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  return (res.data.files || []).map(f => ({
    id: f.id!,
    name: f.name!,
    modifiedTime: f.modifiedTime,
    thumbnailUrl: `/api/slides/thumbnail/${f.id}`,
  }));
}

export async function listSheetFiles(uid: string) {
  const drive = await getDriveClient(uid);
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id,name,modifiedTime,thumbnailLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  return (res.data.files || []).map(f => ({
    id: f.id!,
    name: f.name!,
    modifiedTime: f.modifiedTime,
    thumbnailUrl: `/api/slides/thumbnail/${f.id}`,
  }));
}

export async function getSlidePlaceholders(
  uid: string,
  templateId: string
): Promise<string[]> {
  const slides = await getSlidesClient(uid);
  const res = await slides.presentations.get({
    presentationId: templateId,
    fields: "slides",
  });
  const placeholders = new Set<string>();
  const regex = /<<([^>]+)>>/g;

  for (const slide of res.data.slides || []) {
    for (const element of slide.pageElements || []) {
      const textElements =
        (element.shape as any)?.text?.textElements || [];
      const text = textElements
        .map((te: any) => te.textRun?.content || "")
        .join("");
      let match;
      while ((match = regex.exec(text)) !== null) {
        placeholders.add(`<<${match[1]}>>`);
      }
      if (element.title) {
        let titleMatch;
        while ((titleMatch = regex.exec(element.title)) !== null) {
          if (titleMatch[1].toLowerCase() !== "qr_code") {
            placeholders.add(`<<${titleMatch[1]}>>`);
          }
        }
      }
    }
  }
  return Array.from(placeholders);
}

export async function getSlidesInfo(
  uid: string,
  templateId: string
): Promise<Array<{ index: number; objectId: string; thumbnailUrl: string | null }>> {
  const slides = await getSlidesClient(uid);
  const res = await slides.presentations.get({
    presentationId: templateId,
    fields: "slides(objectId)",
  });
  const slidePages = res.data.slides || [];
  const result: Array<{ index: number; objectId: string; thumbnailUrl: string | null }> = [];

  for (let i = 0; i < slidePages.length; i++) {
    const objectId = slidePages[i].objectId!;
    let thumbnailUrl: string | null = null;
    try {
      const thumbRes = await slides.presentations.pages.getThumbnail({
        presentationId: templateId,
        pageObjectId: objectId,
        "thumbnailProperties.mimeType": "PNG",
        "thumbnailProperties.thumbnailSize": "MEDIUM",
      });
      thumbnailUrl = thumbRes.data.contentUrl ?? null;
    } catch {
      // Thumbnail fetch can fail for blank slides; skip
    }
    result.push({ index: i, objectId, thumbnailUrl });
  }
  return result;
}

export async function getSlidePresentation(
  uid: string,
  presentationId: string
): Promise<{ id: string; name: string; url: string }> {
  const slides = await getSlidesClient(uid);
  const res = await slides.presentations.get({
    presentationId,
    fields: "presentationId,title",
  });
  const id = res.data.presentationId!;
  return {
    id,
    name: res.data.title || "Untitled",
    url: `https://docs.google.com/presentation/d/${id}/edit`,
  };
}

export async function createSlidePresentation(
  uid: string,
  name: string
): Promise<{ id: string; name: string; url: string }> {
  const slides = await getSlidesClient(uid);
  const res = await slides.presentations.create({
    requestBody: { title: name },
    fields: "presentationId,slides(objectId),pageSize",
  });
  const id = res.data.presentationId!;
  return {
    id,
    name: res.data.title || name,
    url: `https://docs.google.com/presentation/d/${id}/edit`,
  };
}

export async function addQrCodePlaceholder(
  uid: string,
  presentationId: string
): Promise<void> {
  const slides = await getSlidesClient(uid);
  const res = await slides.presentations.get({
    presentationId,
    fields: "slides(objectId),pageSize",
  });

  const slideObjectId = res.data.slides?.[0]?.objectId;
  if (!slideObjectId) return;

  const size = 914400;
  const margin = 228600;
  const pageSizeWidth = res.data.pageSize?.width?.magnitude;
  const pageSizeHeight = res.data.pageSize?.height?.magnitude;
  const slideWidth = (typeof pageSizeWidth === "number" && pageSizeWidth > 0) ? pageSizeWidth : 9144000;
  const slideHeight = (typeof pageSizeHeight === "number" && pageSizeHeight > 0) ? pageSizeHeight : 5143500;
  const shapeObjectId = "qr_code_placeholder";

  await slides.presentations.batchUpdate({
    presentationId,
    requestBody: {
      requests: [
        {
          createShape: {
            objectId: shapeObjectId,
            shapeType: "RECTANGLE",
            elementProperties: {
              pageObjectId: slideObjectId,
              size: {
                width: { magnitude: size, unit: "EMU" },
                height: { magnitude: size, unit: "EMU" },
              },
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: slideWidth - size - margin,
                translateY: slideHeight - size - margin,
                unit: "EMU",
              },
            },
          },
        },
        {
          updateShapeProperties: {
            objectId: shapeObjectId,
            fields: "shapeBackgroundFill,outline",
            shapeProperties: {
              shapeBackgroundFill: {
                solidFill: {
                  color: { rgbColor: { red: 0.93, green: 0.93, blue: 0.93 } },
                },
              },
              outline: {
                outlineFill: {
                  solidFill: {
                    color: { rgbColor: { red: 0.5, green: 0.5, blue: 0.5 } },
                  },
                },
                weight: { magnitude: 2, unit: "PT" },
                dashStyle: "DASH",
              },
            },
          },
        },
        { insertText: { objectId: shapeObjectId, text: "QR Code" } },
        {
          updateTextStyle: {
            objectId: shapeObjectId,
            style: {
              fontSize: { magnitude: 10, unit: "PT" },
              foregroundColor: {
                opaqueColor: { rgbColor: { red: 0.4, green: 0.4, blue: 0.4 } },
              },
            },
            fields: "fontSize,foregroundColor",
          },
        },
        {
          updateParagraphStyle: {
            objectId: shapeObjectId,
            style: { alignment: "CENTER" },
            fields: "alignment",
          },
        },
        {
          updatePageElementAltText: {
            objectId: shapeObjectId,
            title: "<<qr_code>>",
            description: "QR code will be generated here",
          },
        },
      ],
    },
  });
}

export async function uploadPptxAsPresentation(
  uid: string,
  name: string,
  buffer: Buffer
): Promise<{ id: string; name: string; url: string }> {
  const drive = await getDriveClient(uid);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.presentation",
    },
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      body: Readable.from(buffer),
    },
    fields: "id,name",
  });
  const id = res.data.id!;
  return {
    id,
    name: res.data.name || name,
    url: `https://docs.google.com/presentation/d/${id}/edit`,
  };
}

export async function exportSlidesToPdf(uid: string, fileId: string): Promise<Buffer> {
  const drive = await getDriveClient(uid);
  const res = await drive.files.export(
    { fileId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function createFolder(
  uid: string,
  name: string,
  parentFolderId?: string | null
): Promise<string> {
  const drive = await getDriveClient(uid);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : undefined,
    },
    fields: "id",
  });
  return res.data.id!;
}

export async function uploadPdf(
  uid: string,
  name: string,
  pdfBuffer: Buffer,
  folderId: string
): Promise<{ fileId: string; url: string }> {
  const drive = await getDriveClient(uid);
  const res = await drive.files.create({
    requestBody: {
      name: name.endsWith(".pdf") ? name : `${name}.pdf`,
      parents: [folderId],
      mimeType: "application/pdf",
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(pdfBuffer),
    },
    fields: "id, webViewLink",
  });
  return {
    fileId: res.data.id!,
    url: res.data.webViewLink!,
  };
}

export async function moveFileToFolder(
  uid: string,
  fileId: string,
  folderId: string
) {
  const drive = await getDriveClient(uid);
  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents || []).join(",");
  await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: "id, parents",
  });
}

export async function makeFilePublic(uid: string, fileId: string) {
  const drive = await getDriveClient(uid);
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });
}

export async function generateCertificate(
  uid: string,
  templateId: string,
  recipientName: string,
  replacements: Record<string, string>,
  folderId?: string | null,
  qrCodeUrl?: string | null,
  slideIndex?: number | null
): Promise<{ fileId: string; url: string }> {
  const drive = await getDriveClient(uid);
  const slides = await getSlidesClient(uid);

  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: {
      name: `Certificate - ${recipientName}`,
      parents: folderId ? [folderId] : undefined,
    },
    fields: "id",
  });
  const fileId = copy.data.id!;

  if (slideIndex != null) {
    const presData = await slides.presentations.get({
      presentationId: fileId,
      fields: "slides(objectId)",
    });
    const allSlides = presData.data.slides || [];
    if (slideIndex >= 0 && slideIndex < allSlides.length && allSlides.length > 1) {
      const deleteRequests: any[] = [];
      for (let i = allSlides.length - 1; i >= 0; i--) {
        if (i !== slideIndex) {
          deleteRequests.push({ deleteObject: { objectId: allSlides[i].objectId } });
        }
      }
      if (deleteRequests.length > 0) {
        await slides.presentations.batchUpdate({
          presentationId: fileId,
          requestBody: { requests: deleteRequests },
        });
      }
    }
  }

  const presentationData = await slides.presentations.get({
    presentationId: fileId,
    fields: "slides(objectId,pageElements(objectId,title,size,transform,shape(text(textElements))))",
  });

  const fontScaleRequests: any[] = [];
  const EMU_PER_PT = 12700;
  // Increased from 0.55 to 0.62 for more conservative estimation to prevent wrapping
  const CHAR_WIDTH_FACTOR = 0.62;
  // Google Slides default inset: 91440 EMU per side (~7.2pt each)
  const DEFAULT_INSET_EMU = 91440;

  const getEffectiveLength = (text: string) => {
    let len = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (['W', 'M'].includes(char)) len += 1.4;
      else if (/[A-Z]/.test(char)) len += 1.2;
      else if (['w', 'm'].includes(char)) len += 1.2;
      else if (['i', 'j', 'l', 'f', '1', '.', ',', ';', ':', "'", '"', '|'].includes(char)) len += 0.35;
      else if (['t', 'r'].includes(char)) len += 0.6;
      else if (char === ' ') len += 0.35;
      else len += 1.0;
    }
    return len;
  };

  const processedObjectIds = new Set<string>();
  for (const slide of presentationData.data.slides || []) {
    for (const element of slide.pageElements || []) {
      const textElements = element.shape?.text?.textElements || [];
      const content = textElements.map((te: any) => te.textRun?.content || "").join("");

      for (const [placeholder, value] of Object.entries(replacements)) {
        if (content.includes(placeholder) && !processedObjectIds.has(element.objectId!)) {
          const shapeWidthEmu = element.size?.width?.magnitude || 0;
          // Account for the element's transform scaleX to get visual width
          const scaleX = Math.abs((element.transform as any)?.scaleX ?? 1);
          const visualWidthEmu = shapeWidthEmu * scaleX;
          // Subtract left+right insets from the available drawing width
          const shapeWidth = (visualWidthEmu - DEFAULT_INSET_EMU * 2) / EMU_PER_PT;
          // Font size priority: explicit run override > fallback
          const runFontEl = textElements.find((te: any) => te.textRun?.style?.fontSize?.magnitude);
          const currentFontSize =
            runFontEl?.textRun?.style?.fontSize?.magnitude ||
            28; // Fallback confirmed from user's template

          const effectiveLen = getEffectiveLength(value);
          const estimatedWidth = effectiveLen * currentFontSize * CHAR_WIDTH_FACTOR;
          const availableWidth = shapeWidth * 0.90; // Increased margin to 10% for safer fitting



          if (estimatedWidth > availableWidth) {
            const scaledFontSize = Math.max(6, Math.floor(currentFontSize * (availableWidth / estimatedWidth)));

            processedObjectIds.add(element.objectId!);
            fontScaleRequests.push({
              updateTextStyle: {
                objectId: element.objectId,
                style: { fontSize: { magnitude: scaledFontSize, unit: "PT" } },
                fields: "fontSize",
                textRange: { type: "ALL" },
              },
            });
          }
        }
      }
    }
  }

  const requests: any[] = [
    ...Object.entries(replacements).map(([placeholder, value]) => ({
      replaceAllText: {
        containsText: { text: placeholder, matchCase: true },
        replaceText: value,
      },
    })),
    ...fontScaleRequests,
  ];
  if (qrCodeUrl) {
    try {
      // Build a publicly accessible QR image URL so Google Slides can fetch it.
      // Prefer R2 (upload PNG once); fall back to api.qrserver.com.
      let publicQrUrl: string;
      if (isR2Configured()) {
        try {
          const png = await QRCode.toBuffer(qrCodeUrl, {
            type: "png", width: 400, margin: 1, errorCorrectionLevel: "M",
          });
          const key = `_qr_tmp/single/${fileId}.png`;
          await uploadBufferToR2(key, png, "image/png");
          const r2Url = getR2PublicUrl(key);
          publicQrUrl = r2Url || `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeUrl)}`;
          // Schedule cleanup after Slides has had time to fetch the image
          setTimeout(() => {
            deleteR2Objects([key]).catch(() => {});
          }, 60_000);
        } catch {
          publicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeUrl)}`;
        }
      } else {
        publicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeUrl)}`;
      }

      // Method 1: Replace text placeholders containing {{qr_code}}
      requests.push({
        replaceAllShapesWithImage: {
          imageUrl: publicQrUrl,
          imageReplaceMethod: "CENTER_INSIDE",
          containsText: { text: "{{qr_code}}", matchCase: true },
        },
      });

      // Method 2: Replace placeholder shapes with Alt Text/Title = <<qr_code>>
      const qrShapes: Array<{
        objectId: string;
        slideObjectId: string;
        size: any;
        transform: any;
      }> = [];

      for (const slide of presentationData.data.slides || []) {
        for (const element of slide.pageElements || []) {
          if (element.title === "<<qr_code>>") {
            qrShapes.push({
              objectId: element.objectId!,
              slideObjectId: slide.objectId!,
              size: element.size,
              transform: element.transform,
            });
          }
        }
      }

      if (qrShapes.length > 0) {
        const qrImageObjectIds: string[] = [];
        for (let i = 0; i < qrShapes.length; i++) {
          const shape = qrShapes[i];
          const newObjectId = `qr_img_${i}_${Date.now()}`;
          qrImageObjectIds.push(newObjectId);
          requests.push({ deleteObject: { objectId: shape.objectId } });
          requests.push({
            createImage: {
              objectId: newObjectId,
              url: publicQrUrl,
              elementProperties: {
                pageObjectId: shape.slideObjectId,
                size: shape.size,
                transform: shape.transform,
              },
            },
          });
        }
        for (const objectId of qrImageObjectIds) {
          requests.push({
            updatePageElementsZOrder: {
              pageElementObjectIds: [objectId],
              operation: "BRING_TO_FRONT",
            },
          });
        }
      }
    } catch (qrErr) {
      console.error("Failed to process QR code:", qrErr);
    }
  }

  if (requests.length > 0) {
    await slides.presentations.batchUpdate({
      presentationId: fileId,
      requestBody: { requests },
    });
  }

  return {
    fileId,
    url: `https://docs.google.com/presentation/d/${fileId}`,
  };
}

export interface BatchCertInput {
  certId: string;
  recipientName: string;
  replacements: Record<string, string>;
  qrCodeUrl: string;
}

export interface BatchCertResult {
  certId: string;
  pdfBuffer: Buffer;
}

const EMU_PER_PT = 12700;
const CHAR_WIDTH_FACTOR = 0.62;
const DEFAULT_INSET_EMU = 91440;
const SLIDES_BATCH_LIMIT = 500; // max requests per batchUpdate call

function getEffectiveLength(text: string): number {
  let len = 0;
  for (const char of text) {
    if (['W', 'M'].includes(char)) len += 1.4;
    else if (/[A-Z]/.test(char)) len += 1.2;
    else if (['w', 'm'].includes(char)) len += 1.2;
    else if (['i', 'j', 'l', 'f', '1', '.', ',', ';', ':', "'", '"', '|'].includes(char)) len += 0.35;
    else if (['t', 'r'].includes(char)) len += 0.6;
    else if (char === ' ') len += 0.35;
    else len += 1.0;
  }
  return len;
}

async function flushBatchUpdate(
  slides: any,
  presentationId: string,
  requests: any[]
): Promise<void> {
  for (let i = 0; i < requests.length; i += SLIDES_BATCH_LIMIT) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: requests.slice(i, i + SLIDES_BATCH_LIMIT) },
    });
  }
}

export interface BatchCertBatchResult {
  results: BatchCertResult[];
  tempR2Keys: string[];
}

export async function generateCertificateBatch(
  uid: string,
  templateId: string,
  certs: BatchCertInput[],
  slideIndex: number | null = null,
  folderId: string | null = null,
  baseUrl: string = "http://localhost:3000"
): Promise<BatchCertBatchResult> {
  if (certs.length === 0) return [];

  const drive = await getDriveClient(uid);
  const slides = await getSlidesClient(uid);

  console.log(`[BATCH] Starting: ${certs.length} certs`);

  // ── Step 1: Analyse template structure once ──────────────────────────────
  const templateData = await slides.presentations.get({
    presentationId: templateId,
    fields: "slides(objectId,pageElements(objectId,title,size,transform,shape(text(textElements))))",
  });
  const templateSlides = templateData.data.slides || [];
  const srcSlideIdx = (slideIndex != null && slideIndex >= 0 && slideIndex < templateSlides.length)
    ? slideIndex : 0;

  // ── Step 2: Copy template once ───────────────────────────────────────────
  console.log(`[BATCH] Copying template...`);
  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: `_batch_${Date.now()}`, parents: folderId ? [folderId] : undefined },
    fields: "id",
  });
  const batchId = copy.data.id!;
  const tempR2Keys: string[] = [];

  try {
    // ── Step 3: Delete unwanted slides if slideIndex is set ─────────────────
    const initData = await slides.presentations.get({
      presentationId: batchId,
      fields: "slides(objectId)",
    });
    const initSlides = initData.data.slides || [];

    if (slideIndex != null && initSlides.length > 1) {
      const delRequests = initSlides
        .map((s: any, i: number) => i !== srcSlideIdx ? { deleteObject: { objectId: s.objectId } } : null)
        .filter(Boolean)
        .reverse(); // delete from end to avoid index shifts
      await slides.presentations.batchUpdate({
        presentationId: batchId,
        requestBody: { requests: delRequests },
      });
    }

    // ── Step 4: Get the single base slide objectId ───────────────────────────
    const baseData = await slides.presentations.get({
      presentationId: batchId,
      fields: "slides(objectId)",
    });
    const baseSlideObjectId = baseData.data.slides![0].objectId!;

    // ── Step 5: Duplicate base slide N-1 times in one batchUpdate ────────────
    if (certs.length > 1) {
      console.log(`[BATCH] Duplicating slide ${certs.length - 1} times...`);
      const dupRequests = Array.from({ length: certs.length - 1 }, () => ({
        duplicateObject: { objectId: baseSlideObjectId },
      }));
      await slides.presentations.batchUpdate({
        presentationId: batchId,
        requestBody: { requests: dupRequests },
      });
    }

    // ── Step 6: Fetch full presentation with all element objectIds ────────────
    console.log(`[BATCH] Fetching slide elements...`);
    const fullData = await slides.presentations.get({
      presentationId: batchId,
      fields: "slides(objectId,pageElements(objectId,title,size,transform,shape(text(textElements))))",
    });
    const allSlides = fullData.data.slides || [];

    // ── Step 6b: Pre-generate QR PNGs and upload to R2 (publicly accessible) ─
    const r2Configured = isR2Configured();
    const qrUrlByCertId = new Map<string, string>();
    await Promise.all(certs.map(async (cert) => {
      let url: string;
      if (r2Configured) {
        try {
          const png = await QRCode.toBuffer(cert.qrCodeUrl, {
            type: "png",
            width: 400,
            margin: 1,
            errorCorrectionLevel: "M",
          });
          const key = `_qr_tmp/${batchId}/${cert.certId}.png`;
          await uploadBufferToR2(key, png, "image/png");
          const publicUrl = getR2PublicUrl(key);
          if (publicUrl) {
            tempR2Keys.push(key);
            url = publicUrl;
          } else {
            url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(cert.qrCodeUrl)}`;
          }
        } catch (e: any) {
          console.error("[BATCH] QR R2 upload failed, falling back:", e.message);
          url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(cert.qrCodeUrl)}`;
        }
      } else {
        url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(cert.qrCodeUrl)}`;
      }
      qrUrlByCertId.set(cert.certId, url);
    }));

    // ── Step 7: Build one giant batchUpdate for all certs ────────────────────
    const allRequests: any[] = [];

    for (let ci = 0; ci < certs.length; ci++) {
      const cert = certs[ci];
      const slide = allSlides[ci];
      if (!slide) continue;
      const slideObjId = slide.objectId!;

      // Text replacements — scoped to this slide via pageObjectIds
      for (const [placeholder, value] of Object.entries(cert.replacements)) {
        allRequests.push({
          replaceAllText: {
            containsText: { text: placeholder, matchCase: true },
            replaceText: value,
            pageObjectIds: [slideObjId],
          },
        });
      }

      // Font scaling — scan elements on this slide for oversized values
      for (const el of slide.pageElements || []) {
        const textEls = el.shape?.text?.textElements || [];
        const content = textEls.map((te: any) => te.textRun?.content || "").join("");
        for (const [placeholder, value] of Object.entries(cert.replacements)) {
          if (content.includes(placeholder)) {
            const shapeWidthEmu = el.size?.width?.magnitude || 0;
            // Account for the element's transform scaleX to get visual width
            const scaleX = Math.abs((el.transform as any)?.scaleX ?? 1);
            const visualWidthEmu = shapeWidthEmu * scaleX;
            const shapeWidth = (visualWidthEmu - DEFAULT_INSET_EMU * 2) / EMU_PER_PT;
            const runFontEl = textEls.find((te: any) => te.textRun?.style?.fontSize?.magnitude);
            const currentFontSize = runFontEl?.textRun?.style?.fontSize?.magnitude || 28;
            const estimatedWidth = getEffectiveLength(value) * currentFontSize * CHAR_WIDTH_FACTOR;
            if (estimatedWidth > shapeWidth * 0.9) {
              const scaled = Math.max(6, Math.floor(currentFontSize * ((shapeWidth * 0.9) / estimatedWidth)));
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

      // QR code — uploaded to R2 in Step 6b (publicly accessible)
      const qrImageUrl = qrUrlByCertId.get(cert.certId)!;

      allRequests.push({
        replaceAllShapesWithImage: {
          imageUrl: qrImageUrl,
          imageReplaceMethod: "CENTER_INSIDE",
          containsText: { text: "{{qr_code}}", matchCase: true },
          pageObjectIds: [slideObjId],
        },
      });

      // QR code — alt-text based <<qr_code>> shapes
      const qrShapes = (slide.pageElements || []).filter((el: any) => el.title === "<<qr_code>>");
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

    // Flush in chunks of SLIDES_BATCH_LIMIT to stay under API limits
    console.log(`[BATCH] Applying text replacements (${allRequests.length} requests)...`);
    await flushBatchUpdate(slides, batchId, allRequests);

    // ── Step 8: Export entire presentation as one PDF ────────────────────────
    console.log(`[BATCH] Exporting PDF...`);
    const exportRes = await drive.files.export(
      { fileId: batchId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );
    const fullPdf = Buffer.from(exportRes.data as ArrayBuffer);

    // ── Step 9: Split PDF by page using pdf-lib ──────────────────────────────
    const { PDFDocument } = await import("pdf-lib");
    const srcDoc = await PDFDocument.load(fullPdf);
    const results: BatchCertResult[] = [];

    for (let i = 0; i < certs.length; i++) {
      const singleDoc = await PDFDocument.create();
      const [page] = await singleDoc.copyPages(srcDoc, [i]);
      singleDoc.addPage(page);
      results.push({
        certId: certs[i].certId,
        pdfBuffer: Buffer.from(await singleDoc.save()),
      });
    }

    console.log(`[BATCH] Done — ${certs.length} certs processed.`);
    return { results, tempR2Keys };
  } finally {
    // Clean up batch presentation — fire and forget
    drive.files.delete({ fileId: batchId })
      .catch((e: any) => console.error("[BATCH] cleanup failed:", e.message));
    // QR PNGs are NOT deleted here — caller collects keys across all
    // chunks and deletes them all at once after full generation.
  }
}

export async function deleteFile(uid: string, fileId: string) {
  try {
    const drive = await getDriveClient(uid);
    await drive.files.delete({ fileId });
    console.log(`[DRIVE] Deleted file: ${fileId}`);
  } catch (err: any) {
    if (err.code === 404) {
      console.warn(`[DRIVE] File ${fileId} not found, skipping deletion.`);
    } else {
      console.error(`[DRIVE] Failed to delete file ${fileId}:`, err.message);
    }
  }
}

