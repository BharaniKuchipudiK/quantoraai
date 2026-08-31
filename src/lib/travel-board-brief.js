/**
 * Travel desk board state. Pure and testable — decides whether the trip board
 * shows, what it already knows about the trip, and which live searches can
 * actually run.
 *
 * This is Travel's deterministic path to live results: the board calls the
 * provider straight through /api/travel-search, so flights and stays still
 * work on a turn where the model's tool route is unavailable. It never books.
 *
 * A chip lights up only when the search behind it would reach the provider —
 * the enable rules below mirror parseTravelSearchRequest exactly. An enabled
 * chip whose request 400s is a dead control, which is the one thing this desk
 * must never ship.
 */
import { hotelLocationNeedsCity, inferStayLocation } from './travel-hotel-location.js';

const IATA = /^[A-Z]{3}$/;
const ISO_DATE = /^20\d{2}-\d{2}-\d{2}$/;

/** Today in UTC, comparable against a zero-padded ISO date without parsing. */
function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
const ISO_DATE_SCAN = /\b20\d{2}-\d{2}-\d{2}\b/g;

/**
 * Codes that look like airports and are not. Currency matters most: "convert
 * 2000 USD to SGD" in a trip-budget turn would otherwise read as a route.
 */
/**
 * Words that fill a place-shaped slot without naming a place. "I am flying from
 * there" read an origin of "there" — the same invention as "tickets to Bali"
 * reading a destination of "tickets", just on the other end of the trip.
 * Deliberately short, and matched per token. Nice, Reading and Bath are real
 * cities; so are New York City, Cape Town and Mexico City — which is why
 * "city" and "town" are NOT here, though a first pass at this list added them
 * and broke New York City on the spot. Only words that can never be part of a
 * place name belong in it. Blocking a real destination and inventing a fake
 * one are both failures; this list must not trade one for the other.
 */
const NOT_A_PLACE = new Set([
  'there', 'here', 'home', 'anywhere', 'somewhere', 'everywhere', 'nowhere',
  'elsewhere', 'wherever', 'abroad', 'overseas', 'that', 'this', 'it', 'them',
  'us', 'me', 'you', 'mine', 'ours', 'both', 'either', 'destination',
  // Verbs only ever reach a place slot when the phrase was mis-parsed.
  'take', 'find', 'book', 'need', 'want', 'get', 'show', 'give', 'plan',
]);

const NOT_AN_AIRPORT = new Set([
  'USD', 'EUR', 'GBP', 'SGD', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY', 'CNY', 'HKD',
  'INR', 'IDR', 'THB', 'MYR', 'PHP', 'VND', 'KRW', 'TWD', 'AED', 'SAR', 'QAR',
  'ZAR', 'BRL', 'MXN', 'TRY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'LKR', 'PKR',
  'AND', 'THE', 'FOR', 'YOU', 'NOT', 'BUT', 'ARE', 'CAN', 'ANY', 'ONE', 'TWO',
  'OUR', 'ALL', 'NEW', 'GET', 'LET', 'SEE', 'WAY', 'DAY', 'MAY', 'NOW', 'HOW',
  'WHY', 'WHO', 'ITS', 'HAS', 'HAD', 'WAS', 'USA', 'UAE', 'FAQ', 'ETA', 'PDF',
  'API', 'CEO', 'VIP', 'TBD', 'YES', 'PER', 'PAX', 'MON', 'TUE', 'WED', 'THU',
  'FRI', 'SAT', 'SUN',
]);

/*
 * Codes are matched case-sensitively so "from bali" cannot yield "bal", which
 * is why each cue spells out its capitalisations instead of using the i flag.
 */
const ROUTE_PAIR = /\b([A-Z]{3})\s*(?:→|->|—|–|-|to|To|TO)\s*([A-Z]{3})\b/;
const FROM_CODE = /\b(?:from|From|FROM|out of|Out of|leaving|Leaving|departing|Departing)\s+([A-Z]{3})\b/;
const TO_CODE = /\b(?:to|To|TO|into|Into|INTO)\s+([A-Z]{3})\b/;

/**
 * Cues that make even a lowercase place name safe to read as the destination.
 *
 * The booking verbs are here because a traveller's first message is usually a
 * request to book, not a request to plan: "help me book tickets to Bali from
 * Singapore" carried both ends of the trip and this list understood neither, so
 * the board asked "Where are you heading?" directly underneath a reply that
 * said "your trip to Bali".
 */
const DESTINATION_CUE = /\b(?:trips?\s+to|travel(?:ling|ing)?\s+to|going\s+to|go\s+to|head(?:ing|ed)?\s+(?:to|for)|fly(?:ing)?\s+to|flights?\s+to|tickets?\s+to|seats?\s+to|book(?:ing)?\s+(?:me\s+)?(?:a\s+|an\s+|some\s+|the\s+)?(?:flights?|tickets?|seats?|trips?|travel|holidays?|vacations?)?\s*to|(?:get|take|fly|send)\s+me\s+to|holidays?\s+in|vacations?\s+in|hotels?\s+in|stays?\s+in|places?\s+to\s+stay\s+in|visit(?:ing)?)\s+([\p{L}][\p{L}\s'’.-]{1,40})/iu;

/**
 * Where they are flying FROM, as a place name rather than an airport code.
 *
 * Origin was only ever read as IATA, so "from Singapore" was discarded in
 * silence. This never gates a search — canSearchFlights still needs a real
 * code — it exists so the board can show the trip it was told about instead of
 * looking like it heard nothing.
 */
const FROM_PLACE = /\b(?:from|out\s+of|departing\s+from|leaving\s+from|starting\s+(?:from|in))\s+([\p{L}][\p{L}\s'’.-]{1,40})/iu;

/**
 * "from Kuala Lumpur to Tokyo" names both ends in one breath. The cue list
 * needs the verb adjacent to the destination, so a sentence that puts the
 * origin in between ("book me a flight from X to Y") slipped past it entirely.
 */
const ROUTE_PLACES = /\bfrom\s+([\p{L}][\p{L}\s'’.-]{1,40}?)\s+to\s+([\p{L}][\p{L}\s'’.-]{1,40})/iu;

/** Words that end a place name rather than belong to it. */
const LABEL_STOP = new Set([
  'a', 'about', 'after', 'also', 'an', 'and', 'around', 'at', 'before',
  'between', 'during', 'for', 'from', 'i', 'if', 'in', 'include', 'including',
  'my', 'near', 'next', 'on', 'onwards', 'our', 'over', 'please', 'plus', 'so',
  'the', 'then', 'this', 'to', 'under', 'we', 'when', 'while', 'with',
]);

function isAirportCode(value) {
  const code = String(value || '').trim();
  return IATA.test(code) && !NOT_AN_AIRPORT.has(code);
}

function userTexts(messages) {
  return (messages || [])
    .filter((message) => message?.sender === 'user' && typeof message.text === 'string' && message.text.trim())
    .map((message) => message.text);
}

/** Keep at most three words, stopping where the place name plainly ends. */
function tidyPlace(raw) {
  const tokens = [];
  for (const piece of String(raw || '').trim().split(/\s+/)) {
    const token = piece.replace(/[^\p{L}\p{N}'’-]/gu, '');
    if (!token || LABEL_STOP.has(token.toLowerCase())) break;
    tokens.push(token);
    if (tokens.length >= 3) break;
  }
  return tokens.join(' ');
}

/**
 * True when tidyPlace consumed the whole phrase without cutting anything.
 *
 * "tickets to Bali" tidies to "tickets" — a fragment the board reported as the
 * destination and would have sent to Google Places as a city, with the Stays
 * chip lit. Truncation means the sentence had structure the cue list did not
 * understand, and guessing at its head is exactly how a destination gets
 * invented. Understanding none of it is the honest answer.
 */
function isWholePhrase(raw, tidied) {
  const rawTokens = String(raw || '').trim().split(/\s+/).filter(Boolean).length;
  const keptTokens = tidied ? tidied.split(/\s+/).filter(Boolean).length : 0;
  return rawTokens > 0 && rawTokens === keptTokens;
}

function isUsablePlace(place) {
  if (!place || place.length < 2) return false;
  // "DPS" is an airport, not a city Places can shortlist.
  if (IATA.test(place)) return false;
  /*
   * ANY token, not the whole string. "somewhere warm", "anywhere cheap" and
   * "take me home" all survived a whole-string check and were reported as
   * destinations — the stop word was simply not alone. A real place name that
   * merely contains one of these as a longer word is untouched, because this
   * compares whole tokens: Homestead is not "home".
   */
  if (place.toLowerCase().split(/\s+/).some((token) => NOT_A_PLACE.has(token))) return false;
  return !hotelLocationNeedsCity(place);
}

function readPlace(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  const routed = value.match(ROUTE_PLACES);
  if (routed) {
    const place = tidyPlace(routed[2]);
    if (isUsablePlace(place)) return place;
  }

  const cued = value.match(DESTINATION_CUE);
  if (cued) {
    // The cue already said where the place sits in this sentence. If what
    // follows is not a usable place, the sentence holds no bare answer
    // either — reading the whole phrase would invent "flying to DPS".
    const place = tidyPlace(cued[1]);
    return isUsablePlace(place) ? place : '';
  }

  // A bare "Singapore" is an answer to "which city?", not noise. Reading it
  // is what stops the desk asking twice for a city already named.
  if (value.split(/\s+/).length <= 3) {
    const inferred = inferStayLocation(value);
    const place = tidyPlace(inferred);
    if (place && isWholePhrase(inferred, place) && isUsablePlace(place)) return place;
  }
  return '';
}

/** Newest statement wins, so a correction replaces an earlier answer. */
function readDestinationLabel(texts) {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const place = readPlace(texts[index]);
    if (place) return place;
  }
  return '';
}

/** Newest statement wins, as with the destination. */
function readOriginLabel(texts) {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = String(texts[index]);
    const routed = text.match(ROUTE_PLACES);
    if (routed) {
      const both = tidyPlace(routed[1]);
      if (isUsablePlace(both)) return both;
    }
    const match = text.match(FROM_PLACE);
    if (!match) continue;
    const place = tidyPlace(match[1]);
    if (isUsablePlace(place)) return place;
  }
  return '';
}

function readRoute(texts) {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const pair = String(texts[index]).match(ROUTE_PAIR);
    if (pair && isAirportCode(pair[1]) && isAirportCode(pair[2])) {
      return { origin: pair[1], destination: pair[2] };
    }
  }

  // Airports named in separate turns ("I fly from SIN" … then "into DPS").
  let origin = '';
  let destination = '';
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = String(texts[index]);
    if (!origin) {
      const match = text.match(FROM_CODE);
      if (match && isAirportCode(match[1])) origin = match[1];
    }
    if (!destination) {
      const match = text.match(TO_CODE);
      if (match && isAirportCode(match[1])) destination = match[1];
    }
    if (origin && destination) break;
  }
  return { origin, destination };
}

function readDates(texts) {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const found = [...new Set(String(texts[index]).match(ISO_DATE_SCAN) || [])].sort();
    if (!found.length) continue;
    return { departureDate: found[0], returnDate: found[1] || '' };
  }
  return { departureDate: '', returnDate: '' };
}

function listPhrase(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What the trip is still short of, as facts rather than a sentence. */
function describeMissing({ destinationLabel, origin, destination, departureDate }) {
  const missing = [];
  // Asked for only when nothing at all has been said about where they are
  // going. Once a route or a city exists, asking again is the thing this desk
  // gets wrong most often.
  if (!destinationLabel && !destination) missing.push('place');
  if (!origin) missing.push('origin');
  if (!destination) missing.push('destination');
  if (!ISO_DATE.test(departureDate) || departureDate < todayIso()) missing.push('departureDate');
  return missing;
}

const MISSING_LABEL = {
  place: 'where you are heading',
  origin: 'departure airport',
  destination: 'arrival airport',
  departureDate: 'a date (YYYY-MM-DD)',
};

/**
 * One short line, or none at all.
 *
 * This used to be a full sentence of prose that wrapped to two lines on the
 * board and re-stated what the chips underneath it already offered — the
 * single most expensive row on a surface whose whole promise is "one screen".
 * A board with nothing left to ask for now says nothing, and shrinks.
 */
function describeNext(missing, { destinationLabel, canSearchHotels }) {
  if (!missing.length) return '';

  // Where they are going comes first and alone. A traveller who has said
  // nothing yet must not be met with a demand for two airport codes and a date
  // — that is the verbose version's one genuinely good instinct, kept.
  if (missing.includes('place')) return 'Where are you heading?';

  const wanted = missing.map((key) => MISSING_LABEL[key]).filter(Boolean);
  if (!wanted.length) return '';

  // Stays already work, so name the one thing flights are still short of
  // rather than implying the whole trip is blocked.
  return canSearchHotels && destinationLabel
    ? `For flights: ${listPhrase(wanted)}.`
    : `Need ${listPhrase(wanted)}.`;
}

/**
 * Show the board once the traveller has actually said something. Mirrors the
 * Finance desk: the board is a working surface for a live thread, not chrome
 * that greets an empty one.
 */
export function deriveTravelBrief({ messages = [] } = {}) {
  const texts = userTexts(messages);
  if (!texts.length) {
    return {
      active: false,
      origin: '',
      destination: '',
      departureDate: '',
      returnDate: '',
      destinationLabel: '',
      originLabel: '',
      canSearchFlights: false,
      canSearchHotels: false,
      missing: ['place', 'origin', 'destination', 'departureDate'],
      next: 'Where are you heading?',
    };
  }

  const { origin, destination } = readRoute(texts);
  const { departureDate, returnDate } = readDates(texts);
  const destinationLabel = readDestinationLabel(texts);
  const originLabel = readOriginLabel(texts);

  /*
   * A departure that has already happened is not a searchable trip. The board
   * lit the Flights chip for any well-formed 20xx date, so a date the model had
   * resolved against the wrong year offered a search that could only fail — the
   * same dead control as a chip with no provider behind it.
   */
  const departureInFuture = ISO_DATE.test(departureDate) && departureDate >= todayIso();
  const canSearchFlights = IATA.test(origin) && IATA.test(destination) && departureInFuture;
  const canSearchHotels = isUsablePlace(destinationLabel);

  const missing = describeMissing({ destinationLabel, origin, destination, departureDate });

  return {
    active: true,
    origin,
    destination,
    departureDate,
    returnDate,
    destinationLabel,
    /*
     * Display only. It deliberately does not feed canSearchFlights or missing:
     * a city is not an airport, so the desk still has to ask for the code
     * before a search can run. Showing it stops the board looking like it
     * ignored half of what it was told.
     */
    originLabel,
    canSearchFlights,
    canSearchHotels,
    /*
     * Structured, so the board can offer a chip for exactly the gap in the way
     * and the wording stays in one place. A chip that asks for something
     * already known is the same dead control as a search that cannot run.
     */
    missing,
    next: describeNext(missing, { destinationLabel, canSearchHotels }),
  };
}
