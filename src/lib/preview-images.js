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
