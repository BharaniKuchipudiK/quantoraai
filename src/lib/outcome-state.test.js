import assert from 'node:assert/strict';
import test from 'node:test';
import { contextToOutcomeState } from './outcome-state.js';

test('model-derived context remains inferred', () => {
  const state = contextToOutcomeState({ goal: 'Launch the shop', facts: ['Use orange'] }, {
    sourceTurn: 'assistant-1', confirmed: false, consented: true,
  });
  assert.equal(state.goal.status, 'draft');
  assert.equal(state.assumptions[0].status, 'inferred');
});

test('direct user choices become confirmed with provenance', () => {
  const state = contextToOutcomeState({ goal: 'Launch the shop', facts: ['Pickup only'] }, {
    sourceTurn: 'user-2', confirmed: true, consented: true,
  });
  assert.equal(state.goal.status, 'confirmed');
  assert.equal(state.assumptions[0].status, 'confirmed');
  assert.equal(state.assumptions[0].sourceTurn, 'user-2');
});

test('working-note edits preserve Cognitive Ledger history', () => {
  const existingState = {
    cognitiveLedger: [{
      id: 'reject-1',
      type: 'rejection',
      statement: 'Do not use the old layout again',
      actor: 'user',
      status: 'active',
    }],
  };
  const state = contextToOutcomeState({ goal: 'Improve the homepage' }, {
    existingState,
    sourceTurn: 'user-3',
    confirmed: true,
    consented: true,
  });

  assert.equal(state.cognitiveLedger.length, 1);
  assert.equal(state.cognitiveLedger[0].id, 'reject-1');
});
