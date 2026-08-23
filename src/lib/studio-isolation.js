/**
 * Terminal and Git need an isolated document (COOP same-origin).
 * Google Sign-In needs allow-popups. Those cannot share one page.
 * Studio after login lives at /desk. Login stays on /.
 */

export const ISOLATED_STUDIO_PATH = '/desk';

export function isIsolatedStudioPath(pathname = '') {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  return path === ISOLATED_STUDIO_PATH;
}

export function isolatedStudioHref() {
  return ISOLATED_STUDIO_PATH;
}

export function homeHrefForTab(tab = 'landing') {
  const name = String(tab || 'landing');
  if (name === 'landing' || name === 'studio') return '/';
  return `/?tab=${encodeURIComponent(name)}`;
}

export function tabFromLocation(pathname = '/', search = '') {
  if (isIsolatedStudioPath(pathname)) return 'studio';
  const tab = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('tab');
  if (tab && tab !== 'studio') return tab;
  return 'landing';
}

const PREFILL_KEY = 'quantora_studio_prefill';

export function stashStudioPrefill(text = '') {
  const value = String(text || '').trim();
  if (typeof sessionStorage === 'undefined' || !value) return;
  sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ id: Date.now(), text: value }));
}

export function takeStudioPrefill() {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(PREFILL_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PREFILL_KEY);
  try {
    const parsed = JSON.parse(raw);
    const text = String(parsed?.text || '').trim();
    if (!text) return null;
    return { id: Number(parsed?.id) || Date.now(), text };
  } catch {
    return null;
  }
}

/** Extra CSP hosts WebContainer needs on the isolated desk only. */
export const ISOLATED_STUDIO_CSP_EXTRA = {
  connectSrc: ' https://*.webcontainer-api.io https://*.local-coep.webcontainer-api.io wss://*.webcontainer-api.io',
  frameSrc: ' https://*.webcontainer.io https://*.webcontainer-api.io',
};
