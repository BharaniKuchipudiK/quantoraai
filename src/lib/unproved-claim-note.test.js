import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { UNPROVED_CLAIM_NOTES, unprovedClaimNote } from './unproved-claim-note.js';

/**
 * ---------------------------------------------------------------------------
 * A CHECK THAT CANNOT CHANGE AN OUTCOME IS WORSE THAN NO CHECK.
 *
 * conversation-engine.ts has caught "your app is ready" over nothing verified
 * since it was written — outcome_done_without_proof, severity FAILURE. The
 * verdict then travelled to the client inside conversation.verification and was
 * read by nobody: TechnicalAnalyticsPanel reads .routing, .evaluation,
 * .responseContract, .move and .reasonCode, never .verification.
 *
 * So the gate ran, judged right, failed, and the user read the claim anyway.
 * These tests hold the correction to the two things that make it real: it says
 * something, and something renders it.
 * ---------------------------------------------------------------------------
 */

const failing = (...codes) => ({
  status: 'fail',
  issues: codes.map((code) => ({ code, severity: 'failure' })),
});

test('a clean verification corrects nothing', () => {
  assert.equal(unprovedClaimNote({ status: 'pass', issues: [] }), null);
  assert.equal(unprovedClaimNote(null), null);
  assert.equal(unprovedClaimNote(undefined), null);
  assert.equal(unprovedClaimNote({ issues: 'not an array' }), null);
});

test('warnings never produce a correction', () => {
  /*
   * "too many questions" and "delivery too thin" are tuning signals for us. Put
   * them under a reply and the user learns to skip the notes that matter, which
   * is how the one about an unsent email stops being read.
   */
  const warned = { status: 'warning', issues: [
    { code: 'too_many_questions', severity: 'warning' },
    { code: 'action_delivery_too_thin', severity: 'warning' },
  ] };
  assert.equal(unprovedClaimNote(warned), null);
});

test('a claim of done over nothing verified is corrected, and says what is missing', () => {
  const note = unprovedClaimNote(failing('outcome_done_without_proof'));
  assert.equal(note?.code, 'outcome_done_without_proof');
  assert.match(note.text, /Nothing has verified it/);
  // Says what is absent, so the user can go and look, rather than calling the
  // model a liar and leaving them nothing to check.
  assert.match(note.text, /no success criterion|no artifact/i);
});

test('a claim that something was sent or published is corrected concretely', () => {
  const note = unprovedClaimNote(failing('external_action_without_evidence'));
  assert.equal(note?.code, 'external_action_without_evidence');
  assert.match(note.text, /no such action/i);
  assert.match(note.text, /nothing left this session/i, 'a vague "unsupported claim" leaves them guessing which sentence to distrust');
});

test('the outside world outranks the artifact', () => {
  // The user can open the desk and judge the artifact themselves. They cannot
  // check whether an email was sent, so that correction goes first.
  const note = unprovedClaimNote(failing('outcome_done_without_proof', 'external_action_without_evidence'));
  assert.equal(note?.code, 'external_action_without_evidence');
});

test('every failure the engine can raise has a decided answer', async () => {
  /*
   * THE CLASS, not the instance. A new failure code added to
   * verifyConversationResponse must not silently reach the user uncorrected —
   * which is the exact defect this file exists to fix, repeating itself one
   * code later. A code that deliberately shows nothing is written as null with
   * its reason; omission is indistinguishable from an oversight.
   */
  const engine = await readFile(new URL('../../api/_lib/conversation-engine.ts', import.meta.url), 'utf8');
  const codes = [...engine.matchAll(/issue\(issues,\s*"([a-z_]+)",\s*"failure"\)/g)].map((m) => m[1]);
  assert.ok(codes.length >= 4, `expected the engine's failure codes, found ${codes.length} — this gate has stopped reading the file`);
  for (const code of codes) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(UNPROVED_CLAIM_NOTES, code),
      `${code} is a FAILURE the engine raises and nobody has decided what the user is told about it`,
    );
  }
});

test('two failures deliberately show nothing, and say why in the source', async () => {
  // §4 in the other direction: a null that is a decision reads the same as a
  // null that is a gap unless the reason is written down.
  assert.equal(UNPROVED_CLAIM_NOTES.empty_response, null);
  assert.equal(UNPROVED_CLAIM_NOTES.unsafe_output_detected, null);
  const source = await readFile(new URL('./unproved-claim-note.js', import.meta.url), 'utf8');
  for (const code of ['empty_response', 'unsafe_output_detected']) {
    const before = source.slice(0, source.indexOf(`${code}: null`));
    assert.match(before.slice(-420), /on purpose/, `${code} is silenced with no stated reason`);
  }
});

test('the desk renders the correction on the message it judged', async () => {
  /*
   * The wiring. A correction nobody renders is the defect this file was written
   * to remove, wearing a different name — and this repository has deleted three
   * subsystems for exactly that.
   */
  const studio = await readFile(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /unprovedClaimNote\(msg\.conversation\?\.verification\)/, 'the desk must ask for the correction');
  assert.match(studio, /data-quantora-unproved-claim=\{note\.code\}/, 'the correction must be observable');
  assert.match(studio, /\{note\.text\}/, 'the correction must be rendered, not merely computed');
  /*
   * On the message it judged, not only the newest: an unbacked claim does not
   * stop being one when the next turn arrives.
   *
   * Anchored on the JSX guard that opens the block, not on a byte window before
   * the call. Two earlier drafts of this assertion did not fail with the bug
   * present — one sliced FORWARD from the call, past the guard entirely; the
   * next looked 600 characters back and landed inside the comment. Both were
   * found only by breaking the code and reading the result (§8), which is why
   * that step is not optional.
   */
  const callAt = studio.indexOf('unprovedClaimNote(msg.conversation');
  assert.ok(callAt > 0, 'the correction call is gone');
  const guardAt = studio.lastIndexOf("{msg.sender === 'ai'", callAt);
  assert.ok(guardAt > 0, 'the correction block has no message guard');
  const guardLine = studio.slice(guardAt, studio.indexOf('\n', guardAt));
  assert.doesNotMatch(
    guardLine,
    /lastAiMessage/,
    `the correction disappears from older replies that still carry the claim: ${guardLine.trim()}`,
  );

  const stream = await readFile(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(stream, /conversation: parsed\.conversation/, 'the verdict must reach the message in the first place');
});
