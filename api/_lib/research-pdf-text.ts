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
 */

export const RESEARCH_PDF_TEXT_VERSION = "research-pdf-text-2026-09-02.1";

const MAX_PAGES = 60;
const MAX_TEXT_CHARS = 800_000;

export type ResearchPdfTextResult = {
  ok: boolean;
  text?: string;
  pages?: number;
  reason?: string;
};

export async function extractResearchPdfText(bytes: Uint8Array): Promise<ResearchPdfTextResult> {
  let getDocument: any;
  try {
    ({ getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"));
  } catch (err: any) {
    console.warn("pdfjs-dist unavailable:", err?.message || err);
    return { ok: false, reason: "source_pdf_support_unavailable" };
  }

  let doc: any = null;
  try {
    doc = await getDocument({
      data: bytes,
      useSystemFonts: true,
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
