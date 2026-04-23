import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, CopyObjectCommand } from "@aws-sdk/client-s3";

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

/**
 * Upload an arbitrary buffer (image, etc.) to R2 with a custom content type.
 * Returns the R2 object key.
 */
export async function uploadBufferToR2(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const config = getConfig();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw new Error("Cloudflare R2 credentials are not fully configured");
  }
  const client = getR2Client(config);
  const safeKey = key.replace(/[^a-zA-Z0-9+\-_./]/g, "_");
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: safeKey,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return safeKey;
}

/**
 * Copy an existing R2 object to a new key.
 */
export async function copyR2Object(sourceKey: string, destKey: string): Promise<void> {
  const config = getConfig();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw new Error("Cloudflare R2 credentials are not fully configured");
  }
  const client = getR2Client(config);
  await client.send(
    new CopyObjectCommand({
      Bucket: config.bucketName,
      CopySource: encodeURIComponent(`${config.bucketName}/${sourceKey}`),
      Key: destKey,
    })
  );
  console.log(`[R2] Copied object from ${sourceKey} to ${destKey}`);
}

/**
 * Delete a single object from R2 by its key.
 */
export async function deleteR2Object(key: string): Promise<void> {
  const config = getConfig();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw new Error("Cloudflare R2 credentials are not fully configured");
  }
  const client = getR2Client(config);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
    console.log(`[R2] Deleted object: ${key}`);
  } catch (err: any) {
    console.warn(`[R2] Failed to delete object ${key}:`, err.message);
  }
}

/**
 * Delete multiple objects from R2 by their keys (up to 1000 at a time).
 */
export async function deleteR2Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const config = getConfig();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw new Error("Cloudflare R2 credentials are not fully configured");
  }
  const client = getR2Client(config);
  // R2 supports up to 1000 keys per batch delete
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: config.bucketName,
        Delete: { Objects: chunk.map((k) => ({ Key: k })) },
      })
    );
    console.log(`[R2] Deleted ${chunk.length} objects`);
  }
}

