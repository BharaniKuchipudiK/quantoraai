import assert from 'node:assert/strict';
import test from 'node:test';
import { detectProactiveNudge } from './proactive-nudges.js';

test('does not show travel nudge on HTML build responses', () => {
  const nudge = detectProactiveNudge(
    'build a website for my coffee shop',
    '```html\n<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css"></head></html>\n```',
    'Sriya',
    { studioMode: 'build', guidedIntake: true },
  );
  assert.equal(nudge, null);
});

test('shows site-ready nudge after build preview exists', () => {
  const nudge = detectProactiveNudge(
    'build my coffee shop site',
    'Here is your site.',
    'Sriya',
    { studioMode: 'build', hasPreview: true },
  );
  assert.match(nudge.text, /site is ready to preview/i);
});

test('shows travel-specific nudge for travel URL requests', () => {
  const nudge = detectProactiveNudge(
    'share hotel links for Bali',
    'Try https://example.com/hotel',
    'Bharani',
    { studioDomain: 'travel', studioMode: 'ask' },
  );
  assert.match(nudge.text, /beach, rooms, and facilities/i);
});
