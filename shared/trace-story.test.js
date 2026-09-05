import assert from 'node:assert/strict';
import test from 'node:test';
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
