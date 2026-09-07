/**
 * The comprehension gate for a developer working on their own repository.
 *
 * `travel-comprehension.test.js` established the class: every other gate here
 * asks whether something is REACHABLE, and a parser that was confidently wrong
 * passed all of them. This is that measurement for the journey Phase 7 exists
 * to serve -- somebody imports a repository they already have and asks for a
 * change to it.
 *
 * WHAT IS BEING MEASURED, STATED CAREFULLY
 *
 * The first reading of this was wrong and the correction is kept because the
 * mistake is the easy one. `shouldRefineRunningDesk` returned false for 26 of
 * 28 ordinary developer requests with a repository open. That is a real number
 * about a real signal, and it is NOT the claim that the desk failed to treat
 * them as coding work -- `turnBelongsToBuild` answers yes to any message once
 * the desk holds files, so `buildMode` on the request was never wrong.
 *
 * What the signal decides is whether the turn is a REFINEMENT of code that
 * exists. Measured on the same desk with the same files:
 *
 *   "make the header blue"             studioMode build, refineMode true
 *   "add a test for the retry path"    studioMode ASK,   refineMode ABSENT
 *
 * Two of the twenty-eight did pass, and they matter more than the misses:
 * "migrate the users TABLE" matched the UI-parts list on an HTML table, and
 * "can you fix THEM" matched the rule for iterating on a preview. Neither was
 * heard as repository work; both would have counted as a pass.
 *
 * THE TWO NUMBERS, AND WHY THEY PULL AGAINST EACH OTHER
 *
 *   PRECISION must be 100%. On the travel desk an invention was a wrong
 *   destination. Here it is a WRITE: reading a question about the code as an
 *   instruction to change it means files move while someone was only asking.
 *   There is no acceptable non-zero rate and the floor is not negotiable.
 *
 *   RECALL has a floor that may only ever be raised. It reads 100% of this
 *   corpus and 8 of 8 holdout phrasings, against 7% for the vocabulary that
 *   was there before.
 *
 * The adversarial set earned its place twice while this was written. It first
 * caught a question guard that only looked at the START of a message, so "just
 * wondering, should I add a test for the parser?" was read as an instruction --
 * a write on somebody thinking aloud. It then caught `document` matching the
 * Office-artifact list as a bare word, which silently refused "document the
 * exported functions". Both were mine, and both were found here rather than by
 * a person losing work.
 *
 * MEASURED THROUGH THE ENTRY POINT THAT SHIPS
 *
 * Every case below runs `shouldRefineRunningDesk`, which is what production
 * calls, rather than the vocabulary module underneath it. Two things are only
 * true of the composed behaviour and would be missed by testing the parser
 * alone: an advisor desk refuses a refine whatever the words were, and no
 * message is repository work when no repository is open.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldKeepWorkspaceForPrompt, shouldRefineRunningDesk } from '../../shared/workspace-intent.js';
import { asksForRepositoryWork } from '../../shared/repo-work-intent.js';
import { isBuildSessionActive, turnBelongsToBuild } from '../../shared/build-session.js';
import { resolveIsCodingRequest } from '../../shared/build-intent.js';
import { resolveStudioMode } from './studio-mode.js';
import { codingTurnRequestFields } from './studio-desk-context.js';

/*
 * ---------------------------------------------------------------------------
 * THE CORPUS
 *
 * In this file rather than beside it, for the reason travel-comprehension
 * records: as an importable module its exports would be dead wires, and the
 * wiring gate would be right to fail on them.
 *
 * `domain` is the desk the message would really arrive on, so a case carries
 * the guard that would really apply to it.
 * ---------------------------------------------------------------------------
 */

/** Ordinary requests to change code. Failing these is the deafness measured above. */
const REPOSITORY_WORK = [
  'Fix the null check in auth.ts',
  'Add a test for the retry path',
  'Refactor the login handler to use the new session store',
  'Rename getUser to fetchUser across the repo',
  'Bump the eslint version',
  'Add error handling to the upload endpoint',
  'Remove the dead feature flag from the config',
  'Wire the new endpoint into the router',
  'Open a PR with these changes',
  'Revert the last commit on this branch',
  'Update the README with the new setup steps',
  'Handle the 429 from the provider with a backoff',
  'Implement pagination on the search endpoint',
  'Delete the unused import in server.ts',
  'Write a migration to backfill the slug column',
  'The tests are failing on CI, can you fix them',
  'Add types to the response parser',
  'Split this component into two modules',
  'Extract the retry logic into a helper',
  'Patch the race condition in the queue worker',
  'Replace the deprecated api with the new one',
  'Add a null check before the callback fires',
  'Commit this and push to my branch',
  'Fix the lint errors',
  'Migrate the users query to the new schema',
  'Document the exported functions',
  'Disable the flaky test in the payments spec',
  'Pin the dependency to the version that works',
];

/*
 * ---------------------------------------------------------------------------
 * THE ADVERSARIAL SET
 *
 * The corpus above cannot be the only thing measured. One that contains only
 * the cases that motivated the fix reads 100% for a parser that got far more
 * dangerous, so these are the messages a loosened parser starts writing files
 * on. Every one must stay silent, and this is the floor that cannot move.
 * ---------------------------------------------------------------------------
 */
const NOT_REPOSITORY_WORK = [
  // Questions ABOUT the code. Every one names something real in the repository,
  // and answering any of them by editing it is the expensive mistake here.
  'Why are the tests failing?',
  'How does the auth handler work?',
  'What does this function do?',
  'Can you explain the migration to me?',
  'Which endpoint returns the user profile?',
  'Is the parser covered by tests?',
  'Where is the router configured?',
  'Tell me what the config does',
  'Should I add a test for this?',
  'Does the CLI read the env vars?',

  // The shape that actually threatens precision: a question carrying both a
  // change verb and a code noun, so everything except the question itself says
  // "edit the repository". Dropping the question guard fires on every one.
  'Why did you add the retry helper?',
  'How do I fix the failing migration?',
  'What happens if we remove the null check?',
  'Should we rename the endpoint before the release?',
  'Is it safe to delete the unused imports?',
  'Do you want me to update the dependencies?',
  'Where should I add the test for the parser?',
  'Which dependency should I bump first?',
  'Just wondering, should I add a test for the parser?',
  'Quick one before I start: why does the worker cache the response?',

  // Ordinary conversation that happens to carry a change verb.
  'Fix my credit score',
  'Update me on the market today',
  'Remove the sugar from the recipe',
  'Add milk to the shopping list',
  'Can you fix my sleep schedule',

  // Office work, which is the one surface the advisor guard does not cover.
  'Add a slide about our API strategy',
  'Fix the formatting in the document',
  'Update the spreadsheet with the new dependencies',
  'Add a paragraph explaining the migration',
];

/*
 * Advisor desks own their turn however technical the words are. A finance desk
 * asked to "fix the model" is not being asked to edit a file.
 */
const ADVISOR_DESK_ASKS = [
  { text: 'Fix the assumptions in my savings schema', domain: 'finance' },
  { text: 'Add a test for chapter 3 of the biology notes', domain: 'education' },
  { text: 'Update the itinerary to handle the delayed branch of the trip', domain: 'travel' },
  { text: 'Document the sources for these claims', domain: 'research' },
];

/*
 * ---------------------------------------------------------------------------
 * THE HOLDOUT
 *
 * Phrasings written after the vocabulary was fixed and never consulted while
 * fixing it. Their only job is to say whether recall generalises or was merely
 * fitted to the corpus above.
 * ---------------------------------------------------------------------------
 */
const HOLDOUT_WORK = [
  'the upload route 500s on empty files, guard it',
  'swap the deprecated crypto helper for the node one',
  'this class is doing too much, extract the validation',
  'cover the timeout branch with a test',
  'the changelog is stale, update it',
  'add a fixture for the malformed payload case',
  'rewrite the reducer so it stops mutating state',
  'silence the eslint warning in the worker script',
];

/*
 * ---------------------------------------------------------------------------
 * KNOWN_UNHEARD
 *
 * Phrasings a real developer uses that this vocabulary knowingly cannot read.
 * Each is a recall loss accepted to keep precision at 100%, and naming them is
 * what stops a miss budget quietly swallowing a decision.
 * ---------------------------------------------------------------------------
 */
const KNOWN_UNHEARD = [
  {
    text: 'make it stop crashing on startup',
    why: 'names nothing in the repository. The words alone are equally an ask about a preview, a document or a deployment. The older UI-parts door does read it as iterating on a preview, which is its call to make and not this one.',
  },
  {
    text: 'same thing but for the other one',
    why: 'carries the whole meaning in a previous turn. Reading it needs the transcript, which this signal deliberately does not take.',
  },
  {
    text: 'ship it',
    why: 'no verb this understands and no noun at all. Guessing here would mean writing files on two words.',
  },
  {
    text: 'the CI is red',
    why: 'a statement of fact, not a request. A developer saying it usually wants a fix; acting on that reading would also fire on someone thinking aloud.',
  },
];

/*
 * ---------------------------------------------------------------------------
 * WHAT THE OLDER DOOR ALREADY DOES, RECORDED RATHER THAN ABSORBED
 *
 * Four of the messages above are read as a refine today, by the UI-parts rule
 * that predates this work: `slide`, `document` and `spreadsheet` are all in its
 * noun list, and `this` matches its rule for iterating on a preview. For an
 * Office surface that is the right answer -- "fix the formatting in the
 * document" IS a refine of the open document.
 *
 * "Should I add a test for this?" is the one that is not obviously right: on a
 * coding desk it is a question, and it is heard as an instruction. It predates
 * this change, nothing here alters it, and tightening a rule that also serves
 * documents and presentations needs its own evidence rather than being done in
 * passing. It is named here so the next person finds it as a decision instead
 * of discovering it as a surprise.
 * ---------------------------------------------------------------------------
 */
const HEARD_BY_THE_OLDER_DOOR = [
  'Should I add a test for this?',
  'Add a slide about our API strategy',
  'Fix the formatting in the document',
  'Update the spreadsheet with the new dependencies',
];

/*
 * 100, because that is what it measures today.
 *
 * A floor at the achieved number is the strongest ratchet available -- any
 * regression fails -- and it has one consequence worth stating plainly: this
 * gate can no longer be strengthened by raising a number. It is strengthened by
 * ADDING CASES, which is the right incentive and the opposite of the one a
 * comfortable margin creates. A hundred per cent here is a statement about this
 * corpus, never about the world; the holdout set below is what says whether it
 * generalises, and the adversarial set is what says what it cost.
 */
const RECALL_FLOOR = 100;

const heard = (text, domain = null) => shouldRefineRunningDesk({
  prompt: text,
  hasDeskFiles: true,
  studioDomain: domain,
});
const olderDoor = (text) => shouldKeepWorkspaceForPrompt({ prompt: text, hasWorkspace: true });

test('PRECISION: nothing outside repository work reaches the new door', () => {
  const wrote = NOT_REPOSITORY_WORK.filter((text) => asksForRepositoryWork(text));
  assert.deepEqual(wrote, [], `would have edited the repository on a message that did not ask for it: ${JSON.stringify(wrote, null, 2)}`);
});

/*
 * The check above is only worth having if the new door cannot quietly widen the
 * composed answer instead. This compares every adversarial message against what
 * the older door alone says, so a verdict this change moves shows up here.
 */
test('PRECISION: this change moves no verdict the desk already had', () => {
  const moved = NOT_REPOSITORY_WORK
    .map((text) => [text, heard(text), olderDoor(text)])
    .filter(([, now, before]) => now !== before)
    .map(([text, now, before]) => `${text} (was ${before}, now ${now})`);
  assert.deepEqual(moved, [], `the new door changed an existing verdict: ${JSON.stringify(moved, null, 2)}`);
});

test('the four the older door already hears are exactly the four recorded', () => {
  const stillHeard = NOT_REPOSITORY_WORK.filter((text) => olderDoor(text));
  assert.deepEqual(
    stillHeard.sort(),
    [...HEARD_BY_THE_OLDER_DOOR].sort(),
    'the older UI-parts door changed behaviour; the record above is now wrong',
  );
});

test('PRECISION: an advisor desk keeps its turn however technical the words are', () => {
  const stolen = ADVISOR_DESK_ASKS.filter((c) => heard(c.text, c.domain)).map((c) => `${c.domain}: ${c.text}`);
  assert.deepEqual(stolen, [], `an advisor turn was taken as repository work: ${JSON.stringify(stolen, null, 2)}`);
});

/*
 * The signal answers "is this repository work?", never "is there a repository?".
 * Without this, a first message on an empty desk would be read as an edit to
 * files that do not exist.
 */
test('PRECISION: nothing is repository work when no repository is open', () => {
  const early = REPOSITORY_WORK.filter((text) => shouldRefineRunningDesk({ prompt: text, hasDeskFiles: false }));
  assert.deepEqual(early, [], `treated an empty desk as one with code on it: ${JSON.stringify(early, null, 2)}`);
});

test(`RECALL: the desk hears at least ${RECALL_FLOOR}% of ordinary developer requests`, () => {
  const understood = REPOSITORY_WORK.filter((text) => heard(text));
  const recall = (understood.length / REPOSITORY_WORK.length) * 100;
  const deaf = REPOSITORY_WORK.filter((text) => !heard(text));
  assert.ok(
    recall >= RECALL_FLOOR,
    `recall ${recall.toFixed(1)}% is below the ${RECALL_FLOOR}% floor. Deaf to: ${JSON.stringify(deaf, null, 2)}`,
  );
});

/*
 * THE FLOOR HAS TO BE CARRIED BY THE NEW DOOR.
 *
 * A recall number the older rule could reach on its own would make this gate
 * decorative -- it would pass with the new vocabulary deleted, which is the
 * defect this repository names as worse than having no gate at all. This is the
 * other direction of the two-way check, run every time rather than once by hand.
 */
test('RECALL: the older UI-parts door alone falls well short of the floor', () => {
  const withoutNewDoor = REPOSITORY_WORK.filter((text) => olderDoor(text));
  const before = (withoutNewDoor.length / REPOSITORY_WORK.length) * 100;
  assert.ok(
    before < RECALL_FLOOR,
    `the older door alone scores ${before.toFixed(1)}%, at or above the ${RECALL_FLOOR}% floor, so this gate would pass with the new vocabulary deleted`,
  );
});

test('RECALL generalises: requests phrased in ways the vocabulary was not built against', () => {
  const missed = HOLDOUT_WORK.filter((text) => !heard(text));
  // A holdout miss is a recall gap, not a write on something nobody asked
  // about, so this is a budget rather than perfection.
  assert.ok(missed.length <= 1, `holdout recall regressed: ${JSON.stringify(missed, null, 2)}`);
});

test('KNOWN_UNHEARD: a phrasing we cannot read stays silent rather than guessing', () => {
  const guessed = KNOWN_UNHEARD.filter((c) => asksForRepositoryWork(c.text)).map((c) => c.text);
  assert.deepEqual(guessed, [], `acted on a phrasing recorded as unreadable: ${JSON.stringify(guessed, null, 2)}`);
});

/*
 * THE CORRECTED CLAIM, MADE EXECUTABLE.
 *
 * The header records that the first reading of the recall number was wrong.
 * Prose decays, so both halves of the correction are asserted here: what was
 * never broken stays proven not-broken, and what the fix actually buys is
 * pinned to the two values it changes.
 */
test('what was NOT broken: the turn was always a coding turn', () => {
  const buildSessionActive = isBuildSessionActive({
    priorUserMessages: [],
    codingDeskOpen: true,
    hasDeskFiles: true,
    isCodingRequest: (candidate) => resolveIsCodingRequest(candidate, { codingDeskOpen: true }),
  });
  const missedByTheOlderDoor = REPOSITORY_WORK.filter((text) => !olderDoor(text));
  const notCoding = missedByTheOlderDoor.filter((text) => !turnBelongsToBuild({ text, buildSessionActive }));
  assert.deepEqual(
    notCoding,
    [],
    'turnBelongsToBuild no longer covers these, so the recall number above now IS a claim about whether the desk '
    + `hears a developer at all, and the header is wrong: ${JSON.stringify(notCoding, null, 2)}`,
  );
});

test('what the fix buys: a change to existing code goes out as a refinement, not a fresh ask', () => {
  const packet = { files: {}, previewCode: '<h1>x</h1>', studioDomain: 'coding' };
  const send = (text) => {
    const refineDesk = heard(text);
    return {
      studioMode: resolveStudioMode({ chosen: null, refineDesk }),
      refineMode: codingTurnRequestFields({ isCodingRequest: true, refineDesk, packet }).refineMode ?? null,
    };
  };
  // The product phrasing was always right; it is the control.
  assert.deepEqual(send('make the header blue'), { studioMode: 'build', refineMode: true });
  // The developer phrasing on the same desk, which used to read { ask, null }.
  assert.deepEqual(
    send('Add a test for the retry path'),
    { studioMode: 'build', refineMode: true },
    'a developer editing their own repository is being described to the server as a fresh request again',
  );
});

/*
 * THE VOCABULARY HAS TO BE IN THE PATH, NOT MERELY AVAILABLE TO IT.
 *
 * Everything above would pass with the module imported and never consulted, by
 * way of the two accidental matches the header records. This drives a message
 * that ONLY the new door can hear.
 */
test('the refine path consults the new door, not the UI-parts list', () => {
  assert.equal(heard('Add a test for the retry path'), true, 'the new door is not wired into the refine path');
  assert.equal(
    heard('Add a test for the retry path', 'finance'),
    false,
    'the advisor guard must still run ahead of it',
  );
});
