import assert from 'node:assert/strict';
import test from 'node:test';
import { isSummarizable, resolveMessageActions } from './message-actions.js';

test('one-line replies are NOT summarizable', () => {
  assert.equal(isSummarizable('Yes, it will rain tomorrow afternoon.'), false);
  assert.equal(isSummarizable('Singapore.'), false);
  assert.equal(isSummarizable(''), false);
});

test('long / multi-paragraph replies ARE summarizable', () => {
  assert.equal(isSummarizable('a '.repeat(120)), true);              // many words
  assert.equal(isSummarizable('x'.repeat(600)), true);               // long
  assert.equal(isSummarizable('Para one.\n\nPara two.\n\nPara three.'), true); // 3 paragraphs
});

test('resolveMessageActions: one-liner shows no summarize, no preview', () => {
  const a = resolveMessageActions({ text: 'Singapore.', hasPreview: false });
  assert.equal(a.summarize, false);
  assert.equal(a.preview, false);
  assert.equal(a.copy, true);
  assert.equal(a.regenerate, true);
});

test('resolveMessageActions: normal previewable code enables preview', () => {
  const a = resolveMessageActions({ text: '```html\n<div/>\n```', hasPreview: true });
  assert.equal(a.preview, true);
});

test('resolveMessageActions: generated PowerPoint stays in inline workspace', () => {
  const a = resolveMessageActions({
    text: '✅ Successfully generated powerpoint document from the approved briefing.',
    hasPreview: true,
  });
  assert.equal(a.preview, false);
});

test('resolveMessageActions: refined PowerPoint stays in inline workspace', () => {
  const a = resolveMessageActions({
    text: '✅ Successfully updated the powerpoint document from the active verified artifact.',
    hasPreview: true,
  });
  assert.equal(a.preview, false);
});

test('overflow always has items (so "…" is never a dead button), and read-aloud only with text', () => {
  assert.deepEqual(resolveMessageActions({ text: 'hello' }).overflow, ['read-aloud', 'report']);
  assert.deepEqual(resolveMessageActions({ text: '' }).overflow, ['report']);
});
