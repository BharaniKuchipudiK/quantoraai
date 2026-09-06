/**
 * Vercel/proxy often kills /api/generate-office with a naked 504 HTML page
 * while Quantora is still walking 3 model attempts × 3 providers × 110s.
 * Stay inside the host clock and return JSON instead.
 */

export const OFFICE_HOST_PROXY_LIMIT_MS = 60_000;
export const OFFICE_PROXY_BUDGET_MS = 55_000;
export const OFFICE_COMPILE_RESERVE_MS = 8_000;
export const OFFICE_MIN_MODEL_CALL_MS = 8_000;
export const OFFICE_FAST_FAILOVER_MS = 8_000;
export const OFFICE_MAX_ATTEMPTS = 1;
export const OFFICE_MAX_FULL_PROVIDER_CALLS = 1;
export const OFFICE_CLIENT_GENERATE_ABORT_MS = 58_000;
export const OFFICE_CLIENT_COMPILE_ABORT_MS = 55_000;

export function officeProxyBudgetMs() {
  const fromEnv = Number(process.env.OFFICE_HOST_BUDGET_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= 20_000 && fromEnv <= 280_000) return Math.floor(fromEnv);
  return OFFICE_PROXY_BUDGET_MS;
}

export function remainingOfficeBudgetMs(startedAt, now = Date.now(), totalMs = officeProxyBudgetMs()) {
  return Math.max(0, totalMs - (now - startedAt));
}

export function officeModelCallBudgetMs(remainingMs) {
  const usable = Math.max(0, remainingMs - OFFICE_COMPILE_RESERVE_MS);
  return Math.max(OFFICE_MIN_MODEL_CALL_MS, usable);
}

export function officeGenerationMaxAttempts(_format) {
  return OFFICE_MAX_ATTEMPTS;
}

export function shouldStartAnotherOfficeAttempt(remainingMs, attemptsUsed, maxAttempts) {
  if (attemptsUsed >= maxAttempts) return false;
  return remainingMs > OFFICE_COMPILE_RESERVE_MS + 18_000;
}

export function officeProviderOrder(available = [], attemptIndex = 0) {
  const list = (available || []).filter(Boolean);
  if (!list.length) return [];
  const start = ((attemptIndex % list.length) + list.length) % list.length;
  return [list[start], ...list.filter((_, index) => index !== start)];
}

/**
 * Why the next provider may NOT be asked, in words — or null when it may.
 * shouldOfficeProviderFailover is this function's verdict; the reason rides
 * into the error so a 502 says which providers were never consulted and why,
 * instead of leaving them to be guessed at from the one that answered.
 */
export function officeFailoverRefusalReason({
  providersTried = 0,
  firstElapsedMs = Number.POSITIVE_INFINITY,
  remainingMs = 0,
} = {}) {
  if (providersTried < 1) return null;
  if (providersTried >= 2) return 'one failover per attempt is the limit';
  if (firstElapsedMs > OFFICE_FAST_FAILOVER_MS) {
    return `the first miss took ${Math.round(firstElapsedMs / 1000)}s and only a miss under ${Math.round(OFFICE_FAST_FAILOVER_MS / 1000)}s may fail over`;
  }
  const needed = OFFICE_COMPILE_RESERVE_MS + OFFICE_MIN_MODEL_CALL_MS;
  if (remainingMs < needed) {
    return `${Math.round(remainingMs / 1000)}s of host clock remained, under the ${Math.round(needed / 1000)}s a model call and a compile need`;
  }
  return null;
}

export function shouldOfficeProviderFailover(input = {}) {
  return officeFailoverRefusalReason(input) === null;
}

/**
 * One line naming every provider the Office generator asked, what each said,
 * and which were never asked and why. The 502 used to carry only the LAST
 * provider's error: on 2026-09-06 a preview deployment whose Gemini lived in
 * the gateway failed its Word file as "Gatekeeper failed to produce a valid
 * word specification after 1 attempts", with the provider that actually
 * answered — and the two that were never consulted — invisible.
 */
export function describeOfficeProviderOutcome({ failures = [], untried = [], refusal = null } = {}) {
  const asked = failures.length ? failures.join(' | ') : 'no provider was asked';
  if (!untried.length) return asked;
  return `${asked} — ${untried.join(', ')} not asked: ${refusal || 'failover refused'}`;
}

export function officeTimeoutUserMessage() {
  return 'The document generator ran out of host time before a file could be compiled. This is Quantora hitting the platform clock, not a missing API key. Shorten the brief and try once.';
}
