import assert from 'node:assert/strict';
import test from 'node:test';
import { describeTrace } from './trace-story.js';

const at = (offsetMs) => new Date(1_788_614_000_000 + offsetMs).toISOString();

test('[was-red] provider success with a missing terminal row is never called a timeout/crash', () => {
  const story = describeTrace([
    { boundary: 'api.chat', state: 'started', at: at(0) },
    { boundary: 'inference.plan', state: 'selected', modelId: 'anthropic/claude-opus-5', gateway: 'openrouter', at: at(5_000) },
    { boundary: 'inference.provider', state: 'attempting', modelId: 'anthropic/claude-opus-5', gateway: 'openrouter', at: at(5_001) },
    { boundary: 'inference.provider', state: 'succeeded', modelId: 'anthropic/claude-opus-5', gateway: 'openrouter', durationMs: 31_000, at: at(36_001) },
    { boundary: 'browser.chat-stream', state: 'failed', detailCode: 'silent-turn', at: at(37_000) },
  ]);

  assert.equal(story.outcome, 'provider-finished-terminal-missing');
  assert.match(story.headline, /model replied successfully/i);
  assert.match(story.detail, /provider completed its reply/i);
  assert.match(story.detail, /cannot distinguish a lost terminal trace from a post-processing failure/i);
  assert.doesNotMatch(story.detail, /provider timeout/i);
  assert.doesNotMatch(story.detail, /before choosing an engine/i);
  assert.doesNotMatch(story.headline, /fault on our side/i);
});
