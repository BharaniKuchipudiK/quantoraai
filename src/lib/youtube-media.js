export function parseYouTubeVideoId(rawHref, baseHref = 'https://quantoraai.app/') {
  if (!rawHref) return null;
  try {
    const url = new URL(rawHref, baseHref);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    if (!['youtube.com', 'm.youtube.com'].includes(host)) return null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const parts = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || null;
  } catch {
    return null;
  }
  return null;
}

const validationCache = new Map();

export async function validateYouTubeVideo(id) {
  if (!id) return { valid: false, reason: 'missing_id' };
  if (validationCache.has(id)) return validationCache.get(id);
  const pending = fetch(`/api/youtube-validate?id=${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) return { valid: false, reason: `http_${response.status}` };
      return response.json();
    })
    .catch(() => ({ valid: false, reason: 'verification_failed' }));
  validationCache.set(id, pending);
  return pending;
}
