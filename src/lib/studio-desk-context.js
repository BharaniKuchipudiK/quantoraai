/**
 * Desk context packet: what is actually on the coding desk.
 * Chat, Review, and continue chips must read this — not the last paragraph.
 */

import { advisorBlocksPreviewBuild } from './build-intent.js';
import { inspectBuildTruth } from './build-truth.js';
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
  // Shop and calculator checks where they apply, PLUS the ones that apply to
  // every build. Before this, anything that was neither got a single
  // unverifiable placeholder.
  const checks = [...buildDeskChecks(facts, { includeCatalog, job }), ...buildTruthChecks(source, listStudioFiles(vfs), { livePresent: false })];
  const failed = failingChecks(checks);
  const nextBeat = failed[0]?.label || '';
  return { facts, checks, failed, nextBeat, catalog };
}

/**
 * Checks that apply to ANY build, from Phase 01's Build Truth.
 *
 * WHY THIS EXISTS
 *
 * buildDeskChecks only knew two vocabularies: shop (photos, cart, currency,
 * catalog) and calculator (display, keys, scientific). Everything else — a
 * scheduling board, a dashboard, a CRM, a booking system — got exactly ONE
 * check, and it was a placeholder that is never verified:
 *
 *   "Not checked on Preview yet: Interactive controls still work"
 *
 * So a real build shipped with an unwired button, a dead anchor and lorem
 * ipsum in it, and the panel had nothing to say. It is also why "0 catalog
 * photos" leaked onto a scheduler: shop was the only vocabulary available, so
 * shop words were what came out.
 *
 * Build Truth already finds these on any HTML — dead controls, broken links,
 * fabricated content, numbers that disagree — and was wired into the proof
 * plane but not into the panel the user actually reads.
 */
export function buildTruthChecks(html = '', files = [], { livePresent = false } = {}) {
  const source = String(html || '');
  if (!source.trim()) return [];
  let truth;
  try {
    truth = inspectBuildTruth(source, { files });
  } catch {
    // A check that throws must not take the panel down with it.
    return [];
  }
  const findings = truth?.findings || [];
  const byKind = new Map();
  for (const finding of findings) {
    const kind = String(finding?.kind || '');
    if (!kind) continue;
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
  }
  const LABELS = {
    'dead-control': (n) => `${n} control${n === 1 ? '' : 's'} on the page do${n === 1 ? 'es' : ''} nothing when clicked`,
    'broken-link': (n) => `${n} link${n === 1 ? '' : 's'} point${n === 1 ? 's' : ''} nowhere`,
    'placeholder-content': (n) => `${n} block${n === 1 ? '' : 's'} of placeholder text left in`,
    'numbers-disagree': (n) => `${n} total${n === 1 ? ' does' : 's do'} not match the rows above ${n === 1 ? 'it' : 'them'}`,
  };
  const checks = [];
  for (const [kind, label] of Object.entries(LABELS)) {
    const count = byKind.get(kind) || 0;
    /*
     * A FINDING is sound from source; an ABSENCE is not.
     *
     * The first version reported ok:true from reading the HTML, and the
     * desk-job gate caught it: "a desk whose page was never probed reported a
     * passing check". That is the rule this codebase enforces everywhere else —
     * a data-testid in source is not a passing calculator check either.
     *
     * So a dead control found in the source is a real failure and says so. Not
     * finding one only means the source did not show one, which is 'unverified'
     * until the live page has actually been probed.
     */
    checks.push({
      id: `truth-${kind}`,
      ok: count === 0 && livePresent,
      state: count > 0 ? 'fix' : (livePresent ? 'ok' : 'unverified'),
      sourceOk: count === 0,
      label: count === 0 ? okLabelFor(kind, livePresent) : label(count),
    });
  }
  return checks;
}

function okLabelFor(kind, livePresent) {
  const proved = {
    'dead-control': 'Every control is wired to something',
    'broken-link': 'Every link resolves',
    'placeholder-content': 'No placeholder text left in',
    'numbers-disagree': 'Totals match their rows',
  }[kind] || 'Checked';
  // Until the running page has been probed, this is what the SOURCE shows —
  // not what the page does.
  return livePresent ? proved : `Not checked on Preview yet: ${proved.toLowerCase()}`;
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
      const inSource = Number(facts.catalogCountInSource) || 0;
      const rendered = typeof facts.catalogCountLive === 'number' ? facts.catalogCountLive : null;
      /*
       * A catalog is only proved when what rendered matches what was written.
       * Any count above zero used to pass, so a page showing 1 of 18 products
       * was a green tick reading "1 catalog item" — the shortfall, which is
       * the whole finding, went unmentioned.
       */
      const short = rendered !== null && inSource > 0 && rendered < inSource;
      const catalog = sourceOrLiveCheck({
        sourceOk: catalogCount > 0 && !short,
        observed: observedCount(live, 'catalogCount'),
        livePresent,
      });
      let label;
      if (short) label = `Only ${rendered} of ${inSource} catalog items reached Preview`;
      else if (catalogCount) label = `${catalogCount} catalog item${catalogCount === 1 ? '' : 's'}`;
      else label = 'products.json has no named items';
      checks.push({
        id: 'catalog',
        ok: catalog.ok,
        state: catalog.state,
        sourceOk: catalog.sourceOk,
        label,
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
  /*
   * The live count is what RENDERED; the source count is what was WRITTEN.
   * Overwriting one with the other loses the only interesting fact — a
   * products.json with 18 items whose page renders 1 was reported as
   * "1 catalog item" with a green tick, turning a rendering failure into a
   * pass. Keep both; the check below says so when they disagree.
   */
  facts.catalogCountInSource = Number(packet.facts?.catalogCount) || 0;
  applyLiveCount(facts, live, 'catalogCount');
  facts.catalogCountLive = typeof live.catalogCount === 'number' && Number.isFinite(live.catalogCount)
    ? live.catalogCount
    : null;
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
  /*
   * Carry the generic truth rows through from the packet rather than
   * recomputing them — the HTML is not in scope here. A row that FAILED stays
   * failed; a row that merely found nothing is promoted from 'unverified' to
   * 'ok' now that the running page has actually been probed.
   */
  const carriedTruth = (packet.checks || [])
    .filter((check) => String(check.id || '').startsWith('truth-'))
    .map((check) => (check.sourceOk
      ? { ...check, ok: true, state: 'ok', label: check.label.replace(/^Not checked on Preview yet: /, '').replace(/^./, (c) => c.toUpperCase()) }
      : check));
  const checks = [...buildDeskChecks(facts, { includeCatalog, job: packet.job, live }), ...carriedTruth];
  /*
   * Only report the CLICK when there is a control to click. The old else-branch
   * repeated "Add to Cart missing from Preview" verbatim under a second id, so
   * a missing cart printed the same sentence twice and read like two separate
   * faults. A control that is not there has one finding, not two.
   */
  if (facts.shop && facts.hasCart === true) {
    checks.push({
      id: 'cart-click',
      ok: live.bagIncremented === true,
      label: live.bagIncremented === true
        ? 'Add to Cart increments the bag'
        : 'Add to Cart did not increment the bag',
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

/**
 * Names ONLY the shop controls that are actually absent.
 *
 * The chat used to print one fixed sentence — "Preview still has no currency
 * switcher or Add to Cart" — whenever EITHER was missing. So a build whose own
 * check list said "Currency switcher is on Preview" was accused, two inches
 * lower, of not having one. The platform contradicted itself on the same
 * screen, and the reader has no way to tell which half to believe.
 *
 * Returns '' when nothing is missing, so the caller renders no warning at all.
 */
export function describeMissingShopUi(facts = {}) {
  if (!facts || !facts.shop) return '';
  const missing = [];
  if (!facts.hasCart) missing.push('Add to Cart');
  if (!facts.hasCurrency) missing.push('currency switcher');
  if (!missing.length) return '';
  const list = missing.length === 2 ? `${missing[0]} or ${missing[1]}` : missing[0];
  return `Preview still has no ${list}. Chat cannot add that until it appears on the desk.`;
}
