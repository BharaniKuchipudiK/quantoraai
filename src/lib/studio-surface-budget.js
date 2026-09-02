/**
 * Who gets to spend the space above the composer.
 *
 * THE COMPLAINT, AND WHAT WAS ACTUALLY ON SCREEN
 *
 * A Travel session showed three stacked blocks between the last reply and the
 * input box:
 *
 *   1. a row of suggestion chips  — "Strictly vegetarian/Jain?", "Day trip
 *      dining in Ubud", "Finalize 4-day schedule"
 *   2. the trip board             — "Singapore → Bali", a prompt for airport
 *      codes, and six chips
 *   3. the mission card           — "Planning: Suggest attractions that fit
 *      this trip", two lines of prose restating the conversation, and
 *      "Next: Strictly vegetarian/Jain?"
 *
 * Roughly four hundred pixels, three separate rounded cards, on a surface whose
 * whole claim is "one screen". No other assistant spends this.
 *
 * THE DUPLICATION IS STRUCTURAL, NOT A COINCIDENCE OF THAT SESSION
 *
 * mission.next is continueLabel, and continueLabel is
 * `filterContinuesForAdvisor(...)?.items?.[0]?.label` — literally the FIRST
 * SUGGESTION CHIP. So whenever the chips row is on screen, the mission card
 * reprints chip #1 as a heading in its own card two hundred pixels lower. Every
 * Travel session did this; the screenshot just made it visible.
 *
 * It survived because the two blocks are rendered by different components that
 * cannot see each other. Each is individually reasonable. Nobody owned the sum,
 * which is the actual class of defect here: not "this card is too tall" but
 * "no code anywhere knows how much space the stack costs".
 *
 * WHY SUPPRESS RATHER THAN DELETE
 *
 * The chips row is per-message and dismissible (dismissedContinueId), and
 * partnerContinueLabel does NOT consult that flag. Dismiss the chips and the
 * mission card's "Next:" becomes the only place that next step exists — which
 * is worth keeping. So the rule is about what is VISIBLE AT ONCE, not about
 * which component is more deserving: a label already on screen is not printed
 * again, and one that is not stays.
 */

/**
 * Normalise a label for comparison. Chips and the mission line come from the
 * same string, so this only has to survive casing and edge whitespace — a
 * looser match would start hiding lines that merely resemble a chip, which is
 * the ambiguity that gets a rule like this switched off later.
 */
function sameLabel(a, b) {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  return Boolean(left) && left === right;
}

/**
 * Decide what the mission card is still allowed to say.
 *
 * Returns the card's content after removing anything the user can already read
 * somewhere else on screen, plus whether the card has any reason left to exist.
 * A card with nothing to say must not render its border, padding and margin for
 * the privilege of being empty.
 *
 * @param mission        the derived mission ({ lead, goal, understanding, next })
 * @param chipLabels     labels of the suggestion chips CURRENTLY rendered
 * @param hideGoal       Study passes this; the topic lives in its own card there
 */
export function planMissionCard({ mission = null, chipLabels = [], hideGoal = false } = {}) {
  if (!mission) return { show: false, goal: '', understanding: '', next: '' };

  const visible = (Array.isArray(chipLabels) ? chipLabels : []).filter(Boolean);
  const goal = hideGoal ? '' : String(mission.goal || '');
  const understanding = String(mission.understanding || '');

  /*
   * The whole point. If this next step is already a chip the user can see and
   * tap, printing it again buys a row and communicates nothing.
   */
  const duplicated = visible.some((label) => sameLabel(label, mission.next));
  const next = duplicated ? '' : String(mission.next || '');

  return {
    show: Boolean(goal || understanding || next),
    goal,
    understanding,
    next,
    /* Reported so the reason a line vanished is inspectable rather than folklore. */
    suppressedNext: duplicated ? String(mission.next || '') : '',
  };
}
