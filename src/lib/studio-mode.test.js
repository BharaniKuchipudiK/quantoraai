/**
 * Plan means plan.
 *
 * The composer now has a control labelled "Plan" that promises nothing is
 * written to the desk. The model is told the same thing in the system prompt —
 * and a prompt is not a gate (CLAUDE.md §4). The question that matters is what
 * happens when the model ignores the instruction and emits code anyway, which
 * every model does eventually.
 *
 * These tests answer it by running the real assembly path — the same
 * applyWorkspaceFromChat the reply handler calls — over a reply full of code
 * fences, and asserting the desk is untouched afterwards. That is the only
 * version of this test worth having: asserting on mayWriteToDesk alone would
 * pass forever while the component quietly ignored it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  guardPlanTurn,
  mayWriteToDesk,
  planTurnDiscardNotice,
  resolveStudioMode,
  studioModeOptions,
  studioModeRequestFields,
} from './studio-mode.js';
import { applyWorkspaceFromChat } from './studio-preview-helpers.js';

const DESK = {
  'index.html': { content: '<h1>original</h1>' },
  'src/app.js': { content: 'export const a = 1;' },
};

// A reply that ignores "no code this turn" — which is the case the guard exists for.
const REPLY_WITH_CODE = [
  'Here is the plan, and here is a head start on it.',
  '',
  '```html src/index.html',
  '<h1>rewritten by the model</h1>',
  '```',
  '',
  '```js src/app.js',
  'export const a = 999;',
  '```',
].join('\n');

/* ------------------------------------------------------------------ *
 * The guard, over the real assembly path
 * ------------------------------------------------------------------ */

test('a plan turn carrying code leaves the desk byte-for-byte unchanged', () => {
  const assembled = applyWorkspaceFromChat(REPLY_WITH_CODE, DESK, null, { brief: 'plan me a dashboard' });
  const guarded = guardPlanTurn(assembled, DESK, 'plan');

  assert.deepEqual(guarded.vfs, DESK, 'plan mode wrote to the desk — the toggle is decorative');
  assert.equal(guarded.vfs['src/app.js'].content, 'export const a = 1;');
  assert.deepEqual(guarded.changedPaths, []);
  assert.equal(guarded.didUpdate, false);
});

test('a plan turn hands the proof plane nothing to repair', () => {
  // proveCodingTurn runs a repair over `producedVfs`. Leaving the discarded
  // fences there would let the repair rebuild them — the guard would hold the
  // desk with one hand and hand the build back with the other.
  const assembled = applyWorkspaceFromChat(REPLY_WITH_CODE, DESK, null, { brief: 'plan me a dashboard' });
  const guarded = guardPlanTurn(assembled, DESK, 'plan');

  assert.deepEqual(guarded.producedVfs, {});
  assert.equal(guarded.code, '', 'a preview opened from a plan turn is a build the user did not ask for');
});

test('the same reply in build mode DOES write — the guard is what differs, not the parser', () => {
  // Without this, the test above would pass on an assembly path that had simply
  // stopped working, and nobody would know the difference.
  const assembled = applyWorkspaceFromChat(REPLY_WITH_CODE, DESK, null, { brief: 'build me a dashboard' });
  const guarded = guardPlanTurn(assembled, DESK, 'build');

  assert.notDeepEqual(guarded.vfs, DESK, 'the fixture no longer produces files; this suite proves nothing');
  assert.deepEqual(guarded.discardedPaths, []);
});

test('a discarded plan turn names what it discarded, rather than looking like an empty reply', () => {
  const assembled = applyWorkspaceFromChat(REPLY_WITH_CODE, DESK, null, { brief: 'plan me a dashboard' });
  const guarded = guardPlanTurn(assembled, DESK, 'plan');

  assert.ok(guarded.discardedPaths.length > 0, 'a silent discard reads as a model that wrote nothing');
  const notice = planTurnDiscardNotice(guarded.discardedPaths.length);
  assert.match(notice, /discarded/);
  assert.match(notice, /Nothing on the desk changed/);
  assert.match(notice, /Switch to Build/, 'the notice has to say the way out');
});

test('a plan turn that honestly wrote no code discards nothing and says nothing', () => {
  const assembled = applyWorkspaceFromChat('Here are the steps. No code yet.', DESK, null, { brief: 'plan' });
  const guarded = guardPlanTurn(assembled, DESK, 'plan');

  assert.deepEqual(guarded.discardedPaths, []);
  assert.equal(planTurnDiscardNotice(0), '', 'a notice on every plan turn is noise');
});

/* ------------------------------------------------------------------ *
 * Which mode a turn runs in
 * ------------------------------------------------------------------ */

test('an explicit choice outranks the inference, which is the point of a toggle', () => {
  assert.equal(resolveStudioMode({ chosen: 'plan', refineDesk: true }), 'plan');
  assert.equal(resolveStudioMode({ chosen: 'build', refineDesk: false }), 'build');
});

test('no choice preserves exactly the behaviour that existed before the toggle', () => {
  // The old literal was `refineDesk ? 'build' : 'ask'`. Anything else here is a
  // silent behaviour change shipped under the banner of adding a control.
  assert.equal(resolveStudioMode({ refineDesk: true }), 'build');
  assert.equal(resolveStudioMode({ refineDesk: false }), 'ask');
  assert.equal(resolveStudioMode({}), 'ask');
  assert.equal(resolveStudioMode({ chosen: 'nonsense', refineDesk: false }), 'ask');
});

test('only plan mode is barred from the desk', () => {
  assert.equal(mayWriteToDesk('plan'), false);
  for (const mode of ['build', 'ask', null, undefined]) {
    assert.equal(mayWriteToDesk(mode), true, `${mode} must still be able to write`);
  }
});

/* ------------------------------------------------------------------ *
 * What the control says it does
 * ------------------------------------------------------------------ */

test('the toggle offers exactly two positions and both explain themselves', () => {
  const options = studioModeOptions();
  assert.deepEqual(options.map((option) => option.id), ['plan', 'build']);
  for (const option of options) {
    assert.ok(option.hint.length > 10, `${option.id} needs a hint saying what it does`);
  }
  assert.match(options[0].hint, /Nothing is written/, 'the Plan hint must state the promise this suite enforces');
});

/* ------------------------------------------------------------------ *
 * What reaches the server
 * ------------------------------------------------------------------ */

/**
 * The regression this suite exists to prevent, in one test.
 *
 * The server treats a present studioMode as explicit, and an explicit "ask"
 * turns build mode OFF (shared/build-intent.js, resolveEffectiveBuildMode).
 * Sending the inferred mode therefore breaks every fresh build in the product
 * — "build me a website" would answer in chat and never open the desk.
 */
test('an inferred mode is never sent, because the server would read it as a choice', () => {
  assert.deepEqual(studioModeRequestFields(null), {}, 'sending inferred "ask" disables build mode server-side');
  assert.deepEqual(studioModeRequestFields(undefined), {});
  assert.deepEqual(studioModeRequestFields('ask'), {}, '"ask" is what the inference produces, not something anyone picks');
  assert.deepEqual(studioModeRequestFields('nonsense'), {});
});

test('a real choice is sent, because that is the whole point of the control', () => {
  assert.deepEqual(studioModeRequestFields('plan'), { studioMode: 'plan' });
  assert.deepEqual(studioModeRequestFields('build'), { studioMode: 'build' });
});
