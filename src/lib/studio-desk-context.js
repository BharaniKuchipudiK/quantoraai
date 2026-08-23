/**
 * Desk context packet: what is actually on the coding desk.
 * Chat, Review, and continue chips must read this — not the last paragraph.
 */

import { advisorBlocksPreviewBuild } from './build-intent.js';
import { countRealPreviewPhotos, previewHtmlHasRealPhotos, uniqueShopPhotoIds } from './preview-images.js';
import { previewHtmlHasAddToCartControl, previewHtmlHasCurrencySwitcher } from './shop-preview-ui.js';
import { pickPreviewEntry } from './preview-utils.js';
import { listStudioFiles } from './studio-file-tree.js';
import { jobNeedsProductPhotos, normalizeStudioJobCard } from './studio-job-card.js';

const MAX_FILES = 24;
const MAX_CATALOG = 12;
const MAX_PURPOSE = 120;

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

export function looksLikeShopDesk({ html = '', vfs = {}, job = null } = {}) {
  if (vfs['products.json'] && typeof vfs['products.json'].content === 'string') return true;
  const hay = `${html || ''}\n${pickPreviewEntry(vfs) || ''}`;
  if (/\b(add[\s-]?to[\s-]?(?:bag|cart)|boutique|saree|kanjeevaram|catalog|atelier|priceCents)\b/i.test(hay)) return true;
  return jobNeedsProductPhotos(job);
}

export function looksLikeCalculatorDesk({ html = '', job = null } = {}) {
  const purpose = normalizeStudioJobCard(job)?.purpose || '';
  if (/\bcalculator\b/i.test(purpose)) return true;
  return /data-testid\s*=\s*["']calculator-display["']/i.test(String(html || ''));
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
    hasCalculatorDisplay: /data-testid\s*=\s*["']calculator-display["']/i.test(haystack),
    hasCalculatorKey: /data-testid\s*=\s*["']calculator-one["']/i.test(haystack),
    shop: looksLikeShopDesk({ html: source, vfs, job }),
    calculator: looksLikeCalculatorDesk({ html: haystack, job }),
  };

  const checks = [];
  if (facts.shop) {
    checks.push({
      id: 'photos',
      ok: facts.hasPhotos && facts.hasDistinctPhotos,
      label: !facts.hasPhotos
        ? 'Product photos missing from Preview'
        : (facts.hasDistinctPhotos
          ? `${facts.uniquePhotoCount || facts.photoCount} distinct product photo${(facts.uniquePhotoCount || facts.photoCount) === 1 ? '' : 's'} on Preview`
          : 'Catalog cards share one photo — each product needs its own'),
    });
    checks.push({
      id: 'cart',
      ok: facts.hasCart,
      label: facts.hasCart ? 'Add to Cart is on Preview' : 'Add to Cart missing from Preview',
    });
    checks.push({
      id: 'currency',
      ok: facts.hasCurrency,
      label: facts.hasCurrency ? 'Currency switcher is on Preview' : 'Currency switcher missing from Preview',
    });
    if (vfsText(vfs, 'products.json') || facts.catalogCount) {
      checks.push({
        id: 'catalog',
        ok: facts.catalogCount > 0,
        label: facts.catalogCount ? `${facts.catalogCount} catalog item${facts.catalogCount === 1 ? '' : 's'}` : 'products.json has no named items',
      });
    }
  }
  if (facts.calculator) {
    checks.push({
      id: 'calc-display',
      ok: facts.hasCalculatorDisplay,
      label: facts.hasCalculatorDisplay ? 'Calculator display is on Preview' : 'Calculator display missing',
    });
    checks.push({
      id: 'calc-key',
      ok: facts.hasCalculatorKey,
      label: facts.hasCalculatorKey ? 'Calculator keys are on Preview' : 'Calculator keys missing',
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const nextBeat = failed[0]?.label || '';
  return { facts, checks, failed, nextBeat, catalog };
}

export function deskChecksRegressed(beforeChecks = [], afterChecks = []) {
  const after = new Map((afterChecks || []).map((check) => [check.id, check.ok === true]));
  return (beforeChecks || []).some((check) => check && check.ok === true && after.get(check.id) !== true);
}

export function mergeLiveDeskProbe(packet, live = null) {
  if (!packet) return null;
  if (!live || typeof live !== 'object') return packet;
  const facts = {
    ...packet.facts,
    hasCart: packet.facts?.hasCart === true || live.hasCart === true,
    bagIncremented: live.bagIncremented === true,
  };
  const clickCheck = {
    id: 'cart-click',
    ok: live.bagIncremented === true,
    label: live.bagIncremented === true
      ? 'Add to Cart increments the bag'
      : (live.hasCart === true ? 'Add to Cart did not increment the bag' : 'Add to Cart missing from Preview'),
  };
  const checks = [...(packet.checks || []).filter((check) => check.id !== 'cart-click')];
  if (facts.shop) checks.push(clickCheck);
  const failed = checks.filter((check) => !check.ok);
  return {
    ...packet,
    facts,
    checks,
    failed: failed.map((check) => check.id),
    nextBeat: failed[0]?.label || packet.nextBeat || '',
  };
}

export function buildDeskContextPacket({
  vfs = {},
  job = null,
  html = '',
  studioDomain = null,
} = {}) {
  if (advisorBlocksPreviewBuild(studioDomain)) return null;
  const files = listStudioFiles(vfs).slice(0, MAX_FILES);
  if (!files.length && !String(html || '').trim()) return null;
  const probed = probeRunningDesk({ html, vfs, job });
  const card = normalizeStudioJobCard(job);
  return {
    job: card ? { purpose: card.purpose.slice(0, MAX_PURPOSE), mustWork: card.mustWork.slice(0, 4) } : null,
    files,
    catalog: probed.catalog,
    facts: probed.facts,
    checks: probed.checks,
    failed: probed.failed.map((check) => check.id),
    nextBeat: probed.nextBeat,
  };
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
    bagIncremented: raw.facts.bagIncremented === true,
    shop: raw.facts.shop === true,
    calculator: raw.facts.calculator === true,
  } : null;
  const checks = Array.isArray(raw.checks)
    ? raw.checks.slice(0, 8).map((check) => ({
      id: String(check?.id || '').slice(0, 40),
      ok: check?.ok === true,
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
    failed: Array.isArray(raw.failed) ? raw.failed.map((id) => String(id).slice(0, 40)).slice(0, 8) : checks.filter((check) => !check.ok).map((check) => check.id),
    nextBeat: typeof raw.nextBeat === 'string' ? raw.nextBeat.slice(0, 160) : '',
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
  if (desk.catalog.length) {
    lines.push(`CATALOG: ${desk.catalog.map((item) => item.name).join(', ')}`);
  }
  if (desk.facts) {
    const facts = desk.facts;
    lines.push(`LIVE PREVIEW FACTS: photos=${facts.hasPhotos ? facts.photoCount || 'yes' : 'no'} distinctPhotos=${facts.hasDistinctPhotos ? facts.uniquePhotoCount || 'yes' : 'no'} cart=${facts.hasCart ? 'yes' : 'no'} currency=${facts.hasCurrency ? 'yes' : 'no'} catalog=${facts.catalogCount || 0}${facts.calculator ? ` calculator=${facts.hasCalculatorDisplay ? 'yes' : 'no'}` : ''}`);
    const cartClick = desk.checks.find((check) => check.id === 'cart-click');
    if (cartClick) lines.push(`CART CLICK: ${cartClick.ok ? 'bag incremented' : 'bag did not increment'}`);
  }
  if (desk.failed?.length) {
    const labels = desk.checks.filter((check) => !check.ok).map((check) => check.label);
    lines.push(`FAILED CHECKS: ${labels.join('; ') || desk.failed.join(', ')}`);
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
  };
  return (Array.isArray(checks) ? checks : [])
    .filter((check) => check && check.ok === false && beats[check.id])
    .map((check) => beats[check.id]);
}
