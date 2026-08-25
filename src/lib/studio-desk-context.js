/**
 * Desk context packet: what is actually on the coding desk.
 * Chat, Review, and continue chips must read this — not the last paragraph.
 */

import { advisorBlocksPreviewBuild } from './build-intent.js';
import { countRealPreviewPhotos, previewHtmlHasRealPhotos, uniqueShopPhotoIds } from './preview-images.js';
import { previewHtmlHasAddToCartControl, previewHtmlHasCurrencySwitcher } from './shop-preview-ui.js';
import { pickPreviewEntry } from './preview-utils.js';
import { DESK_PROBE_FACT_KEYS } from './desk-probe-script.js';
import { checkState, deriveJobChecks, failingChecks, unverifiedChecks } from './studio-desk-criteria.js';
import { listStudioFiles } from './studio-file-tree.js';
import { jobNeedsProductPhotos, normalizeStudioJobCard } from './studio-job-card.js';

const MAX_FILES = 24;
const MAX_CATALOG = 12;
const MAX_PURPOSE = 120;
export const MAX_PREVIEW_CODE = 80_000;

export function capPreviewCode(code = '') {
  return String(code || '').slice(0, MAX_PREVIEW_CODE);
}

function vfsText(vfs, path) {
  const entry = vfs?.[path];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.content === 'string') return entry.content;
  return '';
}

export function summarizeCatalog(raw = '') {
  try {
    const data = JSON.parse(String(raw || ''));
    const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : []);
    return list.slice(0, MAX_CATALOG).map((item, index) => ({
      id: String(item?.id || `item-${index + 1}`).slice(0, 40),
      name: String(item?.name || '').trim().slice(0, 80),
    })).filter((item) => item.name);
  } catch {
    return [];
  }
}

const SHOP_DOM_RE = /\b(add[\s-]?to[\s-]?(?:bag|cart)|boutique|saree|sari|kanjeevaram|atelier|priceCents|storefront|e-?commerce|product-card|merchandise|kids?\s+collection|shop\s+(?:website|site|page)|online\s+store|data-quantora-shop-(?:photo|card|catalog))\b/i;
const SHOP_PRODUCTS_RE = /"priceCents"\s*:|"currency"\s*:\s*"(?:inr|usd|sgd|aud|aed)"/i;
/** Branded merchandise chrome — not a generic “poetry collection” page. */
const MERCH_SHELL_RE = /\b(merchandise|boutique|storefront|kids?\s+(?:wear|shop|collection)|fox\s*&\s*wolf|online\s+shop|product\s+catalog)\b/i;

/** Job cards from another product must not force shop probes onto this Preview. */
export function jobClearlyNotShop(job = null) {
  const card = normalizeStudioJobCard(job);
  if (!card) return false;
  const hay = [card.purpose, ...card.mustWork].join(' ');
  if (/\b(shop|boutique|storefront|e-?commerce|saree|sari|catalog|cart|bag)\b/i.test(hay)) return false;
  if (/\b(drive|cleaner|calculator|to-?do|timer|quiz|dashboard|agent|todo)\b/i.test(hay)) return true;
  // Named non-shop product (Nimbus landing, etc.) — leftover boutique files are bleed.
  return Boolean(card.purpose) && !jobNeedsProductPhotos(card);
}

export function looksLikeShopDesk({ html = '', vfs = {}, job = null } = {}) {
  if (jobClearlyNotShop(job)) return false;
  const products = vfsText(vfs, 'products.json');
  const entry = String(html || pickPreviewEntry(vfs) || '');
  const hay = `${html || ''}\n${pickPreviewEntry(vfs) || ''}`;
  const namedProducts = summarizeCatalog(products).length > 0;
  const liveShop = SHOP_DOM_RE.test(hay)
    || Boolean(products && (SHOP_PRODUCTS_RE.test(products) || namedProducts));
  if (liveShop) return true;
  // Branded merchandise chrome (header/nav/footer) with empty/gold body is still a shop
  // when the job says so, or when the page itself uses merchandise/shop language —
  // not every page that merely says “collection”.
  if (
    MERCH_SHELL_RE.test(entry)
    && /<(header|nav)\b/i.test(entry)
    && /<footer\b/i.test(entry)
    && (jobNeedsProductPhotos(job) || /\b(shop|cart|merchandise|storefront)\b/i.test(entry))
  ) {
    return true;
  }
  if (
    MERCH_SHELL_RE.test(entry)
    && /<(header|nav|footer)\b/i.test(entry)
    && !previewHtmlHasRealPhotos(entry)
    && (jobNeedsProductPhotos(job) || /\b(shop|cart|bag|merchandise|priceCents|add to cart)\b/i.test(entry))
  ) {
    return true;
  }
  // Empty products.json still marks an intentional shop scaffold.
  if (products !== '' && jobNeedsProductPhotos(job)) return true;
  // A leftover boutique job must not invent cart/photo failures on a non-shop Preview.
  // Do not match bare "catalog" — file catalogs and agent dashboards false-positive.
  if (!jobNeedsProductPhotos(job)) return false;
  return !String(hay || '').trim();
}

export function looksLikeCalculatorDesk({ html = '', job = null } = {}) {
  const purpose = normalizeStudioJobCard(job)?.purpose || '';
  if (/\bcalculator\b/i.test(purpose)) return true;
  const src = String(html || '');
  // Require calculator-specific markers — bare <output> or class*=display matches too much.
  return /data-testid\s*=\s*["']calculator-display["']/i.test(src)
    || /\bid\s*=\s*["']display["']/i.test(src)
    || /\bclass\s*=\s*["'](?:[^"']*\s)?display(?:\s[^"']*)?["']/i.test(src)
    || /data-(?:calc-)?display\b/i.test(src);
}

function htmlHasCalculatorDisplay(haystack = '') {
  const src = String(haystack || '');
  return /data-testid\s*=\s*["']calculator-display["']/i.test(src)
    || /<(?:output)\b/i.test(src)
    || /\bid\s*=\s*["']display["']/i.test(src)
    || /\bclass\s*=\s*["'](?:[^"']*\s)?display(?:\s[^"']*)?["']/i.test(src)
    || /data-(?:calc-)?display\b/i.test(src);
}

function htmlHasScientificKeys(haystack = '') {
  const src = String(haystack || '');
  const has = (name) => new RegExp(`>\\s*${name}\\s*<`, 'i').test(src);
  return (has('sin') && has('cos')) || (has('DEG') && has('RAD')) || (has('deg') && has('rad'));
}

function jobWantsScientific(job = null) {
  const card = normalizeStudioJobCard(job);
  if (!card) return false;
  const hay = [card.purpose, ...(card.mustWork || [])].join(' ');
  return /\bscientific\b/i.test(hay);
}

export function probeRunningDesk({ html = '', vfs = {}, job = null } = {}) {
  const source = String(html || '');
  const haystack = `${source}\n${listStudioFiles(vfs).map((path) => vfsText(vfs, path)).join('\n')}`;
  const catalog = summarizeCatalog(vfsText(vfs, 'products.json'));
  const photoCount = Math.max(countRealPreviewPhotos(source), countRealPreviewPhotos(haystack));
  const uniquePhotoCount = uniqueShopPhotoIds(haystack).size;
  const needsVariety = catalog.length >= 2 || uniquePhotoCount >= 2 || photoCount >= 2;
  const hasDistinctPhotos = uniquePhotoCount >= 2 || !needsVariety;
  const facts = {
    photoCount,
    uniquePhotoCount,
    hasPhotos: photoCount > 0 || previewHtmlHasRealPhotos(source) || previewHtmlHasRealPhotos(haystack),
    hasDistinctPhotos,
    hasCart: previewHtmlHasAddToCartControl(source) || previewHtmlHasAddToCartControl(haystack),
    hasCurrency: previewHtmlHasCurrencySwitcher(source) || previewHtmlHasCurrencySwitcher(haystack),
    catalogCount: catalog.length,
    catalogNames: catalog.map((item) => item.name),
    hasCalculatorDisplay: htmlHasCalculatorDisplay(haystack),
    hasCalculatorKey: /data-testid\s*=\s*["']calculator-one["']/i.test(haystack)
      || />\s*[0-9]\s*</.test(haystack),
    hasScientificKeys: htmlHasScientificKeys(haystack),
    wantsScientific: jobWantsScientific(job) || /\bscientific\b/i.test(haystack),
    shop: looksLikeShopDesk({ html: source, vfs, job }),
    calculator: looksLikeCalculatorDesk({ html: haystack, job }),
  };

  const includeCatalog = Boolean(vfsText(vfs, 'products.json') || facts.catalogCount);
  const checks = buildDeskChecks(facts, { includeCatalog, job });
  const failed = failingChecks(checks);
  const nextBeat = failed[0]?.label || '';
  return { facts, checks, failed, nextBeat, catalog };
}

function observedBool(live, key) {
  return Boolean(live && typeof live[key] === 'boolean');
}

function observedCount(live, key) {
  return Boolean(live && typeof live[key] === 'number' && Number.isFinite(live[key]));
}

/**
 * Source can fail a row. Only the running page can pass one.
 * Photos never get a source-only green — live decode must observe them.
 */
function sourceOrLiveCheck({ sourceOk, observed, livePresent }) {
  const heldInSource = sourceOk === true;
  if (observed) return { ok: heldInSource, state: heldInSource ? 'ok' : 'fix', sourceOk: heldInSource };
  if (!livePresent) {
    return heldInSource
      ? { ok: false, state: 'unverified', sourceOk: true }
      : { ok: false, state: 'fix', sourceOk: false };
  }
  return heldInSource
    ? { ok: false, state: 'unverified', sourceOk: true }
    : { ok: false, state: 'fix', sourceOk: false };
}

/** Review labels come from these facts — live Preview may overwrite HTML regex later. */
export function buildDeskChecks(facts = {}, { includeCatalog = false, job = null, live = null } = {}) {
  const checks = [];
  const livePresent = Boolean(live && typeof live === 'object');
  if (facts.shop) {
    const photos = sourceOrLiveCheck({
      sourceOk: facts.hasPhotos === true && facts.hasDistinctPhotos === true,
      observed: observedCount(live, 'photoCount') || observedCount(live, 'uniquePhotoCount') || observedBool(live, 'hasPhotos'),
      livePresent,
    });
    checks.push({
      id: 'photos',
      ok: photos.ok,
      state: photos.state,
      sourceOk: photos.sourceOk,
      label: !facts.hasPhotos
        ? 'Product photos missing from Preview'
        : (facts.hasDistinctPhotos
          ? `${facts.uniquePhotoCount || facts.photoCount} distinct product photo${(facts.uniquePhotoCount || facts.photoCount) === 1 ? '' : 's'} on Preview`
          : 'Catalog cards share one photo — each product needs its own'),
    });
    const cart = sourceOrLiveCheck({
      sourceOk: facts.hasCart === true,
      observed: observedBool(live, 'hasCart'),
      livePresent,
    });
    checks.push({
      id: 'cart',
      ok: cart.ok,
      state: cart.state,
      sourceOk: cart.sourceOk,
      label: facts.hasCart ? 'Add to Cart is on Preview' : 'Add to Cart missing from Preview',
    });
    const currency = sourceOrLiveCheck({
      sourceOk: facts.hasCurrency === true,
      observed: observedBool(live, 'hasCurrency'),
      livePresent,
    });
    checks.push({
      id: 'currency',
      ok: currency.ok,
      state: currency.state,
      sourceOk: currency.sourceOk,
      label: facts.hasCurrency ? 'Currency switcher is on Preview' : 'Currency switcher missing from Preview',
    });
    if (includeCatalog) {
      const catalogCount = Number(facts.catalogCount) || 0;
      const catalog = sourceOrLiveCheck({
        sourceOk: catalogCount > 0,
        observed: observedCount(live, 'catalogCount'),
        livePresent,
      });
      checks.push({
        id: 'catalog',
        ok: catalog.ok,
        state: catalog.state,
        sourceOk: catalog.sourceOk,
        label: catalogCount ? `${catalogCount} catalog item${catalogCount === 1 ? '' : 's'}` : 'products.json has no named items',
      });
    }
  }
  if (facts.calculator) {
    const display = sourceOrLiveCheck({
      sourceOk: facts.hasCalculatorDisplay === true,
      observed: observedBool(live, 'hasCalculatorDisplay'),
      livePresent,
    });
    checks.push({
      id: 'calc-display',
      ok: display.ok,
      state: display.state,
      sourceOk: display.sourceOk,
      label: facts.hasCalculatorDisplay ? 'Calculator display is on Preview' : 'Calculator display missing',
    });
    const key = sourceOrLiveCheck({
      sourceOk: facts.hasCalculatorKey === true,
      observed: observedBool(live, 'hasCalculatorKey'),
      livePresent,
    });
    checks.push({
      id: 'calc-key',
      ok: key.ok,
      state: key.state,
      sourceOk: key.sourceOk,
      label: facts.hasCalculatorKey ? 'Calculator keys are on Preview' : 'Calculator keys missing',
    });
    if (facts.wantsScientific) {
      const scientific = sourceOrLiveCheck({
        sourceOk: facts.hasScientificKeys === true,
        observed: observedBool(live, 'hasScientificKeys'),
        livePresent,
      });
      checks.push({
        id: 'calc-scientific',
        ok: scientific.ok,
        state: scientific.state,
        sourceOk: scientific.sourceOk,
        label: facts.hasScientificKeys
          ? 'Scientific keys are on Preview'
          : 'Scientific keys (sin/cos) missing from Preview',
      });
    }
  }
  // Shop and calculator desks already probe the running page for their own
  // must-work lines. The job card fills the gap only where nothing else does.
  if (!checks.length) checks.push(...deriveJobChecks(job, live));
  return checks;
}

function checkHeld(check) {
  return Boolean(check && (check.ok === true || check.sourceOk === true));
}

export function deskChecksRegressed(beforeChecks = [], afterChecks = []) {
  const after = new Map((afterChecks || []).map((check) => [check.id, check]));
  return (beforeChecks || []).some((check) => checkHeld(check) && !checkHeld(after.get(check.id)));
}

function applyLiveBool(facts, live, key) {
  if (typeof live[key] === 'boolean') facts[key] = live[key];
}

function applyLiveCount(facts, live, key) {
  if (typeof live[key] === 'number' && Number.isFinite(live[key])) facts[key] = live[key];
}

/**
 * Running Preview wins. HTML regex and chat must not keep a failed check
 * after the live iframe already has the control.
 */
export function mergeLiveDeskProbe(packet, live = null) {
  if (!packet) return null;
  if (!live || typeof live !== 'object') return packet;
  const facts = { ...packet.facts };
  applyLiveBool(facts, live, 'hasCart');
  applyLiveBool(facts, live, 'hasCurrency');
  applyLiveBool(facts, live, 'hasCalculatorDisplay');
  applyLiveBool(facts, live, 'hasCalculatorKey');
  applyLiveBool(facts, live, 'hasScientificKeys');
  applyLiveCount(facts, live, 'photoCount');
  applyLiveCount(facts, live, 'uniquePhotoCount');
  applyLiveCount(facts, live, 'catalogCount');
  if (typeof live.photoCount === 'number' && Number.isFinite(live.photoCount)) {
    facts.hasPhotos = live.photoCount > 0;
  }
  if (typeof live.photoCount === 'number' || typeof live.uniquePhotoCount === 'number') {
    const needsVariety = (facts.catalogCount || 0) >= 2
      || (facts.uniquePhotoCount || 0) >= 2
      || (facts.photoCount || 0) >= 2;
    facts.hasDistinctPhotos = (facts.uniquePhotoCount || 0) >= 2 || !needsVariety;
  }
  facts.bagIncremented = live.bagIncremented === true;
  for (const key of DESK_PROBE_FACT_KEYS) {
    if (typeof live[key] === 'boolean') facts[key] = live[key];
  }

  const includeCatalog = (packet.checks || []).some((check) => check.id === 'catalog');
  const checks = buildDeskChecks(facts, { includeCatalog, job: packet.job, live });
  if (facts.shop) {
    checks.push({
      id: 'cart-click',
      ok: live.bagIncremented === true,
      label: live.bagIncremented === true
        ? 'Add to Cart increments the bag'
        : (facts.hasCart === true ? 'Add to Cart did not increment the bag' : 'Add to Cart missing from Preview'),
    });
  }
  const failed = failingChecks(checks);
  return {
    ...packet,
    facts,
    checks,
    failed: failed.map((check) => check.id),
    nextBeat: failed[0]?.label || '',
  };
}

export function buildDeskContextPacket({
  vfs = {},
  job = null,
  html = '',
  studioDomain = null,
  previewCode = '',
} = {}) {
  if (advisorBlocksPreviewBuild(studioDomain)) return null;
  const files = listStudioFiles(vfs).slice(0, MAX_FILES);
  if (!files.length && !String(html || '').trim()) return null;
  const probed = probeRunningDesk({ html, vfs, job });
  const card = normalizeStudioJobCard(job);
  const source = capPreviewCode(previewCode || html);
  return {
    job: card ? { purpose: card.purpose.slice(0, MAX_PURPOSE), mustWork: card.mustWork.slice(0, 4) } : null,
    files,
    catalog: probed.catalog,
    facts: probed.facts,
    checks: probed.checks,
    failed: probed.failed.map((check) => check.id),
    nextBeat: probed.nextBeat,
    previewCode: source,
  };
}

/** First coding turn with a VFS, and every coding turn after, carry this packet. */
export function buildCodingTurnPacket({
  vfs = {},
  canvasCode = '',
  job = null,
  studioDomain = null,
  live = null,
} = {}) {
  const html = pickPreviewEntry(vfs) || canvasCode || '';
  return mergeLiveDeskProbe(buildDeskContextPacket({
    vfs,
    job,
    html,
    studioDomain,
    previewCode: html,
  }), live);
}

export function codingTurnRequestFields({
  isCodingRequest = false,
  refineDesk = false,
  packet = null,
} = {}) {
  if (!packet) return refineDesk ? { refineMode: true } : {};
  if (isCodingRequest || refineDesk) {
    const fields = {
      deskContext: packet,
      previewCode: capPreviewCode(packet.previewCode),
    };
    if (refineDesk) fields.refineMode = true;
    return fields;
  }
  const { previewCode: _previewCode, ...desk } = packet;
  return { deskContext: desk };
}

export function sanitizeDeskContext(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const files = Array.isArray(raw.files)
    ? raw.files.filter((path) => typeof path === 'string' && path.trim()).map((path) => path.trim().slice(0, 80)).slice(0, MAX_FILES)
    : [];
  const catalog = Array.isArray(raw.catalog)
    ? raw.catalog.slice(0, MAX_CATALOG).map((item, index) => ({
      id: String(item?.id || `item-${index + 1}`).slice(0, 40),
      name: String(item?.name || '').slice(0, 80),
    })).filter((item) => item.name)
    : [];
  const facts = raw.facts && typeof raw.facts === 'object' ? {
    photoCount: Number(raw.facts.photoCount) || 0,
    uniquePhotoCount: Number(raw.facts.uniquePhotoCount) || 0,
    hasPhotos: raw.facts.hasPhotos === true,
    hasDistinctPhotos: raw.facts.hasDistinctPhotos === true,
    hasCart: raw.facts.hasCart === true,
    hasCurrency: raw.facts.hasCurrency === true,
    catalogCount: Number(raw.facts.catalogCount) || catalog.length,
    catalogNames: Array.isArray(raw.facts.catalogNames)
      ? raw.facts.catalogNames.map((name) => String(name).slice(0, 80)).slice(0, MAX_CATALOG)
      : catalog.map((item) => item.name),
    hasCalculatorDisplay: raw.facts.hasCalculatorDisplay === true,
    hasCalculatorKey: raw.facts.hasCalculatorKey === true,
    hasScientificKeys: raw.facts.hasScientificKeys === true,
    wantsScientific: raw.facts.wantsScientific === true,
    bagIncremented: raw.facts.bagIncremented === true,
    shop: raw.facts.shop === true,
    calculator: raw.facts.calculator === true,
    // Tri-state on purpose: an unobserved fact must not collapse into false.
    ...Object.fromEntries(DESK_PROBE_FACT_KEYS
      .filter((key) => typeof raw.facts[key] === 'boolean')
      .map((key) => [key, raw.facts[key]])),
  } : null;
  const checks = Array.isArray(raw.checks)
    ? raw.checks.slice(0, 8).map((check) => ({
      id: String(check?.id || '').slice(0, 40),
      ok: check?.ok === true,
      state: check?.state === 'unverified' ? 'unverified' : (check?.ok === true ? 'ok' : 'fix'),
      label: String(check?.label || '').slice(0, 160),
    })).filter((check) => check.id)
    : [];
  const purpose = typeof raw.job?.purpose === 'string' ? raw.job.purpose.slice(0, MAX_PURPOSE) : '';
  return {
    job: purpose ? {
      purpose,
      mustWork: Array.isArray(raw.job?.mustWork)
        ? raw.job.mustWork.map((item) => String(item || '').slice(0, 120)).filter(Boolean).slice(0, 4)
        : [],
    } : null,
    files,
    catalog,
    facts,
    checks,
    failed: Array.isArray(raw.failed) ? raw.failed.map((id) => String(id).slice(0, 40)).slice(0, 8) : failingChecks(checks).map((check) => check.id),
    nextBeat: typeof raw.nextBeat === 'string' ? raw.nextBeat.slice(0, 160) : '',
    previewCode: typeof raw.previewCode === 'string' ? capPreviewCode(raw.previewCode) : '',
  };
}

export function formatDeskContextForPrompt(packet) {
  const desk = sanitizeDeskContext(packet);
  if (!desk || (!desk.files.length && !desk.facts)) return '';
  const lines = ['DESK CONTEXT (source of truth for this coding turn — do not contradict it):'];
  if (desk.job?.purpose) {
    lines.push(`JOB: ${desk.job.purpose}`);
    if (desk.job.mustWork.length) lines.push(`MUST STILL WORK: ${desk.job.mustWork.join('; ')}`);
  }
  if (desk.files.length) lines.push(`FILES: ${desk.files.join(', ')}`);
  if (desk.previewCode) lines.push(`PREVIEW SOURCE: attached (${desk.previewCode.length} chars)`);
  if (desk.catalog.length) {
    lines.push(`CATALOG: ${desk.catalog.map((item) => item.name).join(', ')}`);
  }
  if (desk.facts) {
    const facts = desk.facts;
    lines.push(`LIVE PREVIEW FACTS: photos=${facts.hasPhotos ? facts.photoCount || 'yes' : 'no'} distinctPhotos=${facts.hasDistinctPhotos ? facts.uniquePhotoCount || 'yes' : 'no'} cart=${facts.hasCart ? 'yes' : 'no'} currency=${facts.hasCurrency ? 'yes' : 'no'} catalog=${facts.catalogCount || 0}${facts.calculator ? ` calculator=${facts.hasCalculatorDisplay ? 'yes' : 'no'}` : ''}`);
    const cartClick = desk.checks.find((check) => check.id === 'cart-click');
    if (cartClick) lines.push(`CART CLICK: ${cartClick.ok ? 'bag incremented' : 'bag did not increment'}`);
  }
  const failed = failingChecks(desk.checks);
  if (failed.length) {
    lines.push(`FAILED CHECKS: ${failed.map((check) => check.label).join('; ')}`);
  }
  const unverified = unverifiedChecks(desk.checks);
  if (unverified.length) {
    lines.push(`UNVERIFIED (Preview was never asked — do not claim these): ${unverified.map((check) => check.label).join('; ')}`);
  }
  lines.push('Never claim a control, photo, catalog item, or calculator key unless LIVE PREVIEW FACTS say it is present. If FAILED CHECKS lists it, it is not on Preview yet.');
  return lines.join('\n');
}

export function chipsFromDeskProbes(checks = []) {
  const beats = {
    photos: {
      id: 'gap-photos',
      label: 'Add real product photos',
      value: 'Put a different real photo on every product card in the running Preview. Repeating one Unsplash image on the whole catalog is not done.',
      priority: 108,
    },
    cart: {
      id: 'gap-cart',
      label: 'Add to Cart on Preview',
      value: 'Put a working Add to Cart control on the running page. Do not say it is done unless Preview shows it.',
      priority: 107,
    },
    currency: {
      id: 'gap-currency',
      label: 'Add a currency converter',
      value: 'Put a currency converter (INR, USD, SGD, AUD, AED) on the running Preview. Do not say it is done unless Preview shows it.',
      priority: 106,
    },
    catalog: {
      id: 'gap-catalog',
      label: 'Fill the product catalog',
      value: 'Put named products in products.json and on the page. Preview is the proof.',
      priority: 105,
    },
    'cart-click': {
      id: 'gap-cart-click',
      label: 'Fix Add to Cart',
      value: 'Add to Cart is on the page but the bag does not increment. Fix the running Preview.',
      priority: 107,
    },
    'calc-display': {
      id: 'gap-calc',
      label: 'Fix the calculator display',
      value: 'The calculator Preview is missing a working display. Fix the running page.',
      priority: 108,
    },
    'calc-key': {
      id: 'gap-calc-key',
      label: 'Fix the calculator keys',
      value: 'The calculator Preview is missing working keys. Fix the running page.',
      priority: 107,
    },
    'calc-scientific': {
      id: 'gap-calc-scientific',
      label: 'Add scientific keys on Preview',
      value: 'Patch the web Preview entry (index.html / App.jsx) with sin/cos (or DEG/RAD). Python-only files never run in Preview.',
      priority: 109,
    },
    'job-add-item': {
      id: 'gap-add-item',
      label: 'Make adding an item work',
      value: 'The running Preview has an add control that does not add anything. Fix it on the page.',
      priority: 108,
    },
    'job-controls': {
      id: 'gap-controls',
      label: 'Make the controls respond',
      value: 'Clicking a control on the running Preview changes nothing. Fix it on the page.',
      priority: 107,
    },
    'job-runs': {
      id: 'gap-page-runs',
      label: 'Make the page render',
      value: 'The running Preview renders nothing. Fix the page before anything else.',
      priority: 109,
    },
  };
  return (Array.isArray(checks) ? checks : [])
    .filter((check) => checkState(check) === 'fix' && beats[check.id])
    .map((check) => beats[check.id]);
}
