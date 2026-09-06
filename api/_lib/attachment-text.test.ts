import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { readZipEntries } from './office-zip.js';
import { buildMinimalPdf as buildMinimalPdfBuffer, bylawsFixtureText, wrapPdfLines, PDF_LINE_CHARS } from '../../scripts/lib/minimal-pdf.mjs';

/*
 * The one PDF builder the deployed golden and the attachments browser gate
 * use, so this test reads the same bytes the real turn attaches. It returns a
 * Node Buffer for Playwright's file input; pdf.js wants a plain Uint8Array.
 */
const buildMinimalPdf = (text: string): Uint8Array => new Uint8Array(buildMinimalPdfBuffer(text));
import {
  attachmentKindFor,
  buildAttachedDocumentsBlock,
  extractAttachmentText,
  readAttachedDocuments,
  summarizeAttachmentReads,
  MAX_DOCUMENT_CHARS,
} from './attachment-text.js';

/*
 * ---------------------------------------------------------------------------
 * DOCUMENTS ATTACHED TO CHAT ARE READ, OR NAMED AS UNREADABLE — NEVER DROPPED.
 *
 * 2026-09-05: four association documents (bylaws PDF, a scanned registration
 * certificate, a member form PDF, a spreadsheet) were attached to one chat
 * turn. The browser dropped every one with "(not a readable image)" and the
 * model, told nothing, asked the user how to get them. Every fixture here is
 * built in memory — a PDF by hand, Office files as the ZIP-of-XML they are —
 * so this gate needs no binaries in the repo and no model.
 * ---------------------------------------------------------------------------
 */


/** Office files are ZIP archives of XML; build one in memory with the platform's own ZIP writer. */
async function zipOf(files: Record<string, string | Buffer>, level = 6): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const out = new PassThrough();
  out.on('data', (chunk) => chunks.push(chunk));
  const archive = new ZipArchive({ zlib: { level } });
  archive.pipe(out);
  for (const [name, content] of Object.entries(files)) archive.append(content, { name });
  const ended = new Promise<void>((resolve) => out.on('end', () => resolve()));
  await archive.finalize();
  await ended;
  return new Uint8Array(Buffer.concat(chunks));
}

const XLSX_FILES = {
  '[Content_Types].xml': '<Types/>',
  'xl/workbook.xml': '<workbook><sheets><sheet name="Members" sheetId="1" r:id="rId1"/><sheet name="Dues &amp; Fees" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Flat</t></si><si><t>Owner</t></si><si><r><t>A-</t></r><r><t>101</t></r></si><si><t>Ramesh &amp; Co</t></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Maintenance</t></is></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><f>SUM(1,2)</f><v>2500</v></c><c r="D2" t="b"><v>1</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Quarter</t></is></c><c r="B1"><v>4</v></c></row></sheetData></worksheet>',
};

test('a PDF\'s text layer is read; a scanned page is named as unreadable, never guessed', async () => {
  const bylaws = await extractAttachmentText({ name: 'Bylaws.pdf', mimeType: 'application/pdf', bytes: buildMinimalPdf('Registration number RKV-2019-0417 applies.') });
  assert.equal(bylaws.ok, true);
  assert.equal(bylaws.kind, 'pdf');
  assert.match(bylaws.text, /RKV-2019-0417/);
  assert.match(bylaws.detail, /1 pages/);

  const scanned = await extractAttachmentText({ name: 'Assn Regn Certificate.pdf', bytes: buildMinimalPdf('') });
  assert.equal(scanned.ok, false);
  assert.equal(scanned.reason, 'source_pdf_empty');
  assert.match(scanned.detail, /no text layer/);
});

test('a spreadsheet becomes CSV per sheet — shared strings, inline strings, cached formula values, booleans, sheet names', async () => {
  const bytes = await zipOf(XLSX_FILES);
  const result = await extractAttachmentText({ name: 'RK Venuzia EC Body details.xlsx', bytes });
  assert.equal(result.ok, true, result.detail);
  assert.equal(result.kind, 'spreadsheet');
  assert.equal(result.sheets, 2);
  assert.match(result.text, /## Sheet: Members/);
  assert.match(result.text, /Flat,Owner,Maintenance/);
  assert.match(result.text, /A-101,Ramesh & Co,2500,TRUE/, 'rich-text runs join, entities decode, the formula\'s cached value is used');
  assert.match(result.text, /## Sheet: Dues & Fees/);
  assert.match(result.text, /Quarter,4/);
});

test('Word and PowerPoint files read as paragraphs and slides', async () => {
  const docx = await zipOf({
    'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Article 1</w:t></w:r><w:tab/><w:r><w:t xml:space="preserve">Name of the association</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>Article 2 &amp; scope</w:t></w:r></w:p></w:body></w:document>',
  });
  const word = await extractAttachmentText({ name: 'Bylaws.docx', bytes: docx });
  assert.equal(word.ok, true, word.detail);
  assert.equal(word.text, 'Article 1\tName of the association\nArticle 2 & scope');

  const pptx = await zipOf({
    'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>',
    'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Welcome </a:t></a:r><a:r><a:t>members</a:t></a:r></a:p></p:sld>',
  });
  const slides = await extractAttachmentText({ name: 'AGM.pptx', bytes: pptx });
  assert.equal(slides.ok, true, slides.detail);
  assert.equal(slides.text, '## Slide 1\nWelcome members\n\n## Slide 2\nSecond');
});

test('plain text passes through; an unsupported type says what IS readable; a broken upload is named', async () => {
  const csv = await extractAttachmentText({ name: 'dues.csv', bytes: new TextEncoder().encode('﻿flat,amount\nA-101,2500\n') });
  assert.equal(csv.ok, true);
  assert.equal(csv.text, 'flat,amount\nA-101,2500');

  const exe = await extractAttachmentText({ name: 'setup.exe', bytes: new Uint8Array([1, 2, 3]) });
  assert.equal(exe.ok, false);
  assert.equal(exe.kind, 'unsupported');
  assert.match(exe.detail, /PDF, Word, Excel, PowerPoint, CSV and plain-text/);
  assert.match(exe.detail, /not \.exe/);

  const [broken] = await readAttachedDocuments([{ name: 'x.pdf', dataUrl: 'data:application/pdf;base64,' }]);
  assert.equal(broken.ok, false);
  assert.equal(broken.reason, 'malformed');
});

test('a data URL round-trips through readAttachedDocuments', async () => {
  const pdf = buildMinimalPdf('Annual general meeting on 14 March.');
  const dataUrl = `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`;
  const [read] = await readAttachedDocuments([{ name: 'notice.pdf', mimeType: 'application/pdf', dataUrl }]);
  assert.equal(read.ok, true, read.detail);
  assert.match(read.text, /14 March/);
});

test('the ZIP reader refuses an archive that expands past its budget (bomb guard)', async () => {
  const bytes = await zipOf({ 'word/document.xml': Buffer.alloc(2 * 1024 * 1024, 0x41) }, 9);
  assert.throws(() => readZipEntries(bytes, { maxTotalBytes: 1024 * 1024 }), /beyond the size budget/);
  assert.equal(readZipEntries(bytes).get('word/document.xml')?.length, 2 * 1024 * 1024, 'within the default budget it reads');
});

test('long documents are clipped with a visible marker, and the block keeps a turn budget', async () => {
  const long = await extractAttachmentText({ name: 'big.txt', bytes: new TextEncoder().encode('x'.repeat(MAX_DOCUMENT_CHARS + 500)) });
  assert.equal(long.truncated, true);
  assert.match(long.text, /truncated: showing the first 60,000 of 60,500 characters/);

  const reads = [
    await extractAttachmentText({ name: 'a.txt', bytes: new TextEncoder().encode('alpha '.repeat(20)) }),
    await extractAttachmentText({ name: 'scan.pdf', bytes: buildMinimalPdf('') }),
    await extractAttachmentText({ name: 'b.txt', bytes: new TextEncoder().encode('beta '.repeat(20)) }),
  ];
  const block = buildAttachedDocumentsBlock(reads, { totalChars: 100 });
  assert.match(block, /^ATTACHED DOCUMENTS/);
  assert.match(block, /=== 1\. a\.txt \(text · \d+ characters\) ===/);
  assert.match(block, /=== 2\. scan\.pdf — NOT READABLE: no text layer/);
  assert.match(block, /=== 3\. b\.txt — OMITTED: the attachment budget for this turn is spent ===/);
  assert.match(block, /Do not ask the user to re-send/);
  const [carried] = await readAttachedDocuments([{ name: 'bylaws.pdf', dataUrl: `data:application/pdf;base64,${Buffer.from(buildMinimalPdf('Carried text.')).toString('base64')}`, carried: true }]);
  assert.equal(carried.carried, true);
  assert.match(buildAttachedDocumentsBlock([carried]), /=== 1\. bylaws\.pdf \(attached earlier in this conversation\) \(pdf/);
  assert.equal(summarizeAttachmentReads([carried])[0].carried, true);
  assert.equal(buildAttachedDocumentsBlock([]), '');

  const summary = summarizeAttachmentReads(reads);
  assert.equal(summary.length, 3);
  assert.equal((summary[0] as any).text, undefined, 'the desk gets everything but the text');
  assert.equal(summary[1].ok, false);
  assert.equal(summary[1].reason, 'source_pdf_empty');
});

test('kinds are decided by extension first, mime second', () => {
  assert.equal(attachmentKindFor('a.PDF', ''), 'pdf');
  assert.equal(attachmentKindFor('a.xlsm', 'application/octet-stream'), 'spreadsheet');
  assert.equal(attachmentKindFor('notes', 'text/plain'), 'text');
  assert.equal(attachmentKindFor('photo.png', 'image/png'), 'unsupported');
});

/*
 * THE GOLDEN'S OWN DOCUMENT ROUND-TRIPS INTACT.
 *
 * 2026-09-06: the deployed golden's bylaws PDF came back from the server's
 * reader as its first 95 characters, cut exactly where the registration
 * number "RKV-445285-GLD" became "RKV-445". pdf.js returns nothing that lies
 * past the page edge, and the fixture had written the whole sentence as one
 * 12pt line off the right of a letter page. The model rendered what it was
 * given and the verdict blamed it, on both engines, for a day. This test reads
 * the exact fixture the golden attaches, through the exact reader the server
 * runs: with the one-line builder restored it fails naming "RKV-445".
 */
test('the deployed golden\'s bylaws PDF round-trips through the reader with its registration number intact', async () => {
  const registration = 'RKV-445285-GLD';
  const text = bylawsFixtureText(registration);
  const read = await extractAttachmentText({ name: 'rkv-bylaws.pdf', mimeType: 'application/pdf', bytes: buildMinimalPdf(text) });
  assert.equal(read.ok, true);
  assert.ok(read.text.includes(registration), `the reader returned "${read.text.slice(-40)}" — the registration number did not survive`);
  assert.equal(read.text.replace(/\s+/g, ' '), text.replace(/\s+/g, ' '), 'every word of the document must come back, in order');
});

test('the fixture wraps its lines inside the page instead of running off it', () => {
  const lines = wrapPdfLines(bylawsFixtureText('RKV-445285-GLD'));
  assert.ok(lines.length >= 3, 'a 179-character sentence needs more than two lines');
  for (const line of lines) assert.ok(line.length <= PDF_LINE_CHARS, `line too long: "${line}"`);
  assert.equal(lines.join(' '), bylawsFixtureText('RKV-445285-GLD'), 'wrapping only moves whitespace');
  // A word longer than a line is split rather than dropped or overflowed.
  assert.deepEqual(wrapPdfLines('x'.repeat(150), 72), ['x'.repeat(72), 'x'.repeat(72), 'x'.repeat(6)]);
  assert.deepEqual(wrapPdfLines(''), []);
});
