import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampChatWidthPct,
  clampFilesWidthPx,
  DEFAULT_CHAT_WIDTH_PCT,
  DEFAULT_FILES_WIDTH_PX,
  isStudioSplitMobile,
  maxChatWidthPctForShell,
  MIN_DESK_WIDTH_PX,
} from './studio-split-layout.js';

test('chat width clamps to studio density bounds', () => {
  assert.equal(clampChatWidthPct(10), 22);
  assert.equal(clampChatWidthPct(80), 55);
  assert.equal(clampChatWidthPct(DEFAULT_CHAT_WIDTH_PCT), DEFAULT_CHAT_WIDTH_PCT);
});

test('files width clamps to studio density bounds', () => {
  assert.equal(clampFilesWidthPx(40), 140);
  assert.equal(clampFilesWidthPx(900), 420);
  assert.equal(clampFilesWidthPx(DEFAULT_FILES_WIDTH_PX), DEFAULT_FILES_WIDTH_PX);
});

test('split drag is desktop-only', () => {
  assert.equal(isStudioSplitMobile(500), true);
  assert.equal(isStudioSplitMobile(1200), false);
});

test('chat max width reserves desk space on narrow shells', () => {
  const max = maxChatWidthPctForShell(720);
  assert.ok(max < 55);
  assert.ok((720 * max) / 100 <= 720 - MIN_DESK_WIDTH_PX + 1);
  assert.equal(maxChatWidthPctForShell(1600), 55);
});
