import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAutoOpenCodeWorkspace,
  canChooseStudioMode,
  canExplicitlyPreviewCode,
  canUseGithubControls,
  studioDomainPolicy,
  studioModeChoiceForDomain,
} from './studio-domain-policy.js';

test('neutral Studio remains a full build workspace', () => {
  assert.equal(canAutoOpenCodeWorkspace(null), true);
  assert.equal(canExplicitlyPreviewCode(null), true);
});


/*
 * Plan/Build and GitHub are coding controls.
 *
 * The pair below is the whole rule: `null` is BOTH Normal Chat and the Coding
 * Desk (there is no separate domain for either), so one assertion covers the
 * two surfaces the controls belong to, and the four named domains are the four
 * advisor desks they must not appear on.
 */
test('coding controls are offered on the generic desk and nowhere else', () => {
  for (const domain of [null, undefined, 'nonsense']) {
    assert.equal(canChooseStudioMode(domain), true);
    assert.equal(canUseGithubControls(domain), true);
  }
  for (const domain of ['travel', 'finance', 'education', 'research']) {
    assert.equal(canChooseStudioMode(domain), false, domain);
    assert.equal(canUseGithubControls(domain), false, domain);
  }
});

/*
 * The bug hiding the control would otherwise create.
 *
 * `studioModeChoice` outlives a workspace switch and the send path reads it
 * from a ref, so Plan chosen on the desk followed the person into Travel — a
 * plan turn whose reply `guardPlanTurn` discards, with no visible toggle to
 * clear. Hiding a control that still steers the turn is worse than showing it.
 */
test('a mode chosen on the desk does not follow the person into an advisor', () => {
  assert.equal(studioModeChoiceForDomain('plan', null), 'plan');
  assert.equal(studioModeChoiceForDomain('build', null), 'build');
  for (const domain of ['travel', 'finance', 'education', 'research']) {
    assert.equal(studioModeChoiceForDomain('plan', domain), null, domain);
    assert.equal(studioModeChoiceForDomain('build', domain), null, domain);
  }
});

test('no choice stays no choice', () => {
  assert.equal(studioModeChoiceForDomain(null, null), null);
  assert.equal(studioModeChoiceForDomain(undefined, null), null);
});
