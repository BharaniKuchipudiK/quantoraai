import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { sessionSigningSecret } from './session.js';

/**
 * Private transport for documents too large to ride inline through Vercel's
 * 4.5 MB Function request envelope.
 *
 * Bytes go browser -> private Supabase Storage. /api/chat receives only the
 * opaque storageRef below. The ref is an HMAC-signed capability over a random,
 * owner-partitioned path; callers never get the service key and cannot mint a
 * path for the server to read. The capability is intentionally short-lived.
 */
export const ATTACHMENT_STORAGE_BUCKET = 'quantora-attachments';
export const MAX_STORED_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_REF_TTL_SECONDS = 8 * 60 * 60;

const REF_PREFIX = 'v1';
const SAFE_PATH = /^chat\/[a-f0-9]{16}\/\d{8}\/[a-f0-9-]{36}-[A-Za-z0-9._-]{1,96}$/;

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function storageConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function encodeStoragePath(path: string): string {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function sanitizeName(name: string): string {
  const basename = String(name || 'attachment').replace(/\\/g, '/').split('/').pop() || 'attachment';
  const cleaned = basename.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'attachment').slice(0, 96);
}

function ownerKey(ownerSub: string): string {
  return createHash('sha256').update(String(ownerSub)).digest('hex').slice(0, 16);
}

function datedPath(ownerSub: string, name: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `chat/${ownerKey(ownerSub)}/${day}/${randomUUID()}-${sanitizeName(name)}`;
}

function signRef(payload: { path: string; ownerSub: string; exp: number }): string | null {
  const secret = sessionSigningSecret();
  if (!secret) return null;
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(createHmac('sha256', secret).update(`attachment-ref:${body}`).digest());
  return `${REF_PREFIX}.${body}.${sig}`;
}

export function verifyAttachmentStorageRef(ref: unknown): { path: string; ownerSub: string; exp: number } | null {
  const secret = sessionSigningSecret();
  if (!secret || typeof ref !== 'string' || ref.length > 2048) return null;
  const parts = ref.split('.');
  if (parts.length !== 3 || parts[0] !== REF_PREFIX) return null;
  const [, body, presented] = parts;
  const expected = base64url(createHmac('sha256', secret).update(`attachment-ref:${body}`).digest());
  if (!safeEqual(presented, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.path !== 'string' || !SAFE_PATH.test(payload.path)) return null;
    if (typeof payload.ownerSub !== 'string' || !payload.ownerSub) return null;
    if (!payload.path.startsWith(`chat/${ownerKey(payload.ownerSub)}/`)) return null;
    if (!Number.isInteger(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function absoluteSignedUploadUrl(baseUrl: string, raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  if (!raw.startsWith('/')) return null;
  return `${baseUrl}/storage/v1${raw.startsWith('/storage/v1/') ? raw.slice('/storage/v1'.length) : raw}`;
}

export async function createSignedAttachmentUpload(input: {
  ownerSub: string;
  name: string;
}): Promise<{ ok: true; uploadUrl: string; storageRef: string } | { ok: false; reason: string }> {
  const config = storageConfig();
  if (!config) return { ok: false, reason: 'storage-unconfigured' };
  const path = datedPath(input.ownerSub, input.name);
  const endpoint = `${config.url}/storage/v1/object/upload/sign/${ATTACHMENT_STORAGE_BUCKET}/${encodeStoragePath(path)}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
        'Content-Type': 'application/json',
      },
      // Match storage-js createSignedUploadUrl exactly. Upsert is false by
      // default; a unique UUID path means overwrite is neither needed nor wanted.
      body: JSON.stringify({}),
    });
  } catch {
    return { ok: false, reason: 'storage-unreachable' };
  }
  const data: any = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, reason: 'storage-sign-failed' };
  const uploadUrl = absoluteSignedUploadUrl(config.url, data?.signedUrl || data?.signedURL || data?.url);
  const storageRef = signRef({
    path,
    ownerSub: input.ownerSub,
    exp: Math.floor(Date.now() / 1000) + ATTACHMENT_REF_TTL_SECONDS,
  });
  if (!uploadUrl || !storageRef) return { ok: false, reason: 'storage-sign-invalid' };
  return { ok: true, uploadUrl, storageRef };
}

export async function downloadAttachmentStorageRef(ref: unknown): Promise<
  | { ok: true; bytes: Uint8Array; ownerSub: string }
  | { ok: false; reason: string }
> {
  const verified = verifyAttachmentStorageRef(ref);
  if (!verified) return { ok: false, reason: 'storage-ref-invalid' };
  const config = storageConfig();
  if (!config) return { ok: false, reason: 'storage-unconfigured' };
  const endpoint = `${config.url}/storage/v1/object/authenticated/${ATTACHMENT_STORAGE_BUCKET}/${encodeStoragePath(verified.path)}`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${config.key}`, apikey: config.key },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'storage-unreachable' };
  }
  if (!response.ok) return { ok: false, reason: response.status === 404 ? 'storage-not-ready' : 'storage-read-failed' };
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_STORED_ATTACHMENT_BYTES) return { ok: false, reason: 'storage-too-large' };
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_STORED_ATTACHMENT_BYTES) return { ok: false, reason: 'storage-too-large' };
  return { ok: true, bytes: new Uint8Array(buffer), ownerSub: verified.ownerSub };
}
