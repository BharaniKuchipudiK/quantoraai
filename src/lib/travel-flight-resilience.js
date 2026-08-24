/**
 * Travel-only flight lookup policy.
 *
 * Live fares come from Duffel. Incomplete queries must ask for airports/dates
 * instead of calling the provider. Missing credentials must say so honestly.
 * Transient provider failures stay retryable so the desk can self-heal once.
 */

export const TRAVEL_FLIGHT_PROVIDER_CODE = 'TRAVEL_FLIGHT_PROVIDER';

export function flightArgsComplete(args = {}) {
  const origin = String(args?.origin || '').trim();
  const destination = String(args?.destination || '').trim();
  const departureDate = String(args?.departureDate || '').trim();
  return Boolean(origin && destination && /^\d{4}-\d{2}-\d{2}$/.test(departureDate));
}

export function flightIncompleteAsk(args = {}) {
  const origin = String(args?.origin || '').trim();
  const destination = String(args?.destination || '').trim();
  const departureDate = String(args?.departureDate || '').trim();
  const known = [
    origin ? `origin ${origin}` : null,
    destination ? `destination ${destination}` : null,
    departureDate ? `date ${departureDate}` : null,
  ].filter(Boolean);
  const noted = known.length ? ` I already have ${known.join(', ')}.` : '';
  return `I can look up live flights once I have origin airport, destination airport, and a departure date (YYYY-MM-DD).${noted} I will not invent fares.`;
}

function routeLabel(args = {}) {
  const origin = String(args?.origin || '').trim();
  const destination = String(args?.destination || '').trim();
  const departureDate = String(args?.departureDate || '').trim();
  if (origin && destination && departureDate) return ` for ${origin} → ${destination} on ${departureDate}`;
  if (origin && destination) return ` for ${origin} → ${destination}`;
  return '';
}

export function flightProviderFailureAsk(args = {}, { configured = true, includeRetry = true } = {}) {
  if (!configured) {
    return 'Live flight search is not connected (DUFFEL_API_KEY is missing on the server). I will not invent fares. Connect Duffel, or keep planning with airports and dates without live prices.';
  }

  const route = routeLabel(args);
  const prose = includeRetry
    ? `I could not look up live flights${route} just now. I will not invent fares. Tap Retry to run the same search again.`
    : `I could not look up live flights${route} just now. I will not invent fares. We can retry when the flight provider answers.`;

  if (!includeRetry) return prose;

  return [
    prose,
    '',
    '<quantora-modal>{"question":"Retry live flight search?","options":[{"id":"retry-flights","title":"Retry flight search","description":"Run the live lookup again","value":"Retry the live flight search with the same airports and dates."}]}</quantora-modal>',
  ].join('\n');
}

export function resolveFlightToolRecovery({
  reason = '',
  configured = true,
  turnAttempt = 1,
} = {}) {
  if (reason === 'INVALID_ARGUMENT' || reason === 'NOT_CONFIGURED') {
    return { retryable: false, autoRetryTurn: false, includeRetry: false };
  }
  if (reason === 'PROVIDER_ERROR' && configured) {
    const attempt = Math.max(1, Number(turnAttempt) || 1);
    return {
      retryable: true,
      autoRetryTurn: attempt < 2,
      includeRetry: attempt >= 2,
    };
  }
  return { retryable: false, autoRetryTurn: false, includeRetry: false };
}
