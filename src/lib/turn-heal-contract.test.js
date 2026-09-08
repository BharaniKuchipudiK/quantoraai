/**
 * The turn-heal contract — Detect → Diagnose → Verify → Apply, adjudicated.
 *
 * THE INCIDENT (2026-09-01). A boutique-website build turn failed twice with
 * BUILD_ARTIFACT_CONTRACT (the model answered in chat, no files). The retry
 * that ran re-sent the IDENTICAL prompt to the IDENTICAL model — so it failed
 * identically — and the terminal message then told the user:
 *
 *   "What we'll do: retry once on a fallback engine … not another silent
 *    retry loop."
 *
 * That sentence is rendered in exactly one state: after the retry budget is
 * spent and nothing more will run. The platform promised, in its terminal
 * state, the action it had just proved it would never take. Three separate
 * lies in one turn: the retry changed nothing (no memory), "fallback engine"
 * never happened (no engine switch), and the closing copy promised future
 * work in a state with no future.
 *
 * This gate closes the class with two contracts:
 *
 *   1. HONEST ESCALATION — a terminal outcome states what the loop already
 *      tried (attempts, engines) and hands the next move to the user via a
 *      chip. It never says "we'll retry": by the time this copy renders, the
 *      code that could retry has returned.
 *
 *   2. DIAGNOSIS-MATCHED REPAIR — a retry must differ from the attempt that
 *      failed. A contract failure (behavioral) retries with a strengthened
 *      brief that names the failure; a dead route (transport) retries on a
 *      different engine, and the notice claims a switch only when the caller
 *      proved one exists.
 *
 * Verified two-way per CLAUDE.md §2: these tests were run against the code
 * as it stood on 2026-09-01 and failed on every assertion marked [was-red]
 * before the fix landed.
 */
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolveCodingTurnOutcome } from './coding-outcome-spine.js';
import { MAX_TURN_ATTEMPTS, resolveTurnRecovery } from './turn-recovery.js';
import { orderEnginesForMission } from './mission-continuation.js';
import {
  attemptEngineId,
  attemptEngineName,
  engineDisplayName,
  repeatsSpentEngine,
  unrecordedServerEngines,
} from './turn-engine-identity.js';

const TERMINAL_KINDS = ['provider-dead', 'stream-ended', 'no-preview', 'timeout'];

/* Matches "What we'll do: … retry …" with straight or curly apostrophes and
 * markdown bold. The phrase is only wrong as a FUTURE promise; a chip label
 * like "Retry with fallback" is the user's action and stays legal. */
const FUTURE_RETRY_PROMISE = /what we.{0,3}ll do[^]{0,160}?re(?:try|build)/i;

test('[was-red] terminal copy never promises a retry the loop will not run', () => {
  for (const kind of TERMINAL_KINDS) {
    const outcome = resolveCodingTurnOutcome({
      kind,
      errorMessage: 'The model answered in chat without files.',
      attemptsMade: MAX_TURN_ATTEMPTS,
      triedEngines: ['Nemotron 3 Super 120B'],
    });
    assert.doesNotMatch(
      outcome.text,
      FUTURE_RETRY_PROMISE,
      `${kind}: terminal copy promises an automatic retry/rebuild, but it renders only after the retry budget is spent`,
    );
    // Escalation still hands the person a move — a chip, never a dead end.
    assert.ok(
      outcome.continueSet?.items?.length >= 1,
      `${kind}: terminal outcome must offer at least one chip`,
    );
  }
});

test('[was-red] an exhausted turn reports what was actually tried, not a vague shrug', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'The model answered in chat without files.',
    attemptsMade: 2,
    triedEngines: ['Nemotron 3 Super 120B', 'Gemini Flash'],
  });
  assert.match(outcome.text, /2 attempts/i, 'names the attempt count');
  assert.match(outcome.text, /Nemotron 3 Super 120B/, 'names the first engine tried');
  assert.match(outcome.text, /Gemini Flash/, 'names the fallback engine tried');
  const retryChip = outcome.continueSet.items.find((chip) => /retry/i.test(chip.label));
  assert.ok(retryChip, 'the retry stays available — as the user\'s move');
});

test('a single-attempt failure does not invent a history it never had', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 1,
    triedEngines: ['Gemini Flash'],
  });
  assert.doesNotMatch(outcome.text, /2 attempts/i);
  assert.doesNotMatch(outcome.text, FUTURE_RETRY_PROMISE);
});

test('[was-red] a contract failure retries with MEMORY: the brief names what failed last time', () => {
  const decision = resolveTurnRecovery({
    attempt: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'The model answered in chat without files.',
  });
  assert.equal(decision.retry, true);
  assert.ok(decision.retryBrief, 'a behavioral failure must strengthen the retried brief');
  assert.match(decision.retryBrief, /answered in chat without files/, 'carries the actual diagnosis, not a generic nudge');
  assert.match(decision.retryBrief, /code fence|complete file/i, 'tells the model the concrete contract to meet');
});

test('[was-red] a dead route retries on a DIFFERENT engine, and only claims a switch that is real', () => {
  const withFallback = resolveTurnRecovery({
    attempt: 1,
    retryable: true,
    fallbackEngineName: 'Gemini Flash',
  });
  assert.equal(withFallback.retry, true);
  assert.equal(withFallback.switchModel, true);
  assert.match(withFallback.notice, /Gemini Flash/, 'the notice names the engine it will actually use');

  // No second engine available: retrying the same one is still worth one
  // attempt, but the notice must not claim a switch that will not happen —
  // that is the same class of lie as "Deployed golden transactions: success".
  const withoutFallback = resolveTurnRecovery({ attempt: 1, retryable: true });
  assert.equal(withoutFallback.retry, true);
  assert.doesNotMatch(withoutFallback.notice, /switch/i);
});

test('a contract failure keeps its engine — the fix is the brief, not the route', () => {
  const decision = resolveTurnRecovery({
    attempt: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
    failureDetail: 'no code fences',
    fallbackEngineName: 'Gemini Flash',
  });
  assert.equal(decision.retry, true);
  assert.notEqual(decision.switchModel, true, 'behavioral failures are repaired by instruction, not by rerouting');
});

test('the retry budget still bounds the loop whatever the diagnosis', () => {
  for (const input of [
    { code: 'BUILD_ARTIFACT_CONTRACT', failureDetail: 'x' },
    { retryable: true, fallbackEngineName: 'Gemini Flash' },
    { networkError: true },
  ]) {
    const decision = resolveTurnRecovery({ attempt: MAX_TURN_ATTEMPTS, ...input });
    assert.equal(decision.retry, false, `${JSON.stringify(input)} must stop at the budget`);
  }
});

/*
 * THE MANUAL-RETRY GAP (2026-09-01, second screenshot). The automatic loop
 * switches engines, but the "Retry with fallback" chip sent only prose —
 * "Retry this same job on the next available model" — which routing ignores.
 * Two consecutive manual turns both ran Nemotron 3 Super 120B; the second
 * burned the full 175s deadline re-proving what the first already proved.
 * The chip must carry the override, not a prayer to the router.
 */

test('[was-red] the retry chip pins the next untried engine, not a prayer to routing', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 2,
    triedEngines: ['Nemotron 3 Super 120B'],
    fallbackEngine: { id: 'google/gemini-flash', name: 'Gemini Flash' },
  });
  const chip = outcome.continueSet.items.find((item) => /retry/i.test(item.label));
  assert.ok(chip, 'the retry move survives');
  assert.equal(chip.modelOverrideId, 'google/gemini-flash', 'the tap re-runs on the named engine, not the one that failed');
  assert.match(chip.label, /Gemini Flash/, 'the label names the engine so the promise is checkable');
});

test('stream-ended offers the same pinned retry', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'stream-ended',
    errorMessage: 'the response stream ended unexpectedly',
    attemptsMade: 2,
    triedEngines: ['Nemotron 3 Super 120B'],
    fallbackEngine: { id: 'google/gemini-flash', name: 'Gemini Flash' },
  });
  const chip = outcome.continueSet.items.find((item) => /retry/i.test(item.label));
  assert.equal(chip?.modelOverrideId, 'google/gemini-flash');
});

test('with no untried engine left, the chip claims nothing it cannot do', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 2,
    triedEngines: ['Engine A', 'Engine B'],
    fallbackEngine: null,
  });
  const chip = outcome.continueSet.items.find((item) => /retry/i.test(item.label));
  assert.ok(chip, 'retry stays available even without an override');
  assert.equal(chip.modelOverrideId, undefined, 'no override is stamped when none exists');
  assert.doesNotMatch(chip.label, /retry on /i, 'the label never names an engine it will not use');
});

/*
 * THE MISSING REQUEST ID (2026-09-04).
 *
 * Every terminal failure named what broke and what the loop tried, and gave the
 * person nothing to quote. QIR has minted a durable `runId` since Phase 2, and
 * the desk rendered it — in a tooltip — so the one moment it is worth having was
 * the one place it never appeared.
 *
 * It is also the first read FROM QIR anywhere in the product. The journal has
 * been write-only: qir-contracts.ts decides completion and nothing consults it.
 *
 * Asserted on the COMPOSED text, not on the helper. Two regressions today came
 * from gates that checked the halves I wrote while the sentence the user reads
 * went unexamined.
 */
test('[was-red] a terminal failure names the durable Run, so the person has something to quote', () => {
  for (const kind of ['provider-dead', 'stream-ended', 'timeout']) {
    const outcome = resolveCodingTurnOutcome({
      kind,
      errorMessage: 'no healthy AI route',
      attemptsMade: 3,
      triedEngines: ['Nemotron 3 Super 120B', 'Gemini Flash'],
      runId: 'qir_run_7f3a91c',
    });
    assert.match(
      outcome.text,
      /qir_run_7f3a91c/,
      `${kind}: the failure must name the Run it belongs to. Got:\n${outcome.text}`,
    );
  }
});

test('no Run, no line — the id is never a placeholder', () => {
  /*
   * A Run id exists precisely when the durable journal accepted the attempt, so
   * printing "Run: unknown" would claim a record that was never written — the
   * same overclaim the honesty law above exists to prevent.
   */
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 2,
    triedEngines: ['Gemini Flash'],
  });
  assert.doesNotMatch(outcome.text, /\*\*Run:\*\*/, 'with no Run id there must be no Run line at all');
  assert.doesNotMatch(outcome.text, /unknown|n\/a|undefined/i, 'and never a placeholder in its place');
});

test('the chat stream hands every terminal outcome the Run id it has', () => {
  /*
   * The unit above proves the copy; this proves the caller supplies it. Four
   * terminal branches resolve an outcome, and a branch that forgets the id
   * silently loses the reference for exactly the failure mode it covers.
   */
  const stream = readFileSync(
    new URL('../hooks/useChatStream.js', import.meta.url),
    'utf8',
  );
  const sites = stream.split('resolveCodingTurnOutcome({').length - 1;
  const threaded = (stream.match(/runId: qirCoding\?\.run\?\.runId/g) || []).length;
  assert.equal(
    threaded,
    sites,
    `${sites} terminal outcomes are resolved but only ${threaded} carry the Run id`,
  );
});

/*
 * THE LADDER THAT NEVER MOVED (2026-09-03).
 *
 * Everything above assumed the loop knew which engine an attempt ran on. On the
 * default Coding path it did not.
 *
 * The desk ships with `Auto` selected (`badge: 'Default'`), and in auto mode
 * useChatStream sets `targetModel = { id: 'auto', ..., resolvedModelId }`. Three
 * readers took `targetModel.id` as the engine: the fallback filter
 * (`model.id !== targetModel?.id`), `triedEngineIds`, and the durable QIR
 * journal. No real model has the id `'auto'`, so the filter excluded NOTHING.
 *
 * Measured on the real resolver and the real catalogue
 * (api/_lib/model-catalog.js: gemini-flash-latest, then nemotron-3-super):
 *
 *     attempt 1 ran on          : gemini-flash-latest
 *     triedEngineIds now holds  : [ 'auto' ]
 *     switchModel picks         : gemini-flash-latest   <-- the same engine
 *     journal recorded strategy : auto
 *
 * So `resolveTurnRecovery` correctly diagnosed "switch engines", the code
 * correctly asked for a fallback, and the fallback handed back the engine that
 * had just died — the exact class this file exists to close, alive on the path
 * almost every build takes, because the ladder was comparing a routing label to
 * an engine id.
 */
test('[was-red] the engine identity a repair reads is the engine that ran, not the routing label', () => {
  const autoTurn = { id: 'auto', name: 'Auto', resolvedModelId: 'gemini-flash-latest', resolvedModelName: 'Gemini Flash' };

  assert.equal(attemptEngineId(autoTurn), 'gemini-flash-latest', 'Auto is a routing decision; the engine is what it resolved to');
  assert.equal(attemptEngineName(autoTurn), 'Gemini Flash', '"3 attempts (Auto, then Auto, then Auto)" names nothing the person can act on');

  // A pinned engine is its own identity — the two must not diverge there.
  assert.equal(attemptEngineId({ id: 'anthropic/claude-sonnet', name: 'Claude Sonnet' }), 'anthropic/claude-sonnet');
});

test('[was-red] a "switch engines" repair cannot hand back the engine Auto just ran', () => {
  const catalogue = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B', available: true },
  ];
  const autoTurn = { id: 'auto', name: 'Auto', resolvedModelId: 'gemini-flash-latest' };
  const spent = new Set([attemptEngineId(autoTurn)]);

  const fallback = orderEnginesForMission(catalogue, null, spent)
    .find((model) => !repeatsSpentEngine(model, autoTurn, spent));

  assert.ok(fallback, 'a catalogue with an untried engine must produce one');
  assert.notEqual(fallback.id, 'gemini-flash-latest', 'the repair must differ from the attempt that failed');
  assert.equal(fallback.id, 'nvidia/nemotron-3-super-120b-a12b:free');

  // And the collision itself is now recognised rather than being invisible.
  assert.equal(
    repeatsSpentEngine(catalogue[0], autoTurn, spent),
    true,
    'the engine Auto resolved to must read as already tried',
  );
});

test('[was-red] the fallback selector no longer compares a routing label to an engine id', () => {
  /*
   * The instance is fixed above; this is the class. A behavioural test cannot
   * see which expression the hook uses to pick a fallback, and that blind spot
   * is precisely how `model.id !== targetModel?.id` survived being wrong on the
   * default path for as long as it did.
   */
  const hook = readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const selector = hook.slice(hook.indexOf('const nextFallbackEngine ='));
  // Ends at the selector's own statement, so a failure prints the expression
  // under review and not the next forty lines of the hook (CLAUDE.md §8).
  const body = selector.slice(0, selector.indexOf('|| null;') + 8);

  assert.doesNotMatch(
    body,
    /model\.id !== targetModel\?\.id/,
    'comparing a catalogue id to `targetModel.id` reads "auto" in auto mode and excludes nothing',
  );
  assert.match(body, /repeatsSpentEngine\(model, targetModel, spentEngineIds\)/, 'exclusion must go through engine identity');
  assert.match(body, /orderEnginesForMission\(/, 'and the ladder must start from what this mission has not burned');
  assert.match(
    hook,
    /spentEngineIds\.add\(runningEngineId\)/,
    'the set of spent engines must hold engine ids, not the string "auto"',
  );
});

/*
 * WHAT THE PERSON READS WHEN THE MISSION IS ACTUALLY OVER.
 *
 * Asserted on the COMPOSED text. Writing the mission line, I read it alone and
 * shipped a message that said "every engine available to me has now failed" and
 * then, four lines later, "retry on the next engine" — with a chip that
 * degraded to a bare "Retry with fallback" carrying no override. That is this
 * file's own class (copy promising action in a state with no future) and the
 * duplication class from 2026-09-02 at once, and reading the halves is what
 * hid both.
 */
test('[was-red] an exhausted mission is never offered "the next engine"', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 3,
    triedEngines: ['Gemini Flash', 'Nemotron 3 Super 120B'],
    runId: 'coding-run-7f3a91c',
    missionExhausted: true,
    fallbackEngine: null,
  });

  assert.match(outcome.text, /every engine available to me has now failed/, 'the terminal state must be stated, not implied');
  assert.doesNotMatch(outcome.text, /retry on the next engine/i, 'there is no next engine; offering one is the promise this file forbids');
  assert.doesNotMatch(
    outcome.text.split('**The mission:**')[1] || '',
    /Gemini Flash/,
    'the engines were named one line above; saying it twice is the 2026-09-02 duplication defect',
  );

  const chips = outcome.continueSet.items;
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, 'Retry a smaller build', 'a smaller job is the one repair that is materially different here');
});

test('[was-red] a mission that survives says so, and the chip still pins a real engine', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 2,
    triedEngines: ['Gemini Flash'],
    runId: 'coding-run-7f3a91c',
    missionExhausted: false,
    fallbackEngine: { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B' },
  });

  assert.match(outcome.text, /The mission is kept/, 'a Run that stays open is the fact the person needs');
  assert.doesNotMatch(outcome.text, /every engine available to me/, 'a surviving mission must not read as a dead one');
  assert.equal(outcome.continueSet.items[0].modelOverrideId, 'nvidia/nemotron-3-super-120b-a12b:free');
});

test('no mission evidence, no mission claim', () => {
  /*
   * Same law as the Run reference: absent evidence renders nothing. A default
   * of `true` would tell every caller that has not been wired yet to give up,
   * and a default of `false` would promise a durable Run that may not exist.
   */
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'no healthy AI route',
    attemptsMade: 2,
    triedEngines: ['Gemini Flash'],
  });
  assert.doesNotMatch(outcome.text, /The mission/, 'neither mission claim may be made without evidence for it');
});

test('the chat stream tells the outcome copy which mission state it is in', () => {
  const hook = readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const resolved = (hook.match(/resolveCodingTurnOutcome\(\{/g) || []).length;
  const informed = (hook.match(/missionExhausted: missionSpent\(\)/g) || []).length;
  assert.equal(
    informed,
    resolved,
    `${resolved} terminal outcomes are resolved but only ${informed} are told whether the mission survived`,
  );
});

/*
 * THE RUNGS THE DESK COULD NOT SEE (2026-09-03, same day, one layer down).
 *
 * The fix above stops the BROWSER repeating an engine. It does not stop the
 * server, which runs its own inference ladder behind a single request: on a
 * build turn api/_lib/chat-handler.ts funds two rungs out of the 165s budget
 * (110s primary, then the remainder) and may burn both. The desk saw one
 * attempt, because which rungs burned was stated only inside a human-readable
 * failover label.
 *
 * Measured through the real modules:
 *
 *     the server actually burned      : gemini-flash-latest, nemotron-3-super
 *     the durable Run records         : gemini-flash-latest
 *     so turn 2 reroutes to           : nemotron-3-super
 *     RED: turn 2 is sent to an engine the server already burned on this mission.
 *
 * Which is this file's own class — a retry identical to an attempt that already
 * failed — arriving through the seam the previous fix did not cover.
 */
test('[was-red] engines the server burned are recorded, and the browser’s own is not double-counted', () => {
  const recorded = new Set(['gemini-flash-latest']);

  assert.deepEqual(
    unrecordedServerEngines(
      ['gemini-flash-latest', 'nvidia/nemotron-3-super-120b-a12b:free'],
      recorded,
    ),
    ['nvidia/nemotron-3-super-120b-a12b:free'],
    'the primary is already on the browser’s record; only the rungs behind it are news',
  );

  assert.deepEqual(
    unrecordedServerEngines(['a', 'a', '', null, 'b'], new Set()),
    ['a', 'b'],
    'a repeated or empty id is not an extra engine',
  );
  assert.deepEqual(unrecordedServerEngines(undefined, recorded), [], 'a server that reports nothing burns nothing');
});

test('a reported engine is named for the person, falling back to something quotable', () => {
  const catalogue = [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }];
  assert.equal(engineDisplayName('gemini-flash-latest', catalogue), 'Gemini Flash');
  assert.equal(
    engineDisplayName('nvidia/nemotron-3-super-120b-a12b:free', catalogue),
    'nvidia/nemotron-3-super-120b-a12b:free',
    'an id the catalogue does not carry is still something the person can quote — a placeholder is not',
  );
  assert.equal(engineDisplayName('', catalogue), '');
});

test('[was-red] the desk absorbs the server’s rungs wherever they can arrive', () => {
  /*
   * Three arrival points, because a turn can die at any of them: a live
   * failover status, a streamed terminal error, and a non-2xx response that
   * never opened a stream at all. Missing one loses the whole record for that
   * failure mode — and a unit test cannot see a receive point that was never
   * wired.
   */
  const hook = readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(hook, /const absorbServerEngines = \(reported\) => \{/, 'the absorber must exist before it can be called');
  const absorbed = hook.match(/absorbServerEngines\([^)]*\)/g) || [];
  assert.equal(
    absorbed.length,
    3,
    `expected three arrival points, found ${absorbed.length}: ${absorbed.join(' | ')}`,
  );
  assert.ok(absorbed.includes('absorbServerEngines(parsed.status.spentEngineIds)'), 'a live failover names the rung it just left');
  assert.ok(absorbed.includes('absorbServerEngines(parsed.error.spentEngineIds)'), 'a streamed terminal error carries the full set');
  assert.ok(absorbed.includes('absorbServerEngines(errData?.spentEngineIds)'), 'a turn that never opened a stream still burned rungs');

  assert.match(
    hook,
    /attemptsMade: Math\.max\(attempt, spentEngineIds\.size\)/,
    'one browser attempt over two engines is two model attempts, and the copy may not under-report it',
  );
});

test('[was-red] the durable journal is told every engine, once', () => {
  /*
   * `qirFail` reports what is NEW since the last call. Re-listing the whole
   * spent set on every failure would inflate each engine's recorded failure
   * count, which is the weight orderEnginesForMission sorts by — an engine
   * would sink for having been mentioned often rather than for failing often.
   */
  const hook = readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const qirFail = hook.slice(hook.indexOf('const qirFail = (kind, message, done)'));
  const body = qirFail.slice(0, qirFail.indexOf('\n    };') + 7);

  assert.match(body, /!journaledEngineIds\.has\(engineId\)/, 'an engine already journaled is not news');
  assert.match(body, /\.\.\.spentEngineIds\]/, 'and the server’s rungs must be in the set that gets journaled');
  assert.match(body, /engineIds,/, 'the journal takes the whole list, not a single engine');
});

/*
 * THE 429 STORM (2026-09-08). A pilot user's Network tab showed eight `429`
 * responses from /api/chat, ~2s apart, for ONE message. 429 was in
 * RETRYABLE_STATUS, so a refusal was diagnosed as a dead route and "repaired"
 * by walking the engine ladder — a retry that changed nothing about why the
 * request was refused, which is contract 2 of this gate violated by status
 * code rather than by prompt. It also spent the very budget it was waiting on,
 * and buried the server's honest sentence under eight route notices.
 *
 * Verified two-way per CLAUDE.md §2: with 429 restored to RETRYABLE_STATUS,
 * the first two tests below fail (`retry` true, reason 'route').
 */

test('[was-red] a rate-limit refusal is terminal — one request, never a ladder walk', () => {
  const recovery = resolveTurnRecovery({
    attempt: 1,
    maxAttempts: 9,
    status: 429,
    failureDetail: 'You have used your 15 AI turns for today.',
    fallbackEngineName: 'Gemini 2.5 Flash',
  });

  assert.equal(recovery.retry, false, 'retrying a refusal spends the budget it is waiting on');
  assert.equal(recovery.resume, false);
  assert.equal(recovery.reason, 'rate-limited', 'the diagnosis names the refusal, not a route');
  assert.equal(recovery.notice, '', 'no notice: the server already said why, verbatim');
});

test('[was-red] one user message costs exactly one refused request', () => {
  /*
   * The count IS the defect. Simulating the caller's loop is the only way to
   * see that a per-attempt "retry: true" becomes eight requests once the
   * engine ladder is long — a property no single-call assertion can show.
   */
  let requests = 0;
  for (let attempt = 1; attempt <= 9; attempt += 1) {
    requests += 1;
    const recovery = resolveTurnRecovery({
      attempt,
      maxAttempts: 9,
      status: 429,
      fallbackEngineName: `engine-${attempt + 1}`,
    });
    if (!recovery.retry) break;
  }
  assert.equal(requests, 1, `one message must cost one refused request, spent ${requests}`);
});

test('a 429 the server marks retryable still cannot restart the loop', () => {
  /*
   * Defence in depth. Removing 429 from RETRYABLE_STATUS alone leaves the
   * `retryable === true` branch as a second door: any future handler that
   * marks a refusal retryable would reopen the storm. The refusal check runs
   * first, so it cannot.
   */
  const recovery = resolveTurnRecovery({ attempt: 1, maxAttempts: 9, status: 429, retryable: true });
  assert.equal(recovery.retry, false, 'a refusal is a refusal however the server labels it');
  assert.equal(recovery.reason, 'rate-limited');
});

test('a genuine transport failure is still repaired by switching engines', () => {
  /*
   * The guard against over-correcting: 503 and 502 are the provider dying,
   * where another engine is exactly the right repair. Narrowing the retry set
   * must not have narrowed it to nothing.
   */
  for (const status of [408, 425, 500, 502, 503, 504]) {
    const recovery = resolveTurnRecovery({ attempt: 1, maxAttempts: 3, status, fallbackEngineName: 'Gemini 2.5 Flash' });
    assert.equal(recovery.retry, true, `HTTP ${status} is a route failure and must still fail over`);
    assert.equal(recovery.switchModel, true, `HTTP ${status} must not be retried on the engine that just died`);
  }
});

test('the refusal message the user reads is the server’s own sentence', () => {
  /*
   * Terminal is only an improvement if the copy that renders instead of the
   * retry notice is the honest one. responseErrorMessage returns payload.error
   * untouched when the server sent one — the budget sentence, the per-minute
   * sentence — rather than the generic HTTP 429 fallback beneath it.
   */
  const hook = readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const fn = hook.slice(hook.indexOf('function responseErrorMessage'), hook.indexOf('function activeStudioDomain'));
  assert.match(fn, /if \(payload\?\.error\) return/, 'a server-provided message must win over the status-derived line');
  assert.ok(
    fn.indexOf('if (payload?.error) return') < fn.indexOf('status === 429'),
    'the server’s own sentence must be reached before the generic 429 wording',
  );
});

test('the desk does not call a refusal a failure', () => {
  /*
   * The heading is what gets read. "Request failed" over a rate-limit message
   * tells a student the platform broke when it did exactly what it was
   * configured to do — and invites the manual retry the loop above just
   * stopped taking automatically. Asserted on the source because this branch
   * lives inside the streaming hook, which has no unit-testable seam.
   */
  const hook = readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(hook, /const refused = res\.status === 429;/, 'the terminal render must know a refusal from a fault');
  const branch = hook.slice(hook.indexOf('const refused = res.status === 429;'));
  const render = branch.slice(0, branch.indexOf('isError: true'));
  assert.match(render, /a limit, not a fault/, 'the heading must say what actually happened');
  assert.ok(
    render.indexOf('refused') < render.indexOf('Request failed'),
    'the refusal branch must be reached before the generic failure heading',
  );
});
