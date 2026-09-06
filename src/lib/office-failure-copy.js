/*
 * The sentence the desk shows when the Office generator answers with an error.
 *
 * The generator's 502 carries `stage` (provider, parse, semantic-gate) and
 * `detail` (which providers were asked and what each said, or the validation
 * rule the specification broke). The desk showed `error` alone — "Gatekeeper
 * failed to produce a valid word specification after 1 attempts." — so on
 * 2026-09-06 a deployment whose generator had no Gemini read exactly like a
 * model that wrote a bad document. The detail IS the diagnosis; the desk
 * passes it on, bounded, and the deployed golden reads it from the page.
 */
export const OFFICE_FAILURE_DETAIL_LIMIT = 280;

const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function officeFailureMessage(data, { fallback = 'Compilation failed' } = {}) {
  const error = oneLine(data?.error) || fallback;
  const detail = oneLine(data?.detail);
  if (!detail) return error;
  const stage = oneLine(data?.stage);
  const bounded = detail.length > OFFICE_FAILURE_DETAIL_LIMIT
    ? `${detail.slice(0, OFFICE_FAILURE_DETAIL_LIMIT - 1)}…`
    : detail;
  return `${error} (${stage ? `${stage}: ` : ''}${bounded})`;
}
