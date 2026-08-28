/*
 * Which listed models may actually be BUILT WITH, as opposed to merely listed.
 *
 * These are different questions and confusing them produces the most expensive
 * mistake this project makes. The OpenRouter catalogue is public and is read
 * anonymously on purpose, so the listing works with no key at all — but the
 * candidates it yields cannot be called. Testing one sends `Bearer null`,
 * earns a guaranteed 401, and records it as a MODEL failure. With every
 * candidate failing that way, the audit's verdict reads "nothing produced a
 * complete page … the problem is upstream of the platform" — a confident,
 * false conclusion of precisely the kind the audit exists to prevent.
 *
 * It lives in its own file, away from the 500-line script, because it is the
 * one decision in there worth asserting: the script's own network paths are
 * unreachable from CI, and this is provable without them.
 */

/**
 * Split candidates by whether a credential for their gateway has been PROVEN.
 * Readiness is never inferred from a catalogue that answered — a public
 * catalogue answers to nobody in particular.
 */
export function splitByGatewayReadiness(candidates, gatewayReady = {}) {
  const reachable = [];
  const blocked = [];
  for (const candidate of candidates || []) {
    (gatewayReady[candidate?.gateway] === true ? reachable : blocked).push(candidate);
  }
  return { reachable, blocked };
}

/**
 * The ids a person explicitly asked for that cannot be reached. Naming these
 * is the whole point: dropping them silently leaves "no models finished" as
 * the apparent answer, which is the lie.
 */
export function namedButBlocked(only = [], blocked = []) {
  const unreachable = new Set(blocked.map((candidate) => candidate?.id));
  return (only || []).filter((id) => unreachable.has(id));
}
