/**
 * A minimal, valid one-page PDF carrying the given ASCII text — enough for a
 * text-layer extractor, small enough to build in memory in a gate. Shared by
 * the deployed golden (a document-grounded build) and the attachments browser
 * gate, so no binary fixture lives in the repo.
 *
 * THE TEXT WRAPS INSIDE THE PAGE (2026-09-06). The first version wrote the
 * whole text as one 12pt line starting at x=72 on a 612pt-wide page. pdf.js
 * (the server's reader) returns nothing that lies past the page edge, so a
 * 179-character sentence came back as its first 95 characters — cut exactly
 * where the golden's registration number "RKV-445285-GLD" became "RKV-445".
 * The model then rendered what it was given, and the verdict blamed the model
 * for "building without reading the document" on both engines for a day. No
 * PDF writer lays text past the page edge; the fixture must not either.
 */
export const PDF_LINE_CHARS = 72;

/** Break text into lines no longer than PDF_LINE_CHARS, on spaces where possible. */
export function wrapPdfLines(text, limit = PDF_LINE_CHARS) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= limit) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
    while (current.length > limit) {
      lines.push(current.slice(0, limit));
      current = current.slice(limit);
    }
  }
  if (current) lines.push(current);
  return lines;
}

export const PDF_LINES_PER_PAGE = 46; // (792 - 2 * 72) / 14pt leading, rounded down

export function buildMinimalPdf(text) {
  const escape = (line) => String(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  // 12pt Helvetica on a 14pt leading: 72 characters stay well inside the 468pt
  // text width, and 46 lines inside the 648pt text height. Text past either
  // edge is invisible to pdf.js, so a long document becomes more pages, the
  // way every real PDF writer lays it out.
  const lines = wrapPdfLines(text);
  const pages = [];
  for (let index = 0; index < lines.length; index += PDF_LINES_PER_PAGE) pages.push(lines.slice(index, index + PDF_LINES_PER_PAGE));
  if (!pages.length) pages.push([]);

  // Objects: 1 catalog, 2 pages, 3 font, then a page and a content stream per page.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const pageRefs = [];
  pages.forEach((pageLines) => {
    const pageNumber = objects.length + 1;
    const contentNumber = pageNumber + 1;
    pageRefs.push(`${pageNumber} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNumber} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    const stream = `BT /F1 12 Tf 14 TL 72 720 Td ${pageLines.map((line) => `(${escape(line)}) Tj T*`).join(' ')} ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;

  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

export function bylawsFixtureText(registrationNumber) {
  return `Ramakrishna Venuzia Owners Welfare Association. Registered society. Registration number ${registrationNumber}. `
    + 'Annual general meeting every March. Maintenance dues are payable quarterly.';
}

/**
 * A second document for the same association, carrying a fact the bylaws do
 * not: one event, by name and code. A site built from both documents shows
 * both facts; a site missing this one read only the first attachment.
 */
export function eventCalendarFixtureText(eventCode) {
  return 'Event calendar of the Ramakrishna Venuzia Owners Welfare Association. '
    + `Golden Harvest Fair (event code ${eventCode}) on 14 November in the community hall, 10am to 4pm. `
    + 'Annual general meeting in March. Diwali lights evening in October.';
}
