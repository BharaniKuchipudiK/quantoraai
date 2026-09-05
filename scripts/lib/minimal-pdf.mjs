/**
 * A minimal, valid one-page PDF carrying the given ASCII text — enough for a
 * text-layer extractor, small enough to build in memory in a gate. Shared by
 * the deployed golden (a document-grounded build) so no binary fixture lives
 * in the repo.
 */
export function buildMinimalPdf(text) {
  const escaped = String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
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
  const offsets = [0];
  objects.forEach((obj, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
