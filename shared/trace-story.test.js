import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { describeTrace, describeTraceEvent } from './trace-story.js';

const at = (offsetMs) => new Date(1_788_614_000_000 + offsetMs).toISOString();
const ID = 'studio-719887e2-b5a4-4de5-b84a-f474192befa2';

test('no events: the account says there is no record, and does not invent a cause', () => {
  const story = describeTrace([]);
  assert.equal(story.outcome, 'no-record');
  assert.match(story.headline, /no record of this reference/);
  assert.match(story.detail, /never reached Quantora's API, or this deployment keeps no trace store/);
  assert.deepEqual(story.steps, []);
});

test('[the incident] started, engine chosen, engine called, then silence — named as a cut-off on our side', () => {
  const story = describeTrace([
    { correlationId: ID, boundary: 'api.chat', state: 'started', at: at(0) },
    { correlationId: ID, boundary: 'inference.plan', state: 'selected', modelId: 'anthropic/claude-opus-5', gateway: 'openrouter', at: at(40) },
    { correlationId: ID, boundary: 'inference.provider', state: 'attempting', modelId: 'anthropic/claude-opus-5', gateway: 'openrouter', at: at(45) },
    { correlationId: ID, boundary: 'browser.chat-stream', state: 'failed', detailCode: 'silent-turn', at: at(61_000) },
  ]);
  assert.equal(story.outcome, 'server-cut-off');
  assert.match(story.headline, /cut off before it finished this turn — a fault on our side/);
  assert.match(story.detail, /Called anthropic\/claude-opus-5 via openrouter\./);
  assert.match(story.detail, /while waiting on anthropic\/claude-opus-5 via openrouter/);
  assert.match(story.detail, /timeout or a crash on Quantora's side/);
  assert.match(story.detail, /Your message is unchanged/);
  assert.equal(story.steps.length, 4);
  assert.equal(story.steps[0].offsetMs, 0);
  assert.equal(story.steps[3].offsetMs, 61_000);
  assert.match(story.steps[3].text, /desk ended the turn without a reply \(the desk received no reply\)/);
});

test('a gateway that rejected the credential is said in words, with the status', () => {
  const story = describeTrace([
    { boundary: 'api.chat', state: 'started', at: at(0) },
    { boundary: 'inference.plan', state: 'selected', modelId: 'openai/gpt-5', gateway: 'openrouter', at: at(10) },
    { boundary: 'inference.provider', state: 'attempting', modelId: 'openai/gpt-5', gateway: 'openrouter', at: at(12) },
    { boundary: 'inference.provider', state: 'failed', modelId: 'openai/gpt-5', gateway: 'openrouter', statusCode: 401, detailCode: 'provider-failure', durationMs: 300, at: at(312) },
    { boundary: 'inference.provider', state: 'attempting', modelId: 'gemini-2.5-flash', gateway: 'gemini', at: at(320) },
    { boundary: 'inference.provider', state: 'failed', modelId: 'gemini-2.5-flash', gateway: 'gemini', statusCode: 429, detailCode: 'quota-exhausted', durationMs: 90, at: at(410) },
    { boundary: 'api.chat', state: 'failed', statusCode: 429, detailCode: 'quota-exhausted', durationMs: 420, at: at(420) },
  ]);
  assert.equal(story.outcome, 'server-failed');
  assert.match(story.headline, /ended this turn with an error, and recorded why/);
  assert.match(story.detail, /HTTP 429\): the engine quota was exhausted/);
  assert.match(story.detail, /Engines tried and failed: openai\/gpt-5 via openrouter \(HTTP 401\); gemini-2.5-flash via gemini \(HTTP 429\)/);
});

test('the server finished but the desk saw nothing — the fault is placed between them, not on the server', () => {
  const story = describeTrace([
    { boundary: 'api.chat', state: 'started', at: at(0) },
    { boundary: 'inference.provider', state: 'attempting', modelId: 'm', gateway: 'g', at: at(5) },
    { boundary: 'inference.provider', state: 'succeeded', modelId: 'm', gateway: 'g', durationMs: 8_000, at: at(8_005) },
    { boundary: 'api.chat', state: 'succeeded', modelId: 'm', gateway: 'g', durationMs: 8_100, at: at(8_100) },
    { boundary: 'browser.chat-stream', state: 'failed', detailCode: 'silent-turn', at: at(8_400) },
  ]);
  assert.equal(story.outcome, 'server-finished-desk-silent');
  assert.match(story.headline, /finished this turn and sent a reply, but the desk never showed it/);
  assert.match(story.detail, /Nothing on the server failed/);
});

test('a turn that finished and rendered reads as finished', () => {
  const story = describeTrace([
    { boundary: 'api.chat', state: 'started', at: at(0) },
    { boundary: 'api.chat', state: 'succeeded', modelId: 'm', gateway: 'g', durationMs: 12_345, at: at(12_345) },
    { boundary: 'browser.response-parser', state: 'parsed', at: at(12_400) },
    { boundary: 'artifact.vfs', state: 'parsed', fileCount: 4, at: at(12_450) },
    { boundary: 'browser.iframe', state: 'rendered', at: at(14_000) },
  ]);
  assert.equal(story.outcome, 'server-finished');
  assert.equal(story.steps[1].text, 'The server finished the turn in 12s with m via g.');
  assert.equal(story.steps[3].text, '4 file(s) landed on the desk.');
});

test('only browser events: the server is not blamed for a request it never saw', () => {
  const story = describeTrace([
    { boundary: 'browser.chat-stream', state: 'failed', detailCode: 'silent-turn', at: at(0) },
  ]);
  assert.equal(story.outcome, 'browser-only');
  assert.match(story.headline, /server has no record of this turn; only this browser does/);
});

test('events are ordered by time, not by arrival, and a missing timestamp keeps its place', () => {
  const story = describeTrace([
    { boundary: 'inference.provider', state: 'attempting', modelId: 'm', gateway: 'g', at: at(50) },
    { boundary: 'api.chat', state: 'started', at: at(0) },
    { boundary: 'inference.plan', state: 'selected', modelId: 'm', gateway: 'g' },
  ]);
  assert.equal(story.steps[0].text, 'Quantora received the request.');
  assert.equal(story.steps[1].text, 'Called m via g.');
  assert.equal(story.steps[2].at, null);
});

test('an empty stream is not called a reply that was read', () => {
  assert.equal(describeTraceEvent({ boundary: 'browser.response-parser', state: 'parsed', detailCode: 'assistant-response-empty' }), 'The desk read the stream to its end and found no reply in it.');
  assert.equal(describeTraceEvent({ boundary: 'browser.response-parser', state: 'parsed' }), 'The desk received the reply and read it.');
});

test('an unknown boundary is still shown rather than dropped, and an unknown code is spelled out', () => {
  assert.equal(describeTraceEvent({ boundary: 'study.replay', state: 'skipped', detailCode: 'checkpoint-stale' }), 'study.replay skipped: checkpoint stale.');
  assert.equal(describeTraceEvent({ boundary: 'api.chat', state: 'failed', statusCode: 500, detailCode: 'chat-failure' }), 'The server ended the turn with an error (HTTP 500): the turn failed on the server.');
});

/*
 * A REFUSAL TOLD AS A CRASH (2026-09-08). /api/chat refused a turn with 429 —
 * the daily budget was spent — and returned having recorded only the 'started'
 * event. describeTrace reads "started, then nothing" as a function that died
 * mid-flight, so "What happened?" told the user the server "stopped before
 * choosing an engine: a timeout or a crash on Quantora's side, NOT A REFUSAL
 * and not anything you did."
 *
 * Every clause of that was invented from an absence, and the last one was the
 * precise inverse of the truth. That is this gate's own class: an account that
 * names a cause the record does not prove. The fix is on both sides — the
 * handler writes the refusal it is making, and the story reads a recorded 429
 * as the decision it is.
 */

test('[was-red] a recorded 429 refusal is told as a limit, never as a crash', () => {
  const story = describeTrace([
    { correlationId: ID, boundary: 'api.chat', state: 'started', at: at(0) },
    { correlationId: ID, boundary: 'api.chat', state: 'failed', statusCode: 429, detailCode: 'turn-budget', at: at(90) },
  ]);
  assert.equal(story.outcome, 'server-refused');
  assert.match(story.headline, /declined to run this turn — a limit on your account, not a failure/);
  assert.match(story.detail, /daily turn budget for this account was already spent/);
  assert.match(story.detail, /Nothing broke/);
  assert.doesNotMatch(story.detail, /crash/i, 'a refusal is not a crash');
  assert.doesNotMatch(story.detail, /fault on our side/i, 'a limit is not a platform fault');
});

test('a per-minute refusal names the guard that fired, and says it clears itself', () => {
  const story = describeTrace([
    { correlationId: ID, boundary: 'api.chat', state: 'started', at: at(0) },
    { correlationId: ID, boundary: 'api.chat', state: 'failed', statusCode: 429, detailCode: 'rate-limited', at: at(12) },
  ]);
  assert.equal(story.outcome, 'server-refused');
  assert.match(story.detail, /more requests than the per-minute guard allows/);
  assert.match(story.detail, /clears on its own within a minute/);
});

test('an engine quota is still our problem to route around, not the account’s limit', () => {
  /*
   * The narrowing that keeps the branch honest (§5), and the regression that
   * proved it necessary. /api/chat stamps its OWN boundary with 429 when every
   * engine's provider quota is exhausted, so the first draft of the refusal
   * branch — keyed on the status — told that user "a limit on your account,
   * not a failure" while the deployment's provider credit was the thing that
   * had died. The status is ambiguous; the detail code Quantora writes when it
   * declines is not.
   */
  const story = describeTrace([
    { correlationId: ID, boundary: 'api.chat', state: 'started', at: at(0) },
    { correlationId: ID, boundary: 'inference.provider', state: 'failed', modelId: 'gemini-2.5-flash', gateway: 'gemini', statusCode: 429, detailCode: 'quota-exhausted', at: at(400) },
    { correlationId: ID, boundary: 'api.chat', state: 'failed', statusCode: 429, detailCode: 'quota-exhausted', durationMs: 420, at: at(420) },
  ]);
  assert.equal(story.outcome, 'server-failed', 'an exhausted engine is a server failure, not the user’s limit');
  assert.match(story.headline, /ended this turn with an error/);
  assert.doesNotMatch(story.detail, /declined/i, 'nobody declined this turn — every engine’s quota died');
});

test('[was-red] the handler records the refusal it makes, at every 429 it can return', () => {
  /*
   * The story can only be honest about what was written. This asserts the
   * write side: each of /api/chat's three own 429s — the per-minute guard,
   * its durable twin, and the daily turn budget — trace a failed api.chat
   * boundary before replying. A handler that refuses silently puts the
   * "timeout or a crash" sentence back on the screen, and no assertion about
   * describeTrace would catch it.
   */
  const handler = readFileSync(new URL('../api/_lib/chat-handler.ts', import.meta.url), 'utf8');

  /* Each refusal must record BOTH halves: the status the caller sees and the
   * reason describeTrace keys on. A detailCode without its 429 renders as an
   * error again; a 429 without its detailCode falls into the provider-quota
   * branch and blames the deployment for the user's own limit. */
  const paired = handler.match(/statusCode: 429,\s*(?:\n\s*)?detailCode: '(?:rate-limited|turn-budget)'/g) || [];
  const reasons = handler.match(/detailCode: '(?:rate-limited|turn-budget)'/g) || [];
  assert.equal(reasons.length, 3, `expected three traced refusals in /api/chat, found ${reasons.length}`);
  assert.equal(
    paired.length,
    reasons.length,
    `every traced refusal must carry statusCode 429: ${reasons.length} reasons, ${paired.length} paired with a status`,
  );

  const chatReturns429 = (handler.match(/return res\.status\(429\)/g) || []).length;
  assert.equal(
    chatReturns429,
    reasons.length,
    `every 429 /api/chat returns must be recorded: ${chatReturns429} returned, ${reasons.length} traced`,
  );
});
