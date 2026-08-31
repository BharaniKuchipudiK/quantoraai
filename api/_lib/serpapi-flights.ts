/**
 * SerpApi Google Flights → the flight shape the trip board already consumes.
 *
 * WHY THIS EXISTS
 *
 * Every provider that can issue tickets gates on business identity: Duffel
 * wants KYB, Amadeus retired its self-service tier, Kiwi went invite-only.
 * SerpApi is reachable by an individual today, so the desk can show real
 * prices without becoming a travel agent.
 *
 * WHAT IT IS, EXACTLY
 *
 * SerpApi runs a browser against Google Flights and returns what a visitor
 * sees. The prices are real as displayed; they are not held inventory and
 * nothing here can be booked. That distinction belongs in the caption, not in
 * a comment, which is why the mode travels with the results.
 *
 * THREE SHAPE TRAPS, EACH FOUND IN A REAL RESPONSE
 *
 * 1. Currency is on `search_parameters`, not on the offer. Reading it per
 *    offer yields null and the board renders a bare "175" — a number with no
 *    unit is worse than no price.
 * 2. `total_duration` is MINUTES; Duffel's `duration` is an ISO 8601 string.
 *    One field, two types across providers is a contract break waiting to
 *    surface, so minutes are converted to match the shape Duffel established.
 * 3. Times are local airport time with no offset ("2026-09-15 19:25"). The
 *    separator is normalised to `T` so the value parses as a local ISO
 *    datetime — no timezone is invented, because none was given.
 */

type SerpApiAirport = { id?: unknown; name?: unknown; time?: unknown };
type SerpApiSegment = {
  airline?: unknown;
  flight_number?: unknown;
  departure_airport?: SerpApiAirport;
  arrival_airport?: SerpApiAirport;
};
type SerpApiOffer = {
  flights?: SerpApiSegment[];
  total_duration?: unknown;
  price?: unknown;
  booking_token?: unknown;
};

export type NormalizedFlight = {
  id: string | null;
  airline: string;
  flightNumber: string | null;
  departure: string | null;
  arrival: string | null;
  duration: string | null;
  price: number;
  currency: string | null;
  direct: boolean | null;
  bookingToken: string | null;
};

/** Duffel reports ISO 8601; SerpApi reports minutes. One field, one type. */
export function minutesToIsoDuration(minutes: unknown): string | null {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  const whole = Math.round(total);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return `PT${hours ? `${hours}H` : ''}${rest || !hours ? `${rest}M` : ''}`;
}

/**
 * "2026-09-15 19:25" is local airport time with no offset. Only the separator
 * is fixed, so the value parses as a local ISO datetime and no timezone is
 * fabricated for one that was never sent.
 */
export function normalizeLocalTime(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  return text.replace(' ', 'T');
}

function normalizeOffer(offer: SerpApiOffer, currency: string | null): NormalizedFlight | null {
  const segments = Array.isArray(offer?.flights) ? offer.flights : [];
  if (!segments.length) return null;

  const first = segments[0] || {};
  const last = segments[segments.length - 1] || {};
  const price = Number(offer?.price);

  return {
    id: typeof offer?.booking_token === 'string' ? offer.booking_token : null,
    airline: typeof first.airline === 'string' && first.airline.trim() ? first.airline : 'Unknown carrier',
    flightNumber: typeof first.flight_number === 'string' ? first.flight_number : null,
    departure: normalizeLocalTime(first.departure_airport?.time),
    arrival: normalizeLocalTime(last.arrival_airport?.time),
    duration: minutesToIsoDuration(offer?.total_duration),
    price: Number.isFinite(price) ? price : 0,
    currency,
    direct: segments.length === 1,
    bookingToken: typeof offer?.booking_token === 'string' ? offer.booking_token : null,
  };
}

/**
 * Flatten a SerpApi payload into the board's flight shape.
 *
 * `best_flights` first, because that is Google's own ranking and dropping it
 * would show a worse list than the source did. Capped to match the Duffel path
 * so the board renders the same amount either way.
 */
export function normalizeSerpApiFlights(payload: any, { limit = 5 }: { limit?: number } = {}): NormalizedFlight[] {
  const currency = typeof payload?.search_parameters?.currency === 'string'
    ? payload.search_parameters.currency
    : null;

  const offers = [
    ...(Array.isArray(payload?.best_flights) ? payload.best_flights : []),
    ...(Array.isArray(payload?.other_flights) ? payload.other_flights : []),
  ];

  const flights: NormalizedFlight[] = [];
  for (const offer of offers) {
    const normalized = normalizeOffer(offer, currency);
    if (normalized) flights.push(normalized);
    if (flights.length >= limit) break;
  }
  return flights;
}

const SERPAPI_SEARCH_URL = 'https://serpapi.com/search';

export const defaultSerpApiKey = process.env.SERPAPI_API_KEY || null;

export function isSerpApiConfigured(key: unknown = defaultSerpApiKey): boolean {
  return typeof key === 'string' && key.trim().length > 0;
}

/**
 * One live Google Flights search, or an honest `unavailable`.
 *
 * Never returns a fabricated fare: a provider that does not answer produces a
 * failure, exactly like the Duffel path. The `source` is what the board's
 * provenance layer captions, so it names the real origin of the numbers rather
 * than a house brand.
 */
export async function searchSerpApiFlights(
  key: string | null,
  fetchFn: typeof fetch,
  args: { origin?: unknown; destination?: unknown; departureDate?: unknown; returnDate?: unknown; currency?: unknown },
): Promise<any> {
  if (!isSerpApiConfigured(key)) {
    return {
      status: 'unavailable',
      executed: false,
      reason: 'NOT_CONFIGURED',
      message: 'Google Flights search is not connected (SERPAPI_API_KEY is missing on the server). No fares were invented.',
    };
  }

  const returnDate = String(args?.returnDate || '').trim();
  const query = new URLSearchParams({
    engine: 'google_flights',
    departure_id: String(args?.origin || '').trim(),
    arrival_id: String(args?.destination || '').trim(),
    outbound_date: String(args?.departureDate || '').trim(),
    // 2 is one way; a return date makes it a round trip, which is type 1.
    type: returnDate ? '1' : '2',
    currency: String(args?.currency || 'USD').trim() || 'USD',
    hl: 'en',
    api_key: String(key).trim(),
  });
  if (returnDate) query.set('return_date', returnDate);

  try {
    const response = await fetchFn(`${SERPAPI_SEARCH_URL}?${query.toString()}`);
    const payload: any = await response.json().catch(() => null);

    // SerpApi reports its own failures in the body with a 200, so the status
    // code alone is not enough to know whether this answered.
    if (!response.ok || payload?.error) {
      return {
        status: 'unavailable',
        executed: false,
        reason: 'PROVIDER_ERROR',
        message: 'Google Flights search failed at the provider. No fares were substituted.',
      };
    }

    const flights = normalizeSerpApiFlights(payload);
    if (!flights.length) {
      return {
        status: 'unavailable',
        executed: false,
        reason: 'NO_RESULTS',
        message: 'Google Flights returned no options for that route and date. Nothing was invented to fill the gap.',
      };
    }

    return {
      status: 'success',
      executed: true,
      source: 'Google Flights',
      flights,
    };
  } catch {
    return {
      status: 'unavailable',
      executed: false,
      reason: 'PROVIDER_ERROR',
      message: 'Google Flights search could not be reached. No fares were substituted.',
    };
  }
}
