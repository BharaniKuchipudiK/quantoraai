/**
 * Coding Desk model ladder — how the turn's routing decision reads to a person.
 *
 * WHY THIS EXISTS
 *
 * resolveCodingDeskModel() already decides, per turn, whether to run the fast
 * default or climb to a stronger coder, and it returns a machine reason for the
 * choice: 'default_gemini', 'escalate_complex_coding', 'stay_gemini_unproven_free'
 * and so on. None of that ever reached the desk. The only trace was a faint
 * "using X" under the reply.
 *
 * So the ladder worked and the desk felt arbitrary. A complex prompt escalated
 * and looked identical to a trivial one. A deliberate refusal to escalate — the
 * router protecting the turn from a slow unproven model — looked like it had
 * simply ignored you.
 *
 * This module turns the decision that ACTUALLY RAN into a sentence. It invents
 * nothing and re-decides nothing: hand it a reason code the router emitted, and
 * it hands back wording. An unknown or missing code yields null, and the chip
 * does not render — silence is correct when we do not know.
 */

/**
 * tier: 'fast' — the quick default carried it.
 *       'strong' — the ladder climbed to a heavier coder.
 *       'held' — it could have climbed and chose not to, for a stated reason.
 */
const LADDER_REASONS = {
  default_gemini: {
    tier: 'fast',
    title: 'Fast lane',
    detail: 'Straightforward build — the fast coder handles this.',
  },
  non_coding_task: {
    tier: 'fast',
    title: 'Fast lane',
    detail: 'Not a build turn, so the ladder stays at the default model.',
  },
  escalate_complex_coding: {
    tier: 'strong',
    title: 'Escalated',
    detail: 'Complex or multi-file ask — moved up to a stronger coder.',
  },
  escalate_refine_or_repair: {
    tier: 'strong',
    title: 'Escalated',
    detail: 'Refining or repairing existing work — moved up to a stronger coder.',
  },
  escalate_shop_image_oversize: {
    tier: 'strong',
    title: 'Escalated',
    detail: 'Large catalogue build — moved up to a stronger coder.',
  },
  escalate_unavailable_stay_gemini: {
    tier: 'held',
    title: 'Held',
    detail: 'This turn earned a stronger coder, but none was available. Running the fast coder instead.',
  },
  stay_gemini_unproven_free: {
    tier: 'held',
    title: 'Held',
    detail: 'A stronger free model was available but has not proven it finishes in time. Kept the fast coder on purpose.',
  },
};

/**
 * @returns {{tier: string, title: string, detail: string, model: string} | null}
 *          null whenever there is nothing truthful to show.
 */
export function deskLadderStatus({ reason = '', modelName = '', autoRouted = false } = {}) {
  // The ladder only runs in Auto. A pinned model was the user's choice, not a
  // routing decision, and dressing it up as one would be a lie.
  if (!autoRouted) return null;
  /*
   * The planner appends a marker to the reason when a past-turn lesson forced
   * the escalation ("escalate_complex_coding+lesson_escalate"). The base reason
   * before the "+" is still exactly what the router decided, so read that and
   * ignore the annotation rather than dropping the chip entirely.
   */
  const base = String(reason || '').trim().split('+')[0];
  const entry = LADDER_REASONS[base];
  if (!entry) return null;
  const model = String(modelName || '').replace(/\s*\(free\)/ig, '').trim();
  if (!model) return null;
  return { ...entry, model };
}

/** One line for a tooltip or a narrow chip. */
export function deskLadderSummary(status) {
  if (!status) return '';
  return `${status.title}: ${status.model} — ${status.detail}`;
}
