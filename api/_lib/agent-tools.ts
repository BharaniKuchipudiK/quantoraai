/**
 * Central registry for Quantora travel tools.
 *
 * Safety rule: a tool may only report success for an action that was actually
 * completed by a connected provider. Provider-specific APIs live behind the
 * Travel Provider Gateway so Gemini and the rest of Quantora never depend on a
 * vendor's payload shape or secret directly.
 */

import { Duffel } from '@duffel/api';
import { DuffelTravelProvider } from './travel/duffel-provider.js';
import { GooglePlacesTravelProvider } from './travel/google-places-provider.js';
import { getDefaultTravelGateway, TravelProviderGateway } from './travel/travel-gateway.js';

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
 * Only non-transactional tools are exposed to Gemini. Transactional tools stay
 * behind the explicit approval boundary until we have idempotent, provider-
 * confirmed booking flows and durable outcome evidence.
 */
export const travelFunctionDeclarations: any[] = [
  {
    name: 'search_flights',
    description: 'Search live flight availability and pricing through Quantora Travel. If providers are unavailable, return unavailable; never invent fares or availability.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origin: { type: 'STRING', description: 'Origin city or 3-letter IATA airport code (for example SIN or JFK).' },
        destination: { type: 'STRING', description: 'Destination city or 3-letter IATA airport code (for example DPS or LHR).' },
        departureDate: { type: 'STRING', description: 'Departure date in YYYY-MM-DD format.' },
        returnDate: { type: 'STRING', description: 'Optional return date in YYYY-MM-DD format.' },
        passengers: { type: 'INTEGER', description: 'Number of adult passengers. Default is 1.' },
        cabinClass: { type: 'STRING', description: 'Optional cabin: economy, premium_economy, business, or first.' },
      },
      required: ['origin', 'destination', 'departureDate'],
    },
  },
  {
    name: 'search_hotels',
    description: 'Search live accommodation availability and pricing through Quantora Travel. Location is resolved upstream and rates must be re-quoted before any booking.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'City or neighborhood.' },
        checkInDate: { type: 'STRING', description: 'Check-in date in YYYY-MM-DD format.' },
        checkOutDate: { type: 'STRING', description: 'Check-out date in YYYY-MM-DD format.' },
        guests: { type: 'INTEGER', description: 'Number of adult guests. Default is 1.' },
        rooms: { type: 'INTEGER', description: 'Number of rooms. Default is 1.' },
        minStarRating: { type: 'INTEGER', description: 'Optional minimum star rating from 1 to 5.' },
      },
      required: ['location', 'checkInDate', 'checkOutDate'],
    },
  },
  {
    name: 'get_places_routing',
    description: 'Resolve a live destination/place through Quantora Travel. This currently returns place metadata and coordinates; route-time computation is not enabled yet.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Place or destination query.' },
        placeType: { type: 'STRING', description: 'Optional place category retained for compatibility.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_attractions',
    description: 'Discover live attractions and destination places. Discovery metadata does not imply ticket inventory or booking availability.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'Destination city or region.' },
        category: { type: 'STRING', description: 'Optional activity category, such as museums or family attractions.' },
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
  /** Explicit gateway for tests or future multi-provider routing. */
  travelGateway?: TravelProviderGateway | null;
  /** Legacy test seam retained while callers migrate to travelGateway. */
  duffelClient?: Duffel | null;
};

function unavailable(message: string, reason: string = 'PROVIDER_UNAVAILABLE') {
  return {
    status: 'unavailable',
    executed: false,
    reason,
    message,
  };
}

function gatewayFor(dependencies: TravelToolDependencies): TravelProviderGateway {
  if (Object.prototype.hasOwnProperty.call(dependencies, 'travelGateway')) {
    return dependencies.travelGateway || new TravelProviderGateway({ flights: null, hotels: null, places: null });
  }
  if (Object.prototype.hasOwnProperty.call(dependencies, 'duffelClient')) {
    const duffel = new DuffelTravelProvider(dependencies.duffelClient || null);
    return new TravelProviderGateway({
      flights: duffel,
      hotels: duffel,
      places: new GooglePlacesTravelProvider(null),
    });
  }
  return getDefaultTravelGateway();
}

function providerPayload<T extends string>(key: T, result: any) {
  if (result?.status !== 'success') {
    return unavailable(result?.message || 'The live travel provider is unavailable.', result?.reason || 'PROVIDER_UNAVAILABLE');
  }
  return {
    status: 'success',
    executed: true,
    source: result.provider,
    fetchedAt: result.fetchedAt,
    [key]: result.data || [],
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
  };
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
      'This transactional travel action is not enabled in the current production build. Nothing was booked, purchased, ticketed, scheduled, or monitored. A future transaction flow must obtain explicit human confirmation, use an idempotency key, and persist provider-confirmed evidence before reporting success.',
      'TRANSACTION_DISABLED',
    );
  }

  const gateway = gatewayFor(dependencies);

  switch (name) {
    case 'search_flights': {
      const result = await gateway.searchFlights({
        origin: String(args?.origin || '').trim(),
        destination: String(args?.destination || '').trim(),
        departureDate: String(args?.departureDate || '').trim(),
        ...(args?.returnDate ? { returnDate: String(args.returnDate).trim() } : {}),
        passengers: Math.min(9, Math.max(1, Number(args?.passengers) || 1)),
        cabinClass: ['economy', 'premium_economy', 'business', 'first'].includes(args?.cabinClass)
          ? args.cabinClass
          : 'economy',
      });
      return providerPayload('flights', result);
    }

    case 'search_hotels': {
      const result = await gateway.searchHotels({
        location: String(args?.location || '').trim(),
        checkInDate: String(args?.checkInDate || '').trim(),
        checkOutDate: String(args?.checkOutDate || '').trim(),
        guests: Math.min(9, Math.max(1, Number(args?.guests) || 1)),
        rooms: Math.min(9, Math.max(1, Number(args?.rooms) || 1)),
        minStarRating: Math.max(0, Math.min(5, Number(args?.minStarRating) || 0)),
      });
      return providerPayload('hotels', result);
    }

    case 'get_places_routing': {
      const result = await gateway.resolveLocation(String(args?.query || '').trim());
      if (result?.status !== 'success') {
        return unavailable(result?.message || 'Live place resolution is unavailable.', result?.reason || 'PROVIDER_UNAVAILABLE');
      }
      return {
        status: 'success',
        executed: true,
        source: result.provider,
        fetchedAt: result.fetchedAt,
        place: result.data,
        warnings: ['Route-time calculation is not enabled yet; this result contains live place metadata and coordinates only.'],
      };
    }

    case 'search_attractions': {
      const result = await gateway.searchAttractions({
        location: String(args?.location || '').trim(),
        ...(args?.category ? { category: String(args.category).trim() } : {}),
        maxResults: 10,
      });
      return providerPayload('attractions', result);
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
