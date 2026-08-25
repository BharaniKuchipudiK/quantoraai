/**
 * Human partner status when inference falls over mid-turn.
 * Prefer "switching engines" over silent retry counters.
 */

export function partnerProviderPressureLabel(input: {
  attempt?: number;
  maxAttempts?: number;
  nextModelLabel?: string;
  statusCode?: number;
} = {}): string {
  const attempt = Math.max(1, Number(input.attempt) || 1);
  const maxAttempts = Math.max(attempt, Number(input.maxAttempts) || attempt);
  const next = String(input.nextModelLabel || '').trim();
  const statusCode = Number(input.statusCode) || 0;
  const overloaded = statusCode === 429 || statusCode === 503;

  if (overloaded) {
    if (next) {
      return (
        `Model overloaded — switching to ${next} (${attempt}/${maxAttempts}). `
        + `Same job, different engine — not leaving you on a dead retry loop.`
      );
    }
    return (
      `Model overloaded (${attempt}/${maxAttempts}). `
      + `Retrying once with a fallback, then I'll stop and tell you what we can still do.`
    );
  }

  if (next) {
    return `That route failed — switching to ${next} (${attempt}/${maxAttempts}).`;
  }
  return `That route failed (${attempt}/${maxAttempts}). Trying the next engine…`;
}
