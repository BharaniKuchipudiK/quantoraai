import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChatDisplayText,
  stripArtifactFromChatDisplay,
} from './build-communication.js';

test('stripArtifactFromChatDisplay removes html fences', () => {
  const raw = 'I added a reviews section.\n\n```html\n<!DOCTYPE html><html></html>\n```';
  assert.equal(stripArtifactFromChatDisplay(raw), 'I added a reviews section.');
});

test('strips NON-html code fences too (the leaked-CSS presentation bug)', () => {
  // Mirrors the screenshot: prose brief followed by a css/other fenced block.
  const raw = "Here's your presentation.\n\n```css\n@import url('https://fonts.googleapis.com/css2');\nbody { font-family: 'Plus Jakarta Sans'; }\n.slide-shadow { box-shadow: 0 20px 50px; }\n```";
  assert.equal(stripArtifactFromChatDisplay(raw), "Here's your presentation.");
});

test('strips an unclosed fence that is still streaming', () => {
  const raw = 'Building your deck.\n\n```html\n<!DOCTYPE html><html><style>@import url(x);';
  assert.equal(stripArtifactFromChatDisplay(raw), 'Building your deck.');
});

test('strips multiple fenced blocks, keeps the prose brief', () => {
  const raw = 'Done.\n\n```js\nconst a=1;\n```\n\nExtra note.\n\n```html\n<div></div>\n```';
  assert.equal(stripArtifactFromChatDisplay(raw), 'Done.\n\nExtra note.');
});

test('deck-only reply gets a presentation-aware brief', () => {
  const raw = '```html\n<!DOCTYPE html><html><body><section class="slide"></section></body></html>\n```';
  assert.match(getChatDisplayText(raw, { artifactHtml: '<section class="slide">' }), /presentation is ready/i);
});

test('getChatDisplayText never truncates a normal (long) reply', () => {
  const long = `${'This is a sentence. '.repeat(60)}`.trim();
  const out = getChatDisplayText(long);
  assert.equal(out, long); // full text, no cap, no ellipsis
  assert.ok(!/…$/.test(out));
});

test('getChatDisplayText falls back when only html returned', () => {
  const raw = '```html\n<!DOCTYPE html><html></html>\n```';
  assert.match(getChatDisplayText(raw, { artifactHtml: '<html></html>' }), /preview panel/i);
});
