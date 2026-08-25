import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isOpenRouterApiKey,
  openRouterEnvPublicHint,
  openRouterKeyShape,
  resolveOpenRouterEnvKey,
} from './openrouter-key.js';

test('classifies OpenRouter vs Stripe-like vs other', () => {
  assert.equal(openRouterKeyShape('sk-or-v1-abc744'), 'openrouter');
  assert.equal(openRouterKeyShape('sk_live_a12xyz'), 'stripe-like');
  assert.equal(openRouterKeyShape('AIzaSySomething'), 'other');
  assert.equal(openRouterKeyShape(''), 'missing');
  assert.equal(openRouterKeyShape(null), 'missing');
});

test('resolveOpenRouterEnvKey ignores impostor secrets', () => {
  assert.equal(
    resolveOpenRouterEnvKey({ OPENROUTER_API_KEY: 'sk-or-v1-good744' }),
    'sk-or-v1-good744',
  );
  assert.equal(resolveOpenRouterEnvKey({ OPENROUTER_API_KEY: 'sk_live_a12' }), undefined);
  assert.equal(resolveOpenRouterEnvKey({ OPENROUTER_API_KEY: '  ' }), undefined);
});

test('public hint never returns the full key', () => {
  const hint = openRouterEnvPublicHint({
    OPENROUTER_API_KEY: 'sk-or-v1-37cdeadbeef744',
  });
  assert.equal(hint.shape, 'openrouter');
  assert.equal(hint.hint, 'sk-or-v1-...744');
  assert.ok(hint.hint && !hint.hint.includes('deadbeef'));

  const stripe = openRouterEnvPublicHint({ OPENROUTER_API_KEY: 'sk_live_a12secret' });
  assert.equal(stripe.shape, 'stripe-like');
  assert.match(String(stripe.hint), /not OpenRouter/);

  const other = openRouterEnvPublicHint({ OPENROUTER_API_KEY: 'AIzaSySecretLeak' });
  assert.equal(other.shape, 'other');
  assert.equal(other.hint, '(unexpected — not OpenRouter)');
  assert.ok(other.hint && !other.hint.includes('AIzaSy'));
});

test('isOpenRouterApiKey is strict', () => {
  assert.equal(isOpenRouterApiKey('sk-or-v1-x'), true);
  assert.equal(isOpenRouterApiKey('sk_live_x'), false);
});
