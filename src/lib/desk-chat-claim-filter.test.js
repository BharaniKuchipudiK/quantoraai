import assert from 'node:assert/strict';
import test from 'node:test';
import { deskChatClaimWasFiltered, filterDeskChatClaims } from './desk-chat-claim-filter.js';

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
