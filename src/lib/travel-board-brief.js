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

/**
 * The earliest date still worth searching, in UTC, with a day of slack.
 *
 * A bare UTC "today" rejects legitimate same-day travel for anyone west of UTC:
 * at 2026-09-01T00:30Z it is still 31 August across the Americas, so a New
 * Yorker booking a flight for their own today was refused as a past date. The
 * offsets run from UTC-12 to UTC+14, so a local date is never more than one day
 * BEHIND the UTC one — one day of slack is exact, not a guess.
 *
 * This guard exists to catch a date that is obviously wrong (the model
 * resolving "next 2-4 weeks" to sixteen months ago), not to police same-day
 * precision. Refusing a real booking is the worse failure of the two.
 */
function earliestSearchableIso(now = new Date()) {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
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
  // "going to see Hamilton" matched the going-to cue and captured the whole
  // tail, reporting a destination of "see Hamilton". A cue says where the
  // place sits; it does not check that what sits there is one.
  'see', 'meet', 'meeting', 'catch', 'explore', 'visit', 'visiting',
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
 * Words that make "from X to Y" a DATE RANGE rather than a route.
 *
 * ROUTE_PLACES was added to read "from Kuala Lumpur to Tokyo" and promptly read
 * "I can travel from Monday to Friday" as a trip from Monday to Friday, with
 * the Stays chip lit over a fabricated destination — the exact invention this
 * module exists to prevent, reintroduced by the fix for it.
 *
 * Checked ONLY on the route pattern, never globally: March and May are real
 * towns, and "trip to March" arrives through the destination cue where the
 * sentence structure says it is a place. Here, where the only evidence is the
 * word "from", a month is overwhelmingly a date.
 */
const TEMPORAL_WORD = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'tues', 'wed', 'thu', 'thurs', 'fri', 'sat', 'sun',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'today', 'tomorrow', 'tonight', 'yesterday', 'weekend', 'weekday', 'week',
  'month', 'year', 'morning', 'afternoon', 'evening', 'night', 'noon', 'midnight',
  'summer', 'winter', 'spring', 'autumn', 'fall', 'easter', 'christmas', 'newyear',
]);

/** True when either end of a route pair reads as a time rather than a place. */
function looksTemporal(...places) {
  return places.some((place) => String(place || '')
    .toLowerCase()
    .split(/\s+/)
    .some((token) => TEMPORAL_WORD.has(token)));
}

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
  'my', 'near', 'next', 'on', 'onwards', 'or', 'our', 'over', 'please', 'plus', 'so',
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
    // "Copenhagen. thoughts?" is one place and one question, not a two-word
    // city — sentence punctuation ends a name as surely as a stop word does.
    const ends = /[.,;:!?]/.test(piece);
    tokens.push(token);
    if (ends || tokens.length >= 3) break;
  }
  return tokens.join(' ');
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

/**
 * Capitalised words that open an English sentence without naming a place.
 *
 * Sentence-initial capitals are the one place the proper-noun signal below is
 * ambiguous: "Planning our honeymoon" and "Bali is lovely" look identical to a
 * capitalisation test. Only openers that can never be a destination belong
 * here — the list is checked at position 0 only, so a real place that happens
 * to start the sentence is untouched.
 */
const SENTENCE_OPENER = new Set([
  'i', 'we', 'my', 'our', 'me', 'us', 'you', 'your', 'it', 'is', 'are', 'am',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'will', 'shall',
  'what', 'whats', 'where', 'wheres', 'when', 'whens', 'why', 'how', 'hows',
  'who', 'which', 'if', 'so', 'but', 'and', 'or', 'the', 'a', 'an', 'any',
  'help', 'book', 'find', 'show', 'give', 'get', 'take', 'need', 'want',
  'plan', 'planning', 'looking', 'thinking', 'flying', 'heading', 'going',
  'travelling', 'traveling', 'visiting', 'trip', 'trips', 'holiday', 'holidays',
  'vacation', 'vacations', 'family', 'weekend', 'free', 'available', 'hi',
  'hello', 'hey', 'please', 'thanks', 'ok', 'okay', 'yes', 'no', 'maybe',
  'also', 'just', 'lets', 'there', 'this', 'that', 'these', 'those', 'not',
  'sure', 'still', 'now', 'then', 'from', 'to', 'in', 'at', 'on', 'for',
]);

/**
 * Words that mark the proper noun after them as where the trip STARTS.
 *
 * "of" is NOT here despite "out of Chennai" needing it: on its own it is the
 * most common preposition in English and reported an origin of "Sarah" from
 * "I have a photo of Sarah". The two-word construction is matched separately,
 * against the pair rather than the tail.
 */
const ORIGIN_PREPOSITION = new Set(['from', 'leaving', 'departing']);

/** Two-word origin constructions, matched whole so "of" alone proves nothing. */
const ORIGIN_PHRASE = new Set(['out of', 'departing from', 'leaving from', 'flying from']);

/**
 * Words that mark the proper noun after them as somewhere you GO.
 *
 * Capitalisation says a word is a proper noun; it does not say the noun is a
 * place. An earlier pass here trusted the capital alone and promptly offered
 * to search for hotels in "Sarah", "Emirates", "Marriott" and "Deloitte" —
 * fourteen of fifteen non-place proper nouns read as destinations. Names,
 * airlines, hotel chains, card networks and employers all arrive capitalised
 * in a travel chat, and no blocklist of them ever finishes.
 *
 * A locative preposition is evidence of ROLE rather than of spelling, which is
 * the thing actually being asserted: you travel TO, land IN, stay NEAR a
 * place. You do not travel to Sarah. It costs recall on phrasings that name a
 * place with no preposition at all ("probably Phuket") and that is the correct
 * side to fail on — silence asks one extra question, invention searches for a
 * city that does not exist.
 */
const DESTINATION_PREPOSITION = new Set([
  'to', 'in', 'at', 'into', 'around', 'near', 'toward', 'towards',
  'visit', 'visiting', 'explore', 'exploring', 'reach', 'reaching',
  // "see" is deliberately absent. It reads as locative in "wanted to see
  // Petra" and not at all in "plan to see Sarah", which reported Sarah as the
  // destination with the Stays chip lit. A word that takes people and shows as
  // readily as it takes places is not evidence of a place, so the Petra-shaped
  // sentence is a miss we accept rather than a guess we make.
]);

/** A capitalised, non-shouting word — "Bali", "Lanka", but not "USD". */
const PROPER_WORD = /^\p{Lu}[\p{Ll}'’.-]+$/u;

/**
 * Places named by capitalisation rather than by sentence pattern.
 *
 * The cue lists above match PHRASINGS, and there are infinitely many of those
 * against a finite list — which is why the desk heard only half the people who
 * told it where they were going, and answered "Where are you heading?" at
 * someone who had just said Tromso. Adding cue number forty-seven does not fix
 * a design that needs cue number forty-eight next week.
 *
 * The signal it was ignoring: people capitalise place names even when they
 * capitalise nothing else. "whats the cheapest way to get to Bali in December"
 * is lowercase throughout except the two words that are proper nouns. So a
 * capitalised run that is not a sentence opener, not a time, and not shouting
 * an airport code is almost always a place — and reading it costs no gazetteer.
 *
 * Precision is protected structurally rather than by hoping: the candidate must
 * survive every stop list already in this module, and AMBIGUITY REPORTS
 * NOTHING. "Japan or Korea, not sure yet" yields two candidates and therefore
 * no answer, which is the honest reading of an undecided traveller.
 */
function properNounPlaces(text) {
  const words = String(text || '').trim().split(/\s+/);
  const spans = [];
  let current = null;

  words.forEach((word, index) => {
    const bare = word.replace(/[^\p{L}\p{N}'’-]/gu, '');
    const isProper = bare && PROPER_WORD.test(bare)
      && !(index === 0 && SENTENCE_OPENER.has(bare.toLowerCase()))
      && !TEMPORAL_WORD.has(bare.toLowerCase())
      && !NOT_A_PLACE.has(bare.toLowerCase());

    if (isProper) {
      if (current) current.words.push(bare);
      else current = { words: [bare], at: index };
    } else if (current) {
      spans.push(current);
      current = null;
    }
    // A comma or full stop ends a name: "Chennai next week, want to end up in
    // Bangkok" must not fuse across the break.
    if (current && /[,.;:!?]$/.test(word)) { spans.push(current); current = null; }
  });
  if (current) spans.push(current);

  const word = (index) => (words[index] || '').replace(/[^\p{L}]/gu, '').toLowerCase();
  return spans
    .map((span) => ({
      place: span.words.slice(0, 3).join(' '),
      lead: word(span.at - 1),
      leadPair: `${word(span.at - 2)} ${word(span.at - 1)}`.trim(),
    }))
    .filter((span) => isUsablePlace(span.place));
}

/**
 * The destination a capitalised name implies, or '' when the sentence is
 * ambiguous. One candidate is the answer; several mean the traveller is still
 * choosing, and guessing between them is invention with better manners.
 */
function properNounDestination(text) {
  const found = properNounPlaces(text).filter((span) => DESTINATION_PREPOSITION.has(span.lead)
    && !ORIGIN_PHRASE.has(span.leadPair));
  return found.length === 1 ? found[0].place : '';
}

/** The origin a capitalised name implies, only when a from-word introduces it. */
function properNounOrigin(text) {
  const found = properNounPlaces(text)
    .filter((span) => ORIGIN_PREPOSITION.has(span.lead) || ORIGIN_PHRASE.has(span.leadPair));
  return found.length === 1 ? found[0].place : '';
}

/**
 * Words a traveller says TO the assistant rather than ABOUT a trip.
 *
 * "Copenhagen. thoughts?" and "Sure. what next?" are structurally identical —
 * a capitalised word, sentence punctuation, then a question — so no rule about
 * shape can separate them. Reading the fragment alone made "Sure", "Great" and
 * "Ok" destinations with the live Stays chip lit, which is worse than the
 * deafness the punctuation break was added to fix.
 *
 * Since structure cannot decide it, a list must, and this one is deliberately
 * conservative. "Nice", "Reading", "Bath", "March" and "May" are all real
 * places and none of them appear here, because refusing a real destination and
 * inventing a fake one are both failures.
 */
const ACKNOWLEDGEMENT = new Set([
  'great', 'cool', 'perfect', 'awesome', 'excellent', 'brilliant', 'right',
  'done', 'yeah', 'yep', 'nope', 'sorry', 'wow', 'amazing', 'good', 'super',
]);

/**
 * True when a short bare reply reads as a name rather than as a sentence.
 *
 * This path exists so "Singapore" answers "which city?" without being asked
 * twice. It used to accept ANY phrase of three words or fewer, which made
 * "is Skyscanner cheaper" a destination — a question read as a city, one tap
 * from a live hotel search.
 *
 * A single word is still taken on trust: a one-word reply in a travel chat is
 * overwhelmingly the answer to the question just asked, and people type "bali"
 * without a capital. Beyond one word the phrase must carry capitals on every
 * token, because that is what separates "New York City" from "is Skyscanner
 * cheaper" without needing to know either of them.
 *
 * This replaces an earlier whole-phrase check that asked whether tidyPlace had
 * cut anything. That test was written for "tickets to Bali", which tidies to
 * the fragment "tickets" — but it also rejected "Copenhagen. thoughts?", where
 * the cut is the correct reading. Asking what the survivor looks like answers
 * both; asking only whether a cut happened answers neither well.
 */
function looksLikeBareName(place) {
  const tokens = String(place || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // An acknowledgement is never a place, however it is capitalised.
  const first = tokens[0].toLowerCase();
  if (ACKNOWLEDGEMENT.has(first) || SENTENCE_OPENER.has(first)) return false;
  if (tokens.length === 1) return /^[\p{L}][\p{L}'’.-]*$/u.test(tokens[0]);
  return tokens.every((token) => /^\p{Lu}/u.test(token));
}

function readPlace(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  const routed = value.match(ROUTE_PLACES);
  if (routed) {
    const from = tidyPlace(routed[1]);
    const place = tidyPlace(routed[2]);
    // Both ends must read as places. One temporal word makes the whole pattern
    // a date range, and half of a date range is not a destination.
    if (!looksTemporal(from, place) && isUsablePlace(place)) return place;
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
    if (place && looksLikeBareName(place) && isUsablePlace(place)) return place;
  }

  // Last resort, once every phrasing rule above has declined: the sentence may
  // still name a place in the only way people reliably mark one — a capital.
  return properNounDestination(value);
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
      const other = tidyPlace(routed[2]);
      if (!looksTemporal(both, other) && isUsablePlace(both)) return both;
    }
    const match = text.match(FROM_PLACE);
    if (match) {
      const place = tidyPlace(match[1]);
      // "from Monday", "from next week": a bare from-phrase is a date at least
      // as often as it is a city, and an origin nobody named is still an
      // invention.
      if (!looksTemporal(place) && isUsablePlace(place)) return place;
    }
    const proper = properNounOrigin(text);
    if (proper) return proper;
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
  if (!ISO_DATE.test(departureDate) || departureDate < earliestSearchableIso()) missing.push('departureDate');
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
  const departureInFuture = ISO_DATE.test(departureDate) && departureDate >= earliestSearchableIso();
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
