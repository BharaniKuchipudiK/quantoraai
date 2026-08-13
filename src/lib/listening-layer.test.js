import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeOneShotListeningSignals,
  QUANTORA_EVENTS,
} from './listening-layer.js';

test('consumes outcome gaps after one request while retaining other signals', () => {
  const signals = [
    { type: QUANTORA_EVENTS.OUTCOME_GAP_DETECTED, label: 'Add direct links' },
    { type: QUANTORA_EVENTS.CHOICE_SELECTED, label: 'Chose: Bali' },
  ];

  const remaining = consumeOneShotListeningSignals(signals);

  assert.deepEqual(remaining, [signals[1]]);
  assert.equal(signals.length, 2);
});
