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

/**
 * What the desk promises not to do whenever it declines to answer from a
 * provider. Every refusal in this module ends with it, and that is the point.
 *
 * "I will not invent fares" was the whole promise, and it was a loophole one
 * field wide. A traveller retried SIN to DPS, the provider was unreachable, the
 * desk said it would not invent fares — and then listed carriers, daily
 * departure patterns and a flight duration of "~2 hours 45 minutes across all
 * carriers", none of which came from a provider. It kept the letter of the
 * promise exactly, because the promise named exactly one field.
 *
 * Naming a single forbidden field tells the reader — and the model — that
 * everything adjacent is permitted. The promise now covers the whole answer,
 * because that is what a traveller would act on: a made-up schedule sends
 * someone to an airport just as surely as a made-up price.
 *
 * ONE CONSTANT, NOT FOUR STRINGS. The first fix changed only the outage
 * refusal, because that is the one the screenshot showed. Three siblings in
 * this same file — missing arguments, a past date, invalid arguments — still
 * carried the one-field version, and they are the refusals a model is MOST
 * tempted to soften: the desk has just declined to do the thing that was asked,
 * for a reason the traveller may find pedantic, and recalled detail is the
 * obvious way to seem useful anyway. Fixing the reported instance and leaving
 * its siblings is how a closed class reopens, so the wording lives in exactly
 * one place and every refusal reads from it.
 */
const NO_SUBSTITUTE = 'I will not fill the gap with flight details from memory — no fares, carriers, schedules or durations.';

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
  return `I can look up live flights once I have origin airport, destination airport, and a departure date (YYYY-MM-DD).${noted} ${NO_SUBSTITUTE}`;
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
    return `Live flight search is not connected (DUFFEL_API_KEY is missing on the server). ${NO_SUBSTITUTE} Connect Duffel, or keep planning with airports and dates without live prices.`;
  }

  const route = routeLabel(args);
  const prose = includeRetry
    ? `I could not look up live flights${route} just now. ${NO_SUBSTITUTE} Tap Retry to run the same search again.`
    : `I could not look up live flights${route} just now. ${NO_SUBSTITUTE} We can retry when the flight provider answers.`;

  if (!includeRetry) return prose;

  return [
    prose,
    '',
    '<quantora-modal>{"question":"Retry live flight search?","options":[{"id":"retry-flights","title":"Retry flight search","description":"Run the live lookup again","value":"Retry the live flight search with the same airports and dates."}]}</quantora-modal>',
  ].join('\n');
}

/** Today in UTC as a comparable YYYY-MM-DD string. Injectable so tests can pin it. */
export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function flightInvalidArgsAsk(args = {}, issues = [], { now = new Date() } = {}) {
  if (!flightArgsComplete(args)) return flightIncompleteAsk(args);

  /*
   * Name the past date, because it is the one invalid argument a traveller did
   * not choose. A model with no clock resolved "next 2-4 weeks" to 2025-05-08,
   * sixteen months behind, and the generic wording sent the traveller to check
   * their passenger count. Saying which date and what today is turns a baffling
   * refusal into a one-word correction.
   */
  const today = todayIso(now);
  const departure = String(args?.departureDate || '');
  if (departure && departure < today) {
    return `That search was for ${departure}, which is in the past — today is ${today}. I did not run it. ${NO_SUBSTITUTE} Tell me the dates you actually want and I will search those.`;
  }

  const detail = Array.isArray(issues) && issues.length
    ? ` (${issues.slice(0, 3).join(', ')})`
    : '';
  return `I could not run that flight search${detail}. Check passengers (1–9) and that any return date is on or after departure. ${NO_SUBSTITUTE}`;
}

export function resolveFlightToolRecovery({
  reason = '',
  configured = true,
  turnAttempt = null,
} = {}) {
  if (reason === 'INVALID_ARGUMENT' || reason === 'NOT_CONFIGURED') {
    return { retryable: false, autoRetryTurn: false, includeRetry: false };
  }
  if (reason === 'PROVIDER_ERROR' && configured) {
    // Only clients that send turnAttempt (the main Travel chat path) get an
    // automatic tool-turn retry. Dual Arena and older callers get a clickable retry.
    if (turnAttempt == null || !Number.isFinite(Number(turnAttempt))) {
      return { retryable: true, autoRetryTurn: false, includeRetry: true };
    }
    const attempt = Math.max(1, Number(turnAttempt) || 1);
    return {
      retryable: true,
      autoRetryTurn: attempt < 2,
      includeRetry: attempt >= 2,
    };
  }
  return { retryable: false, autoRetryTurn: false, includeRetry: false };
}
