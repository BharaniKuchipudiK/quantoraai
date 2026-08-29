import assert from 'node:assert/strict';
import test from 'node:test';
import { miniPracticeFor } from './study-practice-desk.js';

test('mini-practice is generated from the session topic, not a canned problem pack', () => {
  const practice = miniPracticeFor('session.thermal-properties', 'thermal properties');
  assert.match(practice.title, /thermal properties/i);
  assert.match(practice.setup, /thermal properties/i);
  const packed = JSON.stringify(practice);
  assert.doesNotMatch(packed, /15 kg/);
  assert.doesNotMatch(packed, /crate/i);
});
