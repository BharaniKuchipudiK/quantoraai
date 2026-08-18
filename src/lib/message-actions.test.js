import assert from 'node:assert/strict';
import test from 'node:test';
import { isSummarizable, resolveMessageActions } from './message-actions.js';

test('one-line replies are NOT summarizable', () => {
  assert.equal(isSummarizable('Yes, it will rain tomorrow afternoon.'), false);
  assert.equal(isSummarizable('Singapore.'), false);
  assert.equal(isSummarizable(''), false);
});

test('long / multi-paragraph replies ARE summarizable', () => {
  assert.equal(isSummarizable('a '.repeat(120)), true);
  assert.equal(isSummarizable('x'.repeat(600)), true);
  assert.equal(isSummarizable('Para one.\n\nPara two.\n\nPara three.'), true);
});

test('resolveMessageActions: one-liner shows no summarize, no preview', () => {
  const a = resolveMessageActions({ text: 'Singapore.', hasPreview: false });
  assert.equal(a.summarize, false);
  assert.equal(a.preview, false);
  assert.equal(a.copy, true);
  assert.equal(a.regenerate, true);
});

test('resolveMessageActions: normal previewable code enables preview', () => {
  const a = resolveMessageActions({ text: '```html\n<div/>\n```', hasPreview: true, isOfficeArtifact: false });
  assert.equal(a.preview, true);
});

test('resolveMessageActions: Office artifact state keeps generated presentation in inline workspace', () => {
  const a = resolveMessageActions({
    text: 'Any assistant wording is allowed here.',
    hasPreview: true,
    isOfficeArtifact: true,
  });
  assert.equal(a.preview, false);
});

test('resolveMessageActions: Office handling does not depend on success-message wording', () => {
  const a = resolveMessageActions({
    text: '✅ Successfully generated powerpoint document from the approved briefing.',
    hasPreview: true,
    isOfficeArtifact: false,
  });
  assert.equal(a.preview, true);
});

test('overflow always has items (so "…" is never a dead button), and read-aloud only with text', () => {
  assert.deepEqual(resolveMessageActions({ text: 'hello' }).overflow, ['read-aloud', 'report']);
  assert.deepEqual(resolveMessageActions({ text: '' }).overflow, ['report']);
});
