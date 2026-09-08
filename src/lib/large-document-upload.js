const INLINE_DOCUMENT_BYTES = 3 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ENTRY_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_ENTRIES = 32;

const uploadsBySignature = new Map();

function displaySize(bytes) {
  return `${(Number(bytes || 0) / 1024).toFixed(1)} KB`;
}

function signatureFor(value) {
  return [
    String(value?.name || ''),
    String(value?.sizeLabel || value?.size || ''),
    String(value?.mimeType || value?.type || '').toLowerCase(),
  ].join('\u0000');
}

function prune(now = Date.now()) {
  for (const [key, queue] of uploadsBySignature) {
    const kept = queue.filter((entry) => now - entry.createdAt <= ENTRY_TTL_MS);
    if (kept.length) uploadsBySignature.set(key, kept);
    else uploadsBySignature.delete(key);
  }
  let count = [...uploadsBySignature.values()].reduce((sum, queue) => sum + queue.length, 0);
  while (count > MAX_PENDING_ENTRIES) {
    const oldestKey = uploadsBySignature.keys().next().value;
    const queue = uploadsBySignature.get(oldestKey) || [];
    queue.shift();
    if (queue.length) uploadsBySignature.set(oldestKey, queue);
    else uploadsBySignature.delete(oldestKey);
    count -= 1;
  }
}

async function directUpload(file) {
  // Folded into the existing Domains function so this feature does not create
  // a 13th Vercel Function. The routed handler owns auth and rate limiting.
  const tokenResponse = await fetch('/api/domains?route=attachment-upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || '',
      size: file.size,
    }),
  });
  const tokenPayload = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !tokenPayload?.uploadUrl || !tokenPayload?.storageRef) {
    throw new Error(tokenPayload?.error || `Could not prepare attachment upload (HTTP ${tokenResponse.status}).`);
  }

  // This mirrors @supabase/storage-js uploadToSignedUrl for a Blob/File:
  // PUT the signed URL, cacheControl in FormData, file under the blank field.
  const form = new FormData();
  form.append('cacheControl', '0');
  form.append('', file);
  const uploadResponse = await fetch(tokenPayload.uploadUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'false' },
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Private attachment upload failed (HTTP ${uploadResponse.status}).`);
  }
  return { storageRef: tokenPayload.storageRef };
}

/**
 * Begin direct-to-private-storage for a real browser File whose raw bytes would
 * make an inline base64 /api/chat request exceed Vercel's Function envelope.
 * Small documents stay on the existing inline path.
 */
export function registerLargeDocumentUpload(file) {
  if (!file || typeof file.size !== 'number' || file.size <= INLINE_DOCUMENT_BYTES || file.size > MAX_DOCUMENT_BYTES) return false;
  if (typeof Blob === 'undefined' || !(file instanceof Blob)) return false;
  prune();
  const key = signatureFor({ name: file.name, sizeLabel: displaySize(file.size), mimeType: file.type || '' });
  const queue = uploadsBySignature.get(key) || [];
  const entry = { createdAt: Date.now(), status: 'pending', storageRef: '', error: '' };
  queue.push(entry);
  uploadsBySignature.set(key, queue);
  Promise.resolve(directUpload(file)).then((result) => {
    if (!result?.storageRef) throw new Error('Attachment upload returned no storage reference.');
    entry.storageRef = result.storageRef;
    entry.status = 'ready';
  }).catch((error) => {
    entry.error = String(error?.message || error || 'Private upload failed.');
    entry.status = 'failed';
  });
  return true;
}

/**
 * Match the attachment object AiStudio stored after FileReader finished to the
 * upload started from its original File. Pending entries are deliberately not
 * consumed: an immediate Send gets an honest "still uploading" refusal and a
 * second Send can claim the same upload once it is ready.
 */
export function claimLargeDocumentUpload(item) {
  prune();
  const key = signatureFor(item);
  const queue = uploadsBySignature.get(key);
  if (!queue?.length) return null;
  const entry = queue[0];
  if (entry.status === 'pending') return { status: 'pending' };
  queue.shift();
  if (!queue.length) uploadsBySignature.delete(key);
  if (entry.status === 'ready') return { status: 'ready', storageRef: entry.storageRef };
  return { status: 'failed', error: entry.error };
}
