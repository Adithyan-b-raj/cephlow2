import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../types.js";

// S3-compatible client is only used for generating presigned URLs.
// Standard uploads and deletions are performed directly through native R2 bindings (zero latency, $0 cost).
let _s3Client: S3Client | null = null;
function getS3Client(env: Env): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      maxAttempts: 3,
    });
  }
  return _s3Client;
}

export function isR2Configured(env: Env): boolean {
  return !!(env.CERTIFICATES && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

export function getR2PublicUrl(env: Env, key: string): string | null {
  const base = env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${key}`;
}

export async function uploadPdfToR2(
  env: Env,
  folderName: string,
  fileName: string,
  pdfBuffer: ArrayBuffer | Uint8Array
): Promise<string> {
  const safeFolderName = folderName.replace(/[^a-zA-Z0-9+\-_.]/g, "_");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9+\-_.]/g, "_");
  const key = `${safeFolderName}/${safeFileName.endsWith(".pdf") ? safeFileName : `${safeFileName}.pdf`}`;

  console.log(`[R2] Uploading natively key="${key}" size=${pdfBuffer.byteLength}`);

  await env.CERTIFICATES.put(key, pdfBuffer, {
    httpMetadata: { contentType: "application/pdf" },
  });

  return key;
}

export async function uploadBufferToR2(
  env: Env,
  key: string,
  buffer: ArrayBuffer | Uint8Array,
  contentType: string
): Promise<string> {
  const safeKey = key.replace(/[^a-zA-Z0-9+\-_./]/g, "_");
  await env.CERTIFICATES.put(safeKey, buffer, {
    httpMetadata: { contentType },
  });
  return safeKey;
}

export async function copyR2Object(env: Env, sourceKey: string, destKey: string): Promise<void> {
  // Cloudflare R2 binding allows direct copy via get -> put (or using R2 options)
  const obj = await env.CERTIFICATES.get(sourceKey);
  if (!obj) throw new Error(`Source key ${sourceKey} not found in R2`);
  const body = await obj.arrayBuffer();
  await env.CERTIFICATES.put(destKey, body, {
    httpMetadata: { contentType: obj.httpMetadata?.contentType || "application/octet-stream" },
  });
}

export async function deleteR2Object(env: Env, key: string): Promise<void> {
  try {
    await env.CERTIFICATES.delete(key);
    console.log(`[R2] Deleted native object: ${key}`);
  } catch (err: any) {
    console.warn(`[R2] Failed to delete native object ${key}:`, err.message);
  }
}

export async function deleteR2Objects(env: Env, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // D1 / native bindings deletes one-by-one in parallel
  await Promise.all(keys.map((k) => deleteR2Object(env, k)));
}

export async function generatePresignedPutUrl(
  env: Env,
  folderName: string,
  fileName: string,
  contentType: string = "application/pdf",
  expiresIn: number = 900
): Promise<{ url: string; key: string }> {
  const client = getS3Client(env);
  const safeFolderName = folderName.replace(/[^a-zA-Z0-9+\-_./]/g, "_");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9+\-_.]/g, "_");
  const key = `${safeFolderName}/${safeFileName.endsWith(".pdf") ? safeFileName : `${safeFileName}.pdf`}`;

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return { url, key };
}

export async function generatePresignedAssetPutUrl(
  env: Env,
  key: string,
  contentType: string,
  expiresIn: number = 600
): Promise<{ url: string; key: string }> {
  const client = getS3Client(env);
  const safeKey = key.replace(/[^a-zA-Z0-9+\-_./]/g, "_");
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: safeKey,
    ContentType: contentType,
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  return { url, key: safeKey };
}
