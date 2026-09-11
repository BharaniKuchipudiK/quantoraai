/**
 * The coding desk must know the job, or heal will "fix" a calculator into a landing page.
 * Purpose + must-work is stored with the files. Chat is not the source of truth.
 */

import { isShopIntakeAcceptShorthand } from './shop-catalog-scale.js';

const SHOP_MUST_WORK = [
  'Catalog and bag still work',
  'Product images are real photos, not empty frames',
  'Currency and Add to Cart are on Preview',
  'Keep this a shop, not a different app',
];

const NAMED_JOBS = [
  { re: /\bcalculator|\bcalc\b/i, purpose: 'A working calculator', mustWork: ['Number buttons still change the display', 'Keep this a calculator, not a different app'] },
  { re: /\btodo(?:s| list)?|\bto-do list\b/i, purpose: 'A to-do list', mustWork: ['Items can still be added', 'Keep this a to-do list'] },
  { re: /\btimer\b|\bstopwatch\b|\bpomodoro\b/i, purpose: 'A timer', mustWork: ['Start and time still work', 'Keep this a timer'] },
  { re: /\bquiz\b|\bflash ?cards?\b/i, purpose: 'A quiz', mustWork: ['Questions can still be answered', 'Keep this a quiz'] },
  {
    re: /\b(boutique|saree|sari|e-?commerce|storefront|online shop|\bshop\b|merchandise|product catalog|kids?\s+(?:wear|apparel|collection)|clothing\s+(?:store|shop)|apparel)\b/i,
    purpose: 'A shop website',
    mustWork: SHOP_MUST_WORK,
  },
];

function namedJobMatches(named, text) {
  if (named.purpose !== 'A to-do list') return named.re.test(text);
  // A quality constraint such as “No TODOs or placeholder implementations” is
  // not a request to replace the product with a to-do app. Remove only bounded
  // negated code-quality phrases; a real “build a todo list, with no TODOs” ask
  // still retains its positive occurrence.
  const withoutNegatedQuality = String(text || '').replace(
    /\b(?:no|without|avoid|remove|zero)\s+(?:code\s+)?todo(?:s)?\b/gi,
    ' ',
  );
  return named.re.test(withoutNegatedQuality);
}

function vfsLooksLikeShopFiles(vfs = {}) {
  const files = Object.values(vfs || {});
  for (const file of files) {
    const html = typeof file?.content === 'string' ? file.content : '';
    if (/\b(fox\s*&\s*wolf|merchandise|boutique|add[\s-]?to[\s-]?(?:bag|cart)|product-card|storefront)\b/i.test(html)) {
      return true;
    }
  }
  if (vfs?.['products.json']) return true;
  const names = Object.keys(vfs || {}).join(' ');
  return /\bfoxwolf_|\.svg\b/i.test(names) && /\b(shop|product|merch|collection)\b/i.test(names);
}

export function normalizeStudioJobCard(job) {
  if (!job || typeof job !== 'object') return null;
  const purpose = String(job.purpose || '').trim().slice(0, 120);
  if (!purpose) return null;
  const mustWork = Array.isArray(job.mustWork)
    ? job.mustWork.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  return { purpose, mustWork };
}

function purposeFromVfs(vfs = {}) {
  const files = Object.values(vfs || {});
  for (const file of files) {
    const html = typeof file?.content === 'string' ? file.content : '';
    const title = html.match(/<title>([^<]{2,80})<\/title>/i)?.[1];
    if (title && !/quantora/i.test(title)) return title.trim();
    const heading = html.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i)?.[1];
    if (heading) return heading.trim();
  }
  return '';
}

function looksLikeNewJob(brief, existing) {
  if (!existing?.purpose) return true;
  const text = String(brief || '').trim();
  if (!text) return false;
  const existingIsShop = /\b(shop|boutique|storefront|e-?commerce|saree|sari)\b/i.test(existing.purpose || '');
  const briefKeepsShop = /\b(shop|boutique|storefront|store|saree|sari|catalog|cart|bag)\b/i.test(text);
  for (const named of NAMED_JOBS) {
    if (namedJobMatches(named, text) && named.purpose !== existing.purpose) {
      // “Add a shipping calculator to the boutique” is still a shop job.
      if (existingIsShop && briefKeepsShop) continue;
      return true;
    }
  }
  // Drive cleaner / landing pages / productivity apps must not keep a leftover
  // shop job — that card alone keeps cart/photo probes and blocks purge.
  const inventsProduct = (
    (/\b(build|create|make|develop)\b/i.test(text)
      && /\b(app|page|site|tool|game|agent|dashboard|cleaner|landing)\b/i.test(text)
      && text.length > 40)
    || /\b(landing\s+page|one-?page\s+(?:site|landing|app)|productivity\s+app)\b/i.test(text)
  );
  // “Create a landing page section for the existing dashboard” is a refine.
  const refiningExisting = (
    /\b(existing|current|this)\b/i.test(text)
    && /\b(section|add(?:ing)?|also|into|onto|for the)\b/i.test(text)
  );
  if (inventsProduct && !refiningExisting) {
    return !namedPurposeMatch(text, existing.purpose);
  }
  return false;
}

/** True when this ask should replace the desk product (not refine the current one). */
export function isStudioProductSwitch(brief, existing = null) {
  const prev = normalizeStudioJobCard(existing);
  if (!prev) return false;
  return looksLikeNewJob(brief, prev);
}

function namedPurposeMatch(text, purpose) {
  return NAMED_JOBS.some((named) => named.purpose === purpose && namedJobMatches(named, text));
}

export function buildStudioJobCard({ brief = '', vfs = {}, existing = null } = {}) {
  const prev = normalizeStudioJobCard(existing);
  const text = String(brief || '').trim();

  // “Start with 10” is an intake accept, not a new product. Never replace the
  // shop job with purpose “Start with 10” / mustWork “The page still runs”.
  if (isShopIntakeAcceptShorthand(text)) {
    if (prev && (jobNeedsProductPhotos(prev) || /shop|boutique|merchandise|catalog/i.test(prev.purpose || ''))) {
      return prev;
    }
    if (vfsLooksLikeShopFiles(vfs) || (prev && vfsLooksLikeShopFiles(vfs))) {
      return { purpose: 'A shop website', mustWork: SHOP_MUST_WORK };
    }
    if (prev) return prev;
    return { purpose: 'A shop website', mustWork: SHOP_MUST_WORK };
  }

  const switchingProduct = Boolean(prev && looksLikeNewJob(text, prev));
  if (prev && !switchingProduct) return prev;

  for (const named of NAMED_JOBS) {
    if (namedJobMatches(named, text)) return { purpose: named.purpose, mustWork: named.mustWork };
  }

  // Intentional product switch: the brief owns the job. Leftover boutique
  // products.json / Ember HTML must not re-attach "A shop website" and block purge.
  if (switchingProduct && text) {
    const clipped = text.replace(/^(please |can you |could you )/i, '').slice(0, 80).trim();
    const purpose = clipped.charAt(0).toUpperCase() + clipped.slice(1);
    return {
      purpose,
      mustWork: ['Interactive controls still work', 'Do not replace this with a different product'],
    };
  }

  const fromFiles = purposeFromVfs(vfs);
  if (fromFiles) {
    if (vfsLooksLikeShopFiles(vfs) || /\b(fox\s*&\s*wolf|merchandise|boutique|shop)\b/i.test(fromFiles)) {
      return { purpose: 'A shop website', mustWork: SHOP_MUST_WORK };
    }
    return {
      purpose: fromFiles.slice(0, 120),
      mustWork: ['Interactive controls still work', 'Do not replace this with a different product'],
    };
  }

  // A confirmed product switch must not keep the old card when the brief is empty of
  // named markers — otherwise a leftover shop job keeps owning Drive cleaner probes.
  if (prev && !switchingProduct) return prev;
  if (!text) return prev;

  if (vfsLooksLikeShopFiles(vfs)) {
    return { purpose: 'A shop website', mustWork: SHOP_MUST_WORK };
  }

  const clipped = text.replace(/^(please |can you |could you )/i, '').slice(0, 80).trim();
  const purpose = clipped.charAt(0).toUpperCase() + clipped.slice(1);
  return {
    purpose,
    mustWork: ['Do not replace this with a different product'],
  };
}

/**
 * The job card for a repository that was just opened in the desk.
 *
 * WHY A CHECKOUT MUST SET THIS, AND NOT LEAVE THE OLD CARD ALONE.
 *
 * `buildStudioJobCard` derives the job from the BRIEF, and keeps the previous
 * card unless `looksLikeNewJob` sees a named product or a build verb. Opening a
 * repository is neither: it replaces every file on the desk and says nothing.
 * So a desk that had built a shop kept "A shop website" — and its must-work
 * probes — across a checkout of somebody else's application. Observed on
 * 2026-09-04: a 195-file Next.js career agent was opened, and the desk went on
 * asking whether "Catalog and bag still work" and warning itself to "Keep this
 * a shop, not a different app", against a repository with no shop in it.
 *
 * Clearing to null is not enough. With no card, the next turn falls through to
 * `purposeFromVfs`, which checks `vfsLooksLikeShopFiles` FIRST — and that scans
 * every file for words like "storefront" or "add to cart". In a few hundred
 * files of somebody else's code those words are a coincidence, not a product,
 * and the shop card would re-attach itself.
 *
 * So the checkout states the job positively: the product is this repository.
 * A later brief that names a real product still switches it, because
 * `looksLikeNewJob` compares against this purpose the same as any other.
 */
export function jobCardForCheckout({ owner = '', repo = '' } = {}) {
  const slug = [String(owner || '').trim(), String(repo || '').trim()].filter(Boolean).join('/');
  return {
    purpose: (slug || 'An opened repository').slice(0, 120),
    mustWork: ['Do not replace this with a different product'],
  };
}

export function studioJobCardLabel(job) {
  return normalizeStudioJobCard(job)?.purpose || '';
}

export function jobNeedsProductPhotos(job) {
  const card = normalizeStudioJobCard(job);
  if (!card) return false;
  const hay = [card.purpose, ...card.mustWork].join(' ');
  // Bare "photo" matches screenshots on non-shop desks; require shop intent.
  return /\b(shop|boutique|storefront|e-?commerce|saree|sari|merchandise|apparel|collection)\b/i.test(hay)
    || /\b(product (?:images?|photos?)|catalog (?:and|cards?|images?|photos?))\b/i.test(hay);
}

export function formatJobCardForRepair(job) {
  const card = normalizeStudioJobCard(job);
  if (!card) return '';
  const must = card.mustWork.length
    ? `\nMust still work:\n${card.mustWork.map((item) => `- ${item}`).join('\n')}`
    : '';
  return `JOB (do not abandon this product):\nPurpose: ${card.purpose}${must}\nIf a change would turn this into a different product, return the current code unchanged.`;
}

export function formatJobCardForVerify(job, brief = '') {
  const card = normalizeStudioJobCard(job);
  const text = String(brief || '').trim();
  if (!card) return text;
  const extra = [card.purpose, ...card.mustWork].filter(Boolean).join('. ');
  return [text, extra].filter(Boolean).join('\n');
}
