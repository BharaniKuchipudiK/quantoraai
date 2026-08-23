/**
 * Vercel/proxy often kills /api/generate-office with a naked 504 HTML page
 * while Quantora is still walking 3 model attempts × 3 providers × 110s.
 * Stay inside the host clock and return JSON instead.
 */

export const OFFICE_PROXY_BUDGET_MS = 55_000;
export const OFFICE_COMPILE_RESERVE_MS = 8_000;
export const OFFICE_MIN_MODEL_CALL_MS = 8_000;

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

export function officeGenerationMaxAttempts(format) {
  return format === 'powerpoint' ? 1 : 1;
}

export function shouldStartAnotherOfficeAttempt(remainingMs, attemptsUsed, maxAttempts) {
  if (attemptsUsed >= maxAttempts) return false;
  return remainingMs > OFFICE_COMPILE_RESERVE_MS + 18_000;
}

export function pickOfficeProvidersForAttempt(available = [], attemptIndex = 0) {
  const list = (available || []).filter(Boolean);
  if (!list.length) return [];
  const start = ((attemptIndex % list.length) + list.length) % list.length;
  return [list[start], ...list.filter((_, index) => index !== start)];
}

export function officeTimeoutUserMessage() {
  return 'The document generator ran out of host time before a file could be compiled. This is Quantora hitting the platform clock, not a missing API key. Shorten the brief and try once.';
}
