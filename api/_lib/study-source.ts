import { createHash } from 'node:crypto';
import { applyCors, isRateLimited } from './rate-limit.js';
import { requireActiveSession } from './authz.js';

export const STUDY_SOURCE_VERSION = 'study-source-2026-09-03.1';
export const STUDY_SOURCE_MAX_BYTES = 4_000_000;
export const STUDY_SOURCE_MAX_PAGES = 60;
export const STUDY_SOURCE_MAX_TEXT_CHARS = 800_000;

export type StudySourcePage = { page: number; text: string };
export type StudyGroundedSource = {
  version: typeof STUDY_SOURCE_VERSION;
  sourceId: string;
  kind: 'pdf' | 'image';
  filename: string;
  mimeType: string;
  byteSize: number;
  pages: StudySourcePage[];
  pageCount: number | null;
  extraction: 'text_layer' | 'visual_only';
};

type StudySourceFailure = { ok: false; reason: string };
type StudySourceSuccess = { ok: true; source: StudyGroundedSource };
export type StudySourceResult = StudySourceFailure | StudySourceSuccess;

function cleanFilename(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180) || 'study-source';
}

function decodeBase64(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !value || value.length > 6_000_000) return null;
  try {
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.length > STUDY_SOURCE_MAX_BYTES) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

function sourceId(bytes: Uint8Array): string {
  return `src_${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}`;
}

async function extractPdfPages(bytes: Uint8Array): Promise<{ ok: true; pages: StudySourcePage[]; pageCount: number } | StudySourceFailure> {
  let getDocument: any;
  try {
    ({ getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'));
  } catch {
    return { ok: false, reason: 'study_source_pdf_support_unavailable' };
  }

  let doc: any;
  try {
    doc = await getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false, useWorkerFetch: false }).promise;
  } catch (err: any) {
    return { ok: false, reason: String(err?.name || '') === 'PasswordException' ? 'study_source_pdf_encrypted' : 'study_source_pdf_unreadable' };
  }

  try {
    if (doc.numPages > STUDY_SOURCE_MAX_PAGES) return { ok: false, reason: 'study_source_pdf_too_many_pages' };
    const pages: StudySourcePage[] = [];
    let totalChars = 0;
    for (let page = 1; page <= doc.numPages; page += 1) {
      const pdfPage = await doc.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = (content?.items || []).map((item: any) => typeof item?.str === 'string' ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
      totalChars += text.length;
      if (totalChars > STUDY_SOURCE_MAX_TEXT_CHARS) return { ok: false, reason: 'study_source_pdf_text_too_large' };
      pages.push({ page, text });
    }
    if (!pages.some((page) => page.text)) return { ok: false, reason: 'study_source_pdf_empty' };
    return { ok: true, pages, pageCount: doc.numPages };
  } catch {
    return { ok: false, reason: 'study_source_pdf_unreadable' };
  } finally {
    try { await doc?.destroy?.(); } catch { /* no-op */ }
  }
}

export async function ingestStudySource(input: unknown): Promise<StudySourceResult> {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  const filename = cleanFilename(body.filename);
  const bytes = decodeBase64(body.dataBase64);
  if (!bytes) return { ok: false, reason: 'study_source_invalid_or_too_large' };

  if (mimeType === 'application/pdf') {
    const extracted = await extractPdfPages(bytes);
    if (!extracted.ok) return extracted;
    return { ok: true, source: { version: STUDY_SOURCE_VERSION, sourceId: sourceId(bytes), kind: 'pdf', filename, mimeType, byteSize: bytes.byteLength, pages: extracted.pages, pageCount: extracted.pageCount, extraction: 'text_layer' } };
  }

  if (mimeType.startsWith('image/')) {
    return { ok: true, source: { version: STUDY_SOURCE_VERSION, sourceId: sourceId(bytes), kind: 'image', filename, mimeType, byteSize: bytes.byteLength, pages: [], pageCount: null, extraction: 'visual_only' } };
  }

  return { ok: false, reason: 'study_source_type_unsupported' };
}

export default async function studySourceHandler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: 'Sign in to add Study sources.', requiresAuth: true });
  if (isRateLimited(`study-source:ingest:${userSub}`, 20, 60_000)) return res.status(429).json({ error: 'Too many Study source uploads. Please wait a moment.' });

  const result = await ingestStudySource(req.body);
  if (!result.ok) return res.status(400).json({ error: 'Study source could not be ingested.', reason: result.reason });
  return res.status(200).json({ source: result.source });
}
