import { searchAttractions, searchFlights, searchHotels, type TravelProviderSet } from './travel-provider-gateway.js';

export const TRANSACTIONAL_TRAVEL_TOOL_NAMES = new Set([
  'create_price_alert',
  'make_reservation',
  'book_attraction',
]);

/**
 * Travel provider execution is no longer exposed as LLM function tools.
 * The deterministic Travel Gateway owns provider calls before ordinary chat.
 */
export function shouldEnableTravelTools(_studioDomain: unknown): boolean {
  return false;
}

export function isTransactionalTravelTool(name: unknown): boolean {
  return typeof name === 'string' && TRANSACTIONAL_TRAVEL_TOOL_NAMES.has(name);
}

// Kept as a compatibility export for the existing chat runtime. Empty by
// design: models do not receive provider-execution tools.
export const travelFunctionDeclarations: any[] = [];

type TravelToolDependencies = {
  providers?: TravelProviderSet;
};

function unavailable(message: string, reason: string = 'PROVIDER_UNAVAILABLE') {
  return {
    status: 'unavailable',
    executed: false,
    reason,
    message,
  };
}

/**
 * Compatibility execution surface for server-owned callers. New code should
 * prefer travel-provider-gateway directly. No LLM should invoke this function.
 */
export async function executeToolCall(
  name: string,
  args: any,
  dependencies: TravelToolDependencies = {},
): Promise<any> {
  if (isTransactionalTravelTool(name)) {
    return unavailable(
      'This transactional travel action is not enabled in the current production build. Nothing was booked, purchased, ticketed, scheduled, or monitored. A future transaction flow must obtain explicit human confirmation and a provider-confirmed result before reporting success.',
      'TRANSACTION_DISABLED',
    );
  }

  switch (name) {
    case 'search_flights':
      return searchFlights({
        origin: String(args?.origin || '').trim(),
        destination: String(args?.destination || '').trim(),
        departureDate: String(args?.departureDate || '').trim(),
        returnDate: args?.returnDate ? String(args.returnDate).trim() : null,
        adults: Math.min(9, Math.max(1, Number(args?.passengers) || 1)),
        cabinClass: args?.cabinClass || 'economy',
      }, dependencies.providers);

    case 'search_hotels':
      return searchHotels({
        location: String(args?.location || '').trim(),
        checkInDate: String(args?.checkInDate || '').trim(),
        checkOutDate: String(args?.checkOutDate || '').trim(),
        adults: Math.min(9, Math.max(1, Number(args?.guests) || 1)),
        rooms: Math.max(1, Number(args?.rooms) || 1),
      }, dependencies.providers);

    case 'search_attractions':
      return searchAttractions({
        location: String(args?.location || '').trim(),
        radiusKm: args?.radiusKm ? Number(args.radiusKm) : undefined,
      }, dependencies.providers);

    case 'get_places_routing':
      return unavailable(
        'Point-to-point routing is not part of the Travel V1 critical path. Quantora will not depend on a map provider to search flights, hotels, or attractions.',
        'ROUTING_NOT_REQUIRED',
      );

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
