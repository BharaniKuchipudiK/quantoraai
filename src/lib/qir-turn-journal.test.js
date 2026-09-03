import assert from 'node:assert/strict';
import test from 'node:test';
import { createQirTurnJournal } from './qir-turn-journal.js';

/*
 * This gate exists because the one before it could not fail.
 *
 * The QIR production-cutover contract asserted `assert.match(stream,
 * /qirCoding\?\.beginModelAttempt/)` — a substring search over the hook's source
 * text. Rewriting the ownership line to `false && codingFailureSpineOwnsTurn(...)`
 * switches the durable runtime off for every Coding turn in production and the
 * whole local suite stayed byte-identically green (1342 pass / 7 env-only fail),
 * with that contract test passing 4/4. Per CLAUDE.md §4, that is not a gate; per
 * §8, nobody had read what it says with the bug present.
 *
 * So these tests drive the real decision with a spy client and assert a call
 * actually happened. "QIR is dark" is now a red test, not a silent success.
 */

const spyClient = () => {
  const calls = [];
  return {
    calls,
    beginModelAttempt: (...args) => { calls.push(['beginModelAttempt', ...args]); },
    reportModelFailure: (...args) => { calls.push(['reportModelFailure', ...args]); },
  };
};

const codingTurn = (qirCoding) => createQirTurnJournal({
  isCodingRequest: true,
  studioDomain: 'software',
  qirCoding,
});

test('[was-red] a Coding turn durably opens the attempt BEFORE any artifact exists', () => {
  const client = spyClient();
  const journal = codingTurn(client);

  assert.equal(journal.owns, true, 'QIR must own a Coding turn');
  assert.equal(
    journal.beginAttempt('Build a boutique storefront', 'gemini-flash'),
    true,
    'the attempt must be journaled, not merely attempted',
  );
  assert.deepEqual(client.calls, [
    ['beginModelAttempt', 'Build a boutique storefront', 'gemini-flash'],
  ], 'the goal and the engine actually running it are the evidence; both must reach the Run');
});

test('[was-red] QIR going dark is a failing test, not a silent success', () => {
  /*
   * Each of these is a way the runtime stopped journaling in production while
   * every source-text assertion kept matching. None may report success.
   */
  const ownershipSuppressed = createQirTurnJournal({
    isCodingRequest: false, studioDomain: 'software', qirCoding: spyClient(),
  });
  assert.equal(ownershipSuppressed.owns, false);
  assert.equal(ownershipSuppressed.beginAttempt('goal', 'engine'), false);

  // The adapter is absent: hook not mounted, signed-out, chunk failed to load.
  const noAdapter = codingTurn(null);
  assert.equal(noAdapter.beginAttempt('goal', 'engine'), false, 'a missing adapter must not read as journaled');
  assert.equal(noAdapter.reportFailure({ kind: 'timeout', message: '175s' }), false);

  // The adapter exists but the seam was removed from it.
  const hollow = codingTurn({});
  assert.equal(hollow.beginAttempt('goal', 'engine'), false, 'a hollow adapter must not read as journaled');
});

test('an unreachable /api/qir-runs never breaks the user turn, and never claims success', () => {
  const exploding = {
    beginModelAttempt: () => { throw new Error('502 from /api/qir-runs'); },
    reportModelFailure: () => { throw new Error('502 from /api/qir-runs'); },
  };
  const journal = codingTurn(exploding);

  // Evidence is not control flow: the chat turn must survive a dead journal.
  assert.doesNotThrow(() => journal.beginAttempt('goal', 'engine'));
  assert.doesNotThrow(() => journal.reportFailure({ kind: 'transport', message: 'x' }));
  // But a swallowed error is still a turn with no durable Run behind it.
  assert.equal(journal.beginAttempt('goal', 'engine'), false);
  assert.equal(journal.reportFailure({ kind: 'transport', message: 'x' }), false);
});

test('[was-red] an advisor turn never writes into the Coding spine', () => {
  const client = spyClient();
  // The Study flashcard leak: the classifier misfires, and ownership must still
  // refuse. `Make a few flashcards for Newton's laws` is a tutor move.
  const journal = createQirTurnJournal({
    isCodingRequest: true,
    studioDomain: 'education',
    qirCoding: client,
  });

  assert.equal(journal.owns, false, 'a classifier misfire must not hand Study the Coding lifecycle');
  journal.beginAttempt("Make a few flashcards for Newton's laws", 'gemini-flash');
  journal.reportFailure({ kind: 'timeout', message: 'route exhausted', recoveryExhausted: true });
  assert.deepEqual(client.calls, [], 'no Study turn may produce a Coding Run');
});

test('failure evidence carries the terminal signal that separates REPLANNING from FAILED_TERMINAL', () => {
  const client = spyClient();
  const journal = codingTurn(client);

  assert.equal(journal.reportFailure({ kind: 'timeout', message: '175s step deadline' }), true);
  assert.equal(journal.reportFailure({
    kind: 'transport', message: 'all engines exhausted', recoveryExhausted: true,
  }), true);

  assert.deepEqual(client.calls.map(([, payload]) => payload), [
    { kind: 'timeout', message: '175s step deadline', retryable: true, recoveryExhausted: false },
    { kind: 'transport', message: 'all engines exhausted', retryable: false, recoveryExhausted: true },
  ], 'retryable must be derived from the terminal signal, never from copy');
});

/*
 * WHICH ENGINE DIED (2026-09-03).
 *
 * The observation this journal writes has carried an engine slot since Phase 2
 * — `ref: model:<id>` in qir-coding-run-core.js — and nothing ever filled it.
 * Measured against the real transition guard, the durable record of a failed
 * boutique build read:
 *
 *     which engine failed, per the durable record: [ null ]
 *
 * So the Run knew an attempt had failed and not what it failed on, which meant
 * no later turn could avoid repeating it. Durable and useless are not far apart.
 */
test('[was-red] failure evidence names the engine that failed', () => {
  const client = spyClient();
  const journal = codingTurn(client);

  assert.equal(journal.reportFailure({
    kind: 'transport', message: 'no healthy AI route', engineIds: ['gemini-flash-latest'],
  }), true);

  const [[, payload]] = client.calls;
  assert.deepEqual(
    payload.modelIds,
    ['gemini-flash-latest'],
    'the engine is the one field that makes this evidence actionable rather than merely durable',
  );
});

test('an unattributed failure claims no engine rather than guessing at one', () => {
  /*
   * A turn that dies before any engine is resolved has nothing to attribute.
   * Emitting the key with an empty value would put `model:` in the durable
   * evidence and burn an engine named '' for the rest of the mission.
   */
  const client = spyClient();
  codingTurn(client).reportFailure({ kind: 'timeout', message: '175s step deadline' });

  const [[, payload]] = client.calls;
  assert.equal('modelIds' in payload, false, 'no engine known, no engine claimed');
});

test('[was-red] the terminal signal is the MISSION’s, and a spent turn is not it', () => {
  /*
   * Both halves of the same field. api/_lib/qir-contracts.ts turns
   * `recoveryExhausted: true` into FAILED_TERMINAL, which makes
   * deriveQirContinuation return null and coding.attempt answer 409 — the Run
   * stops accepting anything for the rest of the session. Reporting a spent
   * TURN budget through it sealed the mission the person was still asking for.
   */
  const client = spyClient();
  const journal = codingTurn(client);

  journal.reportFailure({ kind: 'transport', message: 'turn budget spent', engineIds: ['gemini-flash-latest'] });
  journal.reportFailure({
    kind: 'transport', message: 'every engine failed on this mission',
    engineIds: ['anthropic/claude-sonnet'], recoveryExhausted: true,
  });

  assert.deepEqual(client.calls.map(([, payload]) => payload), [
    {
      kind: 'transport', message: 'turn budget spent', modelIds: ['gemini-flash-latest'],
      retryable: true, recoveryExhausted: false,
    },
    {
      kind: 'transport', message: 'every engine failed on this mission', modelIds: ['anthropic/claude-sonnet'],
      retryable: false, recoveryExhausted: true,
    },
  ], 'a default of true here is what bricked the durable Run after one failed turn');
});
