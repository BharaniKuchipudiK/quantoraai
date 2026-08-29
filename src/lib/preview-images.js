/**
 * Preview cannot hotlink most CDNs (COEP require-corp + iframe embed).
 * Shop inject uses same-origin data-URI <img> photos that always decode in Preview.
 */

import { SHOP_PHOTO_FLOOR } from './shop-catalog-scale.js';

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

/**
 * Proxy the MODEL'S OWN allowed remote image URLs (Unsplash/Pexels/…) to the
 * same-origin preview proxy so they LOAD in Preview and count as real photos.
 * Unlike the removed injector, this KEEPS the model's chosen image — it never
 * swaps in a stock photo. Returns a relative /api/preview-image URL (which
 * resolves in the preview shell); already-proxied and non-allowed srcs are left
 * exactly as the model wrote them (an honest gap, not a fabricated fill).
 */
export function proxyRemoteShopImages(html = '') {
  return String(html || '').replace(
    /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
    (full, pre, src, post) => {
      const clean = String(src).replace(/&amp;/gi, '&');
      if (!/^https?:\/\//i.test(clean) || clean.includes(PREVIEW_IMAGE_PROXY_PATH)) return full;
      if (!isAllowedPreviewImageUrl(clean)) return full;
      return `${pre}${PREVIEW_IMAGE_PROXY_PATH}?u=${encodeURIComponent(clean)}${post}`;
    },
  );
}

/** Proxy allowed remote image URLs in a products.json catalog (the model's own images). */
export function proxyRemoteCatalogImages(raw = '') {
  try {
    const data = JSON.parse(String(raw || ''));
    const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : null);
    if (!list?.length) return { text: String(raw || ''), changed: false };
    let changed = false;
    const next = list.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const src = String(item.image || '').replace(/&amp;/gi, '&');
      if (!/^https?:\/\//i.test(src) || src.includes(PREVIEW_IMAGE_PROXY_PATH)) return item;
      if (!isAllowedPreviewImageUrl(src)) return item;
      changed = true;
      return { ...item, image: `${PREVIEW_IMAGE_PROXY_PATH}?u=${encodeURIComponent(src)}` };
    });
    if (!changed) return { text: String(raw || ''), changed: false };
    return {
      text: `${JSON.stringify(Array.isArray(data) ? next : { ...data, products: next }, null, 2)}\n`,
      changed: true,
    };
  } catch {
    return { text: String(raw || ''), changed: false };
  }
}

/** Preview is the proof. Remote Unsplash srcs that 403 are not product photos. */
export function previewHtmlHasRealPhotos(html = '') {
  return new RegExp(String.raw`<img\b[^>]*\bsrc\s*=\s*["']${RELIABLE_IMG_SRC}`, 'i').test(String(html || ''));
}

const INJECTED_PHOTO_MARK = 'data-quantora-shop-photo="true"';
const INJECTED_PHOTO_RE = /<img\b[^>]*data-quantora-shop-photo="true"[^>]*>/gi;
const INJECTED_CARD_RE = /<(?:article|div)[^>]*data-quantora-shop-card="true"[^>]*>[\s\S]*?<\/(?:article|div)>/gi;
const PRODUCT_SLOT_RE = /<(article|div|li|section)([^>]*(?:class=["'][^"']*\b(?:product|card|tile|item|frame|slot|sku|merchandise)[^"']*["']|data-(?:product|sku|frame)|style=["'][^"']*(?:border[^"']*gold|#c4a35a|#d4af37|goldenrod)[^"']*["'])[^>]*)>([\s\S]*?)<\/\1>/gi;

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
