import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldShowAssistantDecisionCard } from './studio-choices.js';

test('a decision card hides after the user answers that turn', () => {
  const messages = [
    { id: 'ai-1', sender: 'ai', text: 'How long?' },
    { id: 'user-1', sender: 'user', text: '10–14 days Tokyo + Kyoto' },
  ];
  assert.equal(shouldShowAssistantDecisionCard({
    messageId: 'ai-1',
    messages,
  }), false);
});

test('a decision card stays until there is an answer', () => {
  assert.equal(shouldShowAssistantDecisionCard({
    messageId: 'ai-1',
    messages: [{ id: 'ai-1', sender: 'ai', text: 'How long?' }],
  }), true);
});

test('choiceUsed hides the card even before the next user bubble lands', () => {
  assert.equal(shouldShowAssistantDecisionCard({
    choiceUsed: true,
    messageId: 'ai-1',
    messages: [{ id: 'ai-1', sender: 'ai', text: 'How long?' }],
  }), false);
});
