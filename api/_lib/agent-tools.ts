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
import {
  providerFetch,
  runProviderOperation,
  type ProviderResiliencePolicy,
} from './provider-resilience.js';
import * as core from './agent-tools-core.js';
import {
  formatTravelPlaceShortlist,
  resolveTravelToolInvocation,
} from '../../src/lib/travel-place-shortlist.js';
import { hotelCityAsk, hotelLocationNeedsCity } from '../../src/lib/travel-hotel-location.js';

export const TRANSACTIONAL_TRAVEL_TOOL_NAMES = core.TRANSACTIONAL_TRAVEL_TOOL_NAMES;
export const travelFunctionDeclarations = core.travelFunctionDeclarations;
export const shouldEnableTravelTools = core.shouldEnableTravelTools;
export const isTransactionalTravelTool = core.isTransactionalTravelTool;

type TravelToolDependencies = {
  duffelClient?: Duffel | null;
  googleMapsApiKey?: string | null;
  fetchFn?: typeof fetch;
  providerPolicy?: Partial<ProviderResiliencePolicy>;
};

const defaultDuffelClient = process.env.DUFFEL_API_KEY
  ? new Duffel({ token: process.env.DUFFEL_API_KEY })
  : null;

// Travel searches are interactive user actions, not background jobs. One
// provider attempt gets a bounded six-second budget. If the provider cannot
// answer inside that budget, Quantora stops the agent loop and explains the
// limitation instead of spending another 30-60 seconds retrying upstreams.
const INTERACTIVE_TRAVEL_POLICY: Partial<ProviderResiliencePolicy> = {
  timeoutMs: 6_000,
  maxAttempts: 1,
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
    if (url.hostname === 'places.googleapis.com') return { provider: 'places', operation: 'search' };
    if (url.hostname === 'routes.googleapis.com') return { provider: 'routes', operation: 'compute' };
    return { provider: url.hostname || 'travel-http', operation: url.pathname.slice(0, 80) || 'request' };
  } catch {
    return { provider: 'travel-http', operation: 'request' };
  }
}

function resilientFetch(rawFetch: typeof fetch, policy?: Partial<ProviderResiliencePolicy>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const label = providerLabel(input);
    return providerFetch({
      ...label,
      input,
      init,
      fetchFn: rawFetch,
      policy,
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

function stopAgentLoopOnProviderFailure(name: string, result: any) {
  if (!READ_ONLY_TRAVEL_TOOLS.has(name) || result?.status !== 'unavailable') return result;
  if (result?.action === 'PAUSE_AND_ASK' && result?.message) return result;

  const providerMessage = String(result?.message || 'The connected travel provider is unavailable.');
  if (result?.reason === 'INVALID_ARGUMENT') {
    return {
      ...result,
      action: 'PAUSE_AND_ASK',
      providerMessage,
      message: providerMessage,
    };
  }

  const message = name === 'search_hotels'
    ? 'I could not look up live hotels just now. Tell me the city or area if you have not — I will not invent a list. If Places is down, we can retry after it is connected.'
    : name === 'search_flights'
      ? 'I could not look up live flights just now. I will not invent fares. Give airports and dates, or we can retry when the flight provider answers.'
      : name === 'search_attractions'
        ? 'I could not look up live attractions just now. Name the city or area and I will try again — I will not invent a list.'
        : 'I could not get live map or routing results just now. I will not invent a route.';

  return {
    ...result,
    action: 'PAUSE_AND_ASK',
    providerMessage,
    message,
  };
}

export async function executeToolCall(
  name: string,
  args: unknown,
  dependencies: TravelToolDependencies = {},
): Promise<any> {
  const invocation = resolveTravelToolInvocation(name, args && typeof args === 'object' ? args : {});
  const toolName = invocation.name;
  const toolArgs = invocation.args;

  // Preserve the existing strongest backstop: transactions stay disabled even
  // if a stale client sends malformed arguments for a transactional tool.
  if (isTransactionalTravelTool(toolName)) {
    return core.executeToolCall(toolName, toolArgs, dependencies as any);
  }

  const validation = validateTravelToolArgs(toolName, toolArgs);
  if (validation.status === 'unknown') {
    return core.executeToolCall(toolName, toolArgs, dependencies as any);
  }
  if (validation.status === 'invalid') {
    return unavailable(
      `Travel tool input was rejected before provider execution (${validation.issues.join(', ')}).`,
      'INVALID_ARGUMENT',
    );
  }

  if (toolName === 'search_hotels' && hotelLocationNeedsCity(validation.value?.location)) {
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

  const result = await core.executeToolCall(toolName, validation.value, {
    ...dependencies,
    fetchFn: resilientFetch(rawFetch, providerPolicy),
    duffelClient: resilientDuffel(rawDuffel, providerPolicy),
  } as any);

  if (result?.status === 'success' && Array.isArray(result.hotels) && result.hotels.length) {
    result.mandatoryShortlist = formatTravelPlaceShortlist(result.hotels);
    result.instruction = 'Paste mandatoryShortlist verbatim. Do not omit ratings or links. Do not invent extra hotels.';
  }

  return stopAgentLoopOnProviderFailure(toolName, result);
}
