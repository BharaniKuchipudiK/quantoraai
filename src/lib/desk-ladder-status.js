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

/*
 * Own-key lookup, so a reason or tier named after something on Object.prototype
 * ('constructor', 'toString') reads as absent rather than returning a function
 * the chip would try to render.
 *
 * hasOwnProperty rather than Object.hasOwn, which is now a style choice and no
 * longer a correctness one. It was the latter: build.target was Vite's silent
 * "modules" default (chrome87, firefox78, safari14) and Object.hasOwn needs
 * Chrome 93, so it shipped untransformed — esbuild rewrites syntax, never
 * built-in methods — and threw, taking the whole desk down to render a chip.
 * The target now states the real floor, so either form is safe; this one stays
 * because it is what the rest of the codebase uses.
 */
function ownProperty(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

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
  const entry = ownProperty(LADDER_REASONS, base);
  if (!entry) return null;
  /*
   * The caller overwrites modelUsed with the server's raw id, so this receives
   * provider slugs as well as display names. The chip is nowrap inside a 48px
   * header, so a full slug consumes the row and clips the job and run status
   * beside it. Take the last path segment and drop a ":free" tier suffix.
   */
  const model = String(modelName || '')
    .split('/').pop()
    .replace(/:free$/i, '')
    .replace(/\s*\(free\)/ig, '')
    .trim();
  if (!model) return null;
  return { ...entry, model };
}

/** One line for a tooltip or a narrow chip. */
export function deskLadderSummary(status) {
  if (!status) return '';
  return `${status.title}: ${status.model} — ${status.detail}`;
}

/** Chip colours per tier. Light and dark, resolved where the tier is defined. */
const TIER_COLOR = {
  strong: { light: '#7c3aed', dark: '#c4b5fd', bgLight: 'rgba(124,58,237,0.10)', bgDark: 'rgba(167,139,250,0.16)' },
  held: { light: '#b45309', dark: '#fcd34d', bgLight: 'rgba(245,158,11,0.12)', bgDark: 'rgba(251,191,36,0.14)' },
  fast: { light: '', dark: '', bgLight: 'rgba(15,23,42,0.06)', bgDark: 'rgba(255,255,255,0.07)' },
};

export function deskLadderChipColors(tier, isLight, fallbackColor) {
  const tone = ownProperty(TIER_COLOR, tier) || TIER_COLOR.fast;
  const color = isLight ? tone.light : tone.dark;
  return {
    color: color || fallbackColor,
    background: isLight ? tone.bgLight : tone.bgDark,
  };
}

/** The chip is terse when nothing was decided beyond "the usual model ran". */
export function deskLadderChipLabel(status) {
  if (!status) return '';
  return status.tier === 'fast' ? status.model : `${status.title} · ${status.model}`;
}
