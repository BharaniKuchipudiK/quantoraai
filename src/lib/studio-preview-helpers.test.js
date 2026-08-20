import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHtmlFromResponse, preparePreviewHtml } from './studio-preview-helpers.js';

test('extractHtmlFromResponse strips filepath metadata from an HTML fence', () => {
  const raw = [
    '```html filepath="index.html"',
    '<!doctype html><html><body><h1>Mission Control</h1></body></html>',
    '```',
  ].join('\n');

  const html = extractHtmlFromResponse(raw);
  assert.equal(html, '<!doctype html><html><body><h1>Mission Control</h1></body></html>');
  assert.equal(html.includes('filepath='), false);
});

test('preparePreviewHtml keeps normal HTML fences working', () => {
  const raw = '```html\n<html><body>OK</body></html>\n```';
  assert.equal(preparePreviewHtml(raw), '<html><body>OK</body></html>');
});
