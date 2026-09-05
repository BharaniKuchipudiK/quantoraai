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
  for (const item of attachments || []) {
    if (!item || item.type === 'context') continue;
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

/**
 * Documents stay with the CONVERSATION, not only with the message they arrived
 * on. The real flow is attach → ask for a site → answer the designer's one
 * question → build; without this the build turn had no documents, and the
 * model built without them or asked for them again. Fresh documents replace
 * what was carried; a new chat starts empty; carried copies are marked so the
 * server can say "attached earlier in this conversation".
 *
 * @param {{ current: null | { sessionId: any, documents: any[], turnsLeft: number } }} ref
 */
export function carryDocuments(ref, sessionId, fresh) {
  const freshDocuments = Array.isArray(fresh) ? fresh : [];
  if (freshDocuments.length) {
    ref.current = { sessionId, documents: freshDocuments, turnsLeft: CARRIED_DOCUMENT_TURNS };
    return freshDocuments;
  }
  const carried = ref.current;
  if (!carried || carried.sessionId !== sessionId || carried.turnsLeft <= 0) return [];
  carried.turnsLeft -= 1;
  return carried.documents.map((doc) => ({ ...doc, carried: true }));
}
