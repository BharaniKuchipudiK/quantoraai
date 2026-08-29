/**
 * A workspace may not advertise a capability nothing can answer.
 *
 * WHY THIS EXISTS
 *
 * The Finance workspace told every visitor it did "Portfolio" — on the landing
 * page and again on the workspace picker. Nothing in the repository answers a
 * portfolio question: no store of holdings, no gateway, no arithmetic. Ask it,
 * and the turn falls through to a general model guessing about somebody's money.
 *
 * That is the same defect as a dead button on a generated page, one level up:
 * the door is painted on. The wiring gate proves a tested export is reachable;
 * this proves an advertised capability is answerable.
 *
 * A capability is BACKED when it names at least one module that exists. That is
 * a deliberately low bar — it does not prove the answer is correct, only that
 * something is there to answer with. It is enough to catch a painted door, and
 * claiming more than it checks would be the same sin one level up again.
 */

/**
 * Advertised capability -> the module(s) that answer it.
 *
 * Paths are repository-relative. Adding a capability to a workspace policy
 * without adding it here fails the test, which is the point: the claim and the
 * code that honours it get written in the same commit.
 */
export const CAPABILITY_BACKING = Object.freeze({
  finance: Object.freeze({
    Currency: ['api/_lib/market-data-lookup.ts', 'api/_lib/market-data-gateway.ts'],
    Debt: ['api/_lib/debt-payoff.ts', 'api/_lib/debt-gateway.ts'],
    Savings: ['api/_lib/savings-goal.ts', 'api/_lib/savings-gateway.ts'],
    Decisions: ['api/_lib/affordability.ts'],
  }),
  travel: Object.freeze({
    Flights: ['api/_lib/travel-search-request.ts'],
    Hotels: ['api/_lib/travel-search-request.ts'],
    Attractions: ['api/_lib/travel-search-request.ts'],
    Itineraries: ['api/_lib/travel-model-routing.ts'],
  }),
  education: Object.freeze({
    Explain: ['api/_lib/study-truth-layer.ts'],
    Practise: ['api/_lib/study-evidence.ts'],
    Plan: ['src/lib/study-syllabus-overlay.js'],
    Review: ['api/_lib/study-evidence.ts'],
  }),
  research: Object.freeze({}),
});

/**
 * Claims that are painted doors TODAY, each one a debt with a name.
 *
 * This list may only ever shrink. It exists so the Finance fix could land
 * without silently blessing every other workspace's claims, and so nobody can
 * add a fifth unbacked claim while these four are outstanding.
 */
export const KNOWN_UNBACKED_CLAIMS = Object.freeze([
  // The Research workspace ships a picker entry and four capability chips with
  // no research, comparison, evidence or decision module behind any of them.
  'research::Research',
  'research::Compare',
  'research::Evidence',
  'research::Decide',
]);

/**
 * Every advertised capability with no backing module that exists on disk.
 *
 * `exists` is injected so the check is a pure function of the filesystem the
 * caller reports, and the test can prove both directions without touching disk.
 */
export function findUnbackedCapabilities(policies = {}, exists = () => false) {
  const unbacked = [];
  for (const [domain, policy] of Object.entries(policies)) {
    const backing = CAPABILITY_BACKING[domain] || {};
    for (const capability of policy?.capabilities || []) {
      const paths = backing[capability] || [];
      if (!paths.some((path) => exists(path))) unbacked.push(`${domain}::${capability}`);
    }
  }
  return unbacked;
}

/** What is newly painted-on since the baseline — the set that must stay empty. */
export function newUnbackedClaims(unbacked = []) {
  const known = new Set(KNOWN_UNBACKED_CLAIMS);
  return unbacked.filter((claim) => !known.has(claim));
}

/** Baseline entries that are now backed, so the list can be tightened. */
export function resolvedUnbackedClaims(unbacked = []) {
  const current = new Set(unbacked);
  return KNOWN_UNBACKED_CLAIMS.filter((claim) => !current.has(claim));
}
