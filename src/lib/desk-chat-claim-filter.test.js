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

test('a job card without a live check still blocks the add-item lie', () => {
  const filtered = filterDeskChatClaims(
    'Items can be added on Preview.',
    { job: { purpose: 'A to-do list', mustWork: ['Items can still be added'] }, checks: [], facts: {} },
    'studio',
  );
  assert.equal(filtered, 'Preview cannot add an item yet.');
});

test('no packet means the reply is left alone', () => {
  assert.equal(filterDeskChatClaims('Add to Cart is ready.', null, 'studio'), 'Add to Cart is ready.');
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
