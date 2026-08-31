import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockedReason,
  chipEnabled,
  flightSourceNote,
  flightsBlockedNote,
  staysBlockedNote,
} from './travel-provider-notice.js';

test('sandbox fares are never called live', () => {
  const note = flightSourceNote('test', 'Duffel');
  assert.doesNotMatch(note, /\blive\b/i, 'the word that made the claim false');
  assert.match(note, /sandbox/i);
  assert.match(note, /not real availability/i);
});

test('live fares say so', () => {
  assert.match(flightSourceNote('live', 'Duffel'), /^Live from Duffel\./);
});

test('an unknown mode is shown but not vouched for', () => {
  const note = flightSourceNote('other', 'Duffel');
  assert.doesNotMatch(note, /\blive\b/i);
  assert.match(note, /unverified/i);
});

test('every note keeps the no-booking promise', () => {
  for (const mode of ['live', 'test', 'other', undefined]) {
    assert.match(flightSourceNote(mode), /do not book/i, `mode ${mode}`);
  }
});

test('a missing source name never leaves a hole in the sentence', () => {
  assert.match(flightSourceNote('live', ''), /Live from Duffel\./);
  assert.match(flightSourceNote('test', null), /Duffel sandbox/);
});

test('an unconnected provider is said before the tap, and invents nothing', () => {
  for (const note of [flightsBlockedNote(), staysBlockedNote()]) {
    assert.match(note, /not connected/i);
    assert.match(note, /will not invent/i);
  }
});

test('a chip is dark when the provider cannot answer', () => {
  assert.equal(chipEnabled({ tripReady: true, configured: false }), false);
  assert.equal(chipEnabled({ tripReady: true, configured: true }), true);
  assert.equal(chipEnabled({ tripReady: false, configured: true }), false, 'the trip still has to be ready');
});

test('unknown readiness never disables a working board', () => {
  // A health check that has not answered, or failed outright. Letting that
  // dark a chip would break the desk over a diagnostic.
  assert.equal(chipEnabled({ tripReady: true, configured: null }), true);
  assert.equal(blockedReason({ kind: 'flights', tripReady: true, configured: null }), '');
});

test('the reason appears only when there is something to explain', () => {
  assert.match(blockedReason({ kind: 'flights', tripReady: true, configured: false }), /flight search is not connected/i);
  assert.match(blockedReason({ kind: 'hotels', tripReady: true, configured: false }), /place search is not connected/i);
  assert.equal(blockedReason({ kind: 'flights', tripReady: true, configured: true }), '');
  assert.equal(blockedReason({ kind: 'flights', tripReady: false, configured: false }), '', 'an incomplete trip is not a provider problem');
});

/*
 * THE REGRESSION, KEPT AS A TEST.
 *
 * The board shipped `Live from ${result.source}` for any successful search.
 * The one deployment holding a Duffel token held a duffel_test_ one, so the
 * only environment that could show fares was the one calling its sandbox
 * live. The string predated the wiring, but nothing rendered it — wiring the
 * board is what turned a latent falsehood into a shipped one.
 *
 * The claim is only ever safe when a mode decided it, so the component must
 * not be able to write it directly again.
 */
test('the board cannot claim "live" without a mode deciding it', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = fileURLToPath(new URL('../components/TravelTripBoard.jsx', import.meta.url));
  const source = readFileSync(path, 'utf8');

  const code = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

  assert.doesNotMatch(code, /['"`]Live from/i, 'provenance belongs to flightSourceNote, not a template string');
  assert.match(code, /flightSourceNote\(/, 'and the board must actually route through it');
});
