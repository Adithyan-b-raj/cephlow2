// Google Drive & Slides integration using Google access token from Firebase Auth
import { google } from "googleapis";
import { Readable } from "stream";

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
      const textElements =
        (element.shape as any)?.text?.textElements || [];
      const text = textElements
        .map((te: any) => te.textRun?.content || "")
        .join("");
      let match;
      while ((match = regex.exec(text)) !== null) {
        placeholders.add(`<<${match[1]}>>`);
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
  });
  const id = res.data.presentationId!;
  return {
    id,
    name: res.data.title || name,
    url: `https://docs.google.com/presentation/d/${id}/edit`,
  };
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
  folderId?: string | null
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

  const requests = Object.entries(replacements).map(
    ([placeholder, value]) => ({
      replaceAllText: {
        containsText: { text: placeholder, matchCase: true },
        replaceText: value,
      },
    })
  );

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
