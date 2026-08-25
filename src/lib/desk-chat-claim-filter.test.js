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
