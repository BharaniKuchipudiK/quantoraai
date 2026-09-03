/**
 * May this mission spend a premium escalation?
 *
 * THE DEFECT THIS REPLACES. Premium escalation was decided by
 * `allowPaid: Boolean(getClientSecret('openrouter'))` — whether a credential
 * exists. Not whether this mission had any premium reserve left, not whether it
 * had already spent it. The Resource & Budget Governor that answers exactly
 * that question was complete, deployed, and called by nothing.
 *
 * THE RULE, AND WHY IT LEANS THE WAY IT DOES.
 *
 * `premiumEscalationRemaining` is `null` for an unmetered Run and a number for a
 * metered one — the same convention `evaluateQirResourceGovernor` uses, where a
 * null lane skips the check entirely. An absent Run means the durable journal
 * has not answered yet, or is not configured at all.
 *
 * All three of those resolve to "yes". A budget nobody can read must never be
 * the reason a build does not run — the invariant #516 added when a spent TURN
 * budget was sealing whole missions. The governor may say "you have spent your
 * reserve"; it may never say "I could not tell, so no".
 *
 * The single case that says no is the one backed by evidence: a metered Run
 * whose premium reserve is exhausted.
 */

/**
 * @param {{ budget?: { premiumEscalationRemaining?: number|null } }|null|undefined} run
 * @returns {boolean}
 */
export function missionMayAffordPremium(run) {
  const remaining = run?.budget?.premiumEscalationRemaining;
  if (remaining === null || remaining === undefined) return true;
  const units = Number(remaining);
  return Number.isFinite(units) ? units > 0 : true;
}

/**
 * The `allowPaid` the engine resolver should see.
 *
 * Both inputs must hold: a premium engine needs a credential to call it AND a
 * reserve to charge it to. Neither alone is sufficient, and the old code had
 * only the first.
 *
 * @param {{ hasPaidCredential?: boolean, run?: object|null }} input
 */
export function resolveAllowPaid({ hasPaidCredential = false, run = null } = {}) {
  return Boolean(hasPaidCredential) && missionMayAffordPremium(run);
}
