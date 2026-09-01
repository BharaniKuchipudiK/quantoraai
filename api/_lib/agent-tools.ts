/**
 * Guarded public seam for Travel tools.
 *
 * The provider implementation remains isolated in agent-tools-core.ts. This
 * adapter validates model-authored arguments before any provider call and
 * applies Quantora's provider resilience policy without coupling PCL to a
 * specific travel vendor.
 */
import { Duffel } from '@duffel/api';
import { validateTravelToolArgs } from './ai-contracts.js';
import { providerCircuitStore } from './provider-circuit-store.js';
import { PHOTO_MEDIA_PATH } from './places-photos.js';
import {
  providerFetch,
  runProviderOperation,
  type ProviderResiliencePolicy,
} from './provider-resilience.js';
import * as core from './agent-tools-core.js';
import {
  formatTravelPlaceShortlist,
  resolveTravelToolInvocation,
} from '../../shared/travel/place-shortlist.js';
import { hotelCityAsk, hotelEmptyResultsAsk, hotelLocationNeedsCity, hotelProviderFailureAsk, resolveHotelSearchLocation } from '../../shared/travel/hotel-location.js';
import {
  flightIncompleteAsk,
  flightInvalidArgsAsk,
  flightProviderFailureAsk,
  resolveFlightToolRecovery,
} from '../../shared/travel/flight-resilience.js';

export const TRANSACTIONAL_TRAVEL_TOOL_NAMES = core.TRANSACTIONAL_TRAVEL_TOOL_NAMES;
export const travelFunctionDeclarations = core.travelFunctionDeclarations;
export const shouldEnableTravelTools = core.shouldEnableTravelTools;
export const isTransactionalTravelTool = core.isTransactionalTravelTool;

type TravelToolDependencies = {
  duffelClient?: Duffel | null;
  duffelFallbackClient?: Duffel | null;
  googleMapsApiKey?: string | null;
  fetchFn?: typeof fetch;
  providerPolicy?: Partial<ProviderResiliencePolicy>;
  recentUserTexts?: string[];
  turnAttempt?: number;
};

const defaultDuffelClient = process.env.DUFFEL_API_KEY
  ? new Duffel({ token: process.env.DUFFEL_API_KEY })
  : null;

const defaultDuffelFallbackClient = process.env.DUFFEL_FALLBACK_API_KEY
  ? new Duffel({ token: process.env.DUFFEL_FALLBACK_API_KEY })
  : null;

// Hotels/places stay single-shot. Flight lookups get one bounded retry on the
// same provider (and an optional second Duffel token) before the desk self-heals.
const INTERACTIVE_TRAVEL_POLICY: Partial<ProviderResiliencePolicy> = {
  timeoutMs: 6_000,
  maxAttempts: 1,
};

const INTERACTIVE_FLIGHT_POLICY: Partial<ProviderResiliencePolicy> = {
  timeoutMs: 6_000,
  maxAttempts: 2,
  baseDelayMs: 120,
};

const READ_ONLY_TRAVEL_TOOLS = new Set([
  'search_flights',
  'search_hotels',
  'get_places_routing',
  'search_attractions',
]);

function unavailable(message: string, reason: string) {
  return {
    status: 'unavailable',
    executed: false,
    reason,
    message,
  };
}

function providerLabel(input: string | URL | Request): { provider: string; operation: string } {
  const raw = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(raw);
    /*
     * Photo media shares a hostname with Text Search but must not share a
     * circuit. PHOTO_LIMIT is 4 and circuitFailureThreshold is 4, so one
     * shortlist whose photos time out would open the places:search breaker for
     * every hotel and attraction lookup in the deployment — a photo failing a
     * hotel search, which is the precise inverse of the guarantee photos are
     * built on. Its own operation gives it its own key.
     */
    if (url.hostname === 'places.googleapis.com') {
      const isPhotoMedia = PHOTO_MEDIA_PATH.test(url.pathname);
      return { provider: 'places', operation: isPhotoMedia ? 'photo' : 'search' };
    }
    if (url.hostname === 'routes.googleapis.com') return { provider: 'routes', operation: 'compute' };
    return { provider: url.hostname || 'travel-http', operation: url.pathname.slice(0, 80) || 'request' };
  } catch {
    return { provider: 'travel-http', operation: 'request' };
  }
}

function resilientFetch(rawFetch: typeof fetch, policy?: Partial<ProviderResiliencePolicy>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const label = providerLabel(input);
    /*
     * A photo is decoration and is never retried. Retrying would multiply the
     * per-photo 2.5s budget by maxAttempts and make a shortlist wait seconds
     * for pictures nobody blocked on, so the one thing worth spending here is
     * a single attempt.
     */
    const effectivePolicy = label.operation === 'photo'
      ? { ...(policy || {}), maxAttempts: 1 }
      : policy;
    return providerFetch({
      ...label,
      input,
      init,
      fetchFn: rawFetch,
      policy: effectivePolicy,
      circuitStore: providerCircuitStore,
    });
  }) as typeof fetch;
}

function resilientDuffel(client: Duffel | null, policy?: Partial<ProviderResiliencePolicy>): Duffel | null {
  if (!client) return null;
  const offerRequests = client.offerRequests;
  const wrapped = Object.create(client) as Duffel;
  Object.defineProperty(wrapped, 'offerRequests', {
    enumerable: true,
    configurable: false,
    value: {
      ...offerRequests,
      create: (...args: Parameters<typeof offerRequests.create>) => runProviderOperation({
        provider: 'flight-search',
        operation: 'offer-request',
        policy,
        circuitStore: providerCircuitStore,
        execute: async () => offerRequests.create(...args),
      }),
    },
  });
  return wrapped;
}

function placesLookupConfigured(dependencies: TravelToolDependencies) {
  if (Object.prototype.hasOwnProperty.call(dependencies, 'googleMapsApiKey')) {
    return Boolean(dependencies.googleMapsApiKey);
  }
  return Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY);
}


function flightLookupConfigured(dependencies: TravelToolDependencies) {
  const hasExplicit = Object.prototype.hasOwnProperty.call(dependencies, 'duffelClient');
  const hasExplicitFallback = Object.prototype.hasOwnProperty.call(dependencies, 'duffelFallbackClient');
  const primary = hasExplicit ? dependencies.duffelClient ?? null : defaultDuffelClient;
  const fallback = hasExplicitFallback ? dependencies.duffelFallbackClient ?? null : defaultDuffelFallbackClient;
  return Boolean(primary || fallback);
}

function resolveFlightClients(dependencies: TravelToolDependencies) {
  const hasExplicit = Object.prototype.hasOwnProperty.call(dependencies, 'duffelClient');
  const hasExplicitFallback = Object.prototype.hasOwnProperty.call(dependencies, 'duffelFallbackClient');
  return {
    primary: hasExplicit ? dependencies.duffelClient ?? null : defaultDuffelClient,
    fallback: hasExplicitFallback ? dependencies.duffelFallbackClient ?? null : defaultDuffelFallbackClient,
  };
}

function stopAgentLoopOnProviderFailure(
  name: string,
  result: any,
  toolArgs?: any,
  configured = true,
  options: { turnAttempt?: number } = {},
) {
  if (!READ_ONLY_TRAVEL_TOOLS.has(name) || result?.status !== 'unavailable') return result;
  if (result?.action === 'PAUSE_AND_ASK' && result?.reason === 'INVALID_ARGUMENT' && result?.message) return result;

  const providerMessage = String(result?.message || 'The connected travel provider is unavailable.');
  if (result?.reason === 'INVALID_ARGUMENT' && result?.action === 'PAUSE_AND_ASK') {
    return result;
  }
  if (result?.reason === 'INVALID_ARGUMENT') {
    if (name === 'search_flights') {
      return {
        ...result,
        action: 'PAUSE_AND_ASK',
        providerMessage,
        message: flightIncompleteAsk(toolArgs),
        retryable: false,
      };
    }
    return {
      ...result,
      action: 'PAUSE_AND_ASK',
      providerMessage,
      message: providerMessage,
    };
  }

  const location = String(toolArgs?.location || '').trim();
  if (name === 'search_flights') {
    const reason = result?.reason === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : (result?.reason || 'PROVIDER_ERROR');
    const recovery = resolveFlightToolRecovery({
      reason,
      configured,
      turnAttempt: options.turnAttempt,
    });
    return {
      ...result,
      reason,
      action: 'PAUSE_AND_ASK',
      providerMessage,
      message: flightProviderFailureAsk(toolArgs, {
        configured,
        includeRetry: recovery.includeRetry,
      }),
      retryable: recovery.retryable,
      autoRetryTurn: recovery.autoRetryTurn,
    };
  }

  const reason = String(result?.reason || '');
  const refused = reason === 'PROVIDER_REJECTED' || reason === 'NOT_CONFIGURED';
  const message = name === 'search_hotels'
    ? hotelProviderFailureAsk(location, { configured, kind: 'hotels', reason })
    : name === 'search_attractions'
      ? hotelProviderFailureAsk(location, { configured, kind: 'attractions', reason })
      : refused
        ? 'I could not get live map or routing results: Places refused the request, so trying again will not change it. I will not invent a route.'
        : 'I could not get live map or routing results just now. I will not invent a route.';

  return {
    ...result,
    action: 'PAUSE_AND_ASK',
    providerMessage,
    message,
    /*
     * A refusal is settled, so nothing upstream should schedule another
     * attempt at it. Flights already draw this line through
     * resolveFlightToolRecovery; the Places tools had no line at all.
     */
    retryable: !refused,
  };
}

async function executeFlightSearch(
  toolArgs: any,
  dependencies: TravelToolDependencies,
  providerPolicy: Partial<ProviderResiliencePolicy>,
) {
  const rawFetch = dependencies.fetchFn || fetch;
  const { primary, fallback } = resolveFlightClients(dependencies);
  const flightPolicy = {
    ...INTERACTIVE_TRAVEL_POLICY,
    ...INTERACTIVE_FLIGHT_POLICY,
    ...(dependencies.providerPolicy || {}),
  };

  if (!primary && !fallback) {
    return unavailable(
      'Live flight search is unavailable because no Duffel provider is connected. No mock fares were returned.',
      'NOT_CONFIGURED',
    );
  }

  let result = await core.executeToolCall('search_flights', toolArgs, {
    ...dependencies,
    fetchFn: resilientFetch(rawFetch, flightPolicy),
    duffelClient: resilientDuffel(primary, flightPolicy),
  } as any);

  const primaryFailed = result?.status === 'unavailable'
    && (result?.reason === 'PROVIDER_ERROR' || result?.reason === 'NOT_CONFIGURED' || !result?.reason);
  if (primaryFailed && fallback && fallback !== primary) {
    const fallbackResult = await core.executeToolCall('search_flights', toolArgs, {
      ...dependencies,
      fetchFn: resilientFetch(rawFetch, {
        ...INTERACTIVE_TRAVEL_POLICY,
        ...providerPolicy,
        maxAttempts: 1,
      }),
      duffelClient: resilientDuffel(fallback, {
        ...INTERACTIVE_TRAVEL_POLICY,
        ...providerPolicy,
        maxAttempts: 1,
      }),
    } as any);
    if (fallbackResult?.status === 'success') {
      return {
        ...fallbackResult,
        fallbackUsed: true,
        source: fallbackResult.source || 'Duffel',
      };
    }
    result = fallbackResult?.status === 'unavailable' ? fallbackResult : result;
  }

  return result;
}

export async function executeToolCall(
  name: string,
  args: unknown,
  dependencies: TravelToolDependencies = {},
): Promise<any> {
  const invocation = resolveTravelToolInvocation(name, args && typeof args === 'object' ? args : {});
  const toolName = invocation.name;
  let toolArgs = invocation.args && typeof invocation.args === 'object' ? { ...invocation.args } : invocation.args;

  // Preserve the existing strongest backstop: transactions stay disabled even
  // if a stale client sends malformed arguments for a transactional tool.
  if (isTransactionalTravelTool(toolName)) {
    return core.executeToolCall(toolName, toolArgs, dependencies as any);
  }

  if ((toolName === 'search_hotels' || toolName === 'search_attractions') && toolArgs && typeof toolArgs === 'object') {
    const location = resolveHotelSearchLocation(
      (toolArgs as { location?: string }).location,
      dependencies.recentUserTexts,
    );
    toolArgs = { ...toolArgs, location };
  }

  const validation = validateTravelToolArgs(toolName, toolArgs);
  if (validation.status === 'unknown') {
    return core.executeToolCall(toolName, toolArgs, dependencies as any);
  }
  if (validation.status === 'invalid') {
    if (toolName === 'search_flights') {
      return {
        status: 'unavailable',
        executed: false,
        reason: 'INVALID_ARGUMENT',
        action: 'PAUSE_AND_ASK',
        message: flightInvalidArgsAsk(
          toolArgs && typeof toolArgs === 'object' ? toolArgs : {},
          validation.issues,
        ),
        retryable: false,
      };
    }
    return unavailable(
      `Travel tool input was rejected before provider execution (${validation.issues.join(', ')}).`,
      'INVALID_ARGUMENT',
    );
  }

  if ((toolName === 'search_hotels' || toolName === 'search_attractions') && hotelLocationNeedsCity(validation.value?.location)) {
    return {
      status: 'unavailable',
      executed: false,
      reason: 'INVALID_ARGUMENT',
      action: 'PAUSE_AND_ASK',
      message: hotelCityAsk(validation.value?.location),
    };
  }

  const rawFetch = dependencies.fetchFn || fetch;
  const hasExplicitDuffel = Object.prototype.hasOwnProperty.call(dependencies, 'duffelClient');
  const rawDuffel = hasExplicitDuffel ? dependencies.duffelClient ?? null : defaultDuffelClient;
  const providerPolicy = {
    ...INTERACTIVE_TRAVEL_POLICY,
    ...(dependencies.providerPolicy || {}),
  };

  if (toolName === 'search_flights') {
    const result = await executeFlightSearch(validation.value, dependencies, providerPolicy);
    return stopAgentLoopOnProviderFailure(
      toolName,
      result,
      validation.value,
      flightLookupConfigured(dependencies),
      { turnAttempt: dependencies.turnAttempt },
    );
  }

  const result = await core.executeToolCall(toolName, validation.value, {
    ...dependencies,
    fetchFn: resilientFetch(rawFetch, providerPolicy),
    duffelClient: resilientDuffel(rawDuffel, providerPolicy),
  } as any);

  if (result?.status === 'success' && Array.isArray(result.hotels) && result.hotels.length) {
    result.mandatoryShortlist = formatTravelPlaceShortlist(result.hotels);
    result.instruction = 'Paste mandatoryShortlist verbatim. Do not omit ratings or links. Do not invent extra hotels.';
  }

  if (toolName === 'search_hotels' && result?.status === 'success' && Array.isArray(result.hotels) && result.hotels.length === 0) {
    return {
      ...result,
      status: 'unavailable',
      action: 'PAUSE_AND_ASK',
      reason: 'NO_RESULTS',
      message: hotelEmptyResultsAsk(validation.value?.location, { kind: 'hotels' }),
    };
  }

  return stopAgentLoopOnProviderFailure(
    toolName,
    result,
    validation.value,
    placesLookupConfigured(dependencies),
  );
}
