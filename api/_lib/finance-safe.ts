/**
 * Numeric safety net for the Finance engines. Stored context is already
 * normalized to finite numbers, and every gateway is wrapped in
 * guardFinanceGateway — this is the third layer: it keeps arithmetic and output
 * sane even if a caller passes NaN/Infinity/negative/absurd values, so a heavy
 * or malformed input degrades to a clean number, never a crash or a "NaN" in the
 * user's face.
 */

// A hard ceiling that keeps formatting and iteration bounded without ever being
// reachable by a real personal balance sheet.
const MAX_AMOUNT = 1e15;

/** Coerce to a finite, non-negative, bounded number (default 0 on garbage). */
export function finiteNonNeg(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, MAX_AMOUNT);
}

/** Coerce to a finite number (may be negative — e.g. net worth), bounded. */
export function finiteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-MAX_AMOUNT, Math.min(n, MAX_AMOUNT));
}

/** Money string that never renders NaN/Infinity — falls back to a dash. */
export function safeMoney(amount: unknown, currency: string | null): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  const body = Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
  return `${currency || ""} ${body}`.trim();
}
