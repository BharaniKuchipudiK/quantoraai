import assert from 'node:assert/strict';
import test from 'node:test';
import { claimFilterWroteThis, deskChatClaimWasFiltered, filterDeskChatClaims, segmentDeskReply } from './desk-chat-claim-filter.js';
import { readAssistantModal } from './assistant-modal.js';

const failedAdd = {
  checks: [{ id: 'job-add-item', ok: false, state: 'fix', label: 'Adding an item does nothing on the running Preview' }],
  facts: {},
};

test('a lying add-item sentence is rewritten so it cannot be the last word', () => {
  const original = 'Your to-do list is ready and items can be added.';
  const filtered = filterDeskChatClaims(original, failedAdd, 'studio');
  assert.equal(filtered, 'Preview cannot add an item yet.');
  assert.equal(deskChatClaimWasFiltered(original, filtered), true);
  assert.equal(/items can be added/i.test(filtered), false);
});

test('honest text about a missing control is kept', () => {
  const original = 'Add to Cart is missing from Preview. I will wire it next.';
  const filtered = filterDeskChatClaims(original, {
    checks: [{ id: 'cart', ok: false, state: 'fix' }],
    facts: { hasCart: false },
  }, 'studio');
  assert.match(filtered, /missing/);
  assert.match(filtered, /wire it next/);
});

test('a passing probe leaves the sentence alone', () => {
  const original = 'Items can be added on Preview.';
  const filtered = filterDeskChatClaims(original, {
    checks: [{ id: 'job-add-item', ok: true, state: 'ok' }],
    facts: {},
  }, 'studio');
  assert.equal(filtered, original);
});

test('Travel never gets the coding-desk filter', () => {
  const original = 'Items can be added on Preview.';
  assert.equal(filterDeskChatClaims(original, failedAdd, 'travel'), original);
  assert.equal(filterDeskChatClaims(original, failedAdd, 'education'), original);
  assert.equal(filterDeskChatClaims(original, failedAdd, 'finance'), original);
  assert.equal(filterDeskChatClaims(original, failedAdd, 'research'), original);
});

test('an unverified check uses uncertainty, not a fake failure', () => {
  const filtered = filterDeskChatClaims(
    'Items can be added on Preview.',
    { checks: [{ id: 'job-add-item', ok: false, state: 'unverified' }], facts: {} },
    'studio',
  );
  assert.equal(filtered, 'Preview has not confirmed that an item can be added yet.');
});

test('a contrast clause still cannot claim a failed control now works', () => {
  const filtered = filterDeskChatClaims(
    'The add button was broken before, but it now works.',
    failedAdd,
    'studio',
  );
  assert.equal(filtered, 'Preview cannot add an item yet.');
});

test('a job card without a live check still blocks the add-item lie', () => {
  const filtered = filterDeskChatClaims(
    'Items can be added on Preview.',
    { job: { purpose: 'A to-do list', mustWork: ['Items can still be added'] }, checks: [], facts: {} },
    'studio',
  );
  assert.equal(filtered, 'Preview has not confirmed that an item can be added yet.');
});

test('null packet denies done-claims instead of passing them through', () => {
  const original = 'Add to Cart is ready.';
  const filtered = filterDeskChatClaims(original, null, 'studio');
  assert.equal(filtered, 'Preview has not confirmed Add to Cart yet.');
  assert.equal(deskChatClaimWasFiltered(original, filtered), true);
});

test('warm Preview cannot leave ready/working claims intact', () => {
  const original = 'Add to Cart is ready and working on Preview.';
  const packet = {
    checks: [{ id: 'cart', ok: true, state: 'ok' }, { id: 'cart-click', ok: true, state: 'ok' }],
    facts: { hasCart: true, bagIncremented: true },
  };
  assert.equal(filterDeskChatClaims(original, packet, 'studio'), original);
  const filtered = filterDeskChatClaims(original, packet, 'studio', { previewWarming: true });
  assert.equal(filtered, 'Preview has not confirmed Add to Cart yet.');
  assert.equal(/ready|working/i.test(filtered), false);
});

test('a cart lie is rewritten from live facts even without a named check', () => {
  const filtered = filterDeskChatClaims(
    'Here is the shop. Add to Cart is ready on Preview.',
    { checks: [], facts: { hasCart: false } },
    'studio',
  );
  assert.match(filtered, /Here is the shop/);
  assert.match(filtered, /does not have a working Add to Cart/);
  assert.equal(/Add to Cart is ready/i.test(filtered), false);
});

/*
 * THE INCIDENT (2026-09-04). A user's screenshot of the Coding desk showed a
 * reply reading "...wired them into the nav.Nav clicking..." and "...for a
 * consulting business.Generated files remain on the Coding desk". Two missing
 * spaces in one message.
 *
 * They were not the model's, and not the renderer's: splitKeep()'s leading
 * `[^\n.!?]+` is required and cannot match a newline, so a '\n\n' following a
 * sentence-ending '.' matched nothing — and String.match(/g) drops what it does
 * not match. out.join('') then welded the paragraphs together.
 *
 * The tell is that a markdown newline renders as a SPACE. There was none, so
 * the character had been deleted rather than collapsed.
 *
 * This filter runs on EVERY coding-desk reply whenever any rule is active, and
 * an absent desk packet makes all eight 'unverified' — so this was not an edge
 * case, it was the default path.
 */

test('[was-red] paragraph breaks survive the filter', () => {
  const original = [
    "I've added all three and wired them into the nav.",
    'Nav clicking and smooth scroll still work the same way.',
    'Generated files remain on the Coding desk; Preview still needs to run them.',
  ].join('\n\n');

  const filtered = filterDeskChatClaims(original, null, 'studio');

  assert.equal(filtered, original, 'text with no control claim must pass through byte for byte');
  assert.doesNotMatch(filtered, /nav\.Nav/, 'the exact string from the screenshot must not reappear');
  assert.doesNotMatch(filtered, /business\.Generated|way\.Generated/, 'nor the second one');
  assert.equal((filtered.match(/\n\n/g) || []).length, 2, 'both paragraph breaks survive');
});

test('[was-red] the split is lossless — it may never drop a character', () => {
  /*
   * The instance was one lost '\n\n'. The CLASS is a split that can silently
   * drop input, so this asserts the property rather than the symptom: for text
   * carrying no control claim, the filter is the identity function (modulo the
   * trailing trim and the \n{3,} collapse it performs on purpose).
   *
   * A null packet activates all eight rules, so the split really runs here.
   */
  const corpus = [
    'abc.\n\ndef',
    'One sentence. Two sentence.',
    'Line one\nline two',
    'Para one.\n\nPara two.\n\nPara three.',
    'Ends with a newline.\n',
    '\n\nLeading newlines.',
    '...leading dots',
    'Trailing dots...',
    'Bang!\n\nQuestion?\n\nDone.',
    'No punctuation at all',
    'Mixed!?!\n\nnext',
    '1. list item\n2. second item',
    'a.b.c',
    '\n',
    '.',
    'Tab\tand  double  spaces.\n\nAfter.',
  ];

  for (const original of corpus) {
    const expected = original.replace(/\n{3,}/g, '\n\n').trim();
    assert.equal(
      filterDeskChatClaims(original, null, 'studio'),
      expected,
      `the filter dropped characters from ${JSON.stringify(original)}`,
    );
  }
});

test('a rewritten claim still separates from the prose around it', () => {
  /*
   * The fix must not buy losslessness by disabling the rewrite. A lie is still
   * replaced — and the paragraph it sat in still ends where it did.
   */
  const original = 'Here is the shop.\n\nAdd to Cart is working now.\n\nTell me what to change.';
  const filtered = filterDeskChatClaims(original, {
    checks: [{ id: 'cart', ok: false, state: 'fix' }],
    facts: { hasCart: false },
  }, 'studio');

  assert.doesNotMatch(filtered, /Add to Cart is working now/, 'the lie must still be rewritten');
  assert.match(filtered, /Preview does not have a working Add to Cart yet\./);
  assert.match(filtered, /Here is the shop\./);
  assert.match(filtered, /Tell me what to change\./);
  assert.doesNotMatch(filtered, /yet\.Tell me/, 'and the replacement must not weld onto the next sentence');
});

/*
 * ---------------------------------------------------------------------------
 * THE DESK MUST NOT REWRITE ITS OWN MACHINE-READABLE BLOCKS.
 *
 * Production, 2026-09-05 04:05 UTC — deployed golden on main 6c39d6f, guided
 * intake: "Unterminated string in JSON at position 83 | near: t confirmed Add
 * to Cart yet." Those bytes are THIS FILE's cart wording, "Preview has not
 * confirmed Add to Cart yet.", written into the decision modal's JSON in place
 * of the sentence-run that mentioned Add to Cart next to a ready-word. The
 * closing tag survived, the string never closed, and the reader refused to
 * invent the rest — correctly. Two rounds had gone to a markdown fence and to
 * truncation before the bytes were read (§8); the earlier "position 106" was
 * the same wording at another offset.
 *
 * The rule: a <quantora-modal> block and a fenced code block are artifacts,
 * not prose. The filter's rules read sentences; a JSON value is not a
 * sentence, and a code comment is not a claim.
 * ---------------------------------------------------------------------------
 */

const INTAKE_QUESTION = 'Should the site sell online, so customers can add to cart and check out, or showcase the collection for store visits?';
const INTAKE_MODAL = [
  '<quantora-modal>',
  `{"question": "${INTAKE_QUESTION}", "options": [{"id": "sell", "title": "Sell online", "description": "Add to Cart and checkout are live from day one"}, {"id": "showcase", "title": "Showcase only", "description": "Catalogue and enquiries, no cart"}]}`,
  '</quantora-modal>',
].join('\n');
const INTAKE_REPLY = [
  'A boutique with that mix really works best when the site knows whether it is meant to close sales or bring people into the store.',
  '',
  INTAKE_MODAL,
].join('\n');

test('[was-red] a decision modal is never rewritten — the desk must not corrupt its own artifact', () => {
  // No desk packet: every rule reads 'unverified', which is the state at intake.
  const filtered = filterDeskChatClaims(INTAKE_REPLY, null, 'coding');
  const modal = readAssistantModal(filtered);
  assert.equal(modal.failure, null, `the modal came back unreadable — the parser said: ${modal.failure}`);
  assert.equal(modal.modalData?.question, INTAKE_QUESTION);
  assert.equal(modal.modalData?.options?.length, 2, 'both options survive, including the one that says "live"');
  assert.doesNotMatch(filtered, /Preview has not confirmed/, 'nothing in this reply was a claim, so no disclaimer belongs anywhere in it');
});

test('the prose around a modal is still filtered — protecting the artifact does not switch the filter off', () => {
  const filtered = filterDeskChatClaims(`Add to Cart is live already, you can test it.\n\n${INTAKE_MODAL}`, null, 'coding');
  assert.match(filtered, /^Preview has not confirmed Add to Cart yet\./, 'the prose lie is rewritten');
  const modal = readAssistantModal(filtered);
  assert.equal(modal.failure, null, modal.failure);
  assert.equal(modal.modalData?.options?.[0]?.description, 'Add to Cart and checkout are live from day one');
});

test('an unclosed modal — the block still streaming — is left alone to the end of the text', () => {
  const streaming = 'One question first.\n\n<quantora-modal>\n{"question": "Sell online with Add to Cart, live from';
  assert.equal(filterDeskChatClaims(streaming, null, 'coding'), streaming);
});

test('a fenced code block is an artifact too — a comment is not a claim', () => {
  const reply = 'Here is the cart module.\n\n```js\n// Add to Cart is live and working\nexport const cart = [];\n```\n\nAdd to Cart is live in Preview now.';
  const filtered = filterDeskChatClaims(reply, null, 'coding');
  assert.match(filtered, /\/\/ Add to Cart is live and working/, 'the code is untouched');
  assert.match(filtered, /Preview has not confirmed Add to Cart yet\./, 'the prose claim after it is still rewritten');
});

test('the deployed golden can recognise the filter\'s hand from a 60-character parser window', () => {
  // The evidence from production, 2026-09-05 04:05 UTC, verbatim.
  assert.equal(claimFilterWroteThis('Unterminated string in JSON at position 83 (line 2 column 83) | near: t confirmed Add to Cart yet. '), true);
  // An ordinary model sentence at the same offset is not the filter's.
  assert.equal(claimFilterWroteThis('Unterminated string in JSON at position 106 (line 2 column 106) | near: r showcase the collection? '), false);
  assert.equal(claimFilterWroteThis(''), false);
});

test('whitespace the filter normalises is not reported as a rewrite', () => {
  const original = 'Nothing here mentions a control.\n\n\n\nStill nothing.\n';
  const filtered = filterDeskChatClaims(original, null, 'coding');
  assert.notEqual(filtered, original, 'premise: the filter did normalise whitespace');
  assert.equal(deskChatClaimWasFiltered(original, filtered), false, 'no sentence changed, so the hook the golden reads must stay off');
  const lie = 'Add to Cart is live now.';
  assert.equal(deskChatClaimWasFiltered(lie, filterDeskChatClaims(lie, null, 'coding')), true);
});

test('segmenting a reply is lossless — it may never drop a character', () => {
  const corpus = [
    INTAKE_REPLY,
    'prose only\n\nmore prose.',
    '```js\nconst a = 1;\n```',
    'lead\n\n<quantora-modal>{"question":"x?"}</quantora-modal>\n\ntrail\n\n```\nunclosed fence',
    '<quantora-modal>\n{"question": "still streaming',
    '',
  ];
  for (const text of corpus) {
    assert.equal(segmentDeskReply(text).map((segment) => segment.text).join(''), text);
  }
});
