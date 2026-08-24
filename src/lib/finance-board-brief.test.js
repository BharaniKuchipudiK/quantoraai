import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveFinanceBrief, FINANCE_ACTIONS } from './finance-board-brief.js';

test('inactive until the user has spoken', () => {
  assert.equal(deriveFinanceBrief({ messages: [] }).active, false);
  assert.equal(deriveFinanceBrief({}).active, false);
  assert.equal(deriveFinanceBrief({ messages: [{ sender: 'ai', text: 'hi' }] }).active, false);
});

test('active once a user turn exists, and offers the four tools', () => {
  const brief = deriveFinanceBrief({ messages: [{ sender: 'user', text: 'help with money' }] });
  assert.equal(brief.active, true);
  assert.equal(brief.actions.length, 4);
  assert.deepEqual(brief.actions.map((a) => a.id), ['fx', 'debt', 'savings', 'afford']);
});

test('every action carries an editable label + prompt template', () => {
  for (const action of FINANCE_ACTIONS) {
    assert.ok(action.id && action.label && action.prompt, 'action is fully specified');
  }
});
