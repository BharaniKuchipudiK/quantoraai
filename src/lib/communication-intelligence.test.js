import assert from 'node:assert/strict';
import test from 'node:test';
import {
  learnFromChipSelection,
  formatListeningSignalsForPrompt,
  inferConversationStage,
} from './communication-intelligence.js';
import { QUANTORA_EVENTS } from './listening-layer.js';

test('learnFromChipSelection records choice as session fact', () => {
  const next = learnFromChipSelection({}, { label: 'Day-by-day plan', value: 'Build itinerary' });
  assert.match(next.facts[0], /Day-by-day plan/);
});

test('choosing Publish this site is remembered as a website publish confirmation', () => {
  const next = learnFromChipSelection({}, { label: 'Publish this site', value: 'Publish this website to Vercel' });
  assert.ok(next.facts.some((fact) => /publish the website to vercel/i.test(fact)));
});

test('formatListeningSignalsForPrompt summarizes recent behavior', () => {
  const text = formatListeningSignalsForPrompt([
    { type: 'choice_selected', label: 'Chose: Day-by-day plan' },
  ]);
  assert.match(text, /Day-by-day plan/);
  assert.match(text, /RECENT USER BEHAVIOR/);
});

test('inferConversationStage detects itinerary readiness', () => {
  const stage = inferConversationStage({
    facts: ['March dates', 'solo traveler'],
  }, 'travel');
  assert.equal(stage, 'ready_for_itinerary');
});
