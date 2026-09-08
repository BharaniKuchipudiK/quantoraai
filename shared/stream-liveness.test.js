/*
 * The rule that turns a 90-second silence into a 25-second one.
 *
 * Every case here is drawn from the production trace of 2026-09-08, where a
 * turn spent 176 seconds and produced nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_CONTENT_MS, nextReadBudgetMs, streamStopReason } from './stream-liveness.js';

const IDLE = 20_000;

test('[was-red] keepalives do not keep a silent route alive', () => {
  /*
   * THE INCIDENT. OpenRouter streams ": OPENROUTER PROCESSING" while a request
   * is queued. The parser skips those lines, but they are bytes, and the old
   * guard reset on bytes -- so a route producing NO CONTENT looked healthy for
   * its entire 90s budget.
   *
   * Here the route has streamed keepalives for 30s and produced nothing. Every
   * one of them reset the byte-idle timer; none of them count here.
   */
  const started = 0;
  const budget = nextReadBudgetMs({
    now: 30_000,
    lastContentAt: started,   // no content has EVER arrived
    attemptStartedAt: started,
    attemptBudgetMs: 90_000,  // the real budget from the incident
    idleMs: IDLE,
  });
  assert.equal(budget, 0, 'a route silent past the window gets no further reads');
  assert.equal(
    streamStopReason({ now: 30_000, lastContentAt: started, attemptStartedAt: started, attemptBudgetMs: 90_000 }),
    'no-content',
    'and it is abandoned as a dead route, not as a slow turn',
  );
});

test('the abandon point is 25s, not the 90s the attempt budget allowed', () => {
  const at = (now) => streamStopReason({ now, lastContentAt: 0, attemptStartedAt: 0, attemptBudgetMs: 90_000 });
  assert.equal(at(NO_CONTENT_MS - 1), null, 'just inside the window it may continue');
  assert.equal(at(NO_CONTENT_MS), 'no-content', 'at the window it is gone');
  assert.equal(at(89_000), 'no-content', 'and it never reaches the attempt budget to find out');
});

test('a route that is actually streaming is never cut off', () => {
  /*
   * The failure this must not cause. A long build legitimately runs past 25s;
   * what matters is that content keeps arriving. Here 80 seconds have passed
   * and the last token landed a second ago.
   */
  const budget = nextReadBudgetMs({
    now: 80_000,
    lastContentAt: 79_000,
    attemptStartedAt: 0,
    attemptBudgetMs: 90_000,
    idleMs: IDLE,
  });
  assert.ok(budget > 0, 'a producing route keeps reading');
  assert.equal(budget, 10_000, 'bounded by what is left of the attempt, which is the smallest bound here');
  assert.equal(
    streamStopReason({ now: 80_000, lastContentAt: 79_000, attemptStartedAt: 0, attemptBudgetMs: 90_000 }),
    null,
  );
});

test('a read can never outlive the window that is meant to stop it', () => {
  /*
   * The subtle version of the same bug: a 20s read issued when only 5s of the
   * no-content window remain would let a dead route run 15s past its own
   * deadline, every iteration.
   */
  const budget = nextReadBudgetMs({
    now: 20_000,
    lastContentAt: 0,
    attemptStartedAt: 0,
    attemptBudgetMs: 90_000,
    idleMs: IDLE,
  });
  assert.equal(budget, 5_000, 'the read is cut to the remaining no-content window, not the idle default');
});

test('running out of turn time is reported as itself, not as a dead route', () => {
  /*
   * Separated on purpose. "This route is not answering" means try another one;
   * "the turn is out of time" means stop. Reported as one thing, a dead
   * provider reads as the platform being slow.
   */
  assert.equal(
    streamStopReason({ now: 91_000, lastContentAt: 90_500, attemptStartedAt: 0, attemptBudgetMs: 90_000 }),
    'attempt-budget',
  );
  assert.equal(
    nextReadBudgetMs({ now: 91_000, lastContentAt: 90_500, attemptStartedAt: 0, attemptBudgetMs: 90_000, idleMs: IDLE }),
    0,
  );
});

test('missing or nonsense inputs never produce a negative timer', () => {
  /* A negative passed to setTimeout fires immediately and would abandon a
   * healthy route on the first read. */
  for (const args of [
    { now: NaN, lastContentAt: 0, attemptStartedAt: 0, attemptBudgetMs: 90_000, idleMs: IDLE },
    { now: 1_000, lastContentAt: undefined, attemptStartedAt: 0, attemptBudgetMs: 90_000, idleMs: IDLE },
    { now: 1_000, lastContentAt: 0, attemptStartedAt: 0, attemptBudgetMs: null, idleMs: IDLE },
  ]) {
    assert.ok(nextReadBudgetMs(args) >= 0, `negative budget from ${JSON.stringify(args)}`);
  }
});

test('[was-red] both provider loops are bounded by content, and both count it', async () => {
  /*
   * The rule above is worthless unless the turn loop uses it. Both providers
   * are checked because the incident was on OpenRouter and Gemini had the
   * identical byte-based guard one function away — fixing only the one that
   * happened to fail is how the same defect returns wearing another gateway.
   */
  const { readFileSync } = await import('node:fs');
  const handler = readFileSync(new URL('../api/_lib/chat-handler.ts', import.meta.url), 'utf8');

  /* The clock exists, and starts at the attempt rather than at first content —
   * a route that never speaks must still be abandoned. */
  assert.match(handler, /let lastContentAt = attemptStartedAt;/,
    'a route that never produces content must still have a deadline');

  /* Both loops stop on the rule, not on bytes. */
  /*
   * Four: each provider loop consults the rule twice — once BEFORE the read,
   * to abandon a route that has already gone quiet, and once in the catch, to
   * classify a read that expired on the window as no-content rather than as a
   * bare idle error the fallback policy does not recognise.
   */
  const stops = handler.match(/streamStopReason\(\{ now: Date\.now\(\), lastContentAt, attemptStartedAt, attemptBudgetMs \}\)/g) || [];
  assert.equal(stops.length, 4, `both provider loops must consult the rule before the read and in the catch, found ${stops.length}`);

  const budgets = handler.match(/nextReadBudgetMs\(\{ now: Date\.now\(\), lastContentAt, attemptStartedAt, attemptBudgetMs, idleMs: PROVIDER_STREAM_IDLE_MS \}\)/g) || [];
  assert.equal(budgets.length, 2, `both reads must be bounded by the window, found ${budgets.length}`);

  /* And both must advance the clock ONLY on real content. */
  assert.match(handler, /lastContentAt = Date\.now\(\);\s*\n\s*attemptReply \+= token;/,
    'OpenRouter must count a content token as life');
  assert.match(handler, /lastContentAt = Date\.now\(\);\s*\n\s*attemptReply \+= chunk\.text;/,
    'Gemini must count a content chunk as life');

  /*
   * The old guard must be gone from the read bounds. Left in place it silently
   * wins whenever it is the smaller number, which is most of the time.
   */
  assert.doesNotMatch(handler, /readWithIdleTimeout\(reader, Math\.min\(PROVIDER_STREAM_IDLE_MS/,
    'the byte-based bound must not survive alongside the content-based one');
  assert.doesNotMatch(handler, /nextAsyncIteratorWithIdleTimeout\(iterator, Math\.min\(PROVIDER_STREAM_IDLE_MS/,
    'nor on the Gemini side');
});


test('[was-red] a read that expires on the window falls back instead of stopping the ladder', async () => {
  /*
   * THE FIX THAT WOULD HAVE MADE THINGS WORSE.
   *
   * Bounding the read by the no-content window means it is the WINDOW that
   * usually expires — and readWithIdleTimeout rejects with a bare Error: no
   * status, and the word "idle". shouldFallbackBeforeStreaming tests
   * status against [404,408,...,504] and the message against a list that
   * includes "timeout" but not "idle", so it returned false and the whole
   * ladder STOPPED rather than trying the next route, leaving the upstream
   * request open.
   *
   * Shortening the read made that far more likely. The repair for a
   * 90-second silence would have become a turn that gives up entirely.
   * Found by review before it shipped.
   */
  const { readFileSync } = await import('node:fs');
  const handler = readFileSync(new URL('../api/_lib/chat-handler.ts', import.meta.url), 'utf8');

  /*
   * FOUR, NOT TWO — and the number grew for the right reason.
   *
   * This said two, because two provider loops were known to bound their reads
   * by the content window. chat-handler.ts has FOUR stream reads: the Gemini
   * tool-calling turn and the OpenRouter refine pass were left on a bare
   * idle constant when the streaming pair was fixed, and were content-bounded
   * on 2026-09-08. Codex then found that bounding them without catching their
   * expiry reproduced this very defect in the new pair, so both now convert
   * too.
   *
   * Corrected rather than loosened: the count is the point. The general
   * property — EVERY read site converts, whatever the count becomes — is held
   * per-site by api/_lib/stream-liveness-contract.test.ts, which is what a
   * fifth loop will answer to.
   */
  const conversions = handler.match(/idle for more than\/i\.test\(String\(\(error as any\)\?\.message \|\| ''\)\)/g) || [];
  assert.equal(conversions.length, 4,
    `all four provider stream reads must convert a bare idle rejection into a falling-back error, found ${conversions.length}`);

  /*
   * inferenceNoContent carries status 504, which shouldFallbackBeforeStreaming
   * accepts — that is the whole point of converting it.
   *
   * This used to pin the parameter as `route: InferenceRoute`. That is the
   * spelling, not the property: widening it to Pick<InferenceRoute, 'gateway'
   * | 'id'>, so the later phases of the handler could raise the same error
   * without a full route in scope, turned this red while 504 was still there
   * and still correct. Anchoring on incidental text is the failure §6 names,
   * and it cost a red gate this morning too. The status is the fact.
   */
  assert.match(handler, /function inferenceNoContent\([\s\S]{0,120}?\) \{[\s\S]{0,200}error\.status = 504;/,
    'the no-content error must carry a status the fallback policy recognises');

  /* And the reader is cancelled before throwing, or the upstream request
   * stays open after the turn has moved on. */
  assert.match(handler, /\} catch \(error\) \{\s*\n\s*await reader\.cancel\(\)\.catch\(\(\) => \{\}\);/,
    'the reader must be cancelled on every exit from the read, not only on budget expiry');
});
