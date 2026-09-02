import assert from 'node:assert/strict';
import test from 'node:test';
import { extractDocumentPdfText } from './document-pdf-text.js';

function buildMinimalPdf(text: string): Uint8Array {
  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((obj, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}

test('shared PDF extraction retains page provenance while preserving flattened text', async () => {
  const result = await extractDocumentPdfText(buildMinimalPdf('Voltage is energy transferred per coulomb.'));
  assert.equal(result.ok, true);
  assert.equal(result.pageCount, 1);
  assert.deepEqual(result.pages?.map((page) => page.pageNumber), [1]);
  assert.match(result.pages?.[0]?.text || '', /Voltage is energy transferred per coulomb/);
  assert.match(result.text || '', /Voltage is energy transferred per coulomb/);
});

test('shared PDF extraction fails closed for image-only and unreadable documents', async () => {
  const empty = await extractDocumentPdfText(buildMinimalPdf(''));
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'source_pdf_empty');

  const garbage = await extractDocumentPdfText(new Uint8Array(Buffer.from('not a pdf')));
  assert.equal(garbage.ok, false);
  assert.equal(garbage.reason, 'source_pdf_unreadable');
});
