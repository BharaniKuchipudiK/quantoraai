/*
 * Real MS Office / PDF export (Roadmap: MS Office integration).
 *
 * Replaces the old approach — a runtime <script> from a raw-GitHub CDN that only
 * produced a text-scraped PowerPoint — with genuine exporters for all four
 * formats. Source of truth is the generated artifact HTML (`html`).
 *
 * Dependency notes:
 *  - XLSX (write-excel-file) and DOCX (html-docx-js) are bundled and lazy-loaded
 *    via dynamic import(), so they only ship when the user exports.
 *  - PDF uses print-to-PDF (no dependency, full CSS fidelity).
 *  - PPTX loads pptxgenjs from a PINNED official npm CDN at runtime. It is not
 *    bundled because pptxgenjs pulls a transitive (`image-size`) with an
 *    unfixable high-severity advisory (affects all versions) that would fail
 *    `npm audit --audit-level=high` in CI. The pinned jsdelivr `/npm/` URL is a
 *    large supply-chain improvement over the previous raw-GitHub `/gh/` path.
 */

import { OFFICE_KIND, sanitizeOfficeFilename } from './office-intent.js';

const PPTX_CDN = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';

function parseHtml(html) {
  return new DOMParser().parseFromString(String(html || ''), 'text/html');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── PowerPoint (pptxgenjs, pinned CDN) ─────────────────────────────────── */
async function loadPptxGenJS() {
  if (typeof window !== 'undefined' && window.PptxGenJS) return window.PptxGenJS;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PPTX_CDN;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the PowerPoint library. Check your connection and try again.'));
    document.head.appendChild(s);
  });
  if (!window.PptxGenJS) throw new Error('PowerPoint library failed to initialise.');
  return window.PptxGenJS;
}

export async function exportPptx(html, filenameBase) {
  const PptxGenJS = await loadPptxGenJS();
  const doc = parseHtml(html);
  const pptx = new PptxGenJS();

  const containers = doc.querySelectorAll('.slide, section, article');
  const blocks = containers.length ? Array.from(containers) : [doc.body];

  let made = 0;
  for (const el of blocks) {
    if (!el || !el.textContent || !el.textContent.trim()) continue;
    made += 1;
    const slide = pptx.addSlide();
    let y = 0.4;
    el.querySelectorAll('h1, h2, h3').forEach((h) => {
      if (y > 6.5) return;
      slide.addText(h.textContent.trim(), { x: 0.5, y, w: 9, fontSize: h.tagName === 'H1' ? 28 : 22, bold: true, color: '1F2937' });
      y += 0.7;
    });
    el.querySelectorAll('p').forEach((p) => {
      const t = p.textContent.trim();
      if (!t || y > 6.5) return;
      slide.addText(t, { x: 0.5, y, w: 9, fontSize: 14, color: '4B5563' });
      y += 0.5;
    });
    const bullets = Array.from(el.querySelectorAll('li')).map((li) => li.textContent.trim()).filter(Boolean);
    if (bullets.length && y <= 6.5) {
      slide.addText(bullets.map((text) => ({ text, options: { bullet: true } })), { x: 0.7, y, w: 8.6, fontSize: 14, color: '1F2937' });
    }
  }
  if (!made) throw new Error('No slide content found to export.');
  await pptx.writeFile({ fileName: `${filenameBase}.pptx` });
}

/* ── Excel (write-excel-file, bundled) ──────────────────────────────────── */
export async function exportXlsx(html, filenameBase) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const doc = parseHtml(html);
  const table = doc.querySelector('table');

  let rows;
  if (table) {
    rows = Array.from(table.rows).map((tr, ri) =>
      Array.from(tr.cells).map((cell) => ({
        value: cell.textContent.trim(),
        type: String,
        fontWeight: ri === 0 || cell.tagName === 'TH' ? 'bold' : undefined,
      })),
    );
  } else {
    // No table — fall back to one column of the text lines so the export is
    // still a real, usable sheet rather than an error.
    const lines = Array.from(doc.querySelectorAll('h1, h2, h3, p, li'))
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    if (!lines.length) throw new Error('No tabular content found to export.');
    rows = lines.map((l) => [{ value: l, type: String }]);
  }
  await writeXlsxFile(rows, { fileName: `${filenameBase}.xlsx` });
}

/* ── Word (html-docx-js, bundled) ───────────────────────────────────────── */
export async function exportDocx(html, filenameBase) {
  const mod = await import('html-docx-js-typescript');
  const asBlob = mod.asBlob || (mod.default && mod.default.asBlob);
  if (typeof asBlob !== 'function') throw new Error('Word exporter unavailable.');
  const full = /<html[\s>]/i.test(html) ? html : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html || ''}</body></html>`;
  const result = await asBlob(full);
  const blob = result instanceof Blob ? result : new Blob([result], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  downloadBlob(blob, `${filenameBase}.docx`);
}

/* ── PDF (print-to-PDF, no dependency) ──────────────────────────────────── */
export async function exportPdf(html, filenameBase) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to export PDF.');
  const full = /<html[\s>]/i.test(html) ? html : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filenameBase}</title></head><body>${html || ''}</body></html>`;
  w.document.open();
  w.document.write(full);
  w.document.close();
  await new Promise((r) => setTimeout(r, 400)); // let assets load before print
  w.focus();
  w.print();
}

const EXPORTERS = {
  [OFFICE_KIND.POWERPOINT]: exportPptx,
  [OFFICE_KIND.EXCEL]: exportXlsx,
  [OFFICE_KIND.WORD]: exportDocx,
  [OFFICE_KIND.PDF]: exportPdf,
};

/** Dispatch to the right real exporter for the given office kind. */
export async function exportOffice(kind, { html, filename } = {}) {
  const exporter = EXPORTERS[kind];
  if (!exporter) throw new Error(`Unsupported export type: ${kind}`);
  const base = sanitizeOfficeFilename(filename, `quantora-${kind}`);
  await exporter(html, base);
}
