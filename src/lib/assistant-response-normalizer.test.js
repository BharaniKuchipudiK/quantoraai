import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatConversationalProse,
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

test('malformed protocol metadata cannot discard later visible prose', () => {
  const raw = `First visible paragraph.\n<!-- quantora-ctx:{"goal":"broken"\nThis sentence must remain visible to the user.`;
  const normalized = normalizeAssistantResponse(raw);

  assert.match(normalized.displayText, /First visible paragraph/);
  assert.match(normalized.displayText, /This sentence must remain visible/);
  assert.doesNotMatch(normalized.displayText, /quantora-ctx/);
});

test('long plain prose is broken into readable conversational paragraphs', () => {
  const prose = [
    'Quantora should understand the request before it starts proposing implementation details.',
    'That keeps the response anchored to the user rather than to internal architecture.',
    'The next part should explain the recommendation in direct language that is easy to scan.',
    'A separate paragraph should then cover the most important tradeoff without turning into a wall of text.',
    'Finally the answer should end once the immediate need has been met instead of adding filler.',
    'This makes the exchange feel like a conversation rather than a generated memo.',
  ].join(' ');

  const formatted = formatConversationalProse(prose);
  assert.match(formatted, /\n\n/);
  assert.equal(formatted.replace(/\n\n/g, ' '), prose);
});

test('structured markdown is never auto-reformatted', () => {
  const markdown = `# Recommendation\n\n- Keep the gateway\n- Preserve provider neutrality\n\n${'A'.repeat(450)}`;
  assert.equal(formatConversationalProse(markdown), markdown);
});
