import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildConversationSystemPrompt } from './conversation-policy.js';
import { FIRST_TURN_MODAL_EXEMPTION, MODAL_OMISSION_RULES } from './studio-choices.js';

/**
 * ---------------------------------------------------------------------------
 * ONE PROMPT MUST NOT BOTH REQUIRE A THING AND EXCUSE IT.
 *
 * On 2026-09-04 the deployed golden failed on production with:
 *
 *   GOLDEN VERDICT | failed at: guided-intake | completed: calculator,
 *   simple-website | why: neither an intake question nor an artifact within 150s
 *
 * The page had an intake question on it. The desk had asked, warmly and well:
 * "…whether your client wants real online selling or a beautiful showcase".
 * It had simply not wrapped that question in <quantora-modal>, because the
 * system prompt it was given said both of these, in the same string:
 *
 *   GUIDED_BUILD_DIRECTIVE  "you MUST … append <quantora-modal>"
 *   CHOICES_DIRECTIVE       "never for open-ended questions"
 *                           "Omit the modal if a free-text answer is better."
 *
 * A direction question IS open-ended in the ordinary sense, so the model
 * followed the more specific-sounding rule and was failed by a BLOCKING gate
 * for it. That is the recurring shape in this repo — the platform punishing
 * the model for obeying the brief it was handed — and it is not a model bug.
 *
 * The class this file closes: an omission rule that reaches the model without
 * the first-turn carve-out beside it.
 * ---------------------------------------------------------------------------
 */

test('the guided prompt never grants an unqualified licence to skip the intake modal', () => {
  const prompt = buildConversationSystemPrompt({ guided: true });

  /*
   * The premise, asserted against GUIDED_BUILD_DIRECTIVE's own sentence rather
   * than the loose pair "FIRST-TURN RULE" … "append <quantora-modal>": the
   * carve-out contains the first half and the prompt contains the second in
   * several places, so the loose form could pass with the actual rule deleted.
   */
  assert.match(
    prompt,
    /FIRST-TURN RULE \(critical\)[\s\S]{0,400}?append <quantora-modal>/i,
    'the first turn must still be required to append a modal — without that there is nothing to contradict',
  );

  /*
   * CHOICES_DIRECTIVE is composed FROM these strings, so they cannot go stale
   * against it. What this still catches is the directive not reaching a guided
   * prompt at all — in which case the assertion below would pass over a prompt
   * that never carried the contradiction, and report a clean run over nothing.
   */
  const present = MODAL_OMISSION_RULES.filter((rule) => prompt.includes(rule));
  assert.equal(
    present.length,
    MODAL_OMISSION_RULES.length,
    'the guided prompt no longer carries the omission rules, so this file is checking nothing (§4)',
  );

  assert.ok(
    prompt.includes(FIRST_TURN_MODAL_EXEMPTION),
    `the assembled guided prompt tells the model it may omit the modal (${present.join('; ')}) `
    + 'without the first-turn carve-out that overrides it. The model will obey one of them, and the '
    + 'deployed golden fails whichever it did not pick.',
  );
});

test('the exemption travels with the rules it overrides, not somewhere else in the prompt', () => {
  /*
   * Order matters here in a way a plain includes() cannot see: an exemption
   * that lands ABOVE the escape hatches reads as superseded by them. "The two
   * escape hatches above do not apply" is only true if they are above it.
   */
  const prompt = buildConversationSystemPrompt({ guided: true });
  const exemptionAt = prompt.indexOf(FIRST_TURN_MODAL_EXEMPTION);
  assert.ok(exemptionAt > 0, 'the exemption is missing from the assembled prompt');

  for (const rule of MODAL_OMISSION_RULES) {
    const ruleAt = prompt.indexOf(rule);
    if (ruleAt < 0) continue;
    assert.ok(
      ruleAt < exemptionAt,
      `"${rule}" appears AFTER the first-turn exemption, so the exemption's own wording is false`,
    );
  }
});

test('build mode is not given the carve-out, because it is not given the rule', () => {
  /*
   * The contradiction needs BOTH halves, so the carve-out is owed only where
   * the FIRST-TURN RULE actually ships. Build mode gets the omission rules and
   * no first-turn rule — correct, and naming that rule there would tell a
   * build-mode turn not to output the HTML it exists to output. The first
   * version of this fix folded the carve-out into CHOICES_DIRECTIVE and did
   * exactly that; conversation-policy.test.ts caught it.
   */
  /*
   * Keyed on the guided FLAG, not on the phrase "FIRST-TURN RULE" appearing in
   * the prompt. The first draft skipped on that phrase — which the carve-out's
   * own text contains — so folding the carve-out into CHOICES_DIRECTIVE made
   * this test skip the very prompt it was written to judge, and it passed with
   * the leak present. Found by re-running the break after the refactor (§8).
   */
  for (const options of [{}, { buildMode: true, guided: false }, { studioDomain: 'travel' as any }]) {
    const prompt = buildConversationSystemPrompt(options);
    assert.ok(
      !prompt.includes(FIRST_TURN_MODAL_EXEMPTION),
      `a prompt with guided intake OFF carries the first-turn carve-out anyway (${JSON.stringify(options)}), `
      + 'which names the FIRST-TURN RULE at a build turn and teaches it to withhold the artifact it was asked for',
    );
  }
});

test('wherever the first-turn rule ships, so does the carve-out', () => {
  /*
   * The invariant stated the only way that is true of every prompt: the
   * contradiction exists exactly where both halves are present, so that is
   * exactly where the carve-out is required.
   */
  const guided = buildConversationSystemPrompt({ guided: true });
  assert.match(guided, /FIRST-TURN RULE/, 'the guided prompt must still carry the rule');
  assert.ok(guided.includes(FIRST_TURN_MODAL_EXEMPTION), 'and therefore its carve-out');

  const guidedBuild = buildConversationSystemPrompt({ guided: true, buildMode: true });
  if (/FIRST-TURN RULE/.test(guidedBuild) && MODAL_OMISSION_RULES.some((r) => guidedBuild.includes(r))) {
    assert.ok(
      guidedBuild.includes(FIRST_TURN_MODAL_EXEMPTION),
      'guided+build carries both halves of the contradiction and no carve-out',
    );
  }
});

test('the golden says WHICH intake failure it saw, not one sentence for three', async () => {
  /*
   * The half of this that is not about the prompt. The verdict that cost the
   * night was true of a silent stall and false of what actually happened, and
   * a blocking gate whose only diagnosis is false is the §8 defect exactly.
   */
  const gate = await readFile(new URL('../../scripts/deployed-golden-transactions.mjs', import.meta.url), 'utf8');
  assert.match(gate, /asked its question in PROSE/, 'the prose-question outcome must be named');
  assert.match(gate, /could not READ/, 'the unreadable-modal outcome must be named');
  assert.match(gate, /produced NOTHING within/, 'the silent-stall outcome must be named');
  assert.doesNotMatch(
    gate,
    /produced neither an intake question nor an artifact/,
    'the sentence that was false about a page holding an intake question is back',
  );
});
