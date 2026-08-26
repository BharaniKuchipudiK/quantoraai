/**
 * Preview cannot hotlink most CDNs (COEP require-corp + iframe embed).
 * Shop inject uses same-origin data-URI <img> photos that always decode in Preview.
 */

import {
  SHOP_CATALOG_CAP,
  SHOP_PHOTO_FLOOR,
  shopCatalogTargetSize,
} from './shop-catalog-scale.js';

export const PREVIEW_IMAGE_PROXY_PATH = '/api/preview-image';

const ALLOWED_HOSTS = new Set([
  'images.unsplash.com',
  'plus.unsplash.com',
  'source.unsplash.com',
  'images.pexels.com',
  'images.pixabay.com',
  'cdn.pixabay.com',
  'upload.wikimedia.org',
  // Guaranteed real-photo fallback: picsum always returns a real photograph.
  'picsum.photos',
  'fastly.picsum.photos',
  'i.picsum.photos',
]);

/** Matches <img src> values that decode inside Preview without remote fetch. */
const RELIABLE_IMG_SRC = String.raw`(?:data:image\/[^"'\s]+|\/api\/preview-image[^"'\s]*)`;
const ANY_IMG_SRC = String.raw`(?:data:image\/[^"'\s]+|https?:\/\/[^"'\s]+|\/api\/preview-image[^"'\s]*)`;

const SHOP_PHOTO_PALETTE = [
  ['#1f2937', '#c4a35a'],
  ['#0f172a', '#38bdf8'],
  ['#3b0764', '#f472b6'],
  ['#14532d', '#86efac'],
  ['#7c2d12', '#fdba74'],
  ['#1e3a5f', '#93c5fd'],
  ['#4a044e', '#e879f9'],
  ['#422006', '#fcd34d'],
  ['#164e63', '#67e8f9'],
  ['#3f1d0c', '#fbbf24'],
  ['#1a2e05', '#a3e635'],
  ['#312e81', '#a5b4fc'],
  ['#881337', '#fb7185'],
  ['#134e4a', '#5eead4'],
  ['#713f12', '#fde68a'],
  ['#1e1b4b', '#c4b5fd'],
  ['#083344', '#22d3ee'],
  ['#450a0a', '#fca5a5'],
  ['#365314', '#bef264'],
  ['#4c1d95', '#d8b4fe'],
  ['#0c4a6e', '#7dd3fc'],
  ['#78350f', '#f59e0b'],
  ['#064e3b', '#34d399'],
  ['#500724', '#f9a8d4'],
];

export function isBlockedPreviewImageHost(hostname = '') {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return true;
  return false;
}

export function isAllowedPreviewImageUrl(href) {
  let parsed;
  try {
    parsed = new URL(String(href || ''));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (isBlockedPreviewImageHost(parsed.hostname)) return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return ALLOWED_HOSTS.has(host)
    || host.endsWith('.unsplash.com')
    || host.endsWith('.pexels.com')
    || host.endsWith('.picsum.photos');
}

/** Photos that Preview can show without depending on Unsplash/hotlink/proxy. */
export function isReliablePreviewPhotoSrc(src = '') {
  const raw = String(src || '').trim();
  if (!raw) return false;
  if (/^data:image\//i.test(raw)) return true;
  if (raw.includes(PREVIEW_IMAGE_PROXY_PATH)) return true;
  if (/^\/(?!\/)[\w./%-]+\.(?:png|jpe?g|webp|gif|svg)(?:\?.*)?$/i.test(raw)) return true;
  return false;
}

/**
 * A real photograph — a same-origin proxied photo or a raster data URI, but NOT
 * a fabricated `data:image/svg+xml` gradient/gold-frame placeholder. Used where
 * the injector must decide whether to REPLACE a fake placeholder with a real
 * proxied photo, without disturbing the broader "will this decode in Preview"
 * check above (which still treats a self-contained svg as displayable).
 */
export function isRealPhotoSrc(src = '') {
  const raw = String(src || '').trim();
  if (!raw) return false;
  if (/^data:image\/svg\+xml/i.test(raw)) return false;
  return isReliablePreviewPhotoSrc(raw);
}

export function previewImageProxyUrl(href, origin = '') {
  const base = String(origin || '').replace(/\/$/, '');
  if (!base || !isAllowedPreviewImageUrl(href)) return String(href || '');
  return `${base}${PREVIEW_IMAGE_PROXY_PATH}?u=${encodeURIComponent(String(href))}`;
}

export function rewritePreviewImageUrls(html, origin = '') {
  const base = String(origin || '').replace(/\/$/, '');
  const source = String(html || '');
  if (!base || !source) return source;
  return source.replace(/https:\/\/[^\s"'<>\\]+/gi, (url) => {
    const clean = url.replace(/[),.;]+$/, '');
    if (clean.includes(PREVIEW_IMAGE_PROXY_PATH)) return url;
    if (!isAllowedPreviewImageUrl(clean)) return url;
    return url.replace(clean, previewImageProxyUrl(clean, base));
  });
}

/** Preview is the proof. Remote Unsplash srcs that 403 are not product photos. */
export function previewHtmlHasRealPhotos(html = '') {
  return new RegExp(String.raw`<img\b[^>]*\bsrc\s*=\s*["']${RELIABLE_IMG_SRC}`, 'i').test(String(html || ''));
}

/**
 * Guaranteed no-network placeholder — used ONLY as the final <img onerror> guard
 * so a viewer never sees a broken-image icon if every photo host is unreachable.
 * It is not a "real photo" and never counts as one; it is the safety net beneath
 * the real proxied photograph.
 */
function svgFallbackPhoto(index = 0) {
  const [from, to] = SHOP_PHOTO_PALETTE[index % SHOP_PHOTO_PALETTE.length];
  const id = `quantora-photo-${index + 1}`;
  const label = `Product ${index + 1}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="${label}">`,
    `<defs><linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>`,
    `</linearGradient></defs>`,
    `<rect width="1200" height="800" fill="url(#${id}-g)"/>`,
    `<rect x="72" y="72" width="1056" height="656" rx="28" fill="rgba(255,255,255,0.14)"/>`,
    `<circle cx="220" cy="220" r="64" fill="rgba(255,255,255,0.22)"/>`,
    `<text x="600" y="410" text-anchor="middle" fill="#ffffff" font-family="Georgia, serif" font-size="56">${label}</text>`,
    `<text x="600" y="470" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="system-ui,sans-serif" font-size="28">${id}</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A real photograph via the same-origin proxy — always renders in Preview. */
function picsumPhoto(index = 0) {
  // Keyed with quantora-photo-<n> so photo-identity / uniqueness tracking holds.
  const url = `https://picsum.photos/seed/quantora-photo-${index + 1}/1200/800`;
  return `${PREVIEW_IMAGE_PROXY_PATH}?u=${encodeURIComponent(url)}`;
}

// The injector's fallback photos are now REAL photographs (proxied picsum),
// not fabricated gradient frames. Topical photos come from the model itself
// (it is instructed to use proxied Unsplash URLs that match the subject).
const SHOP_PHOTOS = Array.from({ length: SHOP_CATALOG_CAP }, (_, i) => picsumPhoto(i));

const INJECTED_PHOTO_MARK = 'data-quantora-shop-photo="true"';
const MAX_SHOP_PHOTOS = SHOP_CATALOG_CAP;
const INJECTED_PHOTO_RE = /<img\b[^>]*data-quantora-shop-photo="true"[^>]*>/gi;
const INJECTED_CARD_RE = /<(?:article|div)[^>]*data-quantora-shop-card="true"[^>]*>[\s\S]*?<\/(?:article|div)>/gi;
const PRODUCT_SLOT_RE = /<(article|div|li|section)([^>]*(?:class=["'][^"']*\b(?:product|card|tile|item|frame|slot|sku|merchandise)[^"']*["']|data-(?:product|sku|frame)|style=["'][^"']*(?:border[^"']*gold|#c4a35a|#d4af37|goldenrod)[^"']*["'])[^>]*)>([\s\S]*?)<\/\1>/gi;

function shopPhotoTag(index, alt = 'Product photo') {
  const src = SHOP_PHOTOS[index % SHOP_PHOTOS.length];
  const safeAlt = String(alt || 'Product photo').replace(/[<>&"]/g, '');
  // Real proxied photo first; if the host is ever unreachable, fall back to the
  // self-contained placeholder so the viewer never gets a broken-image icon.
  const guard = svgFallbackPhoto(index);
  return `<img ${INJECTED_PHOTO_MARK} src="${src}" onerror="this.onerror=null;this.src='${guard}'" alt="${safeAlt}" width="1200" height="800" style="width:100%;max-height:280px;object-fit:cover;display:block;border-radius:12px">`;
}

function shopProductCard(index, name = '') {
  const label = String(name || `Product ${index + 1}`).replace(/[<>&"]/g, '');
  const price = 1800 + (index * 250);
  return (
    `<article class="product-card" data-quantora-shop-card="true" style="display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #e8dfc8;border-radius:16px;background:#fff">`
    + `${shopPhotoTag(index, label)}`
    + `<h3 style="margin:0;font-size:1rem">${label}</h3>`
    + `<div class="price" data-quantora-price="true" data-inr="${price}" style="color:#8a6a1f;font-weight:600">INR ${price.toLocaleString('en-IN')}</div>`
    + `<button type="button" data-quantora-add="true" style="margin-top:auto;padding:8px 14px;border:0;border-radius:999px;background:#c4a35a;color:#111;font-weight:700;cursor:pointer">Add to Cart</button>`
    + `</article>`
  );
}

/** Previous inject put a photo on every nested "card". Strip those so Preview is not a repeating stack. */
export function stripInjectedShopPhotos(html = '') {
  return String(html || '')
    .replace(INJECTED_CARD_RE, '')
    .replace(INJECTED_PHOTO_RE, '')
    .replace(/<img\b[^>]*height:min\(52vh,420px\)[^>]*>/gi, '');
}

export function countRealPreviewPhotos(html = '') {
  const matches = String(html || '').match(new RegExp(String.raw`<img\b[^>]*\bsrc\s*=\s*["']${RELIABLE_IMG_SRC}`, 'gi'));
  return matches ? matches.length : 0;
}

export function photoIdentity(src = '') {
  const raw = String(src || '').trim();
  if (!raw) return '';
  const marked = raw.match(/quantora-photo-\d+/i);
  if (marked) return marked[0].toLowerCase();
  let href = raw;
  try {
    const parsed = new URL(raw, 'https://quantoraai.app');
    if (parsed.pathname.includes('preview-image')) {
      href = parsed.searchParams.get('u') || href;
    }
  } catch { /* keep href */ }
  const photo = href.match(/photo-[\w-]+/i);
  if (photo) return photo[0].toLowerCase();
  if (/^data:image\//i.test(href)) {
    return `data-${href.length}-${href.slice(20, 48)}`;
  }
  return href.split('?')[0].toLowerCase();
}

export function uniqueShopPhotoIds(html = '') {
  const ids = new Set();
  String(html || '').replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi, (_, src) => {
    if (!isReliablePreviewPhotoSrc(src) && !/^https?:\/\//i.test(src)) return _;
    const id = photoIdentity(src);
    if (id) ids.add(id);
    return _;
  });
  return ids;
}

function productCardRe() {
  return /<(article|div|li)([^>]*class=["'][^"']*\b(?:product-card|product-item|product-tile|saree-card)\b[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi;
}

function nextUnusedShopPhoto(used) {
  const found = SHOP_PHOTOS.find((src) => !used.has(photoIdentity(src)));
  const src = found || SHOP_PHOTOS[used.size % SHOP_PHOTOS.length];
  used.add(photoIdentity(src));
  return src;
}

function rewriteCardPhoto(inner, used) {
  let first = true;
  return String(inner || '').replace(/<img\b[^>]*>/gi, (tag) => {
    if (!new RegExp(String.raw`\bsrc\s*=\s*["']${ANY_IMG_SRC}`, 'i').test(tag)) return tag;
    if (!first) return tag;
    first = false;
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)/i) || [])[1] || '';
    const id = photoIdentity(src);
    if (isReliablePreviewPhotoSrc(src) && id && !used.has(id)) {
      used.add(id);
      return tag;
    }
    return tag.replace(/\bsrc\s*=\s*["'][^"']*["']/, `src="${nextUnusedShopPhoto(used)}"`);
  });
}

/** One repeated remote URL on every card is not a catalog. Give each card its own photo. */
export function diversifyDuplicateShopPhotos(html = '') {
  const source = String(html || '');
  if (!source) return source;
  const used = new Set();
  let out = source.replace(productCardRe(), (full, tag, attrs, inner) => (
    `<${tag}${attrs}>${rewriteCardPhoto(inner, used)}</${tag}>`
  ));
  out = out.replace(
    /<(article|div|li)(\b[^>]*)>([\s\S]*?add to (?:bag|cart)[\s\S]*?)<\/\1>/gi,
    (full, tag, attrs, inner) => {
      if (/\b(?:product-card|product-item|product-tile|saree-card)\b/i.test(attrs)) return full;
      if (!new RegExp(String.raw`<img\b[^>]*\bsrc\s*=\s*["']${ANY_IMG_SRC}`, 'i').test(inner)) return full;
      return `<${tag}${attrs}>${rewriteCardPhoto(inner, used)}</${tag}>`;
    },
  );
  // Replace leftover remote <img> srcs that Preview cannot load.
  out = out.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
    const src = (String(attrs).match(/\bsrc\s*=\s*["']([^"']+)/i) || [])[1] || '';
    if (!src || isReliablePreviewPhotoSrc(src)) return full;
    if (!/^https?:\/\//i.test(src)) return full;
    const next = nextUnusedShopPhoto(used);
    if (/\bsrc\s*=\s*["'][^"']*["']/i.test(attrs)) {
      return `<img ${String(attrs).replace(/\bsrc\s*=\s*["'][^"']*["']/, `src="${next}"`)}>`;
    }
    return `<img src="${next}" ${attrs}>`;
  });
  return out;
}

function isTinyDecorativeSvg(svg) {
  const head = svg.slice(0, 280);
  const viewBox = head.match(/viewBox=["']0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/i);
  const boxW = viewBox ? Number(viewBox[1]) : 0;
  const boxH = viewBox ? Number(viewBox[2]) : 0;
  if (boxW && boxH && boxW <= 48 && boxH <= 48) return true;
  if (boxW && boxH && (boxW > 96 || boxH > 96)) return false;
  if (/\b(icon|logo|bag|cart|lucide)\b/i.test(head) && (!boxW || boxW <= 48)) return true;
  const width = head.match(/\bwidth=["'](\d+)/i);
  if (width && Number(width[1]) <= 48) return true;
  return svg.length < 480;
}

function brandHint(html = '') {
  const title = String(html || '').match(/<title>([^<]{2,80})<\/title>/i)?.[1]
    || String(html || '').match(/<h1[^>]*>([^<]{2,80})<\/h1>/i)?.[1]
    || '';
  return String(title).replace(/\s+/g, ' ').trim().slice(0, 48);
}

function injectCatalogGrid(html = '', count = SHOP_PHOTO_FLOOR) {
  const n = Math.min(MAX_SHOP_PHOTOS, Math.max(SHOP_PHOTO_FLOOR, count));
  const brand = brandHint(html) || 'Collection';
  const cards = Array.from({ length: n }, (_, i) => shopProductCard(i, `${brand} ${i + 1}`)).join('');
  const grid = (
    `<section data-quantora-shop-catalog="true" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;padding:20px;max-width:1100px;margin:0 auto">`
    + `${cards}</section>`
  );
  let out = String(html || '');
  if (/<section[^>]*data-quantora-shop-catalog="true"/i.test(out)) {
    return out.replace(/<section[^>]*data-quantora-shop-catalog="true"[^>]*>[\s\S]*?<\/section>/i, grid);
  }
  // Empty <main data-quantora-shop-catalog> shells must get a real grid.
  // Nonempty mains keep their copy/filters and receive the grid inserted, not replaced.
  if (/<main\b[^>]*data-quantora-shop-catalog="true"[^>]*>/i.test(out)) {
    return out.replace(
      /<main\b([^>]*data-quantora-shop-catalog="true"[^>]*)>([\s\S]*?)<\/main>/i,
      (full, attrs, inner) => {
        const body = String(inner || '').trim();
        if (!body) return `<main${attrs}>${grid}</main>`;
        if (/data-quantora-shop-card=/i.test(body) || /class=["'][^"']*\bproduct-card\b/i.test(body)) {
          return full;
        }
        return `<main${attrs}>${inner}${grid}</main>`;
      },
    );
  }
  if (/<main\b[^>]*>/i.test(out)) {
    return out.replace(/<main\b[^>]*>/i, (open) => `${open}${grid}`);
  }
  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${grid}</body>`);
  }
  return `${out}${grid}`;
}

/**
 * The model keeps drawing gold frames. Preview is the product: put real photos
 * in the HTML when a shop has none — including blank collection shells.
 */
export function injectMissingShopPhotos(html = '', options = {}) {
  const target = shopCatalogTargetSize(options.brief || '', Number(options.targetCount) || 0);
  const source = String(html || '');
  if (!source) {
    return { html: source, injected: false };
  }
  // Keep an already-injected capped catalog across unrelated follow-ups
  // (“change the heading”) — do not strip and rebuild on every turn.
  const existingCards = (source.match(/data-quantora-shop-card="true"/gi) || []).length;
  const existingPhotos = countRealPreviewPhotos(source);
  if (
    existingCards >= SHOP_PHOTO_FLOOR
    && existingPhotos >= SHOP_PHOTO_FLOOR
    && /data-quantora-shop-catalog="true"/i.test(source)
    && !/images\.unsplash\.com|images\.pexels\.com/i.test(source)
  ) {
    return { html: source, injected: false };
  }

  const cleaned = stripInjectedShopPhotos(source);
  let index = 0;
  let out = cleaned.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => {
    if (isTinyDecorativeSvg(svg) || index >= MAX_SHOP_PHOTOS) return svg;
    return shopPhotoTag(index++);
  });
  let cardCount = 0;
  out = out.replace(
    productCardRe(),
    (full, tag, attrs, inner) => {
      cardCount += 1;
      if (cardCount > MAX_SHOP_PHOTOS) return '';
      if (new RegExp(String.raw`<img\b[^>]*\bsrc\s*=\s*["']${RELIABLE_IMG_SRC}`, 'i').test(inner)) return full;
      // Remote Unsplash/etc. look like photos in source but break in Preview — replace.
      if (new RegExp(String.raw`<img\b[^>]*\bsrc\s*=\s*["']${ANY_IMG_SRC}`, 'i').test(inner)) {
        if (index >= MAX_SHOP_PHOTOS) return full;
        const used = new Set();
        return `<${tag}${attrs}>${rewriteCardPhoto(inner, used)}</${tag}>`;
      }
      if (index >= MAX_SHOP_PHOTOS) return full;
      return `<${tag}${attrs}>${shopPhotoTag(index++)}${inner}</${tag}>`;
    },
  );
  // CSS gold frames / generic product slots without <img>
  out = out.replace(PRODUCT_SLOT_RE, (full, tag, attrs, inner) => {
    if (/\b(?:product-card|product-item|product-tile|saree-card)\b/i.test(attrs)) return full;
    if (new RegExp(String.raw`<img\b[^>]*\bsrc\s*=\s*["']${RELIABLE_IMG_SRC}`, 'i').test(inner)) return full;
    if (index >= MAX_SHOP_PHOTOS) return full;
    if (!/\b(product|card|tile|frame|slot|sku|merchandise|gold)\b/i.test(attrs + inner)) return full;
    return `<${tag}${attrs}>${shopPhotoTag(index++)}${inner}</${tag}>`;
  });

  const photoCount = countRealPreviewPhotos(out);
  const hasProductCards = /class=["'][^"']*\b(?:product-card|product-item|product-tile|saree-card)\b/i.test(out)
    || /data-quantora-shop-card=/i.test(out);
  // Empty collection chrome, or a lone gold-frame photo with no product cards —
  // scaffold a real capped catalog. Do not rewrite shops that already have cards.
  const needsCatalogGrid = (!hasProductCards && photoCount < SHOP_PHOTO_FLOOR)
    && (/<(header|nav|footer)\b/i.test(out) || /<main\b/i.test(out) || /<\/body>/i.test(out));
  if (needsCatalogGrid) {
    out = injectCatalogGrid(out, target);
  } else if (!previewHtmlHasRealPhotos(out) && /<main\b/i.test(out)) {
    out = out.replace(/<main\b[^>]*>/i, (open) => `${open}${shopPhotoTag(index++, 'Collection photo')}`);
  } else if (!previewHtmlHasRealPhotos(out) && /<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${shopPhotoTag(index++, 'Collection photo')}</body>`);
  }
  const diversified = diversifyDuplicateShopPhotos(out);
  return { html: diversified, injected: diversified !== cleaned && diversified !== source };
}

export function injectProductCatalogImages(raw = '', options = {}) {
  try {
    const data = JSON.parse(String(raw || ''));
    const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : null);
    if (!list?.length) return { text: String(raw || ''), changed: false };
    const target = shopCatalogTargetSize(options.brief || '', list.length);
    const capped = list.slice(0, target);
    const used = new Set();
    let changed = capped.length !== list.length;
    const next = capped.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const id = photoIdentity(item.image);
      // Keep only genuine photos (proxied/raster). A fabricated svg placeholder
      // is upgraded to a real proxied photograph instead of being preserved.
      if (isRealPhotoSrc(item.image) && id && !used.has(id)) {
        used.add(id);
        return item;
      }
      changed = true;
      return { ...item, image: nextUnusedShopPhoto(used) };
    });
    if (!changed) return { text: String(raw || ''), changed: false };
    const body = Array.isArray(data) ? next : { ...data, products: next };
    return { text: `${JSON.stringify(body, null, 2)}\n`, changed: true };
  } catch {
    return { text: String(raw || ''), changed: false };
  }
}

/** Build a capped products.json when the model shipped a shop chrome with no catalog. */
export function scaffoldShopCatalogJson(options = {}) {
  const target = shopCatalogTargetSize(options.brief || '', Number(options.count) || 0);
  const brand = String(options.brand || 'Collection').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Collection';
  const used = new Set();
  const products = Array.from({ length: target }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `${brand} ${i + 1}`,
    priceCents: (1800 + i * 250) * 100,
    currency: 'inr',
    image: nextUnusedShopPhoto(used),
  }));
  return `${JSON.stringify(products, null, 2)}\n`;
}

export { SHOP_CATALOG_CAP, SHOP_PHOTO_FLOOR };
