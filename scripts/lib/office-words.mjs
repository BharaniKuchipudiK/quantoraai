/*
 * THE WORDS OF A WORD FILE, WHEREVER ITS WRITER PUT THEM.
 *
 * A .docx written from runs keeps its words in word/document.xml as <w:t>
 * text. The platform's Word writer (html-docx-js-typescript) does not: its
 * document.xml carries one <w:altChunk r:id="htmlChunk"/> and the words live
 * in word/afchunk.mht — an RFC 822 multipart with the HTML as a
 * quoted-printable text/html part, which Word converts on open. The deployed
 * golden's first Word file (2026-09-06) was read as document.xml alone and
 * found "" where the title was, on a file Word opens with the title in it.
 *
 * So: read document.xml; when it defers to an altChunk, follow the
 * relationship to the part, decode the MIME part it carries, and take the
 * words from the HTML. Both shapes report which parts held which words, so a
 * miss says where it looked.
 */
import { readZipEntryText, xmlText } from './zip-entry.mjs';

/** Standard quoted-printable: soft line breaks removed, =XX bytes decoded as UTF-8. */
export function decodeQuotedPrintable(text) {
  const joined = String(text || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let index = 0; index < joined.length; index += 1) {
    const char = joined[index];
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(index + 1, index + 3))) {
      bytes.push(parseInt(joined.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    // Text the writer left raw (this writer leaves UTF-8 as it is): keep its bytes.
    for (const byte of Buffer.from(char, 'utf8')) bytes.push(byte);
  }
  return Buffer.from(bytes).toString('utf8');
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** The words of an HTML document: styles and scripts dropped, tags removed, entities decoded. */
export function htmlWords(html) {
  const withoutBlocks = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  return decodeEntities(withoutBlocks.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function headerValue(headers, name) {
  const match = headers.match(new RegExp(`^${name}:\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, 'im'));
  return match ? match[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}

/** Every text/html part of an MHT (multipart/related) document, decoded. */
export function mhtHtmlParts(mht) {
  const source = String(mht || '');
  const headerEnd = source.search(/\r?\n\r?\n/);
  const topHeaders = headerEnd >= 0 ? source.slice(0, headerEnd) : source;
  const boundaryMatch = headerValue(topHeaders, 'Content-Type').match(/boundary="?([^";\s]+)"?/i);
  if (!boundaryMatch) {
    // Not multipart: the whole thing is the document if it reads as HTML.
    return /<html[\s>]/i.test(source) ? [source] : [];
  }
  const boundary = boundaryMatch[1];
  const parts = source.split(`--${boundary}`).slice(1);
  const html = [];
  for (const part of parts) {
    if (part.startsWith('--')) break;
    const split = part.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const headers = part.slice(0, split);
    const body = part.slice(split).replace(/^\r?\n\r?\n/, '');
    if (!/^text\/html/i.test(headerValue(headers, 'Content-Type'))) continue;
    const encoding = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase();
    if (encoding === 'quoted-printable') html.push(decodeQuotedPrintable(body));
    else if (encoding === 'base64') html.push(Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8'));
    else html.push(body);
  }
  return html;
}

function altChunkTargets(rels) {
  const targets = [];
  const relationship = /<Relationship\b[^>]*>/gi;
  let match;
  while ((match = relationship.exec(String(rels || ''))) !== null) {
    const tag = match[0];
    const type = (tag.match(/\bType="([^"]*)"/i) || [])[1] || '';
    const target = (tag.match(/\bTarget="([^"]*)"/i) || [])[1] || '';
    if (!/\/aFChunk$/i.test(type) || !target) continue;
    // "/word/afchunk.mht" is package-absolute; "afchunk.mht" is relative to word/.
    targets.push(target.startsWith('/') ? target.slice(1) : `word/${target.replace(/^\.\//, '')}`);
  }
  return targets;
}

/**
 * The words of a .docx and where they came from, or null when the zip has no
 * word/document.xml (it is not a Word document).
 */
export function wordDocumentWords(docxBytes) {
  const documentXml = readZipEntryText(docxBytes, 'word/document.xml');
  if (documentXml === null) return null;
  const parts = [{ name: 'word/document.xml', words: xmlText(documentXml) }];
  if (/<w:altChunk\b/i.test(documentXml)) {
    const rels = readZipEntryText(docxBytes, 'word/_rels/document.xml.rels') || '';
    for (const target of altChunkTargets(rels)) {
      const raw = readZipEntryText(docxBytes, target);
      if (raw === null) { parts.push({ name: target, words: '', missing: true }); continue; }
      const html = /^MIME-Version:|^Content-Type:/im.test(raw) ? mhtHtmlParts(raw) : [raw];
      parts.push({ name: target, words: html.map(htmlWords).join(' ').trim() });
    }
  }
  return {
    words: parts.map((part) => part.words).filter(Boolean).join(' ').trim(),
    parts,
  };
}
