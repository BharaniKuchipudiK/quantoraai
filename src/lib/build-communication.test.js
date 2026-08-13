import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChatDisplayText,
  isFeatureSuggestionRequest,
  stripArtifactFromChatDisplay,
} from './build-communication.js';

test('stripArtifactFromChatDisplay removes html fences', () => {
  const raw = 'I added a reviews section.\n\n```html\n<!DOCTYPE html><html></html>\n```';
  assert.equal(stripArtifactFromChatDisplay(raw), 'I added a reviews section.');
});

test('getChatDisplayText falls back when only html returned', () => {
  const raw = '```html\n<!DOCTYPE html><html></html>\n```';
  assert.match(getChatDisplayText(raw, { artifactHtml: '<html></html>' }), /preview panel/i);
});

test('isFeatureSuggestionRequest detects add-a-feature chip', () => {
  assert.equal(
    isFeatureSuggestionRequest('Suggest one high-impact feature we could add — explain why it helps and ask what I think before building.'),
    true,
  );
  assert.equal(isFeatureSuggestionRequest('Yes, build the reviews section'), false);
});
