import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAssistantDisplayText,
  normalizeAssistantResponse,
  sanitizeAssistantStream,
} from './assistant-response-normalizer.js';

const visibleAnswer = 'Morning is the best window. Keep an umbrella nearby.';
const continues = '<!-- quantora-continues:{"prompt":"Where next?","items":[{"id":"c1","label":"Back to app","value":"Return to the app architecture."}]} -->';
const context = '<!-- quantora-ctx:{"goal":"Build a radio app","facts":["User is vegan"]} -->';

test('normalizes Quantora protocol metadata without exposing it to users', () => {
  const normalized = normalizeAssistantResponse(`${visibleAnswer}\n\n${continues}\n${context}`);

  assert.equal(normalized.displayText, visibleAnswer);
  assert.equal(normalized.continueSet?.items[0]?.label, 'Back to app');
  assert.equal(normalized.contextUpdate?.goal, 'Build a radio app');
  assert.deepEqual(normalized.contextUpdate?.facts, ['User is vegan']);
});

test('hides a protocol marker as soon as it begins streaming', () => {
  assert.equal(
    sanitizeAssistantStream(`${visibleAnswer}\n\n<!-- quantora-continues:{"prompt":"Whe`),
    visibleAnswer,
  );
});

test('defensively cleans historical Arena responses', () => {
  const leakedArenaText = `${visibleAnswer}\n\n${continues}\n${context}`;
  assert.equal(getAssistantDisplayText(leakedArenaText), visibleAnswer);
  assert.doesNotMatch(getAssistantDisplayText(leakedArenaText), /quantora-(continues|ctx)/);
});
