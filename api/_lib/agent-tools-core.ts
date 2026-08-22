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

// One server-side Google Maps Platform key can serve Places API (New) and
// Routes API when both APIs are enabled for the same GCP project.
const defaultGoogleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;

const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
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
const GOOGLE_ROUTES_FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
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
    description: 'REQUIRED for hotels, stays, property ratings, websites, Google Maps links, or photos. Uses Google Places API (New). Returns name, address, Google user rating, website and Maps URI. Do not use get_places_routing for hotels. Google Places does not provide date-specific room inventory or bookable rates.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'City, neighborhood, or named hotel.' },
        checkInDate: { type: 'STRING', description: 'Optional check-in YYYY-MM-DD. Context only; Places does not use it for inventory.' },
        checkOutDate: { type: 'STRING', description: 'Optional check-out YYYY-MM-DD. Context only; Places does not use it for inventory.' },
        guests: { type: 'INTEGER', description: 'Number of guests. Context only.' },
        minStarRating: { type: 'INTEGER', description: 'Optional preference 1-5. Not the same as Google user ratings.' },
      },
      required: ['location'],
    },
  },
  {
    name: 'get_places_routing',
    description: 'Geography only: restaurants/POIs via Places, or driving/transit time via Routes. NEVER use this for hotels, stays, property ratings, websites, or Maps links — call search_hotels instead.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Place query, for example "vegetarian restaurants near Marina Bay" or "museums in Kyoto".' },
        placeType: { type: 'STRING', description: 'Optional place category such as restaurant, cafe, museum, park, or tourist_attraction.' },
        origin: { type: 'STRING', description: 'Optional route origin as an address or recognizable place name.' },
        destination: { type: 'STRING', description: 'Optional route destination as an address or recognizable place name.' },
        travelMode: { type: 'STRING', description: 'Optional route mode: DRIVE, TRANSIT, WALK, BICYCLE, or TWO_WHEELER. Defaults to DRIVE.' },
      },
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

function normalizeTravelMode(value: unknown) {
  const mode = String(value || 'DRIVE').trim().toUpperCase();
  return ['DRIVE', 'TRANSIT', 'WALK', 'BICYCLE', 'TWO_WHEELER'].includes(mode) ? mode : 'DRIVE';
}

function durationToSeconds(duration: unknown) {
  const match = String(duration || '').match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Number(match[1]) : null;
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

async function computeGoogleRoute(
  apiKey: string | null | undefined,
  fetchFn: typeof fetch,
  options: { origin: string; destination: string; travelMode?: string },
) {
  if (!apiKey) {
    return unavailable('Google Routes is not connected. Set GOOGLE_MAPS_API_KEY in Vercel and enable Routes API.');
  }

  const origin = String(options.origin || '').trim();
  const destination = String(options.destination || '').trim();
  if (!origin || !destination) {
    return unavailable('Routing requires both origin and destination.', 'INVALID_ARGUMENT');
  }

  const travelMode = normalizeTravelMode(options.travelMode);
  const body: Record<string, unknown> = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode,
  };
  if (travelMode === 'DRIVE') body.routingPreference = 'TRAFFIC_AWARE';

  try {
    const response = await fetchFn(GOOGLE_ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const providerBody = await response.text().catch(() => '');
      console.error('[Google Routes API Error]', response.status, providerBody.slice(0, 1000));
      return unavailable('Google Routes API rejected the request. Places can still work independently; enable Routes API for this Google Maps Platform project if you want distance and travel-time calculations.', 'PROVIDER_ERROR');
    }

    const payload: any = await response.json();
    const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
    if (!route) {
      return unavailable('Google Routes API returned no route for the requested origin and destination.', 'NO_RESULTS');
    }

    const warning = ['WALK', 'BICYCLE', 'TWO_WHEELER'].includes(travelMode)
      ? 'Google marks WALK, BICYCLE and TWO_WHEELER routes as beta; paths can be incomplete, so verify local conditions.'
      : null;

    return {
      status: 'success',
      executed: true,
      source: 'Google Routes API',
      route: {
        origin,
        destination,
        travelMode,
        distanceMeters: typeof route?.distanceMeters === 'number' ? route.distanceMeters : null,
        duration: route?.duration || null,
        durationSeconds: durationToSeconds(route?.duration),
        encodedPolyline: route?.polyline?.encodedPolyline || null,
        warning,
      },
    };
  } catch (error: any) {
    console.error('[Google Routes API Error] Request failed:', error?.message || error);
    return unavailable('Google Routes API request failed. No fabricated route data were substituted.', 'PROVIDER_ERROR');
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
      const focus = String(args?.query || args?.focus || '').trim();
      const result: any = await searchGooglePlaces(googleMapsApiKey, fetchFn, {
        textQuery: focus ? `${focus} hotels in ${location}` : `hotels in ${location}`,
        includedType: 'lodging',
        strictTypeFiltering: false,
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
      const origin = String(args?.origin || '').trim();
      const destination = String(args?.destination || '').trim();
      if (origin || destination) {
        return computeGoogleRoute(googleMapsApiKey, fetchFn, {
          origin,
          destination,
          travelMode: args?.travelMode,
        });
      }

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
