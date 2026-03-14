import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import { readFileSync } from "fs";
import { resolve } from "path";

let serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

// Fallback: load from firebase-service-account.json at project root
if (!serviceAccountKey) {
  try {
    const filePath = resolve(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "firebase-service-account.json"
    );
    serviceAccountKey = readFileSync(filePath, "utf-8");
  } catch {
    // file not found
  }
}

if (!serviceAccountKey) {
  throw new Error(
    "Firebase credentials not found. Either:\n" +
    "  1. Set FIREBASE_SERVICE_ACCOUNT_KEY env var with the JSON string, or\n" +
    "  2. Place firebase-service-account.json in the project root."
  );
}

const serviceAccount: ServiceAccount = JSON.parse(serviceAccountKey);

const app = initializeApp({
  credential: cert(serviceAccount),
});

export const db = getFirestore(app);
export const auth = getAuth(app);

// Collection references
export const batchesCollection = db.collection("batches");

export function certificatesCollection(batchId: string) {
  return batchesCollection.doc(batchId).collection("certificates");
}

// Type definitions (matching old Drizzle schema)
export interface Batch {
  id: string;
  name: string;
  sheetId: string;
  sheetName: string;
  tabName?: string | null;
  templateId: string;
  templateName: string;
  columnMap: Record<string, string>;
  emailColumn: string;
  nameColumn: string;
  emailSubject?: string | null;
  emailBody?: string | null;
  status: string;
  driveFolderId?: string | null;
  pdfFolderId?: string | null;
  totalCount: number;
  generatedCount: number;
  sentCount: number;
  createdAt: Date;
}

export interface Certificate {
  id: string;
  batchId: string;
  recipientName: string;
  recipientEmail: string;
  status: string;
  slideFileId?: string | null;
  slideUrl?: string | null;
  pdfFileId?: string | null;
  pdfUrl?: string | null;
  sentAt?: Date | null;
  errorMessage?: string | null;
  rowData?: Record<string, string> | null;
  createdAt: Date;
}
