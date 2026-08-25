import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCodingTurnOutcome } from './coding-outcome-spine.js';
import { assessShopBuildAsk } from './shop-catalog-scale.js';

const FOX = 'Build a Fox & Wolf kids merchandise shop with 100 unique design images and checkout.';

test('timeout on a normal coding turn proposes a smaller rebuild, not a raw deadline dump', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'timeout', turnDeadlineSec: 90 });
  assert.match(outcome.text, /What failed/i);
  assert.match(outcome.text, /What we’ll do|What we'll do/i);
  assert.ok(outcome.continueSet?.items?.some((item) => /smaller/i.test(item.label)));
});

test('timeout on oversize shop uses intake chips', () => {
  const ask = assessShopBuildAsk(FOX);
  const outcome = resolveCodingTurnOutcome({
    kind: 'timeout',
    turnDeadlineSec: 90,
    shopIntakeAsk: ask,
  });
  assert.match(outcome.text, /Start with 10|working product photos/i);
  assert.ok(outcome.continueSet?.items?.length >= 1);
});

test('no-preview outcome never says only Connection Error', () => {
  const outcome = resolveCodingTurnOutcome({ kind: 'no-preview' });
  assert.match(outcome.text, /no runnable files/i);
  assert.match(outcome.text, /What we’ll do|What we'll do/i);
  assert.equal(/Connection Error/i.test(outcome.text), false);
});

test('provider death under overload still offers a next step', () => {
  const outcome = resolveCodingTurnOutcome({
    kind: 'provider-dead',
    errorMessage: 'Model overloaded (503)',
  });
  assert.match(outcome.text, /under load|overload/i);
  assert.match(outcome.text, /What we’ll do|What we'll do/i);
  assert.ok(outcome.continueSet?.items?.length >= 1);
});
