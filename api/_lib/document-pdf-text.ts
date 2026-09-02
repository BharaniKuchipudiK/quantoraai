/**
 * Provider-neutral PDF text extraction used by source-aware Quantora domains.
 *
 * This module preserves page boundaries so downstream experiences can ground
 * explanations and citations to the page the learner actually uploaded.
 * It deliberately does NOT perform OCR. A scanned/image-only PDF fails closed
 * with `source_pdf_empty`; OCR belongs behind a separate explicit adapter.
 *
 * Safety/truth properties:
 * - page cap is checked before extraction;
 * - text cap rejects the whole document, never truncates it;
 * - encrypted/unreadable documents have named failure reasons;
 * - empty pages are retained in page numbering but contain empty text;
 * - no workspace, learner, mastery, or evidence semantics live here.
 */

export const DOCUMENT_PDF_TEXT_VERSION = 'document-pdf-text-2026-09-02.1';

export const DOCUMENT_PDF_MAX_PAGES = 60;
export const DOCUMENT_PDF_MAX_TEXT_CHARS = 800_000;

export type DocumentPdfPage = {
  pageNumber: number;
  text: string;
};

export type DocumentPdfTextResult = {
  ok: boolean;
  text?: string;
  pages?: DocumentPdfPage[];
  pageCount?: number;
  reason?:
    | 'source_pdf_support_unavailable'
    | 'source_pdf_encrypted'
    | 'source_pdf_unreadable'
    | 'source_pdf_too_many_pages'
    | 'source_pdf_text_too_large'
    | 'source_pdf_empty';
};

export async function extractDocumentPdfText(bytes: Uint8Array): Promise<DocumentPdfTextResult> {
  let getDocument: any;
  try {
    ({ getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'));
  } catch {
    return { ok: false, reason: 'source_pdf_support_unavailable' };
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
    const name = String(err?.name || '');
    return {
      ok: false,
      reason: name === 'PasswordException' ? 'source_pdf_encrypted' : 'source_pdf_unreadable',
    };
  }

  try {
    if (doc.numPages > DOCUMENT_PDF_MAX_PAGES) {
      return { ok: false, pageCount: doc.numPages, reason: 'source_pdf_too_many_pages' };
    }

    const pages: DocumentPdfPage[] = [];
    let totalChars = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = (content?.items || [])
        .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      totalChars += pageText.length;
      if (totalChars > DOCUMENT_PDF_MAX_TEXT_CHARS) {
        return { ok: false, pageCount: doc.numPages, reason: 'source_pdf_text_too_large' };
      }
      pages.push({ pageNumber, text: pageText });
    }

    const text = pages.map((page) => page.text).filter(Boolean).join('\n').trim();
    if (!text) return { ok: false, pageCount: doc.numPages, reason: 'source_pdf_empty' };
    return { ok: true, text, pages, pageCount: doc.numPages };
  } catch {
    return { ok: false, reason: 'source_pdf_unreadable' };
  } finally {
    try { await doc?.destroy?.(); } catch { /* no-op */ }
  }
}
