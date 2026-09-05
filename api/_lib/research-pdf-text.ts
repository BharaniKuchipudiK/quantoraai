/**
 * PDF → searchable text for the Research desk's evidence pipeline.
 *
 * Most of the best evidence — papers, filings, standards, reports — lives in
 * PDFs, and until this module the fetcher refused them (`source_not_textual`),
 * which capped verification recall at whatever happened to be HTML. This
 * extracts the text layer so the deterministic verifier can search it.
 *
 * Honesty properties:
 * - Extraction is the PDF's own text layer, never OCR: a scanned image PDF
 *   yields no text and reports `source_pdf_empty` rather than a guess.
 * - Caps are enforced and oversize is rejected, not truncated — the page
 *   cap stops runaway documents BEFORE extraction, so a partially extracted
 *   text can never silently verify against a truncated corpus. (The byte cap
 *   lives in the fetcher, which sees the body first.)
 * - Encrypted or unparseable files fail closed with a named reason.
 *
 * pdfjs-dist is imported lazily: the chat handler pulls this module on every
 * cold start via the research routes, and non-PDF turns should not pay for
 * parsing a 2 MB library they will not use.
 *
 * THE WORKER THAT NEVER SHIPPED (2026-09-05). In Node, pdfjs loads its worker
 * with `import(this.workerSrc)` — a computed specifier no file tracer follows —
 * so Vercel's function bundle carried pdf.mjs and not pdf.worker.mjs. Every
 * getDocument rejected, and every PDF in production read as "not a readable
 * PDF": the platform blamed the user's file for its own missing file, while
 * every local test passed against a whole node_modules. The deployed golden's
 * document-grounded transaction is what caught it. Two halves, each owed:
 * this module names the worker's absolute location (and says "reader
 * unavailable" when it is absent, never "unreadable"), and vercel.json ships
 * the worker with the pipeline function, because the tracer cannot.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const RESEARCH_PDF_TEXT_VERSION = "research-pdf-text-2026-09-05.1";

const require = createRequire(import.meta.url);

/**
 * Where pdfjs's worker and data files live in THIS deployment. Resolved from
 * the one file the bundle is certain to hold — pdf.mjs, which this module
 * imports by a static string — never from package.json (a deep import does
 * not ship it) and never from a relative path pdf.mjs guesses at.
 */
export function pdfjsAssetLocations(): { worker: string; cmaps: string; standardFonts: string } {
  const root = path.resolve(path.dirname(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")), "..", "..");
  return {
    worker: path.join(root, "legacy", "build", "pdf.worker.mjs"),
    // Trailing separator: pdfjs concatenates the file name onto these.
    cmaps: `${path.join(root, "cmaps")}${path.sep}`,
    standardFonts: `${path.join(root, "standard_fonts")}${path.sep}`,
  };
}

const MAX_PAGES = 60;
const MAX_TEXT_CHARS = 800_000;

export type ResearchPdfTextResult = {
  ok: boolean;
  text?: string;
  pages?: number;
  reason?: string;
};

export async function extractResearchPdfText(
  bytes: Uint8Array,
  options: { workerPath?: string } = {},
): Promise<ResearchPdfTextResult> {
  let pdfjs: any;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (err: any) {
    console.warn("pdfjs-dist unavailable:", err?.message || err);
    return { ok: false, reason: "source_pdf_support_unavailable" };
  }

  let assets: ReturnType<typeof pdfjsAssetLocations>;
  try {
    assets = pdfjsAssetLocations();
  } catch (err: any) {
    console.warn("pdfjs-dist package not resolvable:", err?.message || err);
    return { ok: false, reason: "source_pdf_support_unavailable" };
  }
  const workerPath = options.workerPath || assets.worker;
  if (!existsSync(workerPath)) {
    // A deployment fault, said as one. "Unreadable" here would blame the file.
    console.warn(`pdfjs worker missing at ${workerPath} — the function bundle did not ship it (vercel.json includeFiles).`);
    return { ok: false, reason: "source_pdf_support_unavailable" };
  }
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  let doc: any = null;
  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      // The bundled data, not the system's: a serverless runtime has no fonts
      // to fall back on, and a CID-keyed font needs its CMap from disk.
      useSystemFonts: false,
      standardFontDataUrl: assets.standardFonts,
      cMapUrl: assets.cmaps,
      cMapPacked: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    }).promise;
  } catch (err: any) {
    const name = String(err?.name || "");
    return {
      ok: false,
      reason: name === "PasswordException" ? "source_pdf_encrypted" : "source_pdf_unreadable",
    };
  }

  try {
    if (doc.numPages > MAX_PAGES) {
      return { ok: false, pages: doc.numPages, reason: "source_pdf_too_many_pages" };
    }
    const pageTexts: string[] = [];
    let totalChars = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = (content?.items || [])
        .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      totalChars += pageText.length;
      if (totalChars > MAX_TEXT_CHARS) {
        // Reject, never truncate: a clipped corpus could drop the negating
        // page and let a partial match verify.
        return { ok: false, pages: doc.numPages, reason: "source_pdf_text_too_large" };
      }
      if (pageText) pageTexts.push(pageText);
    }
    const text = pageTexts.join("\n").trim();
    if (!text) return { ok: false, pages: doc.numPages, reason: "source_pdf_empty" };
    return { ok: true, text, pages: doc.numPages };
  } catch {
    return { ok: false, reason: "source_pdf_unreadable" };
  } finally {
    try { await doc?.destroy?.(); } catch { /* nothing to release */ }
  }
}
