import type { Env } from "../types.js";
import { uploadBufferToR2, deleteR2Object, isR2Configured, getR2PublicUrl } from "./r2.js";
import { generateQrPng } from "./qr.js";

export async function googleFetch(
  url: string,
  options: RequestInit,
  accessToken: string
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  
  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `Google API error ${res.status}: ${res.statusText}`;
    try {
      const parsed = JSON.parse(errText);
      errMsg = parsed.error?.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  return res;
}

export async function listSlideTemplates(accessToken: string) {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.presentation' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,thumbnailLink)&orderBy=modifiedTime+desc&pageSize=50`;
  
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  const data = (await res.json()) as any;
  
  return (data.files || []).map((f: any) => ({
    id: f.id!,
    name: f.name!,
    modifiedTime: f.modifiedTime,
    thumbnailUrl: f.thumbnailLink ?? undefined,
  }));
}

export async function listSheetFiles(accessToken: string) {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,thumbnailLink)&orderBy=modifiedTime+desc&pageSize=50`;
  
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  const data = (await res.json()) as any;
  
  return (data.files || []).map((f: any) => ({
    id: f.id!,
    name: f.name!,
    modifiedTime: f.modifiedTime,
    thumbnailUrl: `/api/slides/thumbnail/${f.id}`,
  }));
}

export async function getSlidePlaceholders(
  accessToken: string,
  templateId: string
): Promise<string[]> {
  const url = `https://slides.googleapis.com/v1/presentations/${templateId}?fields=slides`;
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  const data = (await res.json()) as any;
  
  const placeholders = new Set<string>();
  const regex = /<<([^>]+)>>/g;

  for (const slide of data.slides || []) {
    for (const element of slide.pageElements || []) {
      const textElements = element.shape?.text?.textElements || [];
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
  accessToken: string,
  templateId: string
): Promise<Array<{ index: number; objectId: string; thumbnailUrl: string | null }>> {
  const url = `https://slides.googleapis.com/v1/presentations/${templateId}?fields=slides(objectId)`;
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  const data = (await res.json()) as any;
  
  const slidePages = data.slides || [];
  const result: Array<{ index: number; objectId: string; thumbnailUrl: string | null }> = [];

  for (let i = 0; i < slidePages.length; i++) {
    const objectId = slidePages[i].objectId!;
    let thumbnailUrl: string | null = null;
    try {
      const thumbUrl = `https://slides.googleapis.com/v1/presentations/${templateId}/pages/${objectId}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=MEDIUM`;
      const thumbRes = await googleFetch(thumbUrl, { method: "GET" }, accessToken);
      const thumbData = (await thumbRes.json()) as any;
      thumbnailUrl = thumbData.contentUrl ?? null;
    } catch {
      // Thumbnail fetch skipped on failure
    }
    result.push({ index: i, objectId, thumbnailUrl });
  }
  return result;
}

export async function createFolder(
  accessToken: string,
  name: string,
  parentFolderId?: string | null
): Promise<string> {
  const url = "https://www.googleapis.com/drive/v3/files?fields=id";
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentFolderId ? [parentFolderId] : undefined,
  };

  const res = await googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, accessToken);

  const data = (await res.json()) as any;
  return data.id!;
}

export async function makeFilePublic(accessToken: string, fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
  await googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  }, accessToken);
}

export async function moveFileToFolder(accessToken: string, fileId: string, folderId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}`;
  await googleFetch(url, {
    method: "PATCH",
  }, accessToken);
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  try {
    await googleFetch(url, { method: "DELETE" }, accessToken);
    console.log(`[DRIVE] Deleted file: ${fileId}`);
  } catch (err: any) {
    console.error(`[DRIVE] Failed to delete file ${fileId}:`, err.message);
  }
}


export async function downloadDriveFile(accessToken: string, fileId: string): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  return await res.arrayBuffer();
}

// Multipart helper for uploading PDF files to drive
export async function uploadPdf(
  accessToken: string,
  name: string,
  pdfBuffer: ArrayBuffer,
  folderId: string
): Promise<{ fileId: string; url: string }> {
  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
  
  const boundary = "-------cephlowapiworker";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: name.endsWith(".pdf") ? name : `${name}.pdf`,
    parents: [folderId],
    mimeType: "application/pdf",
  };

  const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  
  // Combine multipart parts
  const textEncoder = new TextEncoder();
  const part1 = textEncoder.encode(`${delimiter}${metadataPart}${delimiter}Content-Type: application/pdf\r\n\r\n`);
  const part2 = new Uint8Array(pdfBuffer);
  const part3 = textEncoder.encode(closeDelimiter);

  const combined = new Uint8Array(part1.byteLength + part2.byteLength + part3.byteLength);
  combined.set(part1, 0);
  combined.set(part2, part1.byteLength);
  combined.set(part3, part1.byteLength + part2.byteLength);

  const res = await googleFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  }, accessToken);

  const data = (await res.json()) as any;
  return {
    fileId: data.id!,
    url: data.webViewLink!,
  };
}

export async function generateCertificate(
  env: Env,
  accessToken: string,
  templateId: string,
  recipientName: string,
  replacements: Record<string, string>,
  folderId?: string | null,
  qrCodeUrl?: string | null,
  slideIndex?: number | null
): Promise<{ fileId: string; url: string }> {
  // 1. Copy slide template
  const copyUrl = `https://www.googleapis.com/drive/v3/files/${templateId}/copy?fields=id`;
  const copyBody = {
    name: `Certificate - ${recipientName}`,
    parents: folderId ? [folderId] : undefined,
  };
  const copyRes = await googleFetch(copyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(copyBody),
  }, accessToken);
  
  const copyData = (await copyRes.json()) as any;
  const fileId = copyData.id!;

  // 2. Resolve target slides if slideIndex is set
  if (slideIndex != null) {
    const slidesUrl = `https://slides.googleapis.com/v1/presentations/${fileId}?fields=slides(objectId)`;
    const slidesRes = await googleFetch(slidesUrl, { method: "GET" }, accessToken);
    const slidesData = (await slidesRes.json()) as any;
    const allSlides = slidesData.slides || [];
    
    if (slideIndex >= 0 && slideIndex < allSlides.length && allSlides.length > 1) {
      const deleteRequests: any[] = [];
      for (let i = allSlides.length - 1; i >= 0; i--) {
        if (i !== slideIndex) {
          deleteRequests.push({ deleteObject: { objectId: allSlides[i].objectId } });
        }
      }
      if (deleteRequests.length > 0) {
        const updateUrl = `https://slides.googleapis.com/v1/presentations/${fileId}:batchUpdate`;
        await googleFetch(updateUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: deleteRequests }),
        }, accessToken);
      }
    }
  }

  // 3. Analyze slide layout for text boxes & dimensions
  const presUrl = `https://slides.googleapis.com/v1/presentations/${fileId}?fields=slides(objectId,pageElements(objectId,title,size,transform,shape(text(textElements))))`;
  const presRes = await googleFetch(presUrl, { method: "GET" }, accessToken);
  const presData = (await presRes.json()) as any;

  const fontScaleRequests: any[] = [];
  const EMU_PER_PT = 12700;
  const CHAR_WIDTH_FACTOR = 0.62;
  const DEFAULT_INSET_EMU = 91440;

  const getEffectiveLength = (text: string) => {
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
  };

  const processedObjectIds = new Set<string>();
  for (const slide of presData.slides || []) {
    for (const element of slide.pageElements || []) {
      const textElements = element.shape?.text?.textElements || [];
      const content = textElements.map((te: any) => te.textRun?.content || "").join("");

      for (const [placeholder, value] of Object.entries(replacements)) {
        if (content.includes(placeholder) && !processedObjectIds.has(element.objectId!)) {
          const shapeWidthEmu = element.size?.width?.magnitude || 0;
          const scaleX = Math.abs(element.transform?.scaleX ?? 1);
          const visualWidthEmu = shapeWidthEmu * scaleX;
          const shapeWidth = (visualWidthEmu - DEFAULT_INSET_EMU * 2) / EMU_PER_PT;
          const runFontEl = textElements.find((te: any) => te.textRun?.style?.fontSize?.magnitude);
          const currentFontSize = runFontEl?.textRun?.style?.fontSize?.magnitude || 28;

          const effectiveLen = getEffectiveLength(value);
          const estimatedWidth = effectiveLen * currentFontSize * CHAR_WIDTH_FACTOR;
          const availableWidth = shapeWidth * 0.90;

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

  // 4. Inject QR Code if verifyUrl is present
  if (qrCodeUrl) {
    try {
      let publicQrUrl: string = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCodeUrl)}`;
      
      if (isR2Configured(env)) {
        try {
          const pngBytes = await generateQrPng(qrCodeUrl);
          const key = `_qr_tmp/single/${fileId}.png`;
          await uploadBufferToR2(env, key, pngBytes, "image/png");
          const r2Url = getR2PublicUrl(env, key);
          if (r2Url) {
            publicQrUrl = r2Url;
            // Best effort async cleanup in background worker
            // Since Workers doesn't have standard setTimeout in execution context (it can get cut off),
            // we will let the temp file lie or handle it later. In Workers, we can use waitUntil to delete it after a delay.
          }
        } catch (e: any) {
          console.error("QR R2 upload failed:", e.message);
        }
      }

      requests.push({
        replaceAllShapesWithImage: {
          imageUrl: publicQrUrl,
          imageReplaceMethod: "CENTER_INSIDE",
          containsText: { text: "{{qr_code}}", matchCase: true },
        },
      });

      // Find shapes with Alt Text Title = <<qr_code>>
      const qrShapes: any[] = [];
      for (const slide of presData.slides || []) {
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
    } catch (err: any) {
      console.error("Failed to process QR code:", err.message);
    }
  }

  // 5. Submit batch changes to presentation copy
  if (requests.length > 0) {
    const updateUrl = `https://slides.googleapis.com/v1/presentations/${fileId}:batchUpdate`;
    await googleFetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }, accessToken);
  }

  return {
    fileId,
    url: `https://docs.google.com/presentation/d/${fileId}`,
  };
}

export async function getSlidePresentation(
  accessToken: string,
  presentationId: string
): Promise<{ id: string; name: string; url: string }> {
  const url = `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=presentationId,title`;
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  const data = (await res.json()) as any;
  const id = data.presentationId!;
  return {
    id,
    name: data.title || "Untitled",
    url: `https://docs.google.com/presentation/d/${id}/edit`,
  };
}

export async function createSlidePresentation(
  accessToken: string,
  name: string
): Promise<{ id: string; name: string; url: string }> {
  const url = "https://slides.googleapis.com/v1/presentations";
  const body = { title: name };
  const res = await googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, accessToken);
  const data = (await res.json()) as any;
  const id = data.presentationId!;
  return {
    id,
    name: data.title || name,
    url: `https://docs.google.com/presentation/d/${id}/edit`,
  };
}

export async function addQrCodePlaceholder(
  accessToken: string,
  presentationId: string
): Promise<void> {
  const url = `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=slides(objectId),pageSize`;
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  const data = (await res.json()) as any;

  const slideObjectId = data.slides?.[0]?.objectId;
  if (!slideObjectId) return;

  const size = 914400;
  const margin = 228600;
  const pageSizeWidth = data.pageSize?.width?.magnitude;
  const pageSizeHeight = data.pageSize?.height?.magnitude;
  const slideWidth = (typeof pageSizeWidth === "number" && pageSizeWidth > 0) ? pageSizeWidth : 9144000;
  const slideHeight = (typeof pageSizeHeight === "number" && pageSizeHeight > 0) ? pageSizeHeight : 5143500;
  const shapeObjectId = "qr_code_placeholder";

  const updateUrl = `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`;
  await googleFetch(updateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  }, accessToken);
}

export async function uploadPptxAsPresentation(
  accessToken: string,
  name: string,
  pptxBuffer: ArrayBuffer
): Promise<{ id: string; name: string; url: string }> {
  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name";
  
  const boundary = "-------cephlowpptxupload";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.presentation",
  };

  const metadataPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  
  const textEncoder = new TextEncoder();
  const part1 = textEncoder.encode(`${delimiter}${metadataPart}${delimiter}Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`);
  const part2 = new Uint8Array(pptxBuffer);
  const part3 = textEncoder.encode(closeDelimiter);

  const combined = new Uint8Array(part1.byteLength + part2.byteLength + part3.byteLength);
  combined.set(part1, 0);
  combined.set(part2, part1.byteLength);
  combined.set(part3, part1.byteLength + part2.byteLength);

  const res = await googleFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  }, accessToken);

  const data = (await res.json()) as any;
  return {
    id: data.id!,
    name: data.name || name,
    url: `https://docs.google.com/presentation/d/${data.id}/edit`,
  };
}
