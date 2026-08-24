/**
 * Preview cannot hotlink most CDNs: Studio is COEP require-corp.
 * Photos go through Quantora so the boutique actually shows products, not empty frames.
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
  'images.pexels.com',
  'images.pixabay.com',
  'cdn.pixabay.com',
  'upload.wikimedia.org',
]);

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
  return ALLOWED_HOSTS.has(host) || host.endsWith('.unsplash.com') || host.endsWith('.pexels.com');
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

/** Preview is the proof. SVG frames and empty boxes are not product photos. */
export function previewHtmlHasRealPhotos(html = '') {
  return /<img\b[^>]*\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/i.test(String(html || ''));
}

/** Kids/apparel/textile stock — enough unique URLs for a capped catalog. */
const SHOP_PHOTOS = [
  'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4f2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1503919005314-30d9350c4d51?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1523381213236-4bfa5e9c1d36?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1556905055-8f358a7a47a2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1636005342667-4cbedb38b625?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
];

const INJECTED_PHOTO_MARK = 'data-quantora-shop-photo="true"';
const MAX_SHOP_PHOTOS = SHOP_CATALOG_CAP;
const INJECTED_PHOTO_RE = /<img\b[^>]*data-quantora-shop-photo="true"[^>]*>/gi;
const INJECTED_CARD_RE = /<(?:article|div)[^>]*data-quantora-shop-card="true"[^>]*>[\s\S]*?<\/(?:article|div)>/gi;
const PRODUCT_SLOT_RE = /<(article|div|li|section)([^>]*(?:class=["'][^"']*\b(?:product|card|tile|item|frame|slot|sku|merchandise)[^"']*["']|data-(?:product|sku|frame)|style=["'][^"']*(?:border[^"']*gold|#c4a35a|#d4af37|goldenrod)[^"']*["'])[^>]*)>([\s\S]*?)<\/\1>/gi;

function shopPhotoTag(index, alt = 'Product photo') {
  const src = SHOP_PHOTOS[index % SHOP_PHOTOS.length];
  return `<img ${INJECTED_PHOTO_MARK} src="${src}" alt="${alt}" width="1200" height="800" style="width:100%;max-height:280px;object-fit:cover;display:block;border-radius:12px">`;
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
  const matches = String(html || '').match(/<img\b[^>]*\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/gi);
  return matches ? matches.length : 0;
}

export function photoIdentity(src = '') {
  const raw = String(src || '').trim();
  if (!raw) return '';
  let href = raw;
  try {
    const parsed = new URL(raw, 'https://quantoraai.app');
    if (parsed.pathname.includes('preview-image')) {
      href = parsed.searchParams.get('u') || href;
    }
  } catch { /* keep href */ }
  const photo = href.match(/photo-[\w-]+/i);
  if (photo) return photo[0].toLowerCase();
  return href.split('?')[0].toLowerCase();
}

export function uniqueShopPhotoIds(html = '') {
  const ids = new Set();
  String(html || '').replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi, (_, src) => {
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
    if (!/\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/i.test(tag)) return tag;
    if (!first) return tag;
    first = false;
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)/i) || [])[1] || '';
    const id = photoIdentity(src);
    if (id && !used.has(id)) {
      used.add(id);
      return tag;
    }
    return tag.replace(/\bsrc\s*=\s*["'][^"']*["']/, `src="${nextUnusedShopPhoto(used)}"`);
  });
}

/** One repeated Unsplash URL on every card is not a catalog. Give each card its own photo. */
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
      if (!/<img\b[^>]*\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/i.test(inner)) return full;
      return `<${tag}${attrs}>${rewriteCardPhoto(inner, used)}</${tag}>`;
    },
  );
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
  if (/data-quantora-shop-catalog="true"/i.test(out)) {
    out = out.replace(/<section[^>]*data-quantora-shop-catalog="true"[^>]*>[\s\S]*?<\/section>/i, grid);
    return out;
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
      if (/<img\b[^>]*\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/i.test(inner)) return full;
      if (index >= MAX_SHOP_PHOTOS) return full;
      return `<${tag}${attrs}>${shopPhotoTag(index++)}${inner}</${tag}>`;
    },
  );
  // CSS gold frames / generic product slots without <img>
  out = out.replace(PRODUCT_SLOT_RE, (full, tag, attrs, inner) => {
    if (/\b(?:product-card|product-item|product-tile|saree-card)\b/i.test(attrs)) return full;
    if (/<img\b[^>]*\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/i.test(inner)) return full;
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
      if (isAllowedPreviewImageUrl(item.image) && id && !used.has(id)) {
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
