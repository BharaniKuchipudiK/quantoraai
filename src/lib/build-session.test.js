import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIsCodingRequest } from './build-intent.js';
import { isBuildSessionActive, turnBelongsToBuild } from './build-session.js';
import { planCodingTurn } from './coding-turn-planner.js';

/**
 * The defect this closes, in the user's own words: the platform kept telling
 * them to open TextEdit, turn off smart quotes, paste the code and start a
 * server — instructions instead of a file, given to somebody who came here
 * because they cannot do that.
 *
 * The cause was not the model. Every turn was re-classified from scratch by a
 * regex needing a build VERB and a build NOUN in one sentence, with no memory
 * that a build was under way. Ordinary follow-ups have neither. And the
 * fallback to refine-mode required desk files, so a session whose first turn
 * produced none could never get back in — one failure and it was a chatbot for
 * good.
 */

const isCodingRequest = (candidate) => resolveIsCodingRequest(candidate, { codingDeskOpen: true });
/*
 * The classifier as the guided intake actually sees it: no desk yet, because
 * the first turn produced a question rather than files. Two tests below used
 * `() => false` here to stand in for "the strict classifier misses this ask,
 * as it did in production". That was never measured, and it is wrong — the
 * real classifier recognises "Build me a boutique website for Hira Silks"
 * with the desk shut. Standing in for a miss that does not happen hid which
 * signal was carrying the journey, and #609 widened the wrong one on the
 * strength of it.
 */
const isCodingRequestDeskless = (candidate) => resolveIsCodingRequest(candidate, { codingDeskOpen: false });

test('a session that has asked for a build is an active build session', () => {
  assert.equal(
    isBuildSessionActive({
      priorUserMessages: ['build a Google Drive custodian app'],
      codingDeskOpen: true,
      isCodingRequest,
    }),
    true,
  );
});

test('INVARIANT: desk files are not required to stay in a build', () => {
  // The circularity that made this fatal. A first turn that produced no files —
  // a truncated stream, a provider failure, a missed classification — locked
  // the session out of build mode permanently.
  assert.equal(
    isBuildSessionActive({
      priorUserMessages: ['build a Google Drive custodian app'],
      codingDeskOpen: true,
      hasDeskFiles: false,
      isCodingRequest,
    }),
    true,
    'a failed first turn must not disqualify the session',
  );
});

test('an ordinary chat session is not a build session', () => {
  assert.equal(
    isBuildSessionActive({ priorUserMessages: ['what do you think of this?'], codingDeskOpen: true, isCodingRequest }),
    false,
  );
  /*
   * THIS ASSERTION WAS REVERSED ON 2026-09-07, deliberately.
   *
   * It read `false` with the reason "the desk has to be open", which was the
   * rule until it was found to break the guided intake (#445): a person asks
   * for a site, the desk answers with an intake question rather than guessing,
   * and their typed answer arrives with no desk and no VFS — so the answer to
   * the desk's own question was reclassified as ordinary conversation, spent
   * the whole turn budget on one route, and showed "Temporarily unavailable".
   *
   * Note also that 'build me an app' was never an ordinary chat session, which
   * is this test's name. It is a build ask, filed under the wrong heading. The
   * ordinary-chat case is the assertion above, and it still holds.
   */
  assert.equal(
    isBuildSessionActive({ priorUserMessages: ['build me an app'], codingDeskOpen: false, isCodingRequest }),
    true,
    'prior build intent is enough before the first file exists; the open desk was only ever a proxy for it',
  );
});

test('the follow-ups that were being dropped now belong to the build', () => {
  const dropped = [
    'the buttons do not work',
    'add a dark mode',
    'can you give me the file instead',
    'it is still broken',
    'there is no code to copy',
    'make the header blue',
    'nothing happens when I click it',
  ];
  for (const text of dropped) {
    assert.equal(resolveIsCodingRequest(text, { codingDeskOpen: true }), false, `fixture check: ${text}`);
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), true, text);
  }
});

test('INVARIANT: a real question still gets an answer, not a rebuild', () => {
  // Turning every sentence into a build would be its own failure — somebody
  // asking how something works deserves an answer, not a regenerated page.
  for (const text of [
    'how does a currency conversion work',
    'what is a VFS',
    'why do you recommend that approach',
    'should I use a database',
  ]) {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), false, text);
  }
});

test('a question about the work is still about the work', () => {
  // "Why is the button not working" opens with a question word and is
  // unmistakably about the build. Treating it as chat is how somebody ends up
  // being told to open TextEdit.
  for (const text of [
    'why is the button not working',
    'can you give me the code again',
    'why is the page blank',
    'what happened to my cart, it is broken',
  ]) {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), true, text);
  }
});

test('nothing is added outside a build session', () => {
  for (const text of ['the buttons do not work', 'add a dark mode', 'it is still broken']) {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: false }), false, text);
  }
  assert.equal(turnBelongsToBuild({ text: '', buildSessionActive: true }), false);
});

test('INVARIANT: the planner keeps a follow-up on the desk after a failed first turn', () => {
  /*
   * The whole bug, end to end. The first turn asked for a build and produced no
   * files; the follow-up says the build is broken. Before, that follow-up
   * planned as a non-coding pass-through — no desk, no Preview, no proof — and
   * the model answered with instructions.
   */
  const plan = planCodingTurn({
    message: 'the buttons do not work and there is no code to copy',
    priorUserMessages: ['build a Google Drive custodian app'],
    codingDeskOpen: true,
    vfsFileCount: 0,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.isCodingTurn, true);
  assert.notEqual(plan.mode, 'pass');
});

test('an ordinary chat turn is still a pass-through', () => {
  const plan = planCodingTurn({
    message: 'what do you think of this idea?',
    priorUserMessages: ['what do you think of this idea?'],
    codingDeskOpen: true,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.mode, 'pass');
});

/*
 * Two defects a review found in the first version of this file. Both are the
 * same species as the bug it was written to fix: a rule that looked right and
 * was checked against the wrong thing.
 */

test('INVARIANT: activation recovers the asks the cold classifier misses', () => {
  /*
   * The first version asked resolveIsCodingRequest whether the session had ever
   * been a build — the same classifier whose misses this is meant to recover
   * from. "build me a currency converter" is not recognised by it (no matching
   * noun), so a session opened that way never activated and the circular lock
   * survived intact for exactly the asks that trip it.
   */
  const missedByTheClassifier = [
    'build me a currency converter',
    'make me a thing that renames my photos',
    'create me a slideshow of my holiday',
  ];
  for (const ask of missedByTheClassifier) {
    assert.equal(resolveIsCodingRequest(ask, { codingDeskOpen: true }), false, `fixture: ${ask}`);
    assert.equal(
      isBuildSessionActive({ priorUserMessages: [ask], codingDeskOpen: true, isCodingRequest }),
      true,
      ask,
    );
  }
  // And an ask the classifier does catch still activates, by the other signal.
  assert.equal(
    isBuildSessionActive({ priorUserMessages: ['create me a drive custodian'], codingDeskOpen: true, isCodingRequest }),
    true,
  );
});

test('the whole lock is broken for an ask the classifier misses', () => {
  const plan = planCodingTurn({
    message: 'it is still broken',
    priorUserMessages: ['build me a currency converter'],
    codingDeskOpen: true,
    vfsFileCount: 0,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.isCodingTurn, true);
  assert.notEqual(plan.mode, 'pass');
});

test('INVARIANT: a question about anything else stays a question', () => {
  /*
   * Trouble words alone are not a build signal — "wrong", "still", "again" and
   * "can you show" appear in questions about anything at all. Answering "what is
   * wrong with the economy?" by regenerating somebody's page would be its own
   * kind of not listening.
   */
  for (const text of [
    'what is wrong with the economy?',
    "can you show me today's weather?",
    'why is inflation still rising?',
    'is that still the best approach in general?',
    'what is the application deadline?',
    'why does that appear to be wrong?',
  ]) {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), false, text);
  }
});

test('a noun that merely starts like a noun is not a reference to the build', () => {
  // `app\w*` matched "approach", so a general question read as a reference to
  // the app. Plurals only.
  for (const text of ['is that still the best approach?', 'why does that appear wrong?']) {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), false, text);
  }
  assert.equal(turnBelongsToBuild({ text: 'why are the buttons still broken', buildSessionActive: true }), true);
});

test('a build session is not activated by a question about building', () => {
  assert.equal(
    isBuildSessionActive({ priorUserMessages: ['what should I build next?'], codingDeskOpen: true, isCodingRequest }),
    false,
  );
});

/*
 * THE GUIDED INTAKE ANSWER (#445, reproduced still-live on 2026-09-07).
 *
 * The flow is the ordinary one, and it is the FIRST thing a new user does.
 * They ask for a boutique website; the desk correctly answers with an intake
 * question rather than guessing; they type their answer. At that moment there
 * is no desk and no VFS — the first turn produced a question, not files.
 *
 * isBuildSessionActive required codingDeskOpen, so the answer was reclassified
 * as ordinary conversation: one free route spent essentially the whole
 * 165-second budget, fallbacks got ~0ms, and the screen said "Temporarily
 * unavailable". Every single time.
 */
test('an intake answer before any desk or file is still build work', () => {
  const active = isBuildSessionActive({
    priorUserMessages: ['Build me a boutique website for Hira Silks'],
    codingDeskOpen: false, // the first turn only asked a question
    hasDeskFiles: false,   // so there is nothing in the VFS yet
    isCodingRequest: isCodingRequestDeskless, // the REAL classifier, desk shut, as production has it
  });
  assert.equal(active, true, 'the strict classifier carries this deskless; no open desk needed');
  assert.equal(
    turnBelongsToBuild({ text: 'Boutique showcase + service booking', buildSessionActive: active }),
    true,
    'the typed answer belongs to the build it is answering',
  );
});

test('a session that never asked for a build does not become one', () => {
  // The guard that was removed must not be replaced by nothing: prior build
  // intent is what activates, and idle conversation has none.
  for (const prior of [[], ['hello'], ['what is the weather like?'], ['thanks, that helped']]) {
    assert.equal(
      isBuildSessionActive({ priorUserMessages: prior, codingDeskOpen: false, hasDeskFiles: false }),
      false,
      `"${prior.join(' | ')}" is not a build ask`,
    );
  }
});

test('a question-only opening turn is not build intent', () => {
  // Asking ABOUT building is not asking someone to build.
  assert.equal(
    isBuildSessionActive({
      priorUserMessages: ['could you build a website in principle?'],
      codingDeskOpen: false,
      hasDeskFiles: false,
      isCodingRequest: () => true, // even if the strict classifier says yes
    }),
    false,
    'the question-only filter runs before either signal',
  );
});

test('an unrelated question mid-intake still goes to chat', () => {
  /*
   * This is the cost of the trade, and it is bounded here rather than left to
   * be discovered. An active build session does NOT swallow everything: a
   * question that is not about the work is still a question.
   */
  const active = isBuildSessionActive({
    priorUserMessages: ['Build me a boutique website for Hira Silks'],
    codingDeskOpen: false,
    hasDeskFiles: false,
    isCodingRequest: isCodingRequestDeskless,
  });
  assert.equal(active, true);
  for (const aside of ['what is the capital of France?', 'can you show me today\'s weather?']) {
    assert.equal(
      turnBelongsToBuild({ text: aside, buildSessionActive: active }),
      false,
      `"${aside}" is not about the build`,
    );
  }
});

test('files present still short-circuit, whatever the history says', () => {
  // The cheapest and most certain signal stays first.
  assert.equal(
    isBuildSessionActive({ priorUserMessages: [], codingDeskOpen: false, hasDeskFiles: true }),
    true,
  );
});

/*
 * THE MIRROR IMAGE, found by review on the day #609 landed.
 *
 * #609 removed the `codingDeskOpen` requirement from isBuildSessionActive to
 * fix the guided intake. It removed it from BOTH activation signals, and only
 * one of them could carry that. IMPERATIVE_BUILD matches a build verb with ANY
 * object, so in a deskless ordinary chat "Make me a grocery list" activated a
 * build session, and the next declarative turn — "vegetarian options only" —
 * planned as mode=execute. A whole build turn, and a nonsense artifact, spent
 * on somebody's shopping.
 *
 * That is the same failure as the one #609 fixed, pointing the other way: a
 * turn routed as something the person did not ask for.
 *
 * The corpus below is deliberately adversarial — imperatives whose objects are
 * CONTENT rather than software. Per the doctrine on correctness gates, a corpus
 * containing only the cases that motivated the fix would read clean for a rule
 * that got more dangerous, so these are the cases nobody wrote the fix for.
 */
test('INVARIANT: a generic imperative in a deskless chat is not a build session', () => {
  const notSoftware = [
    'Create a poem about the sea',
    'Make me a grocery list',
    'Design a workout plan',
    'make me a cup of tea',
    'create a playlist for the drive',
    'build me an argument for the essay',
    'generate some ideas for my birthday',
    'design a tattoo for my arm',
    /*
     * Found by review AFTER the first version of this fix (2026-09-07), and it
     * is the sharper case: this one is not caught by IMPERATIVE_BUILD at all.
     * resolveIsCodingRequest widens itself when a desk is open — BUILD_VERB
     * plus DESK_OPEN_BUILD_HINT — and all three production callers passed
     * `codingDeskOpen: true` unconditionally. So "Design" plus "native" was a
     * build ask in an ordinary chat with no desk, and it entered through the
     * STRICT half of activation, which the first fix left alone.
     *
     * The first version of this test could not see it, because it injected a
     * deskless classifier that production never used. That is the same defect
     * this file was written to close, one level up: a fixture asserting
     * something production does not do.
     */
    'Design a native plant garden for my backyard',
    'make me a native english practice routine',
  ];
  for (const ask of notSoftware) {
    // Fixture check: these are exactly the asks IMPERATIVE_BUILD matches and
    // the strict classifier does not. If either half stops being true the
    // test is no longer testing what it claims.
    assert.equal(resolveIsCodingRequest(ask, { codingDeskOpen: false }), false, `fixture: ${ask}`);
    assert.equal(
      isBuildSessionActive({
        priorUserMessages: [ask],
        codingDeskOpen: false,
        hasDeskFiles: false,
        isCodingRequest: isCodingRequestDeskless,
      }),
      false,
      `"${ask}" must not open a build session with no desk`,
    );
  }
});

test('INVARIANT: the follow-up to a deskless content ask is not planned as a build', () => {
  // The end of the chain, which is what the user actually experienced: it is
  // not enough that activation is false — the planner must pass the turn
  // through rather than execute it.
  for (const [opening, followUp] of [
    ['Make me a grocery list', 'vegetarian options only'],
    ['Create a poem about the sea', 'make the second verse shorter'],
    ['Design a workout plan', 'three days a week instead'],
    // Enters through the STRICT half, via the desk-open widening that the
    // production callers applied with no desk open. planCodingTurn builds that
    // callback itself, so this asserts the real path rather than a fixture.
    ['Design a native plant garden for my backyard', 'more shade tolerant ones please'],
  ]) {
    const plan = planCodingTurn({
      message: followUp,
      priorUserMessages: [opening],
      codingDeskOpen: false,
      vfsFileCount: 0,
      autoMode: true,
      availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
    });
    assert.equal(plan.mode, 'pass', `"${opening}" -> "${followUp}" must stay a conversation`);
    assert.equal(plan.isCodingTurn, false, `${followUp}`);
  }
});

test('the loose signal still recovers a real build ask once a desk exists', () => {
  /*
   * The other direction, so the fix cannot be "turn the recovery off". An
   * open desk is corroboration that a build really exists, and with it the
   * imperative signal keeps doing the job it was added for: recovering asks
   * the strict classifier misses.
   */
  for (const ask of [
    'build me a currency converter',
    'make me a thing that renames my photos',
    'create me a slideshow of my holiday',
  ]) {
    assert.equal(resolveIsCodingRequest(ask, { codingDeskOpen: true }), false, `fixture: ${ask}`);
    assert.equal(
      isBuildSessionActive({ priorUserMessages: [ask], codingDeskOpen: true, isCodingRequest }),
      true,
      ask,
    );
  }
});
