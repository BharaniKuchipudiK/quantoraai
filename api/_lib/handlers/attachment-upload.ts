import { applyCors, isRateLimited } from '../rate-limit.js';
import { requireActiveSession } from '../authz.js';
import { createSignedAttachmentUpload, MAX_STORED_ATTACHMENT_BYTES } from '../attachment-storage.js';

const INLINE_DOCUMENT_BYTES = 3 * 1024 * 1024;
const REQUESTS_PER_MINUTE = 20;
const READABLE_EXTENSIONS = new Set(['pdf', 'xlsx', 'xlsm', 'docx', 'pptx', 'csv', 'tsv', 'txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml', 'html', 'htm']);
const ALLOWED_MIME_TYPES = new Set([
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

function extensionOf(name: string): string {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export default async function attachmentUpload(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;
  if (isRateLimited(`attachment-upload:${sessionUser.sub}`, REQUESTS_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many attachment uploads. Please wait a minute.' });
  }

  const name = String(req.body?.name || '').trim().slice(0, 200);
  const mimeType = String(req.body?.mimeType || '').trim().toLowerCase().slice(0, 100);
  const size = Number(req.body?.size);
  const extension = extensionOf(name);

  if (!name || !Number.isInteger(size) || size <= INLINE_DOCUMENT_BYTES || size > MAX_STORED_ATTACHMENT_BYTES) {
    return res.status(400).json({ error: 'Private upload is only used for supported documents larger than 3 MiB and no larger than 5 MiB.' });
  }
  if (!READABLE_EXTENSIONS.has(extension)) {
    return res.status(400).json({ error: 'That document type is not supported for attachment ingestion.' });
  }
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType) && !mimeType.startsWith('text/')) {
    return res.status(400).json({ error: 'That document MIME type is not supported for attachment ingestion.' });
  }

  const signed = await createSignedAttachmentUpload({ ownerSub: sessionUser.sub, name });
  if (signed.ok === false) {
    const reason = signed.reason;
    return res.status(reason === 'storage-unconfigured' ? 503 : 502).json({
      error: reason === 'storage-unconfigured'
        ? 'Private attachment storage is not configured on this deployment.'
        : 'Could not prepare private attachment storage. Please try again.',
      reason,
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ uploadUrl: signed.uploadUrl, storageRef: signed.storageRef });
}
