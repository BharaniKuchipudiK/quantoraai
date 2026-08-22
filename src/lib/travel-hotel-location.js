const AMENITY_WORDS = new Set([
  'a', 'all', 'an', 'and', 'beach', 'beaches', 'cheap', 'club', 'clubs',
  'family', 'for', 'hotel', 'hotels', 'inclusive', 'kid', 'kids', 'luxury',
  'pool', 'resort', 'resorts', 'spa', 'stay', 'stays', 'the', 'villa', 'villas',
  'with',
]);

/**
 * Google Places needs a city or area. "Beach resorts with kids' clubs" is a
 * preference, not a place — calling Places with that string just fails closed.
 */
export function hotelLocationNeedsCity(location = '') {
  const text = String(location || '').trim();
  if (text.length < 2) return true;
  if (/\b(in|near|at)\s+[\p{L}\p{N}]{2,}/iu.test(text)) return false;
  if (/,/.test(text)) return false;

  const words = text
    .toLowerCase()
    .replace(/kids['’]s?/g, 'kids')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => word.length > 1 && !AMENITY_WORDS.has(word));

  return words.length === 0;
}

export function hotelCityAsk(location = '') {
  const hint = String(location || '').trim();
  const preference = hint && hotelLocationNeedsCity(hint) ? ` I noted “${hint.slice(0, 80)}”.` : '';
  return `I can look up live stays, but I need a city or area first — for example Phuket, Bali, or the Gold Coast.${preference} I will not invent a hotel list.`;
}
