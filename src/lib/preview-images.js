/**
 * Preview cannot hotlink most CDNs: Studio is COEP require-corp.
 * Photos go through Quantora so the boutique actually shows silk, not empty frames.
 */

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

const SHOP_PHOTOS = [
  'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1636005342667-4cbedb38b625?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=1200&q=80',
];

const INJECTED_PHOTO_MARK = 'data-quantora-shop-photo="true"';
const MAX_SHOP_PHOTOS = 6;
const INJECTED_PHOTO_RE = /<img\b[^>]*data-quantora-shop-photo="true"[^>]*>/gi;

function shopPhotoTag(index, alt = 'Textile photo') {
  const src = SHOP_PHOTOS[index % SHOP_PHOTOS.length];
  return `<img ${INJECTED_PHOTO_MARK} src="${src}" alt="${alt}" width="1200" height="800" style="width:100%;max-height:280px;object-fit:cover;display:block">`;
}

/** Previous inject put a photo on every nested "card". Strip those so Preview is not a repeating stack. */
export function stripInjectedShopPhotos(html = '') {
  return String(html || '')
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

/**
 * The model keeps drawing gold frames. Preview is the product: put real photos
 * in the HTML when a shop has none.
 */
export function injectMissingShopPhotos(html = '') {
  const cleaned = stripInjectedShopPhotos(html);
  if (!cleaned) {
    return { html: String(html || ''), injected: false };
  }
  let index = 0;
  let out = cleaned.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => {
    if (isTinyDecorativeSvg(svg) || index >= MAX_SHOP_PHOTOS) return svg;
    return shopPhotoTag(index++);
  });
  out = out.replace(
    productCardRe(),
    (full, tag, attrs, inner) => {
      if (/<img\b[^>]*\bsrc\s*=\s*["'](?:https?:\/\/|\/api\/preview-image)/i.test(inner)) return full;
      if (index >= MAX_SHOP_PHOTOS) return full;
      return `<${tag}${attrs}>${shopPhotoTag(index++)}${inner}</${tag}>`;
    },
  );
  if (!previewHtmlHasRealPhotos(out) && /<main\b/i.test(out)) {
    out = out.replace(/<main\b[^>]*>/i, (open) => `${open}${shopPhotoTag(index++, 'Collection photo')}`);
  }
  if (!previewHtmlHasRealPhotos(out) && /<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${shopPhotoTag(index++, 'Collection photo')}</body>`);
  }
  const diversified = diversifyDuplicateShopPhotos(out);
  return { html: diversified, injected: diversified !== cleaned };
}

export function injectProductCatalogImages(raw = '') {
  try {
    const data = JSON.parse(String(raw || ''));
    const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : null);
    if (!list?.length) return { text: String(raw || ''), changed: false };
    const used = new Set();
    let changed = false;
    const next = list.map((item) => {
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
