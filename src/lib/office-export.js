/*
 * Canonical MS Office / PDF export.
 *
 * PowerPoint, Word and Excel are NEVER reconstructed from arbitrary HTML here.
 * The preview carries a signed-by-structure Quantora manifest containing the
 * exact structured Office specification that produced it. We first reuse the
 * already-verified server artifact from the in-memory cache; if that artifact is
 * no longer available (for example after a page refresh), we deterministically
 * recompile the SAME specification on the server and verify the returned
 * envelope before downloading it.
 *
 * This deliberately fails closed. A missing/mismatched manifest does not fall
 * back to text scraping, because a degraded Office file is worse than a clear
 * error: the user must never see a rich preview and receive a plain document.
 * PDF remains browser print-to-PDF because it is not an OOXML Office artifact.
 */

import { OFFICE_CLIENT_COMPILE_ABORT_MS } from '../../api/_lib/office-generation-budget.js';
import { OFFICE_KIND, sanitizeOfficeFilename } from './office-intent.js';
import {
  cacheOfficeArtifact,
  downloadOfficeArtifact,
  extractOfficeManifest,
  getCachedOfficeArtifact,
  manifestMatchesPreview,
  validateOfficeArtifactEnvelope,
} from './office-artifact-cache.js';

async function parseJsonResponse(res) {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(res.status === 504
      ? 'The verified Office compiler timed out. Please try again.'
      : 'The verified Office compiler returned an unreadable response. Please try again.');
  }
}

async function compileCanonicalOffice(kind, html) {
  const manifest = extractOfficeManifest(html);
  if (!manifest) {
    throw new Error('This preview is not bound to a verified Office specification. Regenerate the document once before downloading; Quantora will not create a lower-fidelity fallback.');
  }
  if (manifest.kind !== kind) {
    throw new Error(`Preview/export mismatch: this preview is ${manifest.kind}, not ${kind}. Regenerate the requested Office document.`);
  }
  if (!manifestMatchesPreview(html, manifest)) {
    throw new Error('The preview changed after the Office artifact was compiled. Regenerate it before download so Preview and Download stay identical.');
  }

  const cached = getCachedOfficeArtifact(manifest.previewFingerprint);
  if (cached) {
    const cachedValidation = validateOfficeArtifactEnvelope(cached, kind, manifest.previewFingerprint);
    if (cachedValidation.valid) return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFFICE_CLIENT_COMPILE_ABORT_MS);
  try {
    const res = await fetch('/api/generate-office', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: kind,
        compileOnly: true,
        spec: manifest.spec,
      }),
    });
    const artifact = await parseJsonResponse(res);
    if (!res.ok) throw new Error(artifact.error || 'Verified Office compilation failed.');

    const validation = validateOfficeArtifactEnvelope(artifact, kind, manifest.previewFingerprint);
    if (!validation.valid) {
      throw new Error(`Verified Office compilation was rejected: ${validation.issues.join(' ')}`);
    }
    cacheOfficeArtifact(artifact);
    return artifact;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('The verified Office compiler took too long. No degraded fallback was created; please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function exportPptx(html) {
  const artifact = await compileCanonicalOffice(OFFICE_KIND.POWERPOINT, html);
  downloadOfficeArtifact(artifact);
}

export async function exportDocx(html) {
  const artifact = await compileCanonicalOffice(OFFICE_KIND.WORD, html);
  downloadOfficeArtifact(artifact);
}

export async function exportXlsx(html) {
  const artifact = await compileCanonicalOffice(OFFICE_KIND.EXCEL, html);
  downloadOfficeArtifact(artifact);
}

export async function exportPdf(html, filenameBase) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to export PDF.');
  const full = /<html[\s>]/i.test(html)
    ? html
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filenameBase}</title></head><body>${html || ''}</body></html>`;
  w.document.open();
  w.document.write(full);
  w.document.close();
  await new Promise((resolve) => setTimeout(resolve, 400));
  w.focus();
  w.print();
}

const EXPORTERS = {
  [OFFICE_KIND.POWERPOINT]: exportPptx,
  [OFFICE_KIND.EXCEL]: exportXlsx,
  [OFFICE_KIND.WORD]: exportDocx,
  [OFFICE_KIND.PDF]: exportPdf,
};

export async function exportOffice(kind, { html, filename } = {}) {
  const exporter = EXPORTERS[kind];
  if (!exporter) throw new Error(`Unsupported export type: ${kind}`);
  const base = sanitizeOfficeFilename(filename, `quantora-${kind}`);
  await exporter(html, base);
}
