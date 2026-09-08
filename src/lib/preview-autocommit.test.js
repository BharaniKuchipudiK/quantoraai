/*
 * A click is not a safety mechanism. It is a safety mechanism the user has to
 * perform.
 *
 * The Preview button existed because a snippet from a chat reply can overwrite
 * a working build with a fragment. That is a real danger, and the check for it
 * -- deskCommitRegressesPreview -- has existed the whole time and is used by
 * the desk's own build path. Only the chat path asked a human instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePreviewCommit, describeHeldPreview } from './preview-autocommit.js';

const page = (body) => ({ 'index.html': { content: `<!DOCTYPE html><html><body>${body}</body></html>`, language: 'html' } });

test('[was-red] a safe page lands without being asked', () => {
  /*
   * The whole complaint. No other tool in this class makes you press a button,
   * and the machine can answer the only question the button was asking.
   */
  const decision = decidePreviewCommit({ before: page('<h1>old</h1>'), after: page('<h1>new</h1>') });
  assert.equal(decision.apply, true);
  assert.equal(decision.tell, false, 'a normal update needs no announcement');
});

test('[was-red] a truncated reply never replaces a working page', () => {
  /*
   * The reason the button existed. A cut-off reply still contains <!DOCTYPE,
   * so a naive "looks like HTML" check would happily destroy a running build.
   */
  const truncated = { 'index.html': { content: '<!DOCTYPE html><html><body><div class="prod', language: 'html' } };
  const decision = decidePreviewCommit({ before: page('<h1>working</h1>'), after: truncated });
  assert.equal(decision.apply, false, 'the running page is kept');
  assert.equal(decision.tell, true, 'and the person is told, because silence looks like being ignored');
  assert.match(describeHeldPreview(decision.reason), /cut off/i);
});

test('a first build has nothing to protect, so it lands', () => {
  const decision = decidePreviewCommit({ before: {}, after: page('<h1>first</h1>') });
  assert.equal(decision.apply, true);
});

test('an ordinary conversational reply is silent', () => {
  /*
   * Most turns carry no page. If those produced a notice, every answer would
   * grow a line of noise and the real one would stop being read.
   */
  const decision = decidePreviewCommit({ before: page('<h1>x</h1>'), after: {}, hasHtml: false });
  assert.equal(decision.apply, false);
  assert.equal(decision.tell, false);
  assert.equal(decision.reason, 'no-page-in-reply');
});

test('a desk that cannot preview is left alone entirely', () => {
  const decision = decidePreviewCommit({ before: page('<h1>x</h1>'), after: page('<h1>y</h1>'), canPreview: false });
  assert.equal(decision.apply, false);
  assert.equal(decision.tell, false, 'a research desk has no preview to explain');
});

test('every held reason has words a person can act on', () => {
  for (const reason of ['incoming-entry-truncated', 'incoming-entry-empty', 'incoming-entry-not-runnable', 'something-new']) {
    const words = describeHeldPreview(reason);
    assert.ok(words.length > 10, `no explanation for ${reason}`);
    assert.doesNotMatch(words, /incoming-entry|reject|vfs/i, `${reason} leaks an internal name to the user`);
  }
});


test('[was-red] the desk actually calls this — a rule nothing calls is the old button', async () => {
  /*
   * The whole change is worthless if the effect is not wired. This repo has
   * shipped that shape repeatedly: a correct module, tested, reachable by
   * nothing.
   */
  const { readFileSync } = await import('node:fs');
  const studio = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');

  assert.match(studio, /import \{ decidePreviewCommit, describeHeldPreview \} from '\.\.\/lib\/preview-autocommit\.js';/,
    'the desk must import the rule');
  assert.match(studio, /const decision = decidePreviewCommit\(\{/, 'and consult it');
  assert.match(studio, /if \(decision\.apply\)|if \(!decision\.apply\)/, 'and act on the answer');

  /* Once per message, or the effect fights the user's own edits on the desk. */
  assert.match(studio, /autoPreviewedBySessionRef\.current\.get\(activeSessionId\) === lastAi\.id/,
    'processed replies must be tracked PER SESSION — one component-wide ref reapplied another chat\'s old reply over manual edits');

  /* Never on a failed turn — a refusal carries no page and must not disturb
   * a working desk. */
  assert.match(studio, /if \(!lastAi \|\| lastAi\.isError\) return;/,
    'a failed turn must never touch the preview');

  /* Never mid-stream: applying a half-written page is the exact clobber the
   * guard exists to prevent. */
  assert.match(studio, /if \(isGenerating\) return;/, 'nothing is applied while a turn is still streaming');

  /* And when it declines, it says so. */
  assert.match(studio, /setPreviewHeldNotice\(\{ sessionId: activeSessionId, text: describeHeldPreview\(decision\.reason\) \}\)/,
    'a held page must be explained, not silently dropped');

  /*
   * SETTING STATE IS NOT SHOWING IT. The first cut set previewHeldNotice and
   * rendered it nowhere, so the change delivered exactly the silent rejection
   * it existed to remove — and this file passed, because it only asserted the
   * setter was called. Found by review.
   */
  assert.match(studio, /\{previewHeldNotice && previewHeldNotice\.sessionId === activeSessionId \?/,
    'the notice must be RENDERED, and scoped to the session that produced it');
  assert.match(studio, /data-quantora-preview-held="true"/, 'and carry a durable hook');

  /*
   * Through the verified commit path. Writing straight to setVfs skipped the
   * proof check, session ownership, checkpoints and the stale-tree guard, so a
   * page the proof pipeline REJECTED could become the visible preview.
   */
  assert.match(studio, /if \(!commitDeskVfs\(candidateVfs, activeSessionId\)\)/,
    'the auto-commit must go through commitDeskVfs, never setVfs directly');
  assert.match(studio, /if \(lastAi\.codingProof && lastAi\.codingProof\.ok === false\) return;/,
    'a reply whose proof failed must never reach the preview');
});
