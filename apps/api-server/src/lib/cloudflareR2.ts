import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getConfig() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
  };
}

function getR2Client(config: ReturnType<typeof getConfig>): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId!,
      secretAccessKey: config.secretAccessKey!,
    },
  });
}

export function isR2Configured(): boolean {
  const c = getConfig();
  const configured = !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucketName);
  if (!configured) {
    console.warn("[R2] Not configured — missing env vars:", {
      R2_ACCOUNT_ID: !!c.accountId,
      R2_ACCESS_KEY_ID: !!c.accessKeyId,
      R2_SECRET_ACCESS_KEY: !!c.secretAccessKey,
      R2_BUCKET_NAME: !!c.bucketName,
    });
  }
  return configured;
}

/**
 * Build a public URL for an R2 object key using the R2_PUBLIC_URL env var.
 * Returns null if R2_PUBLIC_URL is not configured.
 */
export function getR2PublicUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${key}`;
}

/**
 * Upload a PDF buffer to Cloudflare R2.
 * Stored at: {folderName}/{fileName}.pdf
 * Returns the R2 object key.
 */
export async function uploadPdfToR2(
  folderName: string,
  fileName: string,
  pdfBuffer: Buffer
): Promise<string> {
  const config = getConfig();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw new Error("Cloudflare R2 credentials are not fully configured");
  }

  const client = getR2Client(config);
  const safeFolderName = folderName.replace(/[^a-zA-Z0-9+\-_.]/g, "_");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9+\-_.]/g, "_");
  const key = `${safeFolderName}/${safeFileName.endsWith(".pdf") ? safeFileName : `${safeFileName}.pdf`}`;

  console.log(`[R2] Uploading to bucket="${config.bucketName}" key="${key}" size=${pdfBuffer.length}`);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    })
  );

  console.log(`[R2] Upload successful: ${key}`);
  return key;
}
