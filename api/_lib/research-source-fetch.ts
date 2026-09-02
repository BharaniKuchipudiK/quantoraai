import { fetchWithTimeout } from "./fetch-timeout.js";
import { admitResearchSourceUrl } from "./research-claim-verifier.js";
import { extractResearchPdfText } from "./research-pdf-text.js";

/**
 * Fetches a cited source for the Research desk's verification pass and turns
 * it into plain text the deterministic verifier can search.
 *
 * Every hop is re-admitted through the same URL policy the verifier uses —
 * a public https page is free to redirect, but never into an IP literal, an
 * internal-looking name, or plain http. Grounding redirect URLs
 * (vertexaisearch.cloud.google.com) resolve to the publisher through exactly
 * this path. Redirects are followed manually so each target is checked
 * BEFORE it is fetched; automatic following would happily walk into the
 * metadata service.
 *
 * A fetch that fails, times out, oversizes, or serves a non-text type does
 * not throw — it reports why, and the claims citing it stay unverified with
 * that reason. A refused lookup is not an outage.
 */

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 800_000;
const MAX_PDF_BYTES = 15_000_000;
const TEXTUAL_CONTENT = /^(?:text\/(?:html|plain)|application\/xhtml\+xml)\s*(?:;|$)/i;
const PDF_CONTENT = /^application\/pdf\s*(?:;|$)/i;

/**
 * Read a binary body without ever holding more than `maxBytes` of it.
 * `response.arrayBuffer()` materializes the WHOLE untrusted body before any
 * size check can run, so a chunked response that omits or understates
 * Content-Length could exhaust the function's memory inside the cap's blind
 * spot. Streaming closes it: the read aborts the moment the running total
 * passes the cap. A response with no readable stream (older fetch shims,
 * test fakes) falls back to arrayBuffer plus the same post-check — the cap
 * holds either way; only the failure mode's memory profile differs.
 */
async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<{ ok: boolean; bytes?: Uint8Array; reason?: "too_large" | "read_failed" }> {
  const stream = (response as any).body;
  if (stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch { /* the refusal stands regardless */ }
          return { ok: false, reason: "too_large" };
        }
        chunks.push(chunk);
      }
    } catch {
      return { ok: false, reason: "read_failed" };
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, bytes };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    return { ok: false, reason: "read_failed" };
  }
  if (buffer.byteLength > maxBytes) return { ok: false, reason: "too_large" };
  return { ok: true, bytes: new Uint8Array(buffer) };
}

export type ResearchSourceFetchResult = {
  ok: boolean;
  url: string;
  finalUrl?: string;
  text?: string;
  reason?: string;
};

/** Minimal, dependency-free HTML → readable text. */
export function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code);
      return point > 31 && point < 1_114_112 ? String.fromCodePoint(point) : " ";
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export async function fetchResearchSourceText(
  sourceUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetchWithTimeout(input as string, init ?? {}, FETCH_TIMEOUT_MS),
): Promise<ResearchSourceFetchResult> {
  const admission = admitResearchSourceUrl(sourceUrl);
  if (!admission.ok || !admission.url) {
    return { ok: false, url: String(sourceUrl || ""), reason: admission.reason || "source_url_invalid" };
  }

  const admittedUrl = admission.url;
  let currentUrl = admittedUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        headers: { Accept: "text/html,application/xhtml+xml,application/pdf,text/plain" },
      });
    } catch {
      return { ok: false, url: admittedUrl, reason: "source_fetch_failed" };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, url: admittedUrl, reason: "source_redirect_missing_target" };
      let next: string;
      try {
        next = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, url: admittedUrl, reason: "source_redirect_invalid" };
      }
      const nextAdmission = admitResearchSourceUrl(next);
      if (!nextAdmission.ok || !nextAdmission.url) {
        return { ok: false, url: admittedUrl, reason: `redirect_${nextAdmission.reason || "source_url_invalid"}` };
      }
      currentUrl = nextAdmission.url;
      continue;
    }

    if (!response.ok) return { ok: false, url: admittedUrl, reason: `source_http_${response.status}` };

    const contentType = response.headers.get("content-type") || "";

    // PDFs get their text layer extracted — papers, filings and reports are
    // where the best evidence lives. Byte cap first, extraction second, and
    // every failure keeps its named reason.
    if (PDF_CONTENT.test(contentType)) {
      const declaredPdfLength = Number(response.headers.get("content-length") || 0);
      if (declaredPdfLength > MAX_PDF_BYTES) {
        return { ok: false, url: admittedUrl, reason: "source_pdf_too_large" };
      }
      const read = await readBodyCapped(response, MAX_PDF_BYTES);
      if (!read.ok || !read.bytes) {
        return {
          ok: false,
          url: admittedUrl,
          reason: read.reason === "too_large" ? "source_pdf_too_large" : "source_read_failed",
        };
      }
      const extracted = await extractResearchPdfText(read.bytes);
      if (!extracted.ok || !extracted.text) {
        return { ok: false, url: admittedUrl, reason: extracted.reason || "source_pdf_unreadable" };
      }
      if (extracted.text.length > MAX_BODY_CHARS) {
        return { ok: false, url: admittedUrl, reason: "source_too_large" };
      }
      return { ok: true, url: admittedUrl, finalUrl: currentUrl, text: extracted.text };
    }

    if (!TEXTUAL_CONTENT.test(contentType)) {
      return { ok: false, url: admittedUrl, reason: "source_not_textual" };
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_BODY_CHARS * 4) {
      return { ok: false, url: admittedUrl, reason: "source_too_large" };
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      return { ok: false, url: admittedUrl, reason: "source_read_failed" };
    }
    if (body.length > MAX_BODY_CHARS * 4) {
      return { ok: false, url: admittedUrl, reason: "source_too_large" };
    }

    const text = /html/i.test(contentType) ? htmlToText(body) : body.trim();
    if (!text) return { ok: false, url: admittedUrl, reason: "source_empty" };
    if (text.length > MAX_BODY_CHARS) {
      return { ok: false, url: admittedUrl, reason: "source_too_large" };
    }
    return { ok: true, url: admittedUrl, finalUrl: currentUrl, text };
  }

  return { ok: false, url: admittedUrl, reason: "source_too_many_redirects" };
}
