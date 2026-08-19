import { routeTravelConversationBody, shouldPreferTravelConversationProvider } from './travel-model-routing.js';

export const TRAVEL_PROVIDER_UNAVAILABLE_CODE = 'TRAVEL_CONVERSATION_PROVIDER_UNAVAILABLE';

export const TRAVEL_PROVIDER_UNAVAILABLE_MESSAGE =
  'Travel Advisor is temporarily unavailable because the independent conversation fallback is not configured. Please try again shortly.';

export type TravelProviderPreparation =
  | { kind: 'passthrough'; body: any }
  | { kind: 'routed'; body: any }
  | {
      kind: 'unavailable';
      status: 503;
      payload: {
        error: string;
        code: typeof TRAVEL_PROVIDER_UNAVAILABLE_CODE;
        retryable: true;
      };
    };

/**
 * Production rule: a server-owned Travel turn must never silently degrade from
 * multi-provider routing into a single Google failure domain. If Quantora owns
 * the credentials and no independent OpenRouter path is available, fail fast.
 * BYOK requests remain passthrough because the user intentionally selected and
 * owns that provider dependency.
 */
export function prepareTravelConversationRequest(
  body: any,
  options: { openRouterAvailable: boolean },
): TravelProviderPreparation {
  if (!shouldPreferTravelConversationProvider(body)) {
    return { kind: 'passthrough', body };
  }

  if (options.openRouterAvailable) {
    return { kind: 'routed', body: routeTravelConversationBody(body) };
  }

  return {
    kind: 'unavailable',
    status: 503,
    payload: {
      error: TRAVEL_PROVIDER_UNAVAILABLE_MESSAGE,
      code: TRAVEL_PROVIDER_UNAVAILABLE_CODE,
      retryable: true,
    },
  };
}
