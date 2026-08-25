/** HTML extraction and live-preview button state for studio chat messages. */

import { parseVFSFromMarkdown, isolateHtmlDocument } from './vfs-parser.js';
import { pickPreviewEntry, pickPreviewEntryPath, prepareCodeForPreview, vfsAssetToDataUri } from './preview-utils.js';
import { isInlineReactRuntimeCode } from './project-runtime-preview.js';
import {
  injectMissingShopPhotos,
  injectProductCatalogImages,
  scaffoldShopCatalogJson,
  countRealPreviewPhotos,
  stripInjectedShopPhotos,
  SHOP_CATALOG_CAP,
} from './preview-images.js';
import { injectShopCommerceUi, stripShopCommerceUi } from './shop-preview-ui.js';
import { deskChecksRegressed, looksLikeShopDesk, probeRunningDesk } from './studio-desk-context.js';
import { buildStudioJobCard, jobNeedsProductPhotos } from './studio-job-card.js';
import { shopCatalogScaleNote } from './shop-catalog-scale.js';

const NATIVE_SIDECAR_RE = /\.(py|swift|kt|kts|java|cs|cpp|c|m|mm|rs|go|rb)$/i;
const PREVIEW_ASSEMBLY_RE = /\.(html|css|js|jsx|tsx|json)$/i;

function isHtmlDocument(source = '') {
  return /<!DOCTYPE html>/i.test(source) || /<html[\s>]/i.test(source);
}

function vfsFileContent(vfs, path) {
  const entry = vfs?.[path];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.content === 'string') return entry.content;
  return '';
}

/** Prefer model-shipped foxwolf_*.svg files as loadable catalog photos. */
export function collectVfsShopImageDataUris(vfs = {}, limit = SHOP_CATALOG_CAP) {
  const paths = Object.keys(vfs || {})
    .filter((path) => /\.(?:svg|png|jpe?g|webp|gif)$/i.test(path))
    .filter((path) => !/(?:^|\/)(?:icon|logo|favicon|avatar|spinner)/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out = [];
  for (const path of paths) {
    if (out.length >= limit) break;
    const uri = vfsAssetToDataUri(path, vfsFileContent(vfs, path));
    if (uri && /^data:image\//i.test(uri)) out.push({ path, uri });
  }
  return out;
}

/**
 * When Review shows foxwolf_*.svg but HTML still points at relative paths (or
 * products.json has none), wire those assets in as data-URI photos so Preview
 * is not waiting on missing files forever.
 */
export function wireVfsShopImagesIntoDesk(vfs = {}, options = {}) {
  if (!vfs || typeof vfs !== 'object') return { vfs: vfs || {}, changed: false };
  const assets = collectVfsShopImageDataUris(vfs);
  if (!assets.length) return { vfs, changed: false };

  const brief = String(options?.brief || '');
  const next = { ...vfs };
  let changed = false;
  const htmlPath = pickPreviewEntryPath(next);

  if (htmlPath && next[htmlPath] && typeof next[htmlPath].content === 'string') {
    let html = next[htmlPath].content;
    let idx = 0;
    const rewritten = html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
      const src = (String(attrs).match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
      if (!src || /^data:/i.test(src) || /^(https?:)?\/\//i.test(src) || src.includes('/api/preview-image')) {
        return full;
      }
      const hit = assets.find((asset) => (
        src === asset.path
        || src.endsWith(`/${asset.path}`)
        || src.replace(/^\.\//, '') === asset.path
      )) || assets[idx % assets.length];
      idx += 1;
      if (!hit) return full;
      changed = true;
      return `<img${String(attrs).replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${hit.uri}"`)}>`;
    });
    if (rewritten !== html) {
      next[htmlPath] = { ...next[htmlPath], content: rewritten };
      html = rewritten;
    }
  }

  if (next['products.json'] && typeof next['products.json'].content === 'string') {
    try {
      const data = JSON.parse(next['products.json'].content);
      const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : null);
      if (list?.length) {
        let catalogChanged = false;
        const mapped = list.map((item, i) => {
          if (!item || typeof item !== 'object') return item;
          const image = String(item.image || '').trim();
          if (image && /^data:image\//i.test(image)) return item;
          const asset = assets[i % assets.length];
          if (!asset) return item;
          catalogChanged = true;
          return { ...item, image: asset.uri };
        });
        if (catalogChanged) {
          next['products.json'] = {
            ...next['products.json'],
            content: `${JSON.stringify(Array.isArray(data) ? mapped : { ...data, products: mapped }, null, 2)}\n`,
          };
          changed = true;
        }
      }
    } catch { /* keep */ }
  } else if (htmlPath && assets.length) {
    const brand = String(next[htmlPath]?.content || '').match(/<title>([^<]{2,80})<\/title>/i)?.[1]
      || 'Collection';
    const products = assets.slice(0, Math.min(assets.length, SHOP_CATALOG_CAP)).map((asset, i) => ({
      id: `item-${i + 1}`,
      name: `${String(brand).trim().slice(0, 40)} ${i + 1}`,
      priceCents: (1800 + i * 250) * 100,
      currency: 'inr',
      image: asset.uri,
    }));
    next['products.json'] = { content: `${JSON.stringify(products, null, 2)}\n`, language: 'json' };
    changed = true;
  }

  void brief;
  return { vfs: next, changed };
}

/** Fingerprint of files the browser Preview actually runs (not Python/native sidecars). */
export function previewAssemblyFingerprint(vfs = {}) {
  const paths = Object.keys(vfs || {})
    .filter((path) => path && PREVIEW_ASSEMBLY_RE.test(path) && !NATIVE_SIDECAR_RE.test(path))
    .sort();
  return paths.map((path) => `${path}\n${vfsFileContent(vfs, path)}`).join('\n--\n');
}

export function isNativeSidecarPath(path = '') {
  return NATIVE_SIDECAR_RE.test(String(path || ''));
}

function changedVfsPaths(before = {}, after = {}) {
  const paths = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [];
  for (const path of paths) {
    if (!path) continue;
    if (vfsFileContent(before, path) !== vfsFileContent(after, path)) changed.push(path);
  }
  return changed;
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
 *
 * Native sidecars (.py, .swift, …) may land in FILES, but Preview only runs the
 * web assembly. A refine that only touches sidecars while a browser entry
 * already exists is marked needsWebEntry so chat cannot claim a UI update.
 *
 * `brief` is the latest user ask so a calculator / Drive cleaner turn can
 * retire a leftover boutique job before shop photos are considered, and so
 * merchandise shells still get photos+cart when the model left a blank body.
 */
export function applyWorkspaceFromChat(rawText, currentVfs = {}, job = null, options = {}) {
  const brief = typeof options === 'string' ? options : String(options?.brief || '');
  const assembled = assembleStudioPreview(rawText, currentVfs);
  const hadProject = Object.keys(currentVfs || {}).some(
    (path) => path && currentVfs[path] && typeof currentVfs[path].content === 'string',
  );
  const nextJob = buildStudioJobCard({
    brief,
    vfs: assembled.vfs,
    existing: job,
  });
  // VFS merge keeps products.json from a prior boutique. Drop that bleed before
  // ensureShopDeskInVfs would paint silk stock photos onto a calculator.
  const purged = purgeStaleShopArtifacts(assembled.vfs, nextJob);
  const ensured = ensureShopDeskInVfs(purged.vfs, nextJob, { brief });
  const vfs = ensured.vfs;
  const code = pickPreviewEntry(vfs) || assembled.code;
  const didUpdate = Object.keys(vfs).length > 0 && Boolean(code);
  const changedPaths = hadProject ? changedVfsPaths(currentVfs, vfs) : Object.keys(vfs);
  const previewChanged = previewAssemblyFingerprint(currentVfs) !== previewAssemblyFingerprint(vfs);
  const onlyNativeSidecars = changedPaths.length > 0
    && changedPaths.every((path) => isNativeSidecarPath(path));
  const needsWebEntry = Boolean(hadProject && didUpdate && onlyNativeSidecars && !previewChanged);
  // Dropping a leftover boutique catalog is an intentional product switch.
  if (hadProject && didUpdate && previewChanged && !purged.changed) {
    const before = probeRunningDesk({ html: pickPreviewEntry(currentVfs), vfs: currentVfs, job: nextJob });
    const after = probeRunningDesk({ html: pickPreviewEntry(vfs) || code, vfs, job: nextJob });
    if (deskChecksRegressed(before.checks, after.checks)) {
      return {
        vfs: currentVfs,
        code: pickPreviewEntry(currentVfs),
        didUpdate: false,
        reopenDesk: false,
        rejected: true,
        needsWebEntry: false,
        previewChanged: false,
        job: nextJob,
      };
    }
  }
  return {
    vfs,
    code,
    didUpdate,
    reopenDesk: hadProject && didUpdate,
    rejected: false,
    needsWebEntry,
    previewChanged: !hadProject || previewChanged,
    job: nextJob,
    scaleNote: ensured.scaleNote || '',
  };
}

export function vfsLooksLikeShop(vfs = {}, job = null) {
  return looksLikeShopDesk({ html: pickPreviewEntry(vfs), vfs, job });
}


/** Live boutique markup on the Preview entry — not a leftover products.json alone. */
const LIVE_SHOP_ENTRY_RE = /\b(add[\s-]?to[\s-]?(?:bag|cart)|boutique|saree|sari|kanjeevaram|atelier|priceCents|storefront|e-?commerce|product-card)\b/i;

/**
 * Boutique catalog + injected Unsplash silk must not survive into a non-shop
 * desk. Sticky products.json alone used to keep looking like a shop forever.
 *
 * A mismatched job card (e.g. “shipping calculator” on a boutique) must not
 * strip real shop HTML — only purge when the Preview entry itself is non-shop.
 */
export function purgeStaleShopArtifacts(vfs = {}, job = null) {
  if (!vfs || typeof vfs !== 'object') return { vfs: {}, changed: false };
  const html = pickPreviewEntry(vfs) || '';
  if (LIVE_SHOP_ENTRY_RE.test(html) || looksLikeShopDesk({ html, vfs, job })) {
    return { vfs, changed: false };
  }
  let changed = false;
  const next = { ...vfs };
  if (next['products.json']) {
    delete next['products.json'];
    changed = true;
  }
  const htmlPath = pickPreviewEntryPath(next);
  if (htmlPath && next[htmlPath] && typeof next[htmlPath].content === 'string') {
    const cleaned = stripShopCommerceUi(stripInjectedShopPhotos(next[htmlPath].content));
    if (cleaned !== next[htmlPath].content) {
      next[htmlPath] = { ...next[htmlPath], content: cleaned };
      changed = true;
    }
  }
  return { vfs: next, changed };
}


export function userAskedForPreviewPhotos(text = '') {
  return /\b(no images|images?|photos?|pictures?|visuals?)\b/i.test(String(text || ''));
}

/** Broken / missing Preview photos — not “replace with blue dresses”. */
export function userAskedForBrokenPreviewPhotos(text = '') {
  const src = String(text || '');
  return /\b(broken|missing|not\s+(?:loading|showing|working|there)|empty\s+frames?|gold\s+frames?|blank\s+(?:white\s+)?(?:body|images?|photos?)|images?\s+(?:are\s+)?(?:still\s+)?broken|no\s+(?:product\s+)?(?:photos?|images?))\b/i.test(src)
    || /\b(?:why|how come).{0,48}\b(?:images?|photos?)\b/i.test(src);
}

/** Semantic catalog edits must reach the model, not the deterministic inject shortcut. */
export function userAskedForSemanticPhotoEdit(text = '') {
  const src = String(text || '');
  if (userAskedForBrokenPreviewPhotos(src)) return false;
  return /\b(replace|swap|change|use|make|remove|delete|redesign)\b[\s\S]{0,80}\b(photos?|images?|pictures?|dresses?|shirts?|hoodies?)\b/i.test(src)
    || /\b(photos?|images?|pictures?)\b[\s\S]{0,80}\b(with|to|into)\b[\s\S]{0,40}\b(blue|red|green|different|new)\b/i.test(src);
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
export function applyDeskReviewPatch(vfs = {}, job = null, options = {}) {
  const brief = String(options?.brief || '');
  const before = probeRunningDesk({ html: pickPreviewEntry(vfs), vfs, job });
  const purged = purgeStaleShopArtifacts(vfs, job);
  const ensured = ensureShopDeskInVfs(purged.vfs, job, { brief });
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
    changed: purged.changed || ensured.changed,
    rejected: false,
    checks: after.checks,
    nextBeat: after.nextBeat,
  };
}

export function ensureShopPhotosInVfs(vfs = {}, job = null, options = {}) {
  if (!vfsLooksLikeShop(vfs, job)) return { vfs, changed: false };
  const brief = String(options?.brief || '');
  const wired = wireVfsShopImagesIntoDesk(vfs, { brief });
  const next = { ...wired.vfs };
  let changed = wired.changed;
  const htmlPath = pickPreviewEntryPath(next);
  if (htmlPath && next[htmlPath] && typeof next[htmlPath].content === 'string') {
    const result = injectMissingShopPhotos(next[htmlPath].content, { brief });
    if (result.html !== next[htmlPath].content) {
      next[htmlPath] = { ...next[htmlPath], content: result.html };
      changed = true;
    }
  }
  if (next['products.json'] && typeof next['products.json'].content === 'string') {
    const catalog = injectProductCatalogImages(next['products.json'].content, { brief });
    if (catalog.changed) {
      next['products.json'] = { ...next['products.json'], content: catalog.text };
      changed = true;
    }
  } else if (htmlPath && next[htmlPath]?.content) {
    const brand = String(next[htmlPath].content).match(/<title>([^<]{2,80})<\/title>/i)?.[1]
      || String(next[htmlPath].content).match(/<h1[^>]*>([^<]{2,80})<\/h1>/i)?.[1]
      || 'Collection';
    next['products.json'] = {
      content: scaffoldShopCatalogJson({ brief, brand }),
      language: 'json',
    };
    changed = true;
  }
  return { vfs: next, changed };
}

/** Photos, currency, and Add to Cart belong on the running desk, not only in chat. */
export function ensureShopDeskInVfs(vfs = {}, job = null, options = {}) {
  const brief = String(options?.brief || '');
  let seed = { ...(vfs || {}) };
  let seededHtml = false;
  // SVG-only merchandise dumps are not a shop. Seed a real HTML desk when the job
  // requires product photos and there is no runnable HTML page yet.
  if (jobNeedsProductPhotos(job) && !pickPreviewEntryPath(seed)) {
    const purpose = String(job?.purpose || '').trim();
    const hay = `${brief}\n${purpose}\n${Object.keys(seed).join('\n')}`;
    const ampBrand = hay.match(/\b([A-Za-z][\w']*\s*&\s*[A-Za-z][\w']*)(?:\s+Kids)?\b/i);
    const gluedBrand = hay.match(/fox\s*[_&-]?\s*wolf/i);
    let title = '';
    if (ampBrand) {
      title = `${ampBrand[1].replace(/\s+/g, ' ').trim()}${/\bkids?\b/i.test(hay) ? ' Kids' : ''} Shop`;
    } else if (gluedBrand) {
      title = `Fox & Wolf${/\bkids?\b/i.test(hay) ? ' Kids' : ''} Shop`;
    } else if (purpose && !/^a\s+shop\b/i.test(purpose)) {
      title = purpose;
    } else {
      title = 'Shop';
    }
    seed = {
      ...seed,
      'index.html': {
        content: (
          `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
          + `<title>${title}</title></head><body>`
          + `<header><nav>Shop</nav><h1>${title}</h1></header>`
          + `<main class="product-catalog" data-quantora-shop-catalog="true" style="min-height:60vh;background:#fff;padding:24px"></main>`
          + `<footer>${title}</footer></body></html>`
        ),
        language: 'html',
      },
    };
    seededHtml = true;
  }
  if (!vfsLooksLikeShop(seed, job)) return purgeStaleShopArtifacts(seed, job);
  const withPhotos = ensureShopPhotosInVfs(seed, job, { brief });
  if (!vfsLooksLikeShop(withPhotos.vfs, job)) return withPhotos;
  const next = { ...withPhotos.vfs };
  const htmlPath = pickPreviewEntryPath(next);
  if (!htmlPath || !next[htmlPath] || typeof next[htmlPath].content !== 'string') {
    return { ...withPhotos, scaleNote: shopCatalogScaleNote(brief) };
  }
  const ui = injectShopCommerceUi(next[htmlPath].content);
  const scaleNote = shopCatalogScaleNote(brief);
  if (!ui.changed) {
    return {
      vfs: next,
      changed: withPhotos.changed || seededHtml,
      scaleNote,
      photoCount: countRealPreviewPhotos(next[htmlPath].content),
    };
  }
  next[htmlPath] = { ...next[htmlPath], content: ui.html };
  return {
    vfs: next,
    changed: true,
    scaleNote,
    photoCount: countRealPreviewPhotos(ui.html),
  };
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
  const withDesk = ensureShopDeskInVfs(next, job);
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

/**
 * Error / provider-dead turns often still carry partial fences. Those must land
 * in Files + Preview — do not bare-return on isError when extractable code exists.
 */
export function messageHasExtractableWorkspaceCode(rawText, currentVfs = {}) {
  if (!rawText || typeof rawText !== 'string') return false;
  if (extractRunnableCode(rawText)) return true;
  return canOpenStudioPreviewPane(rawText, currentVfs);
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
