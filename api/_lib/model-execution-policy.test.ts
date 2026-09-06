import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { describeCredentialFailure, isBillingRefusal, isOutOfCredit, isProviderCredentialRejection, isSpendCapBreach, shouldDegradeToolsTurn, shouldFallbackBeforeStreaming, streamErrorFrom } from './model-execution-policy.js';

test('retryable provider failures include endpoint loss and quota exhaustion before streaming', () => {
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('quota exceeded'), { status: 429 })), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('provider endpoint not found'), { status: 404 })), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('bad key'), { status: 401 })), false);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('credits'), { status: 402 })), false);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('bad key'), { status: 401 }), {
    currentGateway: 'openrouter',
    nextGateway: 'gemini',
  }), true);
  assert.equal(shouldFallbackBeforeStreaming(Object.assign(new Error('credits'), { status: 402 }), {
    currentGateway: 'openrouter',
    nextGateway: 'gemini',
  }), true);
});

test('a rejected provider credential is never reported as retryable', () => {
  // The reported failure: the OpenRouter key in the server environment had never
  // been accepted (provider dashboard showed "Last Used: Never"), so every call
  // 401'd — but the user was told to "retry in a moment", which can never work.
  for (const status of [401, 402, 403]) {
    assert.equal(isProviderCredentialRejection({ status }), true, `status ${status}`);
  }
  assert.equal(isProviderCredentialRejection({ message: 'No auth credentials found' }), true);
  assert.equal(isProviderCredentialRejection({ message: 'Invalid API key provided' }), true);

  // Genuinely transient conditions must stay retryable and NOT be called a
  // credential fault, or a rate limit would send the user hunting a good key.
  for (const status of [429, 500, 502, 503, 504]) {
    assert.equal(isProviderCredentialRejection({ status }), false, `status ${status}`);
    assert.equal(shouldFallbackBeforeStreaming({ status }), true, `status ${status} retryable`);
  }
});

test('a mid-stream provider failure is recognised and carries its upstream status', () => {
  /*
   * A provider can accept the request with HTTP 200 and then fail inside the
   * stream. Both parsers read only choices[0].delta.content, so such an event
   * produced no token and vanished: with no tokens yet the turn blamed the
   * gateway for "an empty response", and with tokens already streamed nothing
   * threw at all - a silently truncated build recorded as outcome:"success",
   * which is the ledger the outcome router later trusts to rank models.
   */
  const credits = streamErrorFrom({ error: { message: 'Insufficient credits', code: 402 } }, 'OpenRouter');
  assert.ok(credits, 'an error event must be recognised');
  assert.match(credits!.message, /Insufficient credits/);
  assert.equal((credits as any).status, 402);
  // The status is the point: it lets the existing classifiers do their job.
  assert.equal(isProviderCredentialRejection(credits), true);

  const rateLimited = streamErrorFrom({ error: { message: 'Rate limited', code: 429 } }, 'OpenRouter');
  assert.equal((rateLimited as any).status, 429);
  assert.equal(isProviderCredentialRejection(rateLimited), false, '429 is retryable, not a credential problem');

  // A bare string error, and an unknown shape, still surface rather than vanish.
  assert.match(streamErrorFrom({ error: 'upstream exploded' }, 'OpenRouter')!.message, /upstream exploded/);
  assert.equal((streamErrorFrom({ error: {} }, 'OpenRouter') as any).status, 502);

  // Ordinary content events must not be mistaken for failures.
  assert.equal(streamErrorFrom({ choices: [{ delta: { content: 'hi' } }] }, 'OpenRouter'), null);
  assert.equal(streamErrorFrom({}, 'OpenRouter'), null);
});

/*
 * From a live session. A calculator built successfully on gemini-flash-latest,
 * the next turn failed, and the user was told their API key had been rejected
 * and "has never been accepted" — while the Gemini dashboard showed 100%
 * success, zero errors, and 6 of 10,000 daily requests used.
 *
 * The key was fine. The message named no provider and could not tell an empty
 * balance (402) from a rejected credential (401/403), so it sent somebody to
 * re-issue the one key that was demonstrably working.
 */
test('402 is an empty balance, not a rejected key', () => {
  assert.equal(isOutOfCredit({ status: 402 }), true);
  assert.equal(isOutOfCredit({ status: 401 }), false);
  assert.equal(isOutOfCredit({ status: 403 }), false);
  assert.equal(isOutOfCredit({ message: 'Insufficient credits for this request' }), true);

  const text = describeCredentialFailure({ status: 402 }, 'deepseek/deepseek-chat');
  assert.match(text, /OpenRouter/);
  assert.match(text, /billing, not for a bad key/);
  assert.match(text, /Top up/);
  assert.doesNotMatch(text, /Last Used: Never/, 'a working key must not be blamed');
});

test('the failing provider is named, so the other one is not suspected', () => {
  const openrouter = describeCredentialFailure({ status: 401 }, 'deepseek/deepseek-chat');
  assert.match(openrouter, /OpenRouter/);
  assert.match(openrouter, /OPENROUTER_API_KEY/);
  assert.match(openrouter, /other than OpenRouter are unaffected/);
  assert.doesNotMatch(openrouter, /GEMINI_API_KEY/, 'Gemini must not be blamed for an OpenRouter refusal');

  const gemini = describeCredentialFailure({ status: 403 }, 'gemini-flash-latest');
  assert.match(gemini, /Google Gemini/);
  assert.match(gemini, /GEMINI_API_KEY/);
  assert.doesNotMatch(gemini, /OPENROUTER_API_KEY/);
});

test('routing still treats all three as fatal for the credential', () => {
  // The grouping was right for ROUTING; only the sentence was wrong. A 402 must
  // still stop the retry loop rather than hammer a provider that will not serve.
  for (const status of [401, 402, 403]) {
    assert.equal(isProviderCredentialRejection({ status }), true, `status ${status}`);
  }
});

/*
 * 2026-09-06: Google answered every production Gemini call with "HTTP 403:
 * Spend cap breached for project: projects/…". The founder's chat said
 * "OpenRouter rejected the credential itself" — wrong engine (Auto is not a
 * Gemini id) and wrong cause (a cap is billing, not a key).
 */
test('a Gemini spend cap is billing, not a rejected key, and the sentence says so', () => {
  const spendCap = { status: 403, message: 'Spend cap breached for project: projects/1053456406059 for service: generativelanguage.googleapis.com. Correlation id: 6' };
  assert.equal(isSpendCapBreach(spendCap), true);
  assert.equal(isOutOfCredit(spendCap), true);
  assert.equal(isOutOfCredit({ status: 403, message: 'API key not valid. Please pass a valid API key.' }), false, 'a plain 403 is still a rejected key');
  const text = describeCredentialFailure(spendCap, 'auto', 'gemini');
  assert.match(text, /Google Gemini/);
  assert.match(text, /spend cap/i);
  assert.match(text, /billing page/);
  assert.match(text, /named the project/);
  assert.doesNotMatch(text, /Last Used: Never|rejected the credential itself/, 'a recognised key must not be blamed');
  assert.doesNotMatch(text, /OpenRouter/, 'the engine that did not fail must not be named');
});

test('the engine that refused is named, not the engine the requested model id implies', () => {
  const stamped = describeCredentialFailure({ status: 403, gateway: 'gemini' }, 'auto');
  assert.match(stamped, /Google Gemini/);
  assert.doesNotMatch(stamped, /OPENROUTER_API_KEY/);
  const explicit = describeCredentialFailure({ status: 401 }, 'gemini-flash-latest', 'openrouter');
  assert.match(explicit, /OpenRouter/, 'an explicit gateway outranks the model id');
  const unstamped = describeCredentialFailure({ status: 401 }, 'auto');
  assert.match(unstamped, /OpenRouter/, 'with nothing stamped, the model id still decides');
  const junk = describeCredentialFailure({ status: 401, gateway: 'stripe' }, 'gemini-flash-latest');
  assert.match(junk, /Google Gemini/, 'an unknown gateway word is ignored, not trusted');
});

test('the chat handler stamps the failing route\'s gateway on the error and reads it back for the sentence', () => {
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /lastRouteError = error;\n[\s\S]{0,400}?error\.gateway = route\.gateway;/, 'the main route loop stamps the gateway');
  assert.match(handler, /lastOpenError = error;\n[^\n]*\n?[^\n]*gateway = 'gemini'/, 'the Gemini candidate loop stamps gemini');
  assert.match(handler, /lastError = error;\n[^\n]*gateway = 'openrouter'/, 'the OpenRouter loop stamps openrouter');
  assert.match(handler, /describeCredentialFailure\(err, req\.body\?\.modelId, err\?\.gateway\)/, 'the sentence is given the stamped gateway');
  assert.match(handler, /provider: err\?\.gateway === 'gemini' \|\| err\?\.gateway === 'openrouter'/, 'the SSE provider field too');
});

/*
 * DEGRADE, DO NOT DIE (2026-09-06): a Travel turn whose Gemini candidates were
 * all refused must run as text on OpenRouter instead of ending in a
 * credential error, while OpenRouter is usable and nothing has streamed.
 */
test('a tools turn refused by its gateway degrades to text on the other gateway, once, before anything streamed', () => {
  const base = { openRouterUsable: true, committed: false, alreadyDegraded: false };
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 403, message: 'Spend cap breached for project: projects/1' } }), true, 'a spend cap');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 401 } }), true, 'a rejected key');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 402 } }), true, 'an empty balance');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 429, message: 'Your prepayment credits are depleted' } }), true, 'exhausted quota');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 503 } }), false, 'a 5xx is "could not ask", not "told no"');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { name: 'AbortError', message: 'timed out' } }), false, 'a timeout neither');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 403 }, committed: true }), false, 'a committed reply cannot restart on another engine');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 403 }, alreadyDegraded: true }), false, 'once only');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: { status: 403 }, openRouterUsable: false }), false, 'nowhere to go');
  assert.equal(shouldDegradeToolsTurn({ ...base, error: null }), false, 'no error, no refusal');
});

test('the chat handler leaves the Gemini tools branch for the OpenRouter path when its candidates are refused', () => {
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /geminiTurn: if \(attempts\[0\]\.provider === 'gemini'\) \{/, 'the Gemini tools branch is a labelled block that can be left');
  const stopped = handler.indexOf('if (!stream) {');
  assert.ok(stopped > 0, 'the no-stream case is a block, not a bare throw');
  const block = handler.slice(stopped, handler.indexOf("throw lastOpenError || new Error('Gemini did not return a stream.');", stopped));
  assert.match(block, /shouldDegradeToolsTurn\(\{\n\s*error: lastOpenError,\n\s*openRouterUsable,\n\s*committed: sse\.isCommitted,\n\s*alreadyDegraded: degradedAfterRefusal,/, 'the pure rule decides, from the last refusal and the SSE state');
  assert.match(block, /geminiAvailable: false,\n\s*openRouterAvailable: openRouterUsable,/, 'the re-plan is text-only on OpenRouter');
  assert.match(block, /travelToolsEnabled = false;/, 'the live tools are off for the rest of the turn');
  assert.match(block, /finalSystemPrompt = finalSystemPromptBase \+ TRAVEL_DEGRADED_DIRECTIVE;/, 'and the model is told so');
  assert.match(block, /attempts = openRouterOnly;\n\s*break geminiTurn;/, 'the OpenRouter path below runs the re-plan');
  assert.match(handler, /const openRouterAttempts = attempts\.filter\(\(attempt\) => attempt\.provider === 'openrouter'\);/, 'which derives its attempts from `attempts`');
  assert.match(handler, /\.\.\.\(travelDegraded \? \{ travelDegraded: true \} : \{\}\),\n\s*\}\);\n\s*return;\n\s*\}[\s\S]*$/, 'the OpenRouter completion still reports travelDegraded to the desk');
});

/*
 * A BILLING REFUSAL IS THE ONE WORTH HOLDING FOR (2026-09-06). Gemini's
 * "Your prepayment credits are depleted" (a 429, on 2026-09-05) and "Spend cap
 * breached" (a 403, the day after) change only when a person pays. A bare 403
 * does not count: OpenRouter answers 403 to a moderation-flagged prompt.
 */
test('a billing refusal is money, in every spelling the providers used, and never a bare status', () => {
  assert.equal(isBillingRefusal({ status: 429, message: 'Your prepayment credits are depleted' }), true, "2026-09-05's 429");
  assert.equal(isBillingRefusal({ status: 403, message: 'Spend cap breached for project: projects/1' }), true, "2026-09-06's 403");
  assert.equal(isBillingRefusal({ status: 402 }), true, 'a 402 is a wallet');
  assert.equal(isBillingRefusal({ status: 402, message: 'Insufficient credits' }), true);
  assert.equal(isBillingRefusal({ status: 403, message: 'Your input was flagged' }), false, 'a flagged prompt is not billing');
  assert.equal(isBillingRefusal({ status: 401, message: 'User not found' }), false, 'a rejected key is not billing');
  assert.equal(isBillingRefusal({ status: 429, message: 'Rate limit exceeded' }), false, 'a rate limit is not now, not never');
  assert.equal(isBillingRefusal({ status: 503 }), false);
  const depleted = describeCredentialFailure({ status: 429, message: 'Your prepayment credits are depleted' }, 'gemini-flash-latest');
  assert.match(depleted, /billing, not for a bad key/, 'and the sentence for it is the billing one');
});

test('the chat handler tells the circuit when a refusal was billing', () => {
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /recordInferenceRouteFailure\(providerCircuitStore, route, status, Date\.now\(\), \{ billing: isBillingRefusal\(error\) \}\)/);
});
