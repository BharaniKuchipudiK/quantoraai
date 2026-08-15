import assert from 'node:assert/strict';
import test from 'node:test';
import { contextToOutcomeState, outcomeStateToConversationContext } from './outcome-state.js';

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

test('only confirmed durable facts are restored into conversation context', () => {
  const ctx = outcomeStateToConversationContext({
    goal: { statement: 'Plan launch' },
    assumptions: [
      { value: 'Confirmed fact', status: 'confirmed' },
      { value: 'Model guess', status: 'inferred' },
    ],
  });
  assert.deepEqual(ctx.facts, ['Confirmed fact']);
});
