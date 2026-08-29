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
  assert.equal(
    isBuildSessionActive({ priorUserMessages: ['build me an app'], codingDeskOpen: false, isCodingRequest }),
    false,
    'the desk has to be open',
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
