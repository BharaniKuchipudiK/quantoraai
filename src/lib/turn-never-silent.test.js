/**
 * The platform must always answer, even when it cannot deliver.
 *
 * THE INCIDENT (2026-09-04). Two consecutive Coding desk turns rendered as
 * completely empty assistant bubbles — no text, no error, no explanation. The
 * user's report was that error handling is "hit and miss", and that is exactly
 * right: honesty lived in HANDLERS, so the real guarantee was "every author of
 * every exit path remembered to write copy". Any path that returned without
 * doing so left the empty `text: ''` the message was created with.
 *
 * An OUTCOME cannot be promised — providers fail, budgets run out. A RESPONSE
 * can, and unlike an outcome it is a closed property that a gate can hold.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describeSilentTurn, turnIsSilent } from './turn-never-silent.js';

test('[was-red] an empty assistant bubble is silence', () => {
  for (const text of ['', '   ', '\n', '\t\n  ', undefined, null]) {
    assert.equal(turnIsSilent({ id: 'ai-1', text }), true, `${JSON.stringify(text)} is nothing to read`);
  }
});

test('anything the user can actually read is NOT silence', () => {
  /*
   * The guard must not fire on a turn that answered through some other surface,
   * or it would append a "no reply" notice underneath a real reply — the same
   * class of lie it exists to remove, pointing the other way.
   */
  const answered = [
    ['prose', { text: 'Here is your CRM.' }],
    ['a proof card', { text: '', codingProof: { ok: true, evidence: {} } }],
    ['a build job', { text: '', buildJob: { id: 'job-1' } }],
    ['a choice set', { text: '', choiceSet: { options: ['a', 'b'] } }],
    ['a continue set', { text: '', continueSet: { options: ['next'] } }],
    ['a compare pane', { text: '', modelA: { text: 'A says' } }],
  ];
  for (const [why, message] of answered) {
    assert.equal(turnIsSilent(message), false, `${why} is an answer, not silence`);
  }
});

test('a non-message is never treated as silence', () => {
  for (const value of [null, undefined, 'string', 42]) {
    assert.equal(turnIsSilent(value), false);
  }
});

test('the notice explains missing completion without inventing provider or persistence evidence', () => {
  const notice = describeSilentTurn({ text: '' });
  assert.match(notice, /not a refusal/, 'the user must not read silence as a refusal');
  assert.doesNotMatch(notice, /nothing was (lost|recorded)/i);
  assert.match(notice, /could not confirm a completed response/);
  assert.match(notice, /Retry/, 'and must be told the next step');
});

test('[was-red] the notice claims no cause it cannot prove', () => {
  /*
   * The tempting copy here is "all engines are busy, try again". The desk DOES
   * send that when it has the evidence — a dead route, a spent retry budget.
   * At this boundary the only fact in hand is that nobody wrote anything, so
   * naming a cause would be the over-promising tool description from CLAUDE.md
   * in a new place: a plausible reason the user reads as fact.
   */
  const notice = describeSilentTurn({ text: '' });
  assert.doesNotMatch(notice, /busy|overloaded|rate.?limit|quota|capacity/i);
});

test('a correlation id rides along when there is one', () => {
  assert.match(describeSilentTurn({ text: '', correlationId: 'corr-9' }), /Reference: corr-9/);
  assert.doesNotMatch(describeSilentTurn({ text: '' }), /Reference:/);
});

test('[was-red] the guarantee is wired at the turn boundary, not in a handler', () => {
  /*
   * A unit cannot drive a 2,300-line React hook, and the handler-by-handler
   * approach is precisely the defect — so what this asserts is that the check
   * sits in the one terminal block every turn passes through. The same tradeoff
   * never-discard-model-output.test.js states and accepts.
   */
  const hook = readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'useChatStream.js'), 'utf8');

  assert.match(
    hook,
    /import \{ describeSilentTurn, turnIsSilent \} from '\.\.\/lib\/turn-never-silent\.js'/,
    'the hook must use the one definition of silence',
  );

  const tail = hook.slice(hook.lastIndexOf('} finally {'));
  assert.match(
    tail,
    /turnIsSilent\(m\)/,
    "the turn's terminal finally must ask whether the user was told anything",
  );
  assert.match(
    tail,
    /text: describeSilentTurn\(m\)/,
    'and must fill the empty message when they were not',
  );
  assert.match(tail, /setIsGenerating\(false\)/, 'guard: this really is the terminal block');
});

test('[was-red] the guard fills, it never replaces', () => {
  /*
   * never-discard-model-output.js: the platform may annotate a turn, it may not
   * replace it. This guard is safe by construction because it fires only on an
   * empty message — but the source must keep spreading the original message, or
   * a future edit could turn a fill into an overwrite.
   */
  const hook = readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'useChatStream.js'), 'utf8');
  const tail = hook.slice(hook.lastIndexOf('} finally {'));
  assert.match(tail, /\.\.\.m,\s*\n\s*text: describeSilentTurn\(m\)/, 'the message must be spread, not rebuilt');
});
