import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { decodeQuotedPrintable, htmlWords, mhtHtmlParts, wordDocumentWords } from './lib/office-words.mjs';
import { readZipEntryText, xmlText } from './lib/zip-entry.mjs';

const require = createRequire(import.meta.url);

/** The platform's own Word writer, given the HTML compileWord gives it. */
async function realDocx(html) {
  const mod = require('html-docx-js-typescript');
  const asBlob = mod.asBlob || mod.default?.asBlob;
  const blob = await asBlob(html);
  return Buffer.isBuffer(blob) ? blob : Buffer.from(await blob.arrayBuffer());
}

const TITLE = 'Golden Canary Brief GC-123456';
const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>h1{color:#0f172a}</style></head><body><h1>${TITLE}</h1><section><h2>A neighbourhood bakery — “Crumbs &amp; Co”</h2><p>First paragraph = one.</p><p>Second paragraph.</p></section></body></html>`;

test('the words of a Word file written as an altChunk are read from the part that holds them', async () => {
  const docx = await realDocx(HTML);
  // The class: document.xml alone has no words at all.
  assert.equal(xmlText(readZipEntryText(docx, 'word/document.xml')), '');
  const read = wordDocumentWords(docx);
  assert.deepEqual(read.parts.map((part) => part.name), ['word/document.xml', 'word/afchunk.mht']);
  assert.equal(read.parts[0].words, '');
  assert.ok(read.words.includes(TITLE), read.words);
  assert.ok(read.words.includes('Crumbs & Co'), read.words);
  assert.ok(read.words.includes('First paragraph = one.'), read.words);
  assert.ok(!/color:#0f172a/.test(read.words), 'a stylesheet is not words');
});

test('quoted-printable decodes soft breaks and encoded bytes, and leaves raw UTF-8 alone', () => {
  assert.equal(decodeQuotedPrintable('a =3D b=\r\nc =E2=80=93 d'), 'a = bc – d');
  assert.equal(decodeQuotedPrintable('caf=C3=A9 — “x”'), 'café — “x”');
  assert.equal(decodeQuotedPrintable('not =ZZ hex'), 'not =ZZ hex');
});

test('an MHT with a base64 HTML part and a non-HTML part yields only the HTML, decoded', () => {
  const html = '<html><body><p>Base sixty-four &lt;ok&gt;</p></body></html>';
  const mht = [
    'MIME-Version: 1.0',
    'Content-Type: multipart/related;',
    '    type="text/html";',
    '    boundary="----=part"',
    '',
    '',
    '------=part',
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    'Content-Location: file:///C:/fake/image0.png',
    '',
    'iVBORw0KGgo=',
    '------=part',
    'Content-Type: text/html;',
    '    charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    'Content-Location: file:///C:/fake/document.html',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    '',
    '------=part--',
    '',
  ].join('\n');
  assert.deepEqual(mhtHtmlParts(mht).map(htmlWords), ['Base sixty-four <ok>']);
});

test('a file with no word/document.xml is not a Word document', async () => {
  const notWord = Buffer.from('%PDF-1.4');
  assert.throws(() => wordDocumentWords(notWord), /Not a zip file/);
});
