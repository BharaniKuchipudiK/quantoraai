import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPclContinuityToOutcomeState } from './pcl-outcome-sync.js';

test('assistant continuity stays inferred while direct user answers become confirmed', () => {
  const state = applyPclContinuityToOutcomeState({}, {
    assistantContext: {
      goal: 'Prepare the decision pack',
      facts: ['Use phased migration'],
    },
    confirmedUserFact: 'Budget is SGD 250,000',
    sourceTurn: 'turn-7',
  });

  assert.equal(state.memory.consented, true);
  assert.equal(state.goal.status, 'draft');
  assert.equal(state.assumptions.find((item) => item.value === 'Use phased migration')?.status, 'inferred');
  assert.equal(state.assumptions.find((item) => item.value === 'Budget is SGD 250,000')?.status, 'confirmed');
});

test('continuity projection preserves existing Cognitive Ledger history', () => {
  const state = applyPclContinuityToOutcomeState({
    cognitiveLedger: [{ id: 'reject-1', type: 'rejection', statement: 'Do not use batch sync', actor: 'user', status: 'active' }],
    assumptions: [],
    definitionOfDone: [],
    constraints: [],
    openQuestions: [],
    decisions: [],
    artifacts: [],
    nextActions: [],
    memory: { scope: 'session', consented: true },
    safety: { unresolvedFlags: [] },
  }, {
    assistantContext: { understanding: 'Use API pull instead' },
    sourceTurn: 'turn-8',
  });

  assert.equal(state.cognitiveLedger.length, 1);
  assert.equal(state.cognitiveLedger[0].id, 'reject-1');
});
