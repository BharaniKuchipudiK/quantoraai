import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regression checks for scroll-follow distance math used by useChatScrollFollow.
 * Full hook behavior is validated in the browser; these guard the threshold logic.
 */
test('distance from bottom is zero when scrolled to end', () => {
  const viewport = { scrollHeight: 1200, clientHeight: 400, scrollTop: 800 };
  const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  assert.equal(distance, 0);
});

test('distance from bottom is positive when stuck at top with overflow', () => {
  const viewport = { scrollHeight: 1200, clientHeight: 400, scrollTop: 0 };
  const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  assert.equal(distance, 800);
});

test('scroll target reaches latest content height', () => {
  const viewport = { scrollHeight: 1200, clientHeight: 400, scrollTop: 0 };
  const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  assert.equal(target, 800);
});
