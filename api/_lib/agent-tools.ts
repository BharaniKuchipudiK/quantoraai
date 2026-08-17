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
 * Only non-transactional tools are exposed to Gemini in this production
 * hotfix. Transactional capabilities remain fail-closed in executeToolCall so
 * stale clients or unexpected model calls cannot fabricate a booking/alert.
 */
export const travelFunctionDeclarations: any[] = [
  {
    name: 'search_flights',
    description: 'Search live flight availability and pricing through the connected provider. If the provider is unavailable, return an unavailable result; never invent fares or availability.',
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
    description: 'Check live hotel availability only if a provider is connected. If unavailable, report that limitation; never return hard-coded or fabricated hotel results.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'City or neighborhood.' },
        checkInDate: { type: 'STRING', description: 'Check-in date in YYYY-MM-DD format.' },
        checkOutDate: { type: 'STRING', description: 'Check-out date in YYYY-MM-DD format.' },
        guests: { type: 'INTEGER', description: 'Number of guests. Default is 1.' },
        minStarRating: { type: 'INTEGER', description: 'Optional minimum star rating from 1 to 5.' },
      },
      required: ['location', 'checkInDate', 'checkOutDate'],
    },
  },
  {
    name: 'get_places_routing',
    description: 'Check live places or routing information only if a provider is connected. If unavailable, report that limitation; never fabricate ratings, addresses, opening status, or commute times.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Place or routing query.' },
        placeType: { type: 'STRING', description: 'Optional place category.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_attractions',
    description: 'Check live attraction availability only if a provider is connected. If unavailable, report that limitation; never invent prices, ratings, availability, or providers.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: { type: 'STRING', description: 'Destination city or region.' },
        category: { type: 'STRING', description: 'Optional activity category.' },
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
};

function unavailable(message: string, reason: string = 'PROVIDER_UNAVAILABLE') {
  return {
    status: 'unavailable',
    executed: false,
    reason,
    message,
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
      'This transactional travel action is not enabled in the current production build. Nothing was booked, purchased, ticketed, scheduled, or monitored. A future transaction flow must obtain explicit human confirmation and a provider-confirmed result before reporting success.',
      'TRANSACTION_DISABLED',
    );
  }

  const duffelClient = Object.prototype.hasOwnProperty.call(dependencies, 'duffelClient')
    ? dependencies.duffelClient
    : defaultDuffelClient;

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

    case 'search_hotels':
      return unavailable('Live hotel search is not connected in the current production build. No hard-coded hotel results were returned.');

    case 'get_places_routing':
      return unavailable('Live places/routing is not connected in the current production build. No fabricated ratings, addresses, opening status, or commute times were returned.');

    case 'search_attractions':
      return unavailable('Live attraction search is not connected in the current production build. No fabricated prices, ratings, providers, or availability were returned.');

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
