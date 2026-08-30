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
const ISO_DATE_SCAN = /\b20\d{2}-\d{2}-\d{2}\b/g;

/**
 * Codes that look like airports and are not. Currency matters most: "convert
 * 2000 USD to SGD" in a trip-budget turn would otherwise read as a route.
 */
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

/** Cues that make even a lowercase place name safe to read as the destination. */
const DESTINATION_CUE = /\b(?:trips?\s+to|travel(?:ling|ing)?\s+to|going\s+to|go\s+to|head(?:ing)?\s+to|fly(?:ing)?\s+to|flights?\s+to|holidays?\s+in|vacations?\s+in|hotels?\s+in|stays?\s+in|places?\s+to\s+stay\s+in|visit(?:ing)?)\s+([\p{L}][\p{L}\s'’.-]{1,40})/iu;

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

function isUsablePlace(place) {
  if (!place || place.length < 2) return false;
  // "DPS" is an airport, not a city Places can shortlist.
  if (IATA.test(place)) return false;
  return !hotelLocationNeedsCity(place);
}

function readPlace(text) {
  const value = String(text || '').trim();
  if (!value) return '';

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
    const place = tidyPlace(inferStayLocation(value));
    if (isUsablePlace(place)) return place;
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

/** Name only what is still missing — never re-ask for something already said. */
function describeNext({ destinationLabel, origin, destination, departureDate, canSearchFlights, canSearchHotels }) {
  if (canSearchFlights && canSearchHotels) return 'search live flights and stays — we do not book from here';
  if (canSearchFlights) return 'search live flights, or name the city so I can shortlist stays';

  const missing = [];
  if (!origin) missing.push('the airport you fly from');
  if (!destination) missing.push('the airport you fly into');
  if (!ISO_DATE.test(departureDate)) missing.push('a departure date (YYYY-MM-DD)');

  // Ask where they are going only when nothing has been said about it. Once a
  // route or a city exists, name the blocker that is actually in the way —
  // asking for a city we already have is the thing this desk gets wrong.
  if (!destinationLabel && !destination) return 'tell me the city or area you are heading to';
  if (canSearchHotels) {
    return `stays are ready for ${destinationLabel} — for live flights I still need ${listPhrase(missing)}`;
  }
  return `I still need ${listPhrase(missing)}`;
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
      canSearchFlights: false,
      canSearchHotels: false,
      next: 'tell me the city or area you are heading to',
    };
  }

  const { origin, destination } = readRoute(texts);
  const { departureDate, returnDate } = readDates(texts);
  const destinationLabel = readDestinationLabel(texts);

  const canSearchFlights = IATA.test(origin) && IATA.test(destination) && ISO_DATE.test(departureDate);
  const canSearchHotels = isUsablePlace(destinationLabel);

  return {
    active: true,
    origin,
    destination,
    departureDate,
    returnDate,
    destinationLabel,
    canSearchFlights,
    canSearchHotels,
    next: describeNext({ destinationLabel, origin, destination, departureDate, canSearchFlights, canSearchHotels }),
  };
}
