/**
 * Central registry for Quantora travel tools.
 *
 * Safety rule: a tool may only report success for an action that was actually
 * completed by a connected provider. There are deliberately no mock-success
 * fallbacks for searches, alerts, reservations, tickets, or background jobs.
 */

import { Duffel } from '@duffel/api';

const defaultDuffelClient = process.env.DUFFEL_API_KEY
  ? new Duffel({ token: process.env.DUFFEL_API_KEY })
  : null;

// One server-side Google Maps Platform key can be used by Places API (New),
// and later by Routes API if that API is enabled for the same GCP project.
const defaultGoogleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;

const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
  'places.priceLevel',
].join(',');

export const TRANSACTIONAL_TRAVEL_TOOL_NAMES = new Set([
  'create_price_alert',
  'make_reservation',
  'book_attraction',
]);

/**
 * Travel tools are enabled only when the PCL/Studio domain has explicitly
 * resolved the current turn to travel. They must never be injected globally.
 */
export function shouldEnableTravelTools(studioDomain: unknown): boolean {
  return studioDomain === 'travel';
}

export function isTransactionalTravelTool(name: unknown): boolean {
  return typeof name === 'string' && TRANSACTIONAL_TRAVEL_TOOL_NAMES.has(name);
}

/**
 * Only non-transactional tools are exposed to Gemini. Transactional
 * capabilities remain fail-closed in executeToolCall so stale clients or
 * unexpected model calls cannot fabricate a booking/alert.
 */
export const travelFunctionDeclarations: any[] = [
  {
    name: 'search_flights',
    description: 'Search live flight availability and pricing through Duffel. If the provider is unavailable, return an unavailable result; never invent fares or availability.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origin: { type: 'STRING', description: 'Origin city or 3-letter IATA airport code (for example SIN or JFK).' },
        destination: { type: 'STRING', description: 'Destination city or 3-letter IATA airport code (for example DPS or LHR).' },
        departureDate: { type: 'STRING', description: 'Departure date in YYYY-MM-DD format.' },
        returnDate: { type: 'STRING', description: 'Optional return date in YYYY-MM-DD format.' },
        passengers: { type: 'INTEGER', description: 'Number of adult passengers. Default is 1.' },
      },
      required: ['origin', 'destination', 'departureDate'],
    },
  },
  {
    name: 'search_hotels',
    description: 'Discover real hotels through Google Places API (New). Returns provider-backed hotel identity, address, user rating, website and Google Maps link when available. Google Places does not provide date-specific room inventory or bookable room rates, so never claim hotel availability or nightly pricing from this tool.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'City or neighborhood.' },
        checkInDate: { type: 'STRING', description: 'Requested check-in date in YYYY-MM-DD format. Context only; Google Places does not use it for room inventory.' },
        checkOutDate: { type: 'STRING', description: 'Requested check-out date in YYYY-MM-DD format. Context only; Google Places does not use it for room inventory.' },
        guests: { type: 'INTEGER', description: 'Number of guests. Context only; Google Places does not price rooms by guest count.' },
        minStarRating: { type: 'INTEGER', description: 'Optional hotel preference from 1 to 5. Do not confuse this with Google user ratings; Places does not provide a guaranteed official hotel star classification.' },
      },
      required: ['location', 'checkInDate', 'checkOutDate'],
    },
  },
  {
    name: 'get_places_routing',
    description: 'Discover real places, restaurants and points of interest through Google Places API (New). This tool currently provides place intelligence, not turn-by-turn routing; route duration/distance must not be invented.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Place query, for example "vegetarian restaurants near Marina Bay" or "museums in Kyoto".' },
        placeType: { type: 'STRING', description: 'Optional place category such as restaurant, cafe, museum, park, or tourist_attraction.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_attractions',
    description: 'Discover real attractions and points of interest through Google Places API (New). Returns provider-backed place data; never invent ticket prices or attraction availability.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'Destination city or region.' },
        category: { type: 'STRING', description: 'Optional activity category, for example museum, park, zoo, aquarium, landmark, or tourist attraction.' },
      },
      required: ['location'],
    },
  },
  {
    name: 'ask_clarifying_question',
    description: 'Pause planning and ask one material question when dates, budget, group, or preferences are missing. Use this instead of guessing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        question: { type: 'STRING', description: 'The exact question to ask the user.' },
      },
      required: ['question'],
    },
  },
];

type TravelToolDependencies = {
  duffelClient?: Duffel | null;
  googleMapsApiKey?: string | null;
  fetchFn?: typeof fetch;
};

function unavailable(message: string, reason: string = 'PROVIDER_UNAVAILABLE') {
  return {
    status: 'unavailable',
    executed: false,
    reason,
    message,
  };
}

function normalizeGooglePlace(place: any) {
  return {
    id: place?.id || null,
    name: place?.displayName?.text || null,
    address: place?.formattedAddress || null,
    latitude: typeof place?.location?.latitude === 'number' ? place.location.latitude : null,
    longitude: typeof place?.location?.longitude === 'number' ? place.location.longitude : null,
    userRating: typeof place?.rating === 'number' ? place.rating : null,
    userRatingCount: typeof place?.userRatingCount === 'number' ? place.userRatingCount : null,
    primaryType: place?.primaryType || null,
    types: Array.isArray(place?.types) ? place.types : [],
    businessStatus: place?.businessStatus || null,
    priceLevel: place?.priceLevel || null,
    website: place?.websiteUri || null,
    googleMapsUrl: place?.googleMapsUri || null,
  };
}

async function searchGooglePlaces(
  apiKey: string | null | undefined,
  fetchFn: typeof fetch,
  options: {
    textQuery: string;
    includedType?: string;
    strictTypeFiltering?: boolean;
    pageSize?: number;
  },
) {
  if (!apiKey) {
    return unavailable('Google Places API (New) is not connected. Set GOOGLE_MAPS_API_KEY in Vercel and enable Places API (New).');
  }

  const textQuery = String(options.textQuery || '').trim();
  if (!textQuery) {
    return unavailable('Google Places search needs a non-empty query.', 'INVALID_ARGUMENT');
  }

  const body: Record<string, unknown> = {
    textQuery,
    pageSize: Math.min(20, Math.max(1, options.pageSize || 8)),
  };
  if (options.includedType) body.includedType = options.includedType;
  if (options.strictTypeFiltering) body.strictTypeFiltering = true;

  try {
    const response = await fetchFn(GOOGLE_PLACES_TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const providerBody = await response.text().catch(() => '');
      console.error('[Google Places API Error]', response.status, providerBody.slice(0, 1000));
      return unavailable('Google Places API (New) rejected the request. Check that the API is enabled, billing is active, and the Vercel server-side key restrictions permit Places API (New).', 'PROVIDER_ERROR');
    }

    const payload: any = await response.json();
    const places = Array.isArray(payload?.places) ? payload.places.map(normalizeGooglePlace) : [];
    return {
      status: 'success',
      executed: true,
      source: 'Google Places API (New)',
      places,
    };
  } catch (error: any) {
    console.error('[Google Places API Error] Request failed:', error?.message || error);
    return unavailable('Google Places API (New) request failed. No fabricated place results were substituted.', 'PROVIDER_ERROR');
  }
}

export async function executeToolCall(
  name: string,
  args: any,
  dependencies: TravelToolDependencies = {},
): Promise<any> {
  console.log(`[Agentic Orchestrator] Executing Tool: ${name}`, args);

  // Defensive backstop: even if a stale client or unexpected model call asks
  // for a transaction, do not attempt it and never fabricate a confirmation.
  if (isTransactionalTravelTool(name)) {
    return unavailable(
      'This transactional travel action is not enabled in the current production build. Nothing was booked, purchased, ticketed, scheduled, or monitored. A future transaction flow must obtain explicit human confirmation and a provider-confirmed result before reporting success.',
      'TRANSACTION_DISABLED',
    );
  }

  const duffelClient = Object.prototype.hasOwnProperty.call(dependencies, 'duffelClient')
    ? dependencies.duffelClient
    : defaultDuffelClient;
  const googleMapsApiKey = Object.prototype.hasOwnProperty.call(dependencies, 'googleMapsApiKey')
    ? dependencies.googleMapsApiKey
    : defaultGoogleMapsApiKey;
  const fetchFn = dependencies.fetchFn || fetch;

  switch (name) {
    case 'search_flights': {
      if (!duffelClient) {
        return unavailable('Live flight search is unavailable because no Duffel provider is connected. No mock fares were returned.');
      }

      try {
        const slices: any[] = [
          {
            origin: String(args?.origin || '').trim(),
            destination: String(args?.destination || '').trim(),
            departure_date: String(args?.departureDate || '').trim(),
          },
        ];
        if (args?.returnDate) {
          slices.push({
            origin: String(args?.destination || '').trim(),
            destination: String(args?.origin || '').trim(),
            departure_date: String(args.returnDate).trim(),
          });
        }

        const passengerCount = Math.min(9, Math.max(1, Number(args?.passengers) || 1));
        const response = await duffelClient.offerRequests.create({
          slices,
          passengers: Array.from({ length: passengerCount }, () => ({ type: 'adult' as const })),
          cabin_class: 'economy',
        });

        const offers = Array.isArray(response?.data?.offers) ? response.data.offers.slice(0, 5) : [];
        return {
          status: 'success',
          executed: true,
          source: 'Duffel',
          flights: offers.map((offer: any) => {
            const firstSlice = offer?.slices?.[0];
            const firstSegment = firstSlice?.segments?.[0];
            return {
              id: offer?.id,
              airline: firstSegment?.operating_carrier?.name || firstSegment?.marketing_carrier?.name || 'Unknown carrier',
              flightNumber: firstSegment?.operating_carrier?.iata_code && firstSegment?.operating_carrier_flight_number
                ? `${firstSegment.operating_carrier.iata_code}${firstSegment.operating_carrier_flight_number}`
                : null,
              departure: firstSegment?.departing_at || null,
              arrival: firstSlice?.segments?.[firstSlice.segments.length - 1]?.arriving_at || null,
              duration: firstSlice?.duration || null,
              price: Number.parseFloat(offer?.total_amount || '0'),
              currency: offer?.total_currency || null,
              direct: Array.isArray(firstSlice?.segments) ? firstSlice.segments.length === 1 : null,
            };
          }),
        };
      } catch (error: any) {
        console.error('[Duffel API Error] Live flight search failed:', error?.errors || error?.message || error);
        return unavailable('Live flight search failed at the provider. No mock fares or availability were substituted.', 'PROVIDER_ERROR');
      }
    }

    case 'search_hotels': {
      const location = String(args?.location || '').trim();
      const result: any = await searchGooglePlaces(googleMapsApiKey, fetchFn, {
        textQuery: `hotels in ${location}`,
        includedType: 'hotel',
        strictTypeFiltering: true,
        pageSize: 10,
      });
      if (result.status !== 'success') return result;
      return {
        status: 'success',
        executed: true,
        source: result.source,
        searchContext: {
          location,
          checkInDate: args?.checkInDate || null,
          checkOutDate: args?.checkOutDate || null,
          guests: Math.max(1, Number(args?.guests) || 1),
          requestedMinStarRating: args?.minStarRating || null,
          inventoryAndRatesAvailable: false,
          note: 'Google Places provides hotel discovery and user ratings, not date-specific room inventory, nightly rates, or guaranteed official star classifications.',
        },
        hotels: result.places,
      };
    }

    case 'get_places_routing': {
      const query = String(args?.query || '').trim();
      const placeType = String(args?.placeType || '').trim();
      const result: any = await searchGooglePlaces(googleMapsApiKey, fetchFn, {
        textQuery: placeType ? `${placeType}: ${query}` : query,
        pageSize: 10,
      });
      if (result.status !== 'success') return result;
      return {
        status: 'success',
        executed: true,
        source: result.source,
        places: result.places,
        routingAvailable: false,
        routingNote: 'Places API (New) is connected for destination discovery. Route duration/distance requires Google Routes API and is not fabricated here.',
      };
    }

    case 'search_attractions': {
      const location = String(args?.location || '').trim();
      const category = String(args?.category || '').trim();
      const result: any = await searchGooglePlaces(googleMapsApiKey, fetchFn, {
        textQuery: `${category || 'tourist attractions'} in ${location}`,
        includedType: category ? undefined : 'tourist_attraction',
        strictTypeFiltering: !category,
        pageSize: 10,
      });
      if (result.status !== 'success') return result;
      return {
        status: 'success',
        executed: true,
        source: result.source,
        location,
        category: category || null,
        attractions: result.places,
        ticketAvailabilityAvailable: false,
        note: 'Google Places provides attraction discovery, not live admission inventory or ticket pricing.',
      };
    }

    case 'ask_clarifying_question': {
      const question = typeof args?.question === 'string' ? args.question.trim() : '';
      return {
        status: 'success',
        executed: false,
        action: 'PAUSE_AND_ASK',
        message: question || 'What travel detail should I clarify before continuing?',
      };
    }

    default:
      return unavailable(`Unknown or disabled travel tool: ${name}`, 'UNKNOWN_TOOL');
  }
}
