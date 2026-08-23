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

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

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

function shopPhotoTag(index, alt = 'Textile photo') {
  const src = SHOP_PHOTOS[index % SHOP_PHOTOS.length];
  return `<img src="${src}" alt="${alt}" width="1200" height="800" style="width:100%;height:min(52vh,420px);object-fit:cover;display:block">`;
}

function isTinyDecorativeSvg(svg) {
  const head = svg.slice(0, 280);
  if (/\b(icon|logo|bag|cart|lucide)\b/i.test(head)) return true;
  const width = head.match(/\bwidth=["'](\d+)/i);
  if (width && Number(width[1]) <= 48) return true;
  return svg.length < 480;
}

/**
 * The model keeps drawing gold frames. Preview is the product: put real photos
 * in the HTML when a shop has none.
 */
export function injectMissingShopPhotos(html = '') {
  const source = String(html || '');
  if (!source || previewHtmlHasRealPhotos(source)) {
    return { html: source, injected: false };
  }
  let index = 0;
  let out = source.replace(/<(article|div|section|li)([^>]*class=["'][^"']*(?:product|card|tile|catalog|saree|look|piece|showcase)[^"']*["'][^>]*)>/gi, (open) => (
    `${open}${shopPhotoTag(index++)}`
  ));
  if (!previewHtmlHasRealPhotos(out)) {
    out = out.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => {
      if (isTinyDecorativeSvg(svg) || index >= 8) return svg;
      return shopPhotoTag(index++);
    });
  }
  if (!previewHtmlHasRealPhotos(out) && /<main\b/i.test(out)) {
    out = out.replace(/<main\b[^>]*>/i, (open) => `${open}${shopPhotoTag(0, 'Collection photo')}`);
  }
  if (!previewHtmlHasRealPhotos(out) && /<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${shopPhotoTag(0, 'Collection photo')}</body>`);
  }
  return { html: out, injected: previewHtmlHasRealPhotos(out) };
}

export function injectProductCatalogImages(raw = '') {
  try {
    const data = JSON.parse(String(raw || ''));
    const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : null);
    if (!list?.length) return { text: String(raw || ''), changed: false };
    let index = 0;
    let changed = false;
    const next = list.map((item) => {
      if (!item || typeof item !== 'object') return item;
      if (isAllowedPreviewImageUrl(item.image)) return item;
      changed = true;
      return { ...item, image: SHOP_PHOTOS[index++ % SHOP_PHOTOS.length] };
    });
    if (!changed) return { text: String(raw || ''), changed: false };
    const body = Array.isArray(data) ? next : { ...data, products: next };
    return { text: `${JSON.stringify(body, null, 2)}\n`, changed: true };
  } catch {
    return { text: String(raw || ''), changed: false };
  }
}
