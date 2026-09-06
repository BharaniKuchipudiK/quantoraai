import assert from 'node:assert/strict';
import test from 'node:test';
import { assessProviderHealth } from './lib/provider-health.mjs';

const healthy = () => ({
  health: { status: 200, body: { ready: true, routeCount: 3, geminiConfigured: true, openRouterConfigured: true, openRouterCredentialRefused: false, spend: { paidRoutesAllowed: true, spentUsd: 32.33, limitUsd: null } } },
  gemini: { status: 200, body: { list: { ok: true, status: 200 }, generate: { ok: true, status: 200, model: 'gemini-3.8-flash', ms: 2122 }, verdict: 'Gemini works from here.' } },
  openrouter: { status: 200, body: { auth: { ok: true, status: 200, usage: 1.5, limit: 10, remaining: 8.5 }, verdict: 'ok' } },
});

test('every provider answering reads OK, with the facts on the line', () => {
  const result = assessProviderHealth(healthy());
  assert.equal(result.ok, true, result.verdict);
  assert.deepEqual(result.failures, []);
  assert.match(result.verdict, /^PROVIDER HEALTH \| OK \| routes=3 gemini=ok\(gemini-3\.8-flash 2122ms\) openrouter=ok\(\$8\.50 left of \$10\.00\) spend=\$32\.33 \(no ceiling\)$/);
});

test('a Gemini spend cap (429) fails as CAPPED with Google\'s own words', () => {
  const reads = healthy();
  reads.gemini.body = { list: { ok: false, status: 429, error: 'You exceeded your current quota' }, generate: { ok: false, status: 429, error: 'You exceeded your current quota' }, verdict: 'Google refused this project\'s spend cap.' };
  const result = assessProviderHealth(reads);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, ['gemini=CAPPED(429: You exceeded your current quota)']);
  assert.match(result.verdict, /^PROVIDER HEALTH \| FAILED \| gemini=CAPPED\(429/);
});

test('a rejected Gemini credential (401) fails as REFUSED; any other failure is FAILED', () => {
  const reads = healthy();
  reads.gemini.body = { list: { ok: false, status: 401, error: 'API key not valid' }, generate: { ok: false, status: null, error: null }, verdict: '' };
  assert.deepEqual(assessProviderHealth(reads).failures, ['gemini=REFUSED(401: API key not valid)']);
  reads.gemini.body = { list: { ok: true, status: 200 }, generate: { ok: false, status: 503, error: 'The model is overloaded' }, verdict: '' };
  assert.deepEqual(assessProviderHealth(reads).failures, ['gemini=FAILED(503: The model is overloaded)']);
});

test('an exhausted OpenRouter balance and a refused OpenRouter key both fail by name', () => {
  const exhausted = healthy();
  exhausted.openrouter.body = { auth: { ok: true, status: 200, usage: 10, limit: 10, remaining: 0 } };
  assert.deepEqual(assessProviderHealth(exhausted).failures, ['openrouter=EXHAUSTED($10.00 of $10.00 used)']);
  const refused = healthy();
  refused.openrouter.body = { auth: { ok: false, status: 401, error: 'User not found.' } };
  assert.deepEqual(assessProviderHealth(refused).failures, ['openrouter=REFUSED(401: User not found.)']);
  const gatewaySaysRefused = healthy();
  gatewaySaysRefused.health.body.openRouterCredentialRefused = true;
  assert.deepEqual(assessProviderHealth(gatewaySaysRefused).failures, ['openrouter=REFUSED(the gateway refused the credential)']);
});

test('a missing key, a closed spend ceiling and an unready deployment each fail, and an unlimited account is a note', () => {
  const missing = healthy();
  missing.health.body.geminiConfigured = false;
  missing.health.body.openRouterConfigured = false;
  assert.deepEqual(assessProviderHealth(missing).failures, ['gemini=MISSING KEY', 'openrouter=MISSING KEY']);

  const ceiling = healthy();
  ceiling.health.body.spend = { paidRoutesAllowed: false, reason: 'spent $50.10 of the $50 platform ceiling', spentUsd: 50.1, limitUsd: 50 };
  assert.deepEqual(assessProviderHealth(ceiling).failures, ['spend=CEILING(spent $50.10 of the $50 platform ceiling)']);

  const unready = healthy();
  unready.health = { status: 200, body: { ready: false, reason: 'no model key' } };
  const result = assessProviderHealth(unready);
  assert.equal(result.failures[0], 'deployment=NOT READY(no model key)');

  const unlimited = healthy();
  unlimited.openrouter.body = { auth: { ok: true, status: 200, usage: 3, limit: null, remaining: null } };
  const fine = assessProviderHealth(unlimited);
  assert.equal(fine.ok, true, fine.verdict);
  assert.ok(fine.notes.includes('openrouter=ok(no account limit)'));
});

test('a probe that could not be read is UNREACHABLE, never OK by silence (§4)', () => {
  const reads = healthy();
  reads.gemini = { status: 502, body: null };
  reads.openrouter = { status: null, body: null };
  const result = assessProviderHealth(reads);
  assert.deepEqual(result.failures, ['gemini=UNREACHABLE(HTTP 502)', 'openrouter=UNREACHABLE(HTTP none)']);
  const dark = assessProviderHealth({ health: { status: 403, body: null }, gemini: { status: null, body: null }, openrouter: { status: null, body: null } });
  assert.equal(dark.ok, false);
  assert.equal(dark.failures[0], 'deployment=UNREACHABLE(HTTP 403)');
});
