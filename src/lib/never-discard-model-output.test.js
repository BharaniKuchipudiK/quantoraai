import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANT: the platform never deletes what the model produced.
 *
 * This defect was found in three separate places, and each one looked local and
 * reasonable where it sat:
 *
 *   1. The proof gate overwrote the assistant message with its failure copy and
 *      returned, so a working build the gate did not recognise was destroyed
 *      before anyone saw it. (Fixed in #348.)
 *   2. The stream-error handler replaced the message with an outcome sentence,
 *      discarding a page that had already streamed in.
 *   3. The connection-error handler did the same for timeouts and Stop.
 *
 * Cases 2 and 3 are the more expensive ones: the tokens were generated and
 * billed before being thrown away, and the model most often runs out of time
 * near the END of a long build - so what gets deleted is a nearly complete page.
 *
 * The rule is the same everywhere. The platform may ANNOTATE a turn. It may not
 * replace it. A partial build is worth more than a sentence explaining that
 * nothing arrived, and the user is the one who gets to judge it.
 *
 * These are source assertions rather than behavioural ones because the code
 * lives inside a React hook with no seam to drive it from a test. The tradeoff
 * is accepted deliberately: a coarse guard that fails loudly beats a comment
 * that gets read once.
 */

const HOOK = path.join(import.meta.dirname, '..', 'hooks', 'useChatStream.js');

function hookSource() {
  return readFileSync(HOOK, 'utf8');
}

test('partial stream output is captured where the error handlers can reach it', () => {
  const source = hookSource();
  // The read loop's own accumulator is scoped inside the loop, so the outer
  // catch cannot see it. A holder in the attempt scope is what makes preserving
  // the partial possible at all — without it the handlers have nothing to keep.
  assert.match(source, /let streamedSoFar = ''/, 'the attempt-scoped holder must exist');
  assert.match(
    source,
    /currentText \+= parsed\.text;\s*\n\s*streamedSoFar = currentText;/,
    'the holder must track the stream as it arrives, or it is always empty',
  );
});

test('INVARIANT: a stopped, timed-out or failed turn keeps what was already built', () => {
  const source = hookSource();

  // The bare forms that discard the stream. Each of these was live code.
  assert.doesNotMatch(
    source,
    /\n\s+text: outcome\.text,/,
    'the stream-error path must append the outcome to the partial build, not replace it',
  );
  assert.doesNotMatch(
    source,
    /\n\s+text: stopped\s*\n\s*\? '⚠️ \*\*Generation Stopped\*\*'/,
    'the connection-error path must append the failure note to the partial build, not replace it',
  );

  // And the preserving form must actually be present on both paths.
  const preserved = source.match(/text: streamedSoFar\s*\n\s*\?\s*`\$\{sanitizeAssistantStream\(streamedSoFar\)\}/g) || [];
  assert.ok(
    preserved.length >= 2,
    `both error paths must preserve the partial build; found ${preserved.length}`,
  );
});

test('INVARIANT: a failed proof never replaces the model output', () => {
  // The first of the three. Kept here beside its siblings so the whole rule is
  // visible in one file rather than split across suites.
  const source = hookSource();
  assert.doesNotMatch(
    source,
    /text:\s*failText/,
    'proof failure copy must be appended as a note, never assigned as the message text',
  );
  assert.match(source, /proofNote/, 'the proof failure copy should reach the turn as a note');
});

test('INVARIANT: the build-truth note is appended, never assigned as the turn text', () => {
  /*
   * The newest note on the pile, held to the oldest rule in this file. Build
   * truth says what does not work on a page — which makes it exactly the kind
   * of copy that, written one line differently, would replace the page it is
   * describing. It has to reach the turn the same way every other note does:
   * concatenated onto the model's output, never substituted for it, and never
   * in place of the proof note either, since the two answer different
   * questions and a turn can need both.
   */
  const source = hookSource();
  assert.match(source, /const truthNote = buildTruthNote\(codingProof\);/, 'the note must be computed');
  assert.match(
    source,
    /if \(truthNote\) proofNote = proofNote \? `\$\{proofNote\}\\n\\n\$\{truthNote\}` : truthNote;/,
    'it must append to any existing proof note rather than overwrite it',
  );
  assert.doesNotMatch(source, /text:\s*truthNote/, 'and it may never become the message text');
});
