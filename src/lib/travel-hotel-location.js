const AMENITY_WORDS = new Set([
  'a', 'all', 'an', 'and', 'beach', 'beaches', 'cheap', 'club', 'clubs',
  'family', 'for', 'hotel', 'hotels', 'inclusive', 'kid', 'kids', 'luxury',
  'pool', 'resort', 'resorts', 'spa', 'stay', 'stays', 'the', 'villa', 'villas',
  'with',
]);

const CLOSED_REPLY = /^(yes|no|ok|okay|sure|thanks|thank you|please|hi|hello|hey|yep|nope|continue|go ahead|i['’]?m with you)$/i;

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

export function inferStayLocation(text = '') {
  const value = String(text || '').trim();
  if (!value || CLOSED_REPLY.test(value)) return '';
  if (/^20\d{2}-\d{2}-\d{2}$/.test(value)) return '';
  if (/^\d+\s+(adults?|kids?|children|nights?|people)\b/i.test(value)) return '';

  const afterIn = value.match(/\b(?:in|near|at)\s+(.+)$/iu);
  if (afterIn) {
    const stop = new Set(['and', 'with', 'for', 'including', 'include', 'to', 'the', 'a', 'an', 'hotels', 'hotel', 'stay', 'stays', 'please', 'also']);
    const tokens = [];
    for (const raw of afterIn[1].split(/\s+/).filter(Boolean)) {
      const token = raw.replace(/[?.!,]+$/g, '');
      if (!token || stop.has(token.toLowerCase())) break;
      tokens.push(token);
      if (tokens.length >= 3) break;
    }
    const place = tokens.join(' ').trim();
    if (place && !hotelLocationNeedsCity(place)) return place;
  }

  if (value.length > 60) return '';
  if (hotelLocationNeedsCity(value)) return '';
  return value;
}

export function resolveHotelSearchLocation(toolLocation = '', recentUserTexts = []) {
  const direct = String(toolLocation || '').trim();
  if (direct && !hotelLocationNeedsCity(direct) && direct.length <= 60) return direct;
  const fromDirect = inferStayLocation(direct);
  if (fromDirect) return fromDirect;
  const fromChat = [...(Array.isArray(recentUserTexts) ? recentUserTexts : [])]
    .reverse()
    .map((text) => inferStayLocation(text))
    .find(Boolean);
  return fromChat || (direct && !hotelLocationNeedsCity(direct) ? direct : '') || direct;
}

export function hotelProviderFailureAsk(location = '', { configured = true, kind = 'hotels' } = {}) {
  const place = String(location || '').trim();
  const known = place && !hotelLocationNeedsCity(place);
  const noun = kind === 'attractions' ? 'attractions' : 'hotels';
  if (!configured) {
    return known
      ? `Live Places lookup is not connected, so I cannot list ${noun} in ${place}. I will not invent a list.`
      : `Live Places lookup is not connected. I will not invent a ${noun} list.`;
  }
  if (known) {
    return `I could not look up live ${noun} in ${place} just now. Places did not return a list — I will not invent one. Retry in a moment.`;
  }
  return kind === 'attractions'
    ? 'I could not look up live attractions just now. Name the city or area and I will try again — I will not invent a list.'
    : 'I could not look up live hotels just now. Tell me the city or area if you have not — I will not invent a list. If Places is down, we can retry after it is connected.';
}

export function hotelEmptyResultsAsk(location = '', { kind = 'hotels' } = {}) {
  const place = String(location || '').trim();
  const noun = kind === 'attractions' ? 'attractions' : 'stays';
  if (place && !hotelLocationNeedsCity(place)) {
    return `Places returned no ${noun} for ${place}. I will not invent a list. Try a neighbourhood, or retry.`;
  }
  return `Places returned no ${noun}. Tell me a city or area — I will not invent a list.`;
}
