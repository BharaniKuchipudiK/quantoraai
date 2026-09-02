import { extractDocumentPdfText } from './document-pdf-text.js';

/**
 * Research compatibility adapter over the shared page-aware PDF extractor.
 * Research keeps its existing flattened-text contract while Study can consume
 * the page-preserving primitive directly.
 */
export const RESEARCH_PDF_TEXT_VERSION = 'research-pdf-text-2026-09-02.2';

export type ResearchPdfTextResult = {
  ok: boolean;
  text?: string;
  pages?: number;
  reason?: string;
};

export async function extractResearchPdfText(bytes: Uint8Array): Promise<ResearchPdfTextResult> {
  const extracted = await extractDocumentPdfText(bytes);
  if (!extracted.ok || !extracted.text) {
    return {
      ok: false,
      pages: extracted.pageCount,
      reason: extracted.reason || 'source_pdf_unreadable',
    };
  }
  return {
    ok: true,
    text: extracted.text,
    pages: extracted.pageCount,
  };
}
