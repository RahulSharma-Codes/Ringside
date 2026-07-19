import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

function getBucketId(): string {
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
  if (!id) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — run setupObjectStorage()");
  return id;
}

export const storageEnabled = Boolean(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID);

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "video/mp4",
]);

export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function uploadFile(params: {
  targetId: number;
  documentId: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ storagePath: string }> {
  const bucketId = getBucketId();
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectName = `targets/${params.targetId}/documents/${params.documentId}/${safeName}`;

  const bucket = gcs.bucket(bucketId);
  const file = bucket.file(objectName);

  await file.save(params.buffer, {
    contentType: params.mimeType,
    resumable: false,
  });

  return { storagePath: objectName };
}

export async function getSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<{ signedUrl: string; expiresAt: string }> {
  const bucketId = getBucketId();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketId,
      object_name: storagePath,
      method: "GET",
      expires_at: expiresAt,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate signed URL: HTTP ${response.status}`);
  }

  const { signed_url: signedUrl } = (await response.json()) as { signed_url: string };
  return { signedUrl, expiresAt };
}

export async function deleteFile(storagePath: string): Promise<void> {
  const bucketId = getBucketId();
  const bucket = gcs.bucket(bucketId);
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (exists) {
    await file.delete();
  }
}
