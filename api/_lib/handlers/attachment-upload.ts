import { createHash, randomUUID } from 'node:crypto';
import { applyCors, isRateLimited } from '../rate-limit.js';
import { requireActiveSession } from '../authz.js';

export const ATTACHMENT_BUCKET = 'quantora-attachments';
export const MAX_STORED_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'docx', 'pptx', 'xlsx', 'xlsm',
  'csv', 'tsv', 'txt', 'md', 'markdown', 'json', 'log',
  'xml', 'yaml', 'yml', 'html', 'htm',
]);

const KNOWN_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'text/markdown',
  'text/html',
  'text/xml',
  'application/xml',
  'application/json',
  'application/octet-stream',
]);

type UploadRequest = {
  name: string;
  extension: string;
  mimeType: string;
  size: number;
};

function extensionOf(name: string): string {
  const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function normalizeAttachmentUploadRequest(value: unknown): UploadRequest | null {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 200) : '';
  const extension = extensionOf(name);
  const rawSize = typeof input.size === 'number' ? input.size : Number.NaN;
  const size = Number.isFinite(rawSize) ? Math.floor(rawSize) : 0;
  const rawMime = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase().slice(0, 120) : '';
  const mimeType = KNOWN_MIME_TYPES.has(rawMime) ? rawMime : 'application/octet-stream';

  if (!name || !SUPPORTED_EXTENSIONS.has(extension)) return null;
  if (size <= 0 || size > MAX_STORED_ATTACHMENT_BYTES) return null;
  return { name, extension, mimeType, size };
}

export function attachmentOwnerPrefix(userSub: string): string {
  return createHash('sha256')
    .update(`quantora-attachment-owner\0${String(userSub || '')}`)
    .digest('hex')
    .slice(0, 32);
}

export function attachmentStoragePath(userSub: string, extension: string, objectId = randomUUID()): string {
  const ext = String(extension || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) throw new Error('unsupported_attachment_extension');
  if (!/^[0-9a-f-]{36}$/i.test(objectId)) throw new Error('invalid_attachment_object_id');
  return `v1/${attachmentOwnerPrefix(userSub)}/${objectId.toLowerCase()}.${ext}`;
}

function storageConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function encodeStoragePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export async function createAttachmentSignedUpload(input: {
  userSub: string;
  extension: string;
  fetchImpl?: typeof fetch;
  objectId?: string;
}): Promise<{ storagePath: string; signedUrl: string } | null> {
  const cfg = storageConfig();
  if (!cfg) return null;
  const storagePath = attachmentStoragePath(input.userSub, input.extension, input.objectId);
  const finalPath = `${ATTACHMENT_BUCKET}/${storagePath}`;
  const endpoint = `${cfg.url}/storage/v1/object/upload/sign/${encodeStoragePath(finalPath)}`;
  const fetcher = input.fetchImpl || fetch;

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  try {
    const payload = await response.json() as { url?: unknown };
    if (typeof payload.url !== 'string' || !payload.url.startsWith('/object/upload/sign/')) return null;
    const signedUrl = `${cfg.url}/storage/v1${payload.url}`;
    const parsed = new URL(signedUrl);
    if (!parsed.searchParams.get('token')) return null;
    return { storagePath, signedUrl };
  } catch {
    return null;
  }
}

export default async function attachmentUpload(req: any, res: any) {
  applyCors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: 'Sign in to attach files.', requiresAuth: true });

  if (isRateLimited(`attachment-upload:init:${userSub}`, 40, 60_000)) {
    return res.status(429).json({ error: 'Too many file uploads. Please wait a moment.' });
  }

  const input = normalizeAttachmentUploadRequest(req.body);
  if (!input) {
    return res.status(400).json({
      error: 'Choose a supported document up to 5 MB.',
      maxBytes: MAX_STORED_ATTACHMENT_BYTES,
    });
  }

  const signed = await createAttachmentSignedUpload({ userSub, extension: input.extension });
  if (!signed) return res.status(503).json({ error: 'File upload is temporarily unavailable.' });

  return res.status(201).json({
    storagePath: signed.storagePath,
    signedUrl: signed.signedUrl,
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    maxBytes: MAX_STORED_ATTACHMENT_BYTES,
    expiresInSeconds: 2 * 60 * 60,
  });
}
