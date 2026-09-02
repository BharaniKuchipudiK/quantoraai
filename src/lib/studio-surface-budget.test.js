/**
 * The screenshot, as a test.
 *
 * A Travel session spent ~400px above the composer on three stacked cards, and
 * the third reprinted the first chip of the first as a heading. Asserting the
 * exact numbers from that session is what stops this being re-argued from
 * memory later.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { planMissionCard } from './studio-surface-budget.js';

/* Verbatim from the reported session. */
const CHIPS = ['Strictly vegetarian/Jain?', 'Day trip dining in Ubud', 'Finalize 4-day schedule'];
const MISSION = {
  lead: 'Planning',
  goal: 'Suggest attractions that fit this trip',
  understanding: 'User selected a 3-4 day getaway based in Seminyak; shortlisted top stays, reviewed flight options from SIN to DPS, explored key attractions, and reviewed top Indian dining spots.',
  next: 'Strictly vegetarian/Jain?',
};

test('THE INCIDENT: the mission card does not reprint a chip that is already on screen', () => {
  const plan = planMissionCard({ mission: MISSION, chipLabels: CHIPS });

  assert.equal(plan.next, '', '"Next: Strictly vegetarian/Jain?" is chip #1, two hundred pixels lower');
  assert.equal(plan.suppressedNext, 'Strictly vegetarian/Jain?', 'and the reason is inspectable');

  // Everything the chips do NOT already say survives. Suppression is about
  // duplication, not about deciding this card matters less.
  assert.equal(plan.goal, MISSION.goal);
  assert.equal(plan.understanding, MISSION.understanding);
  assert.equal(plan.show, true);
});

test('a next step NOT on screen is kept — the chips row is dismissible', () => {
  /*
   * partnerContinueLabel does not consult dismissedContinueId, so dismissing
   * the chips leaves the mission card as the only place this step exists.
   * Suppressing it there too would delete the step from the UI entirely.
   */
  const plan = planMissionCard({ mission: MISSION, chipLabels: [] });
  assert.equal(plan.next, 'Strictly vegetarian/Jain?');
  assert.equal(plan.suppressedNext, '');
});

test('matching survives casing and stray whitespace, and nothing looser', () => {
  assert.equal(planMissionCard({ mission: { next: 'Book the ferry' }, chipLabels: ['  book the FERRY '] }).next, '');

  /*
   * Precision, per CLAUDE.md §5. A rule that hides lines merely RESEMBLING a
   * chip fires on ambiguous evidence, and a rule like that gets switched off by
   * the next person under pressure. Only an exact label is a duplicate.
   */
  const near = planMissionCard({ mission: { next: 'Book the ferry to Nusa Penida' }, chipLabels: ['Book the ferry'] });
  assert.equal(near.next, 'Book the ferry to Nusa Penida', 'a longer, more specific step is not the chip');
});

test('a card with nothing left to say does not render its own chrome', () => {
  // Study: hideGoal, no understanding, and its one next step is already a chip.
  const plan = planMissionCard({
    mission: { goal: 'Thermodynamics', understanding: '', next: 'Try a worked example' },
    chipLabels: ['Try a worked example'],
    hideGoal: true,
  });
  assert.equal(plan.show, false, 'border, padding and margin for an empty box is the defect in miniature');
  assert.equal(plan.goal, '');
  assert.equal(plan.next, '');
});

test('hideGoal drops the goal but never the rest', () => {
  const plan = planMissionCard({ mission: MISSION, chipLabels: [], hideGoal: true });
  assert.equal(plan.goal, '');
  assert.equal(plan.understanding, MISSION.understanding);
  assert.equal(plan.next, 'Strictly vegetarian/Jain?');
  assert.equal(plan.show, true);
});

test('no mission at all is not a crash and not a card', () => {
  for (const value of [null, undefined]) {
    const plan = planMissionCard({ mission: value, chipLabels: CHIPS });
    assert.equal(plan.show, false);
    assert.equal(plan.next, '');
  }
  assert.equal(planMissionCard().show, false);
  // A malformed chipLabels must not throw where a UI is mid-render.
  assert.equal(planMissionCard({ mission: MISSION, chipLabels: null }).next, MISSION.next);
});

test('an empty next is never "duplicated" by an empty chip label', () => {
  // sameLabel requires a non-empty string on both sides; without that, a mission
  // with no next and a stray blank chip would report a phantom suppression.
  const plan = planMissionCard({ mission: { goal: 'g', next: '' }, chipLabels: ['', '  '] });
  assert.equal(plan.suppressedNext, '');
  assert.equal(plan.show, true);
});
