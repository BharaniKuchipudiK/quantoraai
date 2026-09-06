import assert from 'node:assert/strict';
import test from 'node:test';
import { UNCHANGED_DESK_FAILURE_DETAIL, deskChangedThisTurn } from './desk-edit-proof.js';

const site = (heading) => ({
  'package.json': '{"name":"app"}',
  'src/App.jsx': `export default function App() { return <h1>${heading}</h1>; }`,
});

test('a desk that holds exactly the files it held before the turn cannot vouch for the turn (the 2026-09-06 iterate-heading defect)', () => {
  const verdict = deskChangedThisTurn({ before: site('Ramakrishna Venuzia Owners Welfare Association'), after: site('Ramakrishna Venuzia Owners Welfare Association') });
  assert.equal(verdict.changed, false);
  assert.match(verdict.reason, /exactly the files it held before/);
  assert.match(UNCHANGED_DESK_FAILURE_DETAIL, /returned no files/);
});

test('a desk whose files changed during the turn, or that skills repaired, vouches for it', () => {
  assert.equal(deskChangedThisTurn({ before: site('Old heading'), after: site('Golden Harvest Community Portal') }).changed, true);
  assert.equal(deskChangedThisTurn({ before: site('Same'), after: site('Same'), repaired: true }).changed, true);
  assert.equal(deskChangedThisTurn({ before: {}, after: site('First build') }).changed, true);
});

test('an empty desk after the turn is no proof, and fingerprints may be passed instead of files', () => {
  assert.equal(deskChangedThisTurn({ before: {}, after: {} }).changed, false);
  assert.equal(deskChangedThisTurn({ before: '2-abc', after: '2-abc' }).changed, false);
  assert.equal(deskChangedThisTurn({ before: '2-abc', after: '2-abd' }).changed, true);
});
