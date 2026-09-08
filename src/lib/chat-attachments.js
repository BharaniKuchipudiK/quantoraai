/**
 * WHAT TRAVELS WITH A CHAT TURN, AND WHAT IS SAID ABOUT WHAT DOES NOT.
 *
 * Until 2026-09-05 the composer accepted any file and the send path kept only
 * images: a PDF, a spreadsheet and a certificate were dropped with the words
 * "(not a readable image)", and the model — told nothing — asked the user how
 * to get them. This module is the one place that decides what is sent, so the
 * composer, the send path and the copy the user reads cannot disagree.
 *
 * Pure: no React, no fetch. The server reads documents (api/_lib/attachment-text.ts).
 */

export const READABLE_DOCUMENT_EXTENSIONS = ['pdf', 'xlsx', 'xlsm', 'docx', 'pptx', 'csv', 'tsv', 'txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml', 'html', 'htm'];

export const MAX_ATTACHED_IMAGES = 4;
export const MAX_ATTACHED_DOCUMENTS = 4;
/** Encoded sizes: keep the JSON body under Vercel's 4.5MB request limit. */
export const MAX_ATTACHED_IMAGE_CHARS = 3_500_000;
export const MAX_ATTACHED_DOCUMENT_CHARS = 3_500_000;
export const MAX_ATTACHED_TOTAL_CHARS = 4_000_000;
export const MAX_IMAGE_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_DOCUMENT_FILE_BYTES = 3 * 1024 * 1024;

export const READABLE_TYPES_COPY = 'images (PNG/JPG), PDFs, Word, Excel, PowerPoint, CSV and plain-text files';

/*
 * Private transport linkage. The chat loop already calls
 * `carryDocuments(ref, sessionId, partitioned.documents)` after taking
 * `partitioned.images` by reference. This WeakMap links those two temporary
 * buckets without putting metadata on either array and without changing the
 * large send loop: carried pixels are pushed into the same image array after
 * the visible user message has already been recorded, so follow-ups keep
 * vision context without rendering duplicate attachment chips.
 *
 * Weak keys also mean this bookkeeping has no persistence or serialization
 * surface and disappears as soon as the temporary partition is unreachable.
 */
const partitionContinuity = new WeakMap();

function extensionOf(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

/** 'image' | 'document' | 'unsupported' for a File-like ({ name, type }). */
export function attachmentKindForFile(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  const ext = extensionOf(file?.name);
  if (READABLE_DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  if (type === 'application/pdf' || type.startsWith('text/') || type === 'application/json') return 'document';
  return 'unsupported';
}

/**
 * Split the composer's attachments into what the request carries.
 * @returns {{ images: string[], documents: Array<{name:string, mimeType:string, dataUrl:string}>, excluded: Array<{name:string, reason:string}> }}
 */
export function partitionAttachments(attachments) {
  const images = [];
  const documents = [];
  const excluded = [];
  let totalChars = 0;
  let imageChars = 0;
  let documentChars = 0;
  let hadSourceAttachment = false;
  for (const item of attachments || []) {
    if (!item || item.type === 'context') continue;
    hadSourceAttachment = true;
    const url = typeof item.dataUrl === 'string' ? item.dataUrl : '';
    if (item.excludedReason) { excluded.push({ name: item.name, reason: item.excludedReason }); continue; }
    if (url.startsWith('data:image/')) {
      if (images.length >= MAX_ATTACHED_IMAGES) { excluded.push({ name: item.name, reason: 'count' }); continue; }
      if (imageChars + url.length > MAX_ATTACHED_IMAGE_CHARS || totalChars + url.length > MAX_ATTACHED_TOTAL_CHARS) { excluded.push({ name: item.name, reason: 'size' }); continue; }
      imageChars += url.length; totalChars += url.length;
      images.push(url);
      continue;
    }
    if (item.type === 'document' && url.startsWith('data:')) {
      if (documents.length >= MAX_ATTACHED_DOCUMENTS) { excluded.push({ name: item.name, reason: 'count' }); continue; }
      if (documentChars + url.length > MAX_ATTACHED_DOCUMENT_CHARS || totalChars + url.length > MAX_ATTACHED_TOTAL_CHARS) { excluded.push({ name: item.name, reason: 'size' }); continue; }
      documentChars += url.length; totalChars += url.length;
      documents.push({ name: item.name, mimeType: item.mimeType || '', dataUrl: url });
      continue;
    }
    excluded.push({ name: item.name, reason: 'unsupported' });
  }
  partitionContinuity.set(documents, { images, hadSourceAttachment });
  return { images, documents, excluded };
}

const namesOf = (list) => list.map((entry) => entry.name).filter(Boolean).join(', ');

/** The "Heads up" line when the turn goes ahead without some attachments; '' when nothing was excluded. */
export function describeExcludedAttachments(excluded) {
  const list = Array.isArray(excluded) ? excluded : [];
  if (!list.length) return '';
  const parts = [];
  const tooLarge = list.filter((e) => e.reason === 'size');
  const unsupported = list.filter((e) => e.reason === 'unsupported');
  const overCount = list.filter((e) => e.reason === 'count');
  if (tooLarge.length) parts.push(`${namesOf(tooLarge) || 'one file'} (too large to send — files need to be roughly 3MB or smaller)`);
  if (unsupported.length) parts.push(`${namesOf(unsupported) || 'one file'} (not a type I can read — I read ${READABLE_TYPES_COPY})`);
  if (overCount.length) parts.push(`${namesOf(overCount) || 'the rest'} (only ${MAX_ATTACHED_IMAGES} images and ${MAX_ATTACHED_DOCUMENTS} documents per turn)`);
  return `Heads up — I could not send ${parts.join(' and ')}. I am answering on what did go through.`;
}

/** The error when an attachment-only turn has nothing left to send. */
export function explainNothingToSend(excluded) {
  const list = Array.isArray(excluded) ? excluded : [];
  const tooLarge = list.filter((e) => e.reason === 'size');
  const unsupported = list.filter((e) => e.reason === 'unsupported');
  if (tooLarge.length) return `${namesOf(tooLarge) || 'That file'} is too large to send — files need to be roughly 3MB or smaller. Try a smaller copy, or tell me what you need and I will help.`;
  if (unsupported.length) return `I can read ${READABLE_TYPES_COPY}, but not ${namesOf(unsupported) || 'that file'} — describe what you need and I will help.`;
  return 'Add a message so I know what you would like me to do.';
}

/** How many later turns of the same chat a document stays attached to. */
export const CARRIED_DOCUMENT_TURNS = 8;
/** Images are expensive payloads, so keep only a short follow-up window. */
export const CARRIED_IMAGE_TURNS = 3;
/**
 * Hard browser-memory bound for transient source carry.
 *
 * One source partition is already capped by MAX_ATTACHED_TOTAL_CHARS (~4 MB of
 * encoded data). Keeping only the four most recently used attachment sessions
 * therefore prevents the per-session continuity feature from becoming an
 * unbounded heap cache when a learner opens, archives, or abandons many chats.
 */
export const MAX_CARRIED_ATTACHMENT_SESSIONS = 4;

function sessionAttachmentStore(ref) {
  const current = ref.current;
  if (current?.sessions instanceof Map) return current.sessions;

  const sessions = new Map();
  // Migrate the old one-session shape if a live client is updated in place.
  if (current?.sessionId != null && Array.isArray(current.documents)) {
    sessions.set(current.sessionId, {
      sessionId: current.sessionId,
      documents: current.documents,
      documentTurnsLeft: Number.isInteger(current.documentTurnsLeft)
        ? current.documentTurnsLeft
        : Number.isInteger(current.turnsLeft) ? current.turnsLeft : 0,
      images: Array.isArray(current.images) ? current.images : [],
      imageTurnsLeft: Number.isInteger(current.imageTurnsLeft) ? current.imageTurnsLeft : 0,
    });
  }
  ref.current = { sessions };
  return sessions;
}

function rememberAttachmentSession(sessions, sessionId, value) {
  // Map insertion order is our tiny LRU: delete + set moves an existing key to
  // the newest edge, then evict the least-recent entry if the cap is exceeded.
  sessions.delete(sessionId);
  sessions.set(sessionId, value);
  while (sessions.size > MAX_CARRIED_ATTACHMENT_SESSIONS) {
    const oldestSessionId = sessions.keys().next().value;
    sessions.delete(oldestSessionId);
  }
}

function readAttachmentSession(sessions, sessionId) {
  const carried = sessions.get(sessionId);
  if (!carried) return null;
  // A follow-up is real use, so keep this session ahead of abandoned chats.
  sessions.delete(sessionId);
  sessions.set(sessionId, carried);
  return carried;
}

/**
 * Attachments stay with the CONVERSATION, not only with the message they
 * arrived on. Documents need this for intake → build handoffs; images need it
 * for natural follow-ups such as "why is step 3 wrong?" after a photographed
 * assessment or handwritten solution.
 *
 * State is keyed by sessionId, so switching from chat A to chat B and back does
 * not make one chat overwrite the other's carried source. Nothing crosses
 * between sessions; each chat advances only its own bounded counters. The
 * session store itself is a four-entry LRU, so abandoned/deleted chats cannot
 * make transient attachment data grow without bound in the browser heap.
 *
 * Fresh source attachments replace older carried source context for that same
 * session. If the new source could not be sent (unsupported/oversize), that
 * session's old carried context is cleared rather than silently substituted.
 *
 * On a no-attachment follow-up, recent images take precedence over documents
 * from the same fresh source. This keeps the combined request inside the
 * existing body budget; once the short image window expires, document carry
 * can resume if that source included documents too. Carried documents remain
 * marked so the server can say "attached earlier in this conversation". Images
 * stay raw strings because that is the vision API's existing wire contract.
 *
 * The function name is retained for the existing send-loop call site. The
 * module-private WeakMap links the partition's image bucket to this same
 * continuity decision without widening that large, high-risk hook.
 *
 * @param {{ current: any }} ref
 */
export function carryDocuments(ref, sessionId, fresh) {
  const freshDocuments = Array.isArray(fresh) ? fresh : [];
  const continuity = partitionContinuity.get(freshDocuments);
  const imageBucket = continuity?.images;
  const partitionAware = Array.isArray(imageBucket);
  const freshImages = partitionAware ? imageBucket : [];
  const hadFreshSource = partitionAware
    ? continuity.hadSourceAttachment === true
    : freshDocuments.length > 0;
  const sessions = sessionAttachmentStore(ref);

  if (hadFreshSource) {
    if (!freshDocuments.length && !freshImages.length) {
      sessions.delete(sessionId);
      return [];
    }
    rememberAttachmentSession(sessions, sessionId, {
      sessionId,
      documents: freshDocuments,
      documentTurnsLeft: freshDocuments.length ? CARRIED_DOCUMENT_TURNS : 0,
      images: [...freshImages],
      imageTurnsLeft: freshImages.length ? CARRIED_IMAGE_TURNS : 0,
    });
    return freshDocuments;
  }

  const carried = readAttachmentSession(sessions, sessionId);
  if (!carried) return [];

  if (partitionAware && Array.isArray(carried.images) && carried.images.length && carried.imageTurnsLeft > 0) {
    imageBucket.push(...carried.images);
    carried.imageTurnsLeft -= 1;
    if (carried.imageTurnsLeft <= 0 && carried.documentTurnsLeft <= 0) sessions.delete(sessionId);
    return [];
  }

  if (Array.isArray(carried.documents) && carried.documents.length && carried.documentTurnsLeft > 0) {
    carried.documentTurnsLeft -= 1;
    const output = carried.documents.map((doc) => ({ ...doc, carried: true }));
    if (carried.documentTurnsLeft <= 0 && carried.imageTurnsLeft <= 0) sessions.delete(sessionId);
    return output;
  }

  if (carried.imageTurnsLeft <= 0 && carried.documentTurnsLeft <= 0) sessions.delete(sessionId);
  return [];
}
