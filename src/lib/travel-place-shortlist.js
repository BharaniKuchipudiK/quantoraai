const HOTELISH = /\b(hotels?|lodging|ryokan|onsen|guesthouse|properties|property stays?|places to stay|accommodation)\b/i;

export function resolveTravelToolInvocation(name, args = {}) {
  if (name !== 'get_places_routing') {
    return { name, args };
  }

  const query = String(args?.query || '').trim();
  const placeType = String(args?.placeType || '').trim();
  const origin = String(args?.origin || '').trim();
  const destination = String(args?.destination || '').trim();
  const blob = `${query} ${placeType} ${origin} ${destination}`;

  if (!HOTELISH.test(blob)) {
    return { name, args };
  }

  const location = (query.replace(/^(?:hotels?|lodging|stays?)\s+(?:in|near|around)\s+/i, '').trim()
    || destination
    || origin
    || query
    || placeType).slice(0, 160);

  if (!location) return { name, args };

  return {
    name: 'search_hotels',
    args: { location },
    rewrittenFrom: 'get_places_routing',
  };
}

export function travelPlacePreviewUrl(place = {}) {
  return String(place.website || place.googleMapsUrl || '').trim();
}

export function formatTravelPlaceShortlist(places = [], { heading = 'Live stays from Google Places' } = {}) {
  const rows = (Array.isArray(places) ? places : [])
    .map((place) => {
      const name = String(place?.name || '').trim();
      if (!name) return null;
      const maps = String(place.googleMapsUrl || '').trim();
      const website = String(place.website || '').trim();
      const href = website || maps;
      const rating = typeof place.userRating === 'number'
        ? `★ ${place.userRating}/5${place.userRatingCount ? ` (${place.userRatingCount})` : ''}`
        : 'Rating not supplied by Google';
      const area = String(place.address || '').trim();
      const title = href ? `[${name}](${href})` : `**${name}**`;
      const links = [
        website ? `[Website](${website})` : null,
        maps ? `[Maps / photos](${maps})` : null,
      ].filter(Boolean).join(' · ');
      return `1. ${title} — ${rating}${area ? ` — ${area}` : ''}${links ? `\n   ${links}` : ''}`;
    })
    .filter(Boolean);

  if (!rows.length) return '';

  const numbered = rows.map((row, index) => row.replace(/^1\./, `${index + 1}.`));
  return [
    `**${heading}**`,
    'Google user ratings, not official hotel stars. We do not check room inventory from here.',
    '',
    ...numbered,
  ].join('\n');
}

export function travelPlacePreviewHtml(place = {}) {
  const name = escapeHtml(place.name || 'Property');
  const href = escapeHtml(travelPlacePreviewUrl(place));
  const rating = typeof place.userRating === 'number'
    ? `★ ${place.userRating}/5${place.userRatingCount ? ` (${place.userRatingCount} reviews)` : ''}`
    : 'No Google user rating on this result';
  const address = escapeHtml(place.address || '');
  const iframe = href
    ? `<iframe src="${href}" title="${name}" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" style="flex:1;width:100%;border:0;background:#0f172a"></iframe>
<p style="margin:10px 16px 16px;font-size:13px;color:#94a3b8">If this pane is blank, the property site blocks embedding. Use Website or Maps above — that is the real page, not a guess.</p>`
    : '<p style="padding:24px;color:#94a3b8">No website or Maps link was returned for this property.</p>';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
  html,body{margin:0;height:100%;background:#0f172a;color:#e2e8f0;font-family:Inter,system-ui,sans-serif}
  .bar{padding:16px 18px 12px;border-bottom:1px solid #334155}
  h1{margin:0 0 6px;font-size:20px}
  .meta{color:#cbd5e1;font-size:14px;margin:0 0 8px}
  a{color:#38bdf8}
  .frame{display:flex;flex-direction:column;height:calc(100% - 88px)}
</style></head>
<body>
  <div class="bar">
    <h1>${name}</h1>
    <p class="meta">${escapeHtml(rating)}${address ? ` · ${address}` : ''}</p>
    ${href ? `<p class="meta"><a href="${href}" target="_blank" rel="noopener noreferrer">Open the property ↗</a></p>` : ''}
  </div>
  <div class="frame">${iframe}</div>
</body></html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
