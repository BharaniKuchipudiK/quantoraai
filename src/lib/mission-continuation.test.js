import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  missionEngineFailures,
  orderEnginesForMission,
  planMissionContinuation,
  rerouteBurnedEngine,
} from './mission-continuation.js';

/*
 * THE INCIDENT. A boutique build failed, the desk said the retry budget was
 * spent, and the person sent another message — the only thing the copy left
 * them. Measured against the real transition guard, here is what the platform
 * did with that:
 *
 *     turn 1 ends -> Run status becomes: FAILED_TERMINAL
 *     turn 2 asks the journal where to continue: null
 *     turn 2 may open a new attempt (needs QUEUED|REPLANNING): false
 *     which engine failed, per the durable record: [ null ]
 *
 * Three defects in four lines. Every terminal site in useChatStream reported
 * the TURN's spent budget as `recoveryExhausted: true`, which
 * api/_lib/qir-contracts.ts reads as the MISSION's verdict and turns into
 * FAILED_TERMINAL; `deriveQirContinuation` returns null for that status and
 * `coding.attempt` answers 409, so the durable Run stopped accepting anything
 * for the rest of the browser session. And the evidence it did keep never named
 * the engine, so nothing could have avoided repeating it anyway.
 *
 * These tests hold the line the product actually promises: try an engine, and
 * if it cannot, try the next one — and only when there is no engine left that
 * has not already failed on this mission is the answer "sorry".
 */

const ENGINES = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B', available: true },
  { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', available: true },
];

/** The shape qir-coding-run-core.js writes: failure evidence with `model:<id>`. */
const runWithFailures = (...engineIds) => ({
  runId: 'coding-run-1',
  cursor: { stepId: 's1', actionId: 'a1', attempt: engineIds.length },
  observations: engineIds.map((engineId, index) => ({
    observationId: `model-failure-${index}`,
    kind: 'model',
    status: 'failure',
    evidence: [{ source: 'provider', ref: `model:${engineId}`, observedAt: `2026-09-03T10:0${index}:00Z` }],
    error: { code: 'PROVIDER_TRANSPORT', retryable: true, recoveryExhausted: false },
    observedAt: `2026-09-03T10:0${index}:00Z`,
  })),
});

test('[was-red] a spent turn budget is not a dead mission', () => {
  // Turn 1 burned one engine. Two remain, so the mission has somewhere to go.
  const plan = planMissionContinuation({
    run: runWithFailures('gemini-flash-latest'),
    availableModels: ENGINES,
  });

  assert.equal(plan.missionExhausted, false, 'one failed engine out of three must never read as a dead mission');
  assert.equal(plan.reason, 'engine-untried');
  assert.equal(plan.nextEngine?.id, 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(plan.durableAttempts, 1, 'the attempt count must come from the durable Run, not this turn');
});

test('[was-red] the mission is over only when no engine is left that has not failed on it', () => {
  const exhausted = planMissionContinuation({
    run: runWithFailures(...ENGINES.map((engine) => engine.id)),
    availableModels: ENGINES,
  });

  assert.equal(exhausted.missionExhausted, true, '"sorry" is earned by trying every engine, not by a clock');
  assert.equal(exhausted.reason, 'all-engines-tried');
  assert.equal(exhausted.nextEngine, null, 'a named next engine here would be a promise nothing can keep');
});

test('exhaustion requires positive evidence, so a catalogue that has not loaded is not a dead mission', () => {
  /*
   * CLAUDE.md §5: a verdict that fires on ambiguous evidence gets muted by the
   * next person under pressure. An empty catalogue is what a page in mid-load
   * looks like; if that read as exhaustion, the desk would tell the person to
   * give up over a race with their own network.
   */
  const nothingKnown = planMissionContinuation({ run: null, availableModels: [] });
  assert.equal(nothingKnown.missionExhausted, false);
  assert.equal(nothingKnown.reason, 'no-attempt-recorded');

  const loading = planMissionContinuation({ run: runWithFailures(), availableModels: [] });
  assert.equal(loading.missionExhausted, false, 'no attempt on record means no exhaustion claim');
});

test('this turn’s own attempts count toward the mission even before the journal has them', () => {
  /*
   * The durable write is fire-and-forget (the journal must never fail a turn),
   * so the snapshot in hand can lag the attempt that just ran. The turn's own
   * record has to count, or the copy would offer an engine that just died.
   */
  const plan = planMissionContinuation({
    run: runWithFailures('gemini-flash-latest'),
    availableModels: ENGINES,
    spentEngineIds: new Set(['nvidia/nemotron-3-super-120b-a12b:free']),
  });
  assert.equal(plan.nextEngine?.id, 'anthropic/claude-sonnet');
  assert.deepEqual(plan.triedEngineIds.sort(), [
    'gemini-flash-latest', 'nvidia/nemotron-3-super-120b-a12b:free',
  ]);
});

test('[was-red] mission memory reorders the ladder and never shortens it', () => {
  /*
   * The one property that makes this safe to run in the request path: an engine
   * deprioritised for failing is still REACHABLE. A quota failure at 14:00 is
   * routinely fine at 14:05, and a permanent burn on one ambiguous failure is
   * how a platform talks itself out of a route it still has. Mission memory
   * must never be the reason a request goes unanswered.
   */
  const ordered = orderEnginesForMission(ENGINES, runWithFailures('gemini-flash-latest'));

  assert.equal(ordered.length, ENGINES.length, 'ordering may never remove an engine from reach');
  assert.deepEqual(
    ordered.map((engine) => engine.id).sort(),
    ENGINES.map((engine) => engine.id).sort(),
    'the same engines must come back, only in a better order',
  );
  assert.equal(ordered[0].id, 'nvidia/nemotron-3-super-120b-a12b:free', 'an untried engine goes first');
  assert.equal(ordered.at(-1).id, 'gemini-flash-latest', 'the engine that failed goes last, not away');

  const allBurned = orderEnginesForMission(ENGINES, runWithFailures(...ENGINES.map((e) => e.id)));
  assert.equal(allBurned.length, ENGINES.length, 'with every engine burned the ladder is still full');
});

test('[was-red] the durable record must name the engine, or none of this can work', () => {
  /*
   * The evidence field has existed since Phase 2 (`ref: model:<id>` in
   * qir-coding-run-core.js) and nothing ever filled it, so the Run knew an
   * attempt had failed without knowing what it failed on. That is the read
   * every decision above depends on.
   */
  assert.deepEqual([...missionEngineFailures(runWithFailures('gemini-flash-latest')).keys()], ['gemini-flash-latest']);

  const anonymous = runWithFailures('gemini-flash-latest');
  anonymous.observations[0].evidence[0].ref = null;
  assert.equal(
    missionEngineFailures(anonymous).size,
    0,
    'unattributed failure evidence must count for nothing rather than be guessed at',
  );

  const twice = missionEngineFailures(runWithFailures('gemini-flash-latest', 'gemini-flash-latest'));
  assert.equal(twice.get('gemini-flash-latest').failures, 2, 'repeat failures on one engine must accumulate');
  assert.equal(twice.get('gemini-flash-latest').lastAt, '2026-09-03T10:01:00Z', 'the latest failure wins the timestamp');
});

test('a success observation is not a failure, however it is shaped', () => {
  const run = runWithFailures('gemini-flash-latest');
  run.observations[0].status = 'success';
  assert.equal(missionEngineFailures(run).size, 0, 'only failures may burn an engine');
});

test('[was-red] no terminal site may hardcode the mission verdict', () => {
  /*
   * The instance fix is the four call sites; this is the class. Each of them
   * passed a literal `true` for "the mission is exhausted" — a claim about the
   * whole mission made by code that could only see one turn. A behavioural test
   * cannot see a constant at a call site, which is exactly how this survived.
   */
  const hook = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const calls = hook.match(/qirFail\([\s\S]{0,220}?\);/g) || [];
  assert.ok(calls.length >= 4, `expected the terminal failure sites to still be here, found ${calls.length}`);

  for (const call of calls) {
    assert.doesNotMatch(
      call,
      /,\s*(?:true|false)\s*\)/,
      'the third argument is the MISSION’s verdict and must be measured, never written in: '
      + `${call.replace(/\s+/g, ' ').slice(0, 140)}`,
    );
  }
  assert.match(hook, /missionExhausted: missionSpent\(\)/, 'the outcome copy must be told which state it is in');
});

/*
 * THE SECOND TURN MUST NOT BE THE FIRST TURN AGAIN.
 *
 * Everything above makes the mission survivable. This is what the survival
 * buys: when the person sends another message, routing does not hand the goal
 * straight back to the engine that just failed on it.
 *
 * Two cheaper designs were measured and rejected before this one:
 *
 *  - re-ask resolveCodingDeskModel with the burned engine withheld. It no-ops.
 *    Its default branch reads `gemini?.id || 'gemini-flash-latest'`, so
 *    withholding Gemini returns the hardcoded id anyway — measured, the reroute
 *    changed nothing at all;
 *  - take the next id in catalogue order. That throws away the reliability
 *    evidence rankCodingDeskFallbacks holds and can route a heavy build onto
 *    whatever happens to sit next in the list.
 */
test('[was-red] a burned engine is replaced by the best-ranked engine the mission has not tried', () => {
  const reroute = rerouteBurnedEngine({
    engineId: 'gemini-flash-latest',
    rankedFallbackIds: ['nvidia/nemotron-3-super-120b-a12b:free', 'anthropic/claude-sonnet'],
    reachableEngineIds: ENGINES.map((engine) => engine.id),
    run: runWithFailures('gemini-flash-latest'),
  });
  assert.equal(reroute, 'nvidia/nemotron-3-super-120b-a12b:free', 'the caller’s own ranking decides, in its own order');
});

test('the ranking is respected, not re-derived here', () => {
  /*
   * Reversed input, reversed answer. If this module ever started sorting for
   * itself, it would silently override the measured finish-reliability that
   * rankCodingDeskFallbacks exists to carry.
   */
  const reroute = rerouteBurnedEngine({
    engineId: 'gemini-flash-latest',
    rankedFallbackIds: ['anthropic/claude-sonnet', 'nvidia/nemotron-3-super-120b-a12b:free'],
    reachableEngineIds: ENGINES.map((engine) => engine.id),
    run: runWithFailures('gemini-flash-latest'),
  });
  assert.equal(reroute, 'anthropic/claude-sonnet');
});

test('an engine this mission has not failed on is left exactly where routing put it', () => {
  assert.equal(rerouteBurnedEngine({
    engineId: 'anthropic/claude-sonnet',
    rankedFallbackIds: ['gemini-flash-latest'],
    reachableEngineIds: ENGINES.map((engine) => engine.id),
    run: runWithFailures('gemini-flash-latest'),
  }), null, 'routing knows the job better than this module does; only a burned engine may be overridden');
});

test('[was-red] a reroute never leaves a turn with nowhere to run', () => {
  /*
   * The property that makes this safe in the request path. Every one of these
   * must keep routing's own pick rather than returning something unusable — a
   * mission memory that can strand a turn is worse than no memory at all.
   */
  const everyEngineBurned = rerouteBurnedEngine({
    engineId: 'gemini-flash-latest',
    rankedFallbackIds: ENGINES.map((engine) => engine.id),
    reachableEngineIds: ENGINES.map((engine) => engine.id),
    run: runWithFailures(...ENGINES.map((engine) => engine.id)),
  });
  assert.equal(everyEngineBurned, null, 'with every engine burned, routing’s pick stands');

  assert.equal(rerouteBurnedEngine({
    engineId: 'gemini-flash-latest',
    rankedFallbackIds: ['nvidia/nemotron-3-super-120b-a12b:free'],
    reachableEngineIds: [],
    run: runWithFailures('gemini-flash-latest'),
  }), null, 'an engine that is ranked but not reachable is not an answer');

  assert.equal(rerouteBurnedEngine({}), null, 'no engine, no mission, no reroute');
  assert.equal(rerouteBurnedEngine({
    engineId: 'gemini-flash-latest',
    rankedFallbackIds: ['gemini-flash-latest'],
    reachableEngineIds: ['gemini-flash-latest'],
    run: runWithFailures('gemini-flash-latest'),
  }), null, 'the burned engine may never be offered as its own replacement');
});

test('the auto path consults mission memory before it commits to an engine', () => {
  /*
   * The decision is proved behaviourally above. What a unit test cannot see is
   * whether the hook asks at all — and asking with the real Run rather than a
   * constant is the difference between mission memory and a decoration.
   */
  const hook = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const call = hook.slice(hook.indexOf('const rerouteId = rerouteBurnedEngine({'));
  const body = call.slice(0, call.indexOf('});') + 3);

  assert.match(body, /run: qirCoding\?\.run \|\| null,/, 'the burned set must come from the durable Run, not from this turn');
  assert.match(body, /rankedFallbackIds: rankCodingDeskFallbacks\(/, 'the replacement must come from the measured failover ranking');
  assert.doesNotMatch(body, /run: null,/, 'a null Run here disables mission memory while every test above still passes');
});
