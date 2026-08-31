/**
 * What the trip board is allowed to say about where its results came from.
 *
 * WHY THIS EXISTS
 *
 * The board said "Live from Duffel" for anything the provider returned. A
 * duffel_test_ token returns Duffel's sandbox: real carrier names, plausible
 * fares, nothing bookable. So the one deployment that had a Duffel token was
 * the one telling users its sample data was live.
 *
 * That string was in the component before it was wired, but nothing rendered
 * it, so the claim was never made. Wiring the board is what made it reachable
 * — a latent falsehood becoming a shipped one.
 *
 * "Never invent a fare" was enforced in the provider layer. "Never call
 * sandbox data live" had no home at all. This is that home, and it is a pure
 * module so the wording is a test, not a habit.
 */

/** Provider modes, as `duffelKeyShape` reports them. */
const NEVER_BOOKED = 'We do not book from here.';

export function flightSourceNote(mode, source = 'Duffel') {
  const provider = String(source || 'Duffel').trim() || 'Duffel';
  if (mode === 'test') {
    return `${provider} sandbox — sample fares, not real availability or prices. ${NEVER_BOOKED}`;
  }
  if (mode === 'live') {
    return `Live from ${provider}. ${NEVER_BOOKED}`;
  }
  // An unrecognised token still reaches a provider, so results are real
  // enough to show — but not enough to call live.
  return `From ${provider}. Provider mode unknown, so treat these prices as unverified. ${NEVER_BOOKED}`;
}

/**
 * Said before the tap, not after it. A chip that looks live and cannot
 * succeed is the dead control this desk exists to avoid.
 */
export function flightsBlockedNote() {
  return 'Live flight search is not connected on this deployment, so I cannot show fares. I will not invent them.';
}

export function staysBlockedNote() {
  return 'Live place search is not connected on this deployment, so I cannot shortlist stays. I will not invent them.';
}

/**
 * Whether a chip may be offered at all.
 *
 * `configured` is null while readiness is still unknown — a health check that
 * has not answered yet, or failed. That must not disable a working board, so
 * unknown falls through to the trip's own readiness and the provider gets to
 * answer for itself.
 */
export function chipEnabled({ tripReady = false, configured = null } = {}) {
  if (!tripReady) return false;
  return configured === false ? false : true;
}

/** The reason a chip is dark, or '' when there is nothing to explain. */
export function blockedReason({ kind, tripReady = false, configured = null } = {}) {
  if (!tripReady || configured !== false) return '';
  return kind === 'flights' ? flightsBlockedNote() : staysBlockedNote();
}
