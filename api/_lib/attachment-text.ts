import { extractResearchPdfText } from './research-pdf-text.js';
import { readZipEntries } from './office-zip.js';

/**
 * DOCUMENTS ATTACHED TO A CHAT TURN — READ HERE, QUOTED TO THE MODEL.
 *
 * Until 2026-09-05 the chat accepted only images: anything else was dropped in
 * the browser with the words "(not a readable image)", and the model — told
 * nothing about files it never received — asked the user how to get them.
 * Four association documents (bylaws, a registration certificate, a member
 * form, a spreadsheet) went that way in one turn, and the platform wore the
 * model's limitation as its own.
 *
 * The rule: every supported document becomes text on the server, in front of
 * the model, on every route. A file that cannot be read is named as such — a
 * scanned PDF has no text layer and this module does not OCR — so the model
 * can say so plainly instead of inventing a reason.
 *
 * Extraction is deterministic and testable with no model call, which is what
 * lets a gate cover it.
 */

export type AttachmentKind = 'pdf' | 'spreadsheet' | 'word' | 'slides' | 'text' | 'unsupported';

export type AttachmentRead = {
  name: string;
  kind: AttachmentKind;
  ok: boolean;
  text: string;
  chars: number;
  /** One human line: "6 pages · 14,320 characters" or why it could not be read. */
  detail: string;
  reason?: string;
  pages?: number;
  sheets?: number;
  truncated?: boolean;
  /** Attached on an earlier turn of this conversation and re-sent by the desk. */
  carried?: boolean;
};

export type AttachedDocumentInput = { name: string; mimeType?: string; dataUrl: string; carried?: boolean };

export const MAX_DOCUMENT_CHARS = 60_000;
export const MAX_DOCUMENTS_BLOCK_CHARS = 150_000;
export const MAX_ATTACHED_DOCUMENTS = 4;
const MAX_SHEET_ROWS = 300;
const MAX_ZIP_BUDGET = 32 * 1024 * 1024;

function extensionOf(name: string): string {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function attachmentKindFor(name: string, mimeType = ''): AttachmentKind {
  const ext = extensionOf(name);
  const mime = String(mimeType || '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'xlsx' || ext === 'xlsm') return 'spreadsheet';
  if (ext === 'docx') return 'word';
  if (ext === 'pptx') return 'slides';
  if (['csv', 'tsv', 'txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml', 'html', 'htm'].includes(ext)) return 'text';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return 'unsupported';
}

const formatCount = (n: number) => n.toLocaleString('en-US');

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function clip(text: string, limit = MAX_DOCUMENT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return {
    text: `${text.slice(0, limit)}\n[… truncated: showing the first ${formatCount(limit)} of ${formatCount(text.length)} characters]`,
    truncated: true,
  };
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function columnIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/) || [''])[0];
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

const utf8 = (bytes: Uint8Array | undefined) => (bytes ? new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '') : '');

function xlsxToText(bytes: Uint8Array): { text: string; sheets: number } {
  const entries = readZipEntries(bytes, {
    maxTotalBytes: MAX_ZIP_BUDGET,
    wanted: (name) => name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' || name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  });
  const shared: string[] = [];
  for (const si of utf8(entries.get('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    shared.push(Array.from(si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((m) => decodeEntities(m[1])).join(''));
  }
  const rels = new Map<string, string>();
  for (const rel of utf8(entries.get('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = rel[0].match(/\bId="([^"]*)"/)?.[1];
    const target = rel[0].match(/\bTarget="([^"]*)"/)?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const sheetTags = Array.from(utf8(entries.get('xl/workbook.xml')).matchAll(/<sheet\b[^>]*>/g)).map((m) => m[0]);
  const sections: string[] = [];
  let sheets = 0;
  sheetTags.forEach((tag, sheetIndex) => {
    const name = decodeEntities(tag.match(/\bname="([^"]*)"/)?.[1] || `Sheet${sheetIndex + 1}`);
    const rid = tag.match(/\br:id="([^"]*)"/)?.[1] || '';
    const target = rels.get(rid) || `worksheets/sheet${sheetIndex + 1}.xml`;
    const xml = utf8(entries.get(`xl/${target}`));
    if (!xml) return;
    sheets += 1;
    const lines: string[] = [];
    let rowCount = 0;
    let omitted = 0;
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      rowCount += 1;
      if (lines.length >= MAX_SHEET_ROWS) { omitted += 1; continue; }
      const cells: string[] = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1] || '';
        const body = cell[2] || '';
        const ref = attrs.match(/\br="([A-Z]+)\d*"/)?.[1] || '';
        const type = attrs.match(/\bt="([^"]*)"/)?.[1] || '';
        let value = '';
        if (type === 's') {
          const idx = Number.parseInt(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '', 10);
          value = Number.isFinite(idx) ? (shared[idx] ?? '') : '';
        } else if (type === 'inlineStr') {
          value = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((m) => decodeEntities(m[1])).join('');
        } else if (type === 'b') {
          value = (body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '') === '1' ? 'TRUE' : 'FALSE';
        } else {
          value = decodeEntities(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '');
        }
        if (!value) continue;
        const col = ref ? columnIndex(ref) : cells.length;
        while (cells.length < col) cells.push('');
        cells[col] = value;
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) lines.push(cells.map(csvField).join(','));
    }
    sections.push(`## Sheet: ${name} (${formatCount(rowCount)} rows${omitted ? `, showing the first ${MAX_SHEET_ROWS}` : ''})\n${lines.join('\n')}`);
  });
  return { text: sections.join('\n\n').trim(), sheets };
}

function docxToText(bytes: Uint8Array): string {
  const entries = readZipEntries(bytes, { maxTotalBytes: MAX_ZIP_BUDGET, wanted: (name) => name === 'word/document.xml' });
  const xml = utf8(entries.get('word/document.xml'));
  const paragraphs: string[] = [];
  for (const paragraph of xml.split('</w:p>')) {
    const runs: string[] = [];
    for (const piece of paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
      if (piece[0].startsWith('<w:tab')) runs.push('\t');
      else if (piece[0].startsWith('<w:br')) runs.push('\n');
      else runs.push(decodeEntities(piece[1] || ''));
    }
    const line = runs.join('').trim();
    if (line) paragraphs.push(line);
  }
  return paragraphs.join('\n');
}

function pptxToText(bytes: Uint8Array): { text: string; slides: number } {
  const entries = readZipEntries(bytes, { maxTotalBytes: MAX_ZIP_BUDGET, wanted: (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name) });
  const names = Array.from(entries.keys()).sort((a, b) => Number(a.match(/(\d+)/)?.[1]) - Number(b.match(/(\d+)/)?.[1]));
  const sections = names.map((name, index) => {
    const xml = utf8(entries.get(name));
    const lines = Array.from(xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g))
      .map((p) => Array.from(p[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) => decodeEntities(m[1])).join('').trim())
      .filter(Boolean);
    return `## Slide ${index + 1}\n${lines.join('\n')}`;
  });
  return { text: sections.join('\n\n').trim(), slides: names.length };
}

const PDF_REASONS: Record<string, string> = {
  source_pdf_empty: 'no text layer — this looks like a scanned image, and Quantora cannot OCR it yet',
  source_pdf_encrypted: 'password-protected',
  source_pdf_too_many_pages: 'more pages than the reader accepts (60)',
  source_pdf_text_too_large: 'more text than the reader accepts',
  source_pdf_unreadable: 'not a readable PDF',
  source_pdf_support_unavailable: 'the PDF reader is unavailable on this deployment',
};

function read(name: string, kind: AttachmentKind, ok: boolean, text: string, detail: string, extra: Partial<AttachmentRead> = {}): AttachmentRead {
  return { name, kind, ok, text, chars: text.length, detail, ...extra };
}

export async function extractAttachmentText(input: { name: string; mimeType?: string; bytes: Uint8Array }): Promise<AttachmentRead> {
  const name = String(input.name || 'attachment');
  const kind = attachmentKindFor(name, input.mimeType);
  try {
    if (kind === 'pdf') {
      const result = await extractResearchPdfText(input.bytes);
      if (!result.ok || !result.text) {
        const reason = result.reason || 'source_pdf_unreadable';
        return read(name, kind, false, '', PDF_REASONS[reason] || 'could not be read', { reason, pages: result.pages });
      }
      const clipped = clip(result.text);
      return read(name, kind, true, clipped.text, `${formatCount(result.pages || 0)} pages · ${formatCount(result.text.length)} characters${clipped.truncated ? ' (truncated)' : ''}`, { pages: result.pages, truncated: clipped.truncated });
    }
    if (kind === 'spreadsheet') {
      const { text, sheets } = xlsxToText(input.bytes);
      if (!text) return read(name, kind, false, '', 'no cells with values', { reason: 'empty', sheets });
      const clipped = clip(text);
      return read(name, kind, true, clipped.text, `${formatCount(sheets)} sheet${sheets === 1 ? '' : 's'} · ${formatCount(text.length)} characters as CSV${clipped.truncated ? ' (truncated)' : ''}`, { sheets, truncated: clipped.truncated });
    }
    if (kind === 'word') {
      const text = docxToText(input.bytes);
      if (!text) return read(name, kind, false, '', 'no text found', { reason: 'empty' });
      const clipped = clip(text);
      return read(name, kind, true, clipped.text, `${formatCount(text.length)} characters${clipped.truncated ? ' (truncated)' : ''}`, { truncated: clipped.truncated });
    }
    if (kind === 'slides') {
      const { text, slides } = pptxToText(input.bytes);
      if (!text) return read(name, kind, false, '', 'no text found on any slide', { reason: 'empty', pages: slides });
      const clipped = clip(text);
      return read(name, kind, true, clipped.text, `${formatCount(slides)} slides · ${formatCount(text.length)} characters${clipped.truncated ? ' (truncated)' : ''}`, { pages: slides, truncated: clipped.truncated });
    }
    if (kind === 'text') {
      const text = utf8(input.bytes).trim();
      if (!text) return read(name, kind, false, '', 'the file is empty', { reason: 'empty' });
      const clipped = clip(text);
      return read(name, kind, true, clipped.text, `${formatCount(text.length)} characters${clipped.truncated ? ' (truncated)' : ''}`, { truncated: clipped.truncated });
    }
    return read(name, 'unsupported', false, '', `Quantora reads PDF, Word, Excel, PowerPoint, CSV and plain-text files — not .${extensionOf(name) || 'this type'} yet`, { reason: 'unsupported' });
  } catch (error: any) {
    return read(name, kind, false, '', `could not be parsed (${String(error?.message || error).slice(0, 80)})`, { reason: 'unreadable' });
  }
}

/** Decode the browser's data URLs and read each document; a bad entry is a named failure, never a thrown turn. */
export async function readAttachedDocuments(list: AttachedDocumentInput[]): Promise<AttachmentRead[]> {
  const reads: AttachmentRead[] = [];
  for (const item of (Array.isArray(list) ? list : []).slice(0, MAX_ATTACHED_DOCUMENTS)) {
    const name = String(item?.name || 'attachment');
    const match = typeof item?.dataUrl === 'string' ? item.dataUrl.match(/^data:([^;,]*)(?:;[^,]*)?;base64,(.+)$/s) : null;
    if (!match) {
      reads.push(read(name, attachmentKindFor(name, item?.mimeType), false, '', 'the file did not arrive intact', { reason: 'malformed' }));
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(match[2], 'base64'));
    } catch {
      reads.push(read(name, attachmentKindFor(name, item?.mimeType), false, '', 'the file did not arrive intact', { reason: 'malformed' }));
      continue;
    }
    const extracted = await extractAttachmentText({ name, mimeType: item?.mimeType || match[1], bytes });
    reads.push(item?.carried === true ? { ...extracted, carried: true } : extracted);
  }
  return reads;
}

/**
 * What the model is told. Read documents are quoted in full (within budget);
 * unreadable ones are named with the reason, so the model's answer about them
 * is true instead of invented.
 */
export function buildAttachedDocumentsBlock(reads: AttachmentRead[], options: { totalChars?: number } = {}): string {
  if (!Array.isArray(reads) || !reads.length) return '';
  let remaining = options.totalChars ?? MAX_DOCUMENTS_BLOCK_CHARS;
  const sections: string[] = [];
  reads.forEach((item, index) => {
    const label = `${index + 1}. ${item.name}${item.carried ? ' (attached earlier in this conversation)' : ''}`;
    if (!item.ok) {
      sections.push(`=== ${label} — NOT READABLE: ${item.detail} ===\nTell the user plainly that this file could not be read and what would work instead (a text version, or a photo of the relevant page).`);
      return;
    }
    if (remaining <= 0) {
      sections.push(`=== ${label} — OMITTED: the attachment budget for this turn is spent ===`);
      return;
    }
    const body = item.text.length > remaining
      ? `${item.text.slice(0, remaining)}\n[… truncated to fit this turn's attachment budget]`
      : item.text;
    remaining -= body.length;
    sections.push(`=== ${label} (${item.kind} · ${item.detail}) ===\n${body}`);
  });
  return [
    'ATTACHED DOCUMENTS',
    'Quantora extracted the text below from the files the user attached to this conversation. Treat it as part of their message: read it, quote it, and build from it. Do not ask the user to re-send or describe these files.',
    ...sections,
  ].join('\n\n');
}

/** What the desk is told — everything but the text. */
export function summarizeAttachmentReads(reads: AttachmentRead[]) {
  return (Array.isArray(reads) ? reads : []).map((item) => ({
    name: item.name,
    kind: item.kind,
    ok: item.ok,
    detail: item.detail,
    chars: item.chars,
    ...(item.pages != null ? { pages: item.pages } : {}),
    ...(item.sheets != null ? { sheets: item.sheets } : {}),
    ...(item.truncated ? { truncated: true } : {}),
    ...(item.reason ? { reason: item.reason } : {}),
    ...(item.carried ? { carried: true } : {}),
  }));
}
