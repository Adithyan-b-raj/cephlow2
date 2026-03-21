// Google Drive & Slides integration using Google access token from Firebase Auth
import { google } from "googleapis";
import { Readable } from "stream";
import QRCode from "qrcode";

function getAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

function getDriveClient(accessToken: string) {
  const auth = getAuthClient(accessToken);
  return google.drive({ version: "v3", auth });
}

function getSlidesClient(accessToken: string) {
  const auth = getAuthClient(accessToken);
  return google.slides({ version: "v1", auth });
}

// List Google Slides files in Drive
export async function listSlideTemplates(accessToken: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.presentation' and trashed=false",
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  return (res.data.files || []) as Array<{
    id: string;
    name: string;
    modifiedTime?: string;
  }>;
}

// List Google Sheets files in Drive
export async function listSheetFiles(accessToken: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  return (res.data.files || []) as Array<{
    id: string;
    name: string;
    modifiedTime?: string;
  }>;
}

// Get placeholders from a Slides template (<<ColumnName>> format)
export async function getSlidePlaceholders(
  accessToken: string,
  templateId: string
): Promise<string[]> {
  const slides = getSlidesClient(accessToken);
  const res = await slides.presentations.get({
    presentationId: templateId,
    fields: "slides",
  });
  const placeholders = new Set<string>();
  const regex = /<<([^>]+)>>/g;

  for (const slide of res.data.slides || []) {
    for (const element of slide.pageElements || []) {
      // Detect placeholders in text content
      const textElements =
        (element.shape as any)?.text?.textElements || [];
      const text = textElements
        .map((te: any) => te.textRun?.content || "")
        .join("");
      let match;
      while ((match = regex.exec(text)) !== null) {
        placeholders.add(`<<${match[1]}>>`);
      }
      // Detect <<...>> shape titles, but skip <<qr_code>> — it's generated automatically
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

// Create a new blank Google Slides presentation
export async function createSlidePresentation(
  accessToken: string,
  name: string
): Promise<{ id: string; name: string; url: string }> {
  const slides = getSlidesClient(accessToken);
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

// Add a <<qr_code>> placeholder shape to an existing presentation
export async function addQrCodePlaceholder(
  accessToken: string,
  presentationId: string
): Promise<void> {
  const slides = getSlidesClient(accessToken);
  const res = await slides.presentations.get({
    presentationId,
    fields: "slides(objectId),pageSize",
  });

  const slideObjectId = res.data.slides?.[0]?.objectId;
  if (!slideObjectId) return;

  const size = 914400;      // 1 inch in EMUs
  const margin = 228600;    // 0.25 inch in EMUs
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

// Export a Google Slides presentation as a PDF buffer
export async function exportSlidesToPdf(accessToken: string, fileId: string): Promise<Buffer> {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.export(
    { fileId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

// Create a new folder in Google Drive
export async function createFolder(
  accessToken: string,
  name: string,
  parentFolderId?: string | null
): Promise<string> {
  const drive = getDriveClient(accessToken);
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

// Upload a PDF buffer to a specific folder in Drive
export async function uploadPdf(
  accessToken: string,
  name: string,
  pdfBuffer: Buffer,
  folderId: string
): Promise<{ fileId: string; url: string }> {
  const drive = getDriveClient(accessToken);
  
  // Use a Blob or a simple buffer with media upload
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

// Move a file to a specific folder
export async function moveFileToFolder(
  accessToken: string,
  fileId: string,
  folderId: string
) {
  const drive = getDriveClient(accessToken);
  // Retrieve the existing parents to remove
  const file = await drive.files.get({
    fileId: fileId,
    fields: "parents",
  });
  const previousParents = (file.data.parents || []).join(",");

  // Move the file to the new folder
  await drive.files.update({
    fileId: fileId,
    addParents: folderId,
    removeParents: previousParents,
    fields: "id, parents",
  });
}

// Make a file or folder public (anyone with the link can view)
export async function makeFilePublic(
  accessToken: string,
  fileId: string
) {
  const drive = getDriveClient(accessToken);
  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });
}

// Copy a Slides template and fill in <<placeholder>> values
export async function generateCertificate(
  accessToken: string,
  templateId: string,
  recipientName: string,
  replacements: Record<string, string>,
  folderId?: string | null,
  qrCodeUrl?: string | null
): Promise<{ fileId: string; url: string }> {
  const drive = getDriveClient(accessToken);
  const slides = getSlidesClient(accessToken);

  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: { 
      name: `Certificate - ${recipientName}`,
      parents: folderId ? [folderId] : undefined,
    },
    fields: "id",
  });
  const fileId = copy.data.id!;

  const requests: any[] = Object.entries(replacements).map(
    ([placeholder, value]) => ({
      replaceAllText: {
        containsText: { text: placeholder, matchCase: true },
        replaceText: value,
      },
    })
  );

  // If a QR code URL is provided, we replace the {{qr_code}} placeholder with a real QR image.
  if (qrCodeUrl) {
    try {
      // Use a public QR code generator API so Google Slides can fetch the image directly.
      // This works both locally and on Render.
      const publicQrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`;
      
      requests.push({
        replaceAllShapesWithImage: {
          imageUrl: publicQrApiUrl,
          imageReplaceMethod: "CENTER_INSIDE",
          containsText: {
            text: "{{qr_code}}",
            matchCase: true,
          },
        },
      });
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

  // Find shapes titled <<qr_code>> and replace with a QR code image
  const presentation = await slides.presentations.get({
    presentationId: fileId,
    fields: "slides(objectId,pageElements(objectId,title,size,transform))",
  });

  const qrShapes: Array<{
    objectId: string;
    slideObjectId: string;
    size: any;
    transform: any;
  }> = [];

  for (const slide of presentation.data.slides || []) {
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
    const targetUrl = qrCodeUrl || `https://docs.google.com/presentation/d/${fileId}`;
    const qrBuffer = await QRCode.toBuffer(targetUrl, { type: "png", width: 300, margin: 1 });

    // Upload QR code PNG to Drive and make it publicly accessible
    const qrFileRes = await drive.files.create({
      requestBody: {
        name: `qr_${fileId}.png`,
        parents: folderId ? [folderId] : undefined,
        mimeType: "image/png",
      },
      media: {
        mimeType: "image/png",
        body: Readable.from(qrBuffer),
      },
      fields: "id",
    });
    const qrFileId = qrFileRes.data.id!;

    await drive.permissions.create({
      fileId: qrFileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    const qrImageUrl = `https://drive.google.com/uc?id=${qrFileId}&export=view`;

    // Delete each placeholder shape and insert the QR code image in its place
    const qrRequests: any[] = [];
    const qrImageObjectIds: string[] = [];
    for (let i = 0; i < qrShapes.length; i++) {
      const shape = qrShapes[i];
      const newObjectId = `qr_img_${i}_${Date.now()}`;
      qrImageObjectIds.push(newObjectId);
      qrRequests.push({ deleteObject: { objectId: shape.objectId } });
      qrRequests.push({
        createImage: {
          objectId: newObjectId,
          url: qrImageUrl,
          elementProperties: {
            pageObjectId: shape.slideObjectId,
            size: shape.size,
            transform: shape.transform,
          },
        },
      });
    }

    // Bring QR images to front so they appear above any template images
    for (const objectId of qrImageObjectIds) {
      qrRequests.push({
        updatePageElementsZOrder: {
          pageElementObjectIds: [objectId],
          operation: "BRING_TO_FRONT",
        },
      });
    }

    await slides.presentations.batchUpdate({
      presentationId: fileId,
      requestBody: { requests: qrRequests },
    });
  }

  return {
    fileId,
    url: `https://docs.google.com/presentation/d/${fileId}`,
  };
}
