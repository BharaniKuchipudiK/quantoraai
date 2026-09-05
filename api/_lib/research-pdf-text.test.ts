import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractResearchPdfText } from "./research-pdf-text.js";
import { fetchResearchSourceText } from "./research-source-fetch.js";
import { verifyResearchClaimEvidence } from "./research-claim-verifier.js";

const SENTENCE = "Utility-scale solar generation cost less per megawatt-hour than newly built nuclear capacity.";

/** A minimal, valid one-page PDF carrying the given ASCII text. */
function buildMinimalPdf(text: string): Uint8Array {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

function pdfResponse(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  const map = new Map(Object.entries({ "content-type": "application/pdf", ...headers })
    .map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status: 200,
    ok: true,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => { throw new Error("binary body"); },
  } as unknown as Response;
}

test("a PDF's text layer extracts into searchable prose", async () => {
  const result = await extractResearchPdfText(buildMinimalPdf(SENTENCE));
  assert.equal(result.ok, true);
  assert.equal(result.pages, 1);
  assert.match(result.text || "", new RegExp(SENTENCE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("a scanned/empty PDF reports source_pdf_empty rather than guessing; garbage is unreadable", async () => {
  const empty = await extractResearchPdfText(buildMinimalPdf(""));
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "source_pdf_empty");

  const garbage = await extractResearchPdfText(new Uint8Array(Buffer.from("not a pdf at all")));
  assert.equal(garbage.ok, false);
  assert.equal(garbage.reason, "source_pdf_unreadable");
});

test("END TO END: a quote inside a fetched PDF earns a verified standing", async () => {
  const url = "https://www.example.com/paper.pdf";
  const fetched = await fetchResearchSourceText(
    url,
    (async () => pdfResponse(buildMinimalPdf(SENTENCE))) as unknown as typeof fetch,
  );
  assert.equal(fetched.ok, true);

  const verdict = verifyResearchClaimEvidence({
    claimId: "pdf-claim",
    claimText: "Utility solar undercut new nuclear on cost in the surveyed markets.",
    sourceUrl: url,
    sourceText: fetched.text || "",
    proposedExcerpt: SENTENCE,
    stance: "supports",
  });
  assert.equal(verdict.standing, "supported");
  assert.equal(verdict.reasonCode, "supporting_excerpt_verified_in_source");
});

test("oversized PDFs are rejected by bytes, before and after reading", async () => {
  const declared = await fetchResearchSourceText(
    "https://www.example.com/huge.pdf",
    (async () => pdfResponse(buildMinimalPdf(SENTENCE), { "content-length": String(20_000_000) })) as unknown as typeof fetch,
  );
  assert.equal(declared.ok, false);
  assert.equal(declared.reason, "source_pdf_too_large");
});

test("a chunked PDF with no declared length is aborted AT the byte cap, never materialized", async () => {
  // Content-Length is attacker-controlled and optional: the pre-check can't
  // see a chunked body, so the cap must hold while READING. This response
  // streams 1 MB chunks forever and throws if anything tries to buffer it
  // whole — the fetcher has to stop on its own, at the cap.
  let chunksServed = 0;
  const chunk = new Uint8Array(1_000_000);
  const endless = {
    status: 200,
    ok: true,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/pdf" : null) },
    body: {
      getReader: () => ({
        read: async () => {
          chunksServed += 1;
          return { done: false, value: chunk };
        },
        cancel: async () => {},
      }),
    },
    arrayBuffer: async () => {
      throw new Error("the body must be streamed, never materialized whole");
    },
  } as unknown as Response;

  const result = await fetchResearchSourceText(
    "https://www.example.com/endless.pdf",
    (async () => endless) as unknown as typeof fetch,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "source_pdf_too_large");
  assert.ok(chunksServed <= 16, `read ${chunksServed} chunks; the cap must stop the stream at ~15 MB`);
});

test("a broken PDF fetched from the web keeps its named reason on the ledger", async () => {
  const result = await fetchResearchSourceText(
    "https://www.example.com/broken.pdf",
    (async () => pdfResponse(new Uint8Array(Buffer.from("%PDF-1.4 truncated garbage")))) as unknown as typeof fetch,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "source_pdf_unreadable");
});

/*
 * THE WORKER THAT NEVER SHIPPED (2026-09-05, deployed golden transaction 5).
 *
 * In Node, pdfjs loads its worker with `import(this.workerSrc)` — a computed
 * specifier no file tracer can follow — so Vercel's bundle carried pdf.mjs and
 * not pdf.worker.mjs, getDocument rejected, and every PDF in production came
 * back "not a readable PDF": the platform blamed the user's file for its own
 * missing file. Locally every test passed, because node_modules is whole.
 * Two halves, held together here: the reader names the worker's location and
 * says "reader unavailable" when it is absent, and vercel.json ships it.
 */
test("[was-red] a missing worker is the platform's fault, never the file's", async () => {
  const result = await extractResearchPdfText(buildMinimalPdf(SENTENCE), { workerPath: "/nowhere/pdf.worker.mjs" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "source_pdf_support_unavailable", "an absent worker must not read as an unreadable PDF");
});

test("[was-red] pdfjs's computed worker import is named to the bundler, and the reader points at the shipped copy", async () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const includeFiles = String(vercel?.functions?.["api/pipeline.ts"]?.includeFiles || "");
  // /api/chat is served by api/pipeline.ts; the tracer cannot see the worker,
  // so the function's includeFiles must name it (and the font/CMap data the
  // reader points at for non-embedded and CID fonts).
  assert.match(includeFiles, /pdfjs-dist\/\{legacy\/build\/pdf\.worker\.mjs,cmaps\/\*\*,standard_fonts\/\*\*\}/,
    `api/pipeline.ts must ship pdfjs's worker, cmaps and standard_fonts; includeFiles is ${JSON.stringify(includeFiles)}`);

  const result = await extractResearchPdfText(buildMinimalPdf(SENTENCE));
  assert.equal(result.ok, true);
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerSrc = String(pdfjs.GlobalWorkerOptions.workerSrc || "");
  assert.match(workerSrc, /^file:\/\/.*\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs$/, "the reader must point pdfjs at an absolute worker file, not a relative import");
  assert.equal(fs.existsSync(fileURLToPath(workerSrc)), true, "and that file must exist where the reader says it is");
});
