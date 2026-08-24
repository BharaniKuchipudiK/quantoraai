/** HTML extraction and live-preview button state for studio chat messages. */

import { parseVFSFromMarkdown, isolateHtmlDocument } from './vfs-parser.js';
import { pickPreviewEntry, pickPreviewEntryPath, prepareCodeForPreview } from './preview-utils.js';
import { isInlineReactRuntimeCode } from './project-runtime-preview.js';
import {
  injectMissingShopPhotos,
  injectProductCatalogImages,
} from './preview-images.js';
import { injectShopCommerceUi } from './shop-preview-ui.js';
import { deskChecksRegressed, probeRunningDesk } from './studio-desk-context.js';

function isHtmlDocument(source = '') {
  return /<!DOCTYPE html>/i.test(source) || /<html[\s>]/i.test(source);
}

function extractUnfencedHtml(rawText) {
  return isolateHtmlDocument(rawText);
}

/**
 * One pipeline for every generated artifact: fenced VFS, single HTML file,
 * or unfenced HTML document. Callers must not pick the first markdown fence.
 */
export function assembleStudioPreview(rawText, currentVfs = {}) {
  if (!rawText || typeof rawText !== 'string') return { vfs: {}, code: '' };

  const vfs = parseVFSFromMarkdown(rawText, currentVfs);
  if (Object.keys(vfs).length > 0) {
    return { vfs, code: pickPreviewEntry(vfs) };
  }

  const html = extractUnfencedHtml(rawText);
  if (html) {
    return {
      vfs: { 'index.html': { content: html, language: 'html' } },
      code: html,
    };
  }

  return { vfs: {}, code: '' };
}

/**
 * Apply a chat turn onto the desk. A follow-up that only sends one file
 * keeps the rest of the project. A first build does not force the desk open.
 */
export function applyWorkspaceFromChat(rawText, currentVfs = {}, job = null) {
  const assembled = assembleStudioPreview(rawText, currentVfs);
  const hadProject = Object.keys(currentVfs || {}).some(
    (path) => path && currentVfs[path] && typeof currentVfs[path].content === 'string',
  );
  const ensured = ensureShopDeskInVfs(assembled.vfs);
  const vfs = ensured.vfs;
  const code = pickPreviewEntry(vfs) || assembled.code;
  const didUpdate = Object.keys(vfs).length > 0 && Boolean(code);
  if (hadProject && didUpdate) {
    const before = probeRunningDesk({ html: pickPreviewEntry(currentVfs), vfs: currentVfs, job });
    const after = probeRunningDesk({ html: pickPreviewEntry(vfs) || code, vfs, job });
    if (deskChecksRegressed(before.checks, after.checks)) {
      return {
        vfs: currentVfs,
        code: pickPreviewEntry(currentVfs),
        didUpdate: false,
        reopenDesk: false,
        rejected: true,
      };
    }
  }
  return {
    vfs,
    code,
    didUpdate,
    reopenDesk: hadProject && didUpdate,
    rejected: false,
  };
}

export function vfsLooksLikeShop(vfs = {}) {
  if (vfs['products.json'] && typeof vfs['products.json'].content === 'string') {
    const raw = vfs['products.json'].content;
    if (/"priceCents"\s*:|"currency"\s*:\s*"(?:inr|usd|sgd|aud|aed)"/i.test(raw)) return true;
  }
  const html = pickPreviewEntry(vfs);
  // Match desk shop classification — bare "catalog" is not enough.
  return /\b(add[\s-]?to[\s-]?(?:bag|cart)|boutique|saree|sari|kanjeevaram|atelier|priceCents|storefront|e-?commerce)\b/i.test(html);
}

export function userAskedForPreviewPhotos(text = '') {
  return /\b(no images|images?|photos?|pictures?|visuals?)\b/i.test(String(text || ''));
}

export function userAskedForShopDeskFix(text = '') {
  const src = String(text || '');
  return userAskedForPreviewPhotos(src)
    || /\b(currency|converter|usd|sgd|aud|aed|add to cart|add to bag|shopping bag)\b/i.test(src);
}

export function userAskedForDeskReview(text = '') {
  return /\breview(?:\s+this|\s+the\s+(?:desk|preview|page|shop))?\s*$/i.test(String(text || '').trim())
    || /^review this\b/i.test(String(text || '').trim());
}

/**
 * Review applies a surgical desk patch before any LLM rewrite.
 * Shop photos/cart/currency are deterministic. Reject if a passing probe would regress.
 */
export function applyDeskReviewPatch(vfs = {}, job = null) {
  const before = probeRunningDesk({ html: pickPreviewEntry(vfs), vfs, job });
  const ensured = ensureShopDeskInVfs(vfs);
  const after = probeRunningDesk({ html: pickPreviewEntry(ensured.vfs), vfs: ensured.vfs, job });
  if (deskChecksRegressed(before.checks, after.checks)) {
    return {
      vfs,
      changed: false,
      rejected: true,
      checks: before.checks,
      nextBeat: before.nextBeat,
    };
  }
  return {
    vfs: ensured.vfs,
    changed: ensured.changed,
    rejected: false,
    checks: after.checks,
    nextBeat: after.nextBeat,
  };
}

export function ensureShopPhotosInVfs(vfs = {}) {
  if (!vfsLooksLikeShop(vfs)) return { vfs, changed: false };
  const next = { ...vfs };
  let changed = false;
  const htmlPath = pickPreviewEntryPath(next);
  if (htmlPath && next[htmlPath] && typeof next[htmlPath].content === 'string') {
    const result = injectMissingShopPhotos(next[htmlPath].content);
    if (result.html !== next[htmlPath].content) {
      next[htmlPath] = { ...next[htmlPath], content: result.html };
      changed = true;
    }
  }
  if (next['products.json'] && typeof next['products.json'].content === 'string') {
    const catalog = injectProductCatalogImages(next['products.json'].content);
    if (catalog.changed) {
      next['products.json'] = { ...next['products.json'], content: catalog.text };
      changed = true;
    }
  }
  return { vfs: next, changed };
}

/** Photos, currency, and Add to Cart belong on the running desk, not only in chat. */
export function ensureShopDeskInVfs(vfs = {}) {
  const withPhotos = ensureShopPhotosInVfs(vfs);
  if (!vfsLooksLikeShop(withPhotos.vfs)) return withPhotos;
  const next = { ...withPhotos.vfs };
  const htmlPath = pickPreviewEntryPath(next);
  if (!htmlPath || !next[htmlPath] || typeof next[htmlPath].content !== 'string') return withPhotos;
  const ui = injectShopCommerceUi(next[htmlPath].content);
  if (!ui.changed) return withPhotos;
  next[htmlPath] = { ...next[htmlPath], content: ui.html };
  return { vfs: next, changed: true };
}

/** Preview runs the project, not the file currently open in the editor. */
export function runningPreviewCode(vfs = {}, fallback = '') {
  return pickPreviewEntry(vfs) || String(fallback || '');
}

/**
 * A healed Preview is the product. Write it into the project files so Review
 * and reload match what is running. React source is not overwritten with HTML.
 */
export function writeHealedPreviewToVfs(vfs = {}, healed = '', job = null) {
  const html = String(healed || '').trim();
  if (!html) return { vfs: { ...(vfs || {}) }, wrote: false, path: null };
  const asHtml = isHtmlDocument(html);
  let path = pickPreviewEntryPath(vfs);
  if (!path || (asHtml && /\.(jsx|tsx|js|ts)$/i.test(path))) {
    path = 'index.html';
  }
  const next = { ...(vfs || {}) };
  next[path] = {
    content: html,
    language: asHtml || /\.html$/i.test(path) ? 'html' : (next[path]?.language || ''),
  };
  const withDesk = ensureShopDeskInVfs(next);
  const before = probeRunningDesk({ html: pickPreviewEntry(vfs), vfs, job });
  const after = probeRunningDesk({ html: pickPreviewEntry(withDesk.vfs), vfs: withDesk.vfs, job });
  if (deskChecksRegressed(before.checks, after.checks)) {
    return { vfs: { ...(vfs || {}) }, wrote: false, path: null, rejected: true };
  }
  return { vfs: withDesk.vfs, wrote: true, path };
}

export function extractHtmlFromResponse(rawText) {
  const { vfs, code } = assembleStudioPreview(rawText);
  const htmlFile = vfs['index.html']?.content
    || Object.entries(vfs).find(([name]) => /\.html$/i.test(name))?.[1]?.content;
  if (htmlFile) return String(htmlFile).trim();
  return isHtmlDocument(code) ? String(code).trim() : '';
}

export function extractRunnableCode(rawText) {
  const { code } = assembleStudioPreview(rawText);
  if (code) return code;
  if (isInlineReactRuntimeCode(rawText)) return String(rawText).trim();
  return null;
}

const BROWSER_ENTRY = /(?:^|\/)(?:index\.html|presentation\.html|App\.jsx|App\.tsx|src\/App\.jsx|src\/App\.tsx|src\/main\.jsx|src\/main\.tsx)$/i;

function vfsHasBrowserPreview(vfs = {}) {
  const names = Object.keys(vfs);
  if (names.some((name) => BROWSER_ENTRY.test(name))) return true;
  if (names.some((name) => /\.html$/i.test(name))) return true;
  return names.some((name) => isHtmlDocument(vfs[name]?.content) || isInlineReactRuntimeCode(vfs[name]?.content));
}

/**
 * Live Preview only opens for artifacts the sandbox can actually run.
 * Native sources (Swift, Kotlin, etc.) stay in chat until a browser replica exists.
 */
export function canOpenStudioPreviewPane(rawText, currentVfs = {}) {
  if (!rawText || typeof rawText !== 'string') return false;
  const assembled = assembleStudioPreview(rawText, currentVfs);
  if (isHtmlDocument(assembled.code) || isInlineReactRuntimeCode(assembled.code || rawText)) return true;
  return vfsHasBrowserPreview(assembled.vfs);
}

export function hasPreviewableContent(rawText) {
  return canOpenStudioPreviewPane(rawText);
}

export function preparePreviewHtml(rawText, imageMap = new Map()) {
  const assembled = assembleStudioPreview(rawText);
  let html = extractHtmlFromResponse(rawText) || assembled.code;
  if (!html || !isHtmlDocument(html)) return '';
  if (imageMap.size) {
    for (const [token, dataUrl] of imageMap) html = html.split(token).join(dataUrl);
  }
  return prepareCodeForPreview(html, assembled.vfs);
}

export function getLivePreviewButtonMeta(msg, { isGenerating, streamingMessageId }) {
  if (!hasPreviewableContent(msg.text)) return null;
  if (isGenerating && msg.id === streamingMessageId) {
    return { disabled: true, label: 'Building…', title: 'Still generating the response' };
  }
  const status = msg.previewStatus;
  if (!status) {
    return { disabled: false, label: 'Open Live Preview', title: 'Open the sandbox preview' };
  }
  if (status === 'running' || status === 'verifying' || status === 'healing') {
    return { disabled: true, label: 'Verifying preview…', title: 'Running sandbox checks before preview opens' };
  }
  if (status === 'clean') {
    return { disabled: false, label: 'Open Live Preview', title: 'Verified — runs clean' };
  }
  if (status === 'degraded') {
    return { disabled: false, label: 'Open Live Preview', title: 'Preview ready — styling may be incomplete' };
  }
  if (status === 'failed') {
    return { disabled: false, label: 'Open Live Preview', title: 'Preview may have runtime errors' };
  }
  return { disabled: false, label: 'Open Live Preview', title: 'Open the sandbox preview' };
}
