import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const domainSource = fs.readFileSync(new URL('./studio-domains.ts', import.meta.url), 'utf8');
const routingSource = fs.readFileSync(new URL('./study-cognitive-routing.ts', import.meta.url), 'utf8');

test('the turn-specific governed directive owns newly supported lab kinds', () => {
  assert.match(routingSource, /<quantora-study-lab kind="linear-function" \/>/);
  assert.match(routingSource, /supported Study workspace for this turn/i);
});

test('the base Study prompt does not grant generic permission to invent labs', () => {
  assert.match(domainSource, /Study has no separate Preview canvas/);
  assert.doesNotMatch(domainSource, /use any quantora-study-lab kind/i);
});
