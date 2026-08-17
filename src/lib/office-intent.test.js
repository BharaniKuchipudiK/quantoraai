import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OFFICE_KIND,
  clearOfficeToolSelection,
  detectOfficeIntent,
  officeKindFromTool,
  isPresentationIntent,
  isOfficeIntent,
  rememberOfficeToolSelection,
  sanitizeOfficeFilename,
} from './office-intent.js';

test('explicit tool selection wins over text', () => {
  clearOfficeToolSelection();
  assert.equal(detectOfficeIntent({ selectedTool: 'Excel', messages: [{ sender: 'user', text: 'a slide deck' }] }), OFFICE_KIND.EXCEL);
  assert.equal(officeKindFromTool('PowerPoint'), OFFICE_KIND.POWERPOINT);
  assert.equal(officeKindFromTool('nonsense'), null);
});

test('Tools-menu Office choice survives a completely rewritten prompt exactly once', () => {
  clearOfficeToolSelection();
  assert.equal(rememberOfficeToolSelection('PowerPoint'), OFFICE_KIND.POWERPOINT);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'Should we build an AI travel agent?' }] }), OFFICE_KIND.POWERPOINT);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'Should we build an AI travel agent?' }] }), null);
});

test('selecting a non-Office tool clears stale Office intent', () => {
  rememberOfficeToolSelection('PowerPoint');
  rememberOfficeToolSelection('Search');
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'AI travel agents' }] }), null);
});

test('detects each kind from user text', () => {
  clearOfficeToolSelection();
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'Make a PowerPoint about Mars' }] }), OFFICE_KIND.POWERPOINT);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'build me a spreadsheet of expenses' }] }), OFFICE_KIND.EXCEL);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'draft a word document' }] }), OFFICE_KIND.WORD);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'generate a PDF summary' }] }), OFFICE_KIND.PDF);
});

test('does NOT false-positive on non-office uses of similar words', () => {
  clearOfficeToolSelection();
  // "sundeck" / "deck of the boat" must not read as a slide deck.
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'a landing page for a sundeck furniture shop' }] }), null);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'photos of the deck of the boat' }] }), null);
});

test('only user turns count, not assistant echoes', () => {
  clearOfficeToolSelection();
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'ai', text: 'here is your powerpoint' }] }), null);
});

test('isPresentationIntent / isOfficeIntent convenience', () => {
  clearOfficeToolSelection();
  assert.equal(isPresentationIntent([{ sender: 'user', text: 'presentation on climate' }]), true);
  assert.equal(isPresentationIntent([{ sender: 'user', text: 'a react todo app' }]), false);
  assert.equal(isOfficeIntent({ messages: [{ sender: 'user', text: 'an excel budget' }] }), true);
  assert.equal(isOfficeIntent({ messages: [{ sender: 'user', text: 'a coffee shop website' }] }), false);
});

test('sanitizeOfficeFilename strips extension/path/unsafe chars', () => {
  assert.equal(sanitizeOfficeFilename('My Deck.pptx'), 'My Deck');
  assert.equal(sanitizeOfficeFilename('../../etc/passwd'), 'etc passwd');
  assert.equal(sanitizeOfficeFilename(''), 'quantora-document');
  assert.equal(sanitizeOfficeFilename('', 'fallback-x'), 'fallback-x');
});
