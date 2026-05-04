import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const BUCKET = "deal-documents";

export const storageEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

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
]);

export const MAX_FILE_SIZE = 25 * 1024 * 1024;

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!storageEnabled) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

export async function uploadFile(params: {
  targetId: number;
  documentId: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ storagePath: string }> {
  const client = getClient();
  if (!client) throw new Error("Storage not configured");

  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `targets/${params.targetId}/documents/${params.documentId}/${safeName}`;

  const { error } = await client.storage.from(BUCKET).upload(path, params.buffer, {
    contentType: params.mimeType,
    upsert: true,
  });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return { storagePath: path };
}

export async function getSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<{ signedUrl: string; expiresAt: string }> {
  const client = getClient();
  if (!client) throw new Error("Storage not configured");

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw new Error(`Failed to create signed URL: ${error.message}`);

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  return { signedUrl: data.signedUrl, expiresAt };
}
