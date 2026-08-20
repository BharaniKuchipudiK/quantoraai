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
import {
  providerFetch,
  runProviderOperation,
  type ProviderResiliencePolicy,
} from './provider-resilience.js';
import * as core from './agent-tools-core.js';

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
        execute: async () => offerRequests.create(...args),
      }),
    },
  });
  return wrapped;
}

export async function executeToolCall(
  name: string,
  args: unknown,
  dependencies: TravelToolDependencies = {},
): Promise<any> {
  // Preserve the existing strongest backstop: transactions stay disabled even
  // if a stale client sends malformed arguments for a transactional tool.
  if (isTransactionalTravelTool(name)) {
    return core.executeToolCall(name, args, dependencies as any);
  }

  const validation = validateTravelToolArgs(name, args);
  if (validation.status === 'unknown') {
    return core.executeToolCall(name, args, dependencies as any);
  }
  if (validation.status === 'invalid') {
    return unavailable(
      `Travel tool input was rejected before provider execution (${validation.issues.join(', ')}).`,
      'INVALID_ARGUMENT',
    );
  }

  const rawFetch = dependencies.fetchFn || fetch;
  const hasExplicitDuffel = Object.prototype.hasOwnProperty.call(dependencies, 'duffelClient');
  const rawDuffel = hasExplicitDuffel ? dependencies.duffelClient ?? null : defaultDuffelClient;

  return core.executeToolCall(name, validation.value, {
    ...dependencies,
    fetchFn: resilientFetch(rawFetch, dependencies.providerPolicy),
    duffelClient: resilientDuffel(rawDuffel, dependencies.providerPolicy),
  } as any);
}
