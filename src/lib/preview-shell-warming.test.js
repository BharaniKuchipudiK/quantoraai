import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREVIEW_SHELL_FAIL_MS,
  shouldFailPreviewShell,
  shouldHoldPreviewShellFailClock,
  shouldShowPreviewShellTombstone,
  shouldShowPreviewShellFailOverlay,
} from './preview-shell-warming.js';

test('hold shell fail clock while the coding turn is busy', () => {
  assert.equal(shouldHoldPreviewShellFailClock({ turnBusy: true }), true);
  assert.equal(shouldFailPreviewShell({
    turnBusy: true,
    idleElapsedMs: 60_000,
  }), false);
});

test('fail only after idle window past the bound', () => {
  assert.equal(shouldFailPreviewShell({
    turnBusy: false,
    idleElapsedMs: PREVIEW_SHELL_FAIL_MS - 1,
  }), false);
  assert.equal(shouldFailPreviewShell({
    turnBusy: false,
    idleElapsedMs: PREVIEW_SHELL_FAIL_MS,
  }), true);
});

test('never hard-fail the shell when desk already has HTML', () => {
  assert.equal(shouldFailPreviewShell({
    turnBusy: false,
    hasDeskHtml: true,
    idleElapsedMs: PREVIEW_SHELL_FAIL_MS * 4,
  }), false);
});

test('never show fail overlay when desk has HTML even if warmingFailed', () => {
  assert.equal(shouldShowPreviewShellFailOverlay({
    warmingFailed: true,
    hasDeskHtml: true,
  }), false);
  assert.equal(shouldShowPreviewShellFailOverlay({
    warmingFailed: true,
    hasDeskHtml: false,
  }), true);
});

test('never fail when embed is already ready', () => {
  assert.equal(shouldFailPreviewShell({
    turnBusy: false,
    embedReady: true,
    idleElapsedMs: 99_000,
  }), false);
  assert.equal(shouldHoldPreviewShellFailClock({ turnBusy: true, embedReady: true }), false);
});

test('tombstone never shows when desk has HTML — boutique screenshot class', () => {
  assert.equal(shouldShowPreviewShellTombstone({
    warmingFailed: true,
    hasDeskHtml: true,
  }), false);
  assert.equal(shouldShowPreviewShellTombstone({
    warmingFailed: true,
    hasDeskHtml: false,
  }), true);
  assert.equal(shouldShowPreviewShellTombstone({
    warmingFailed: true,
    hasDeskHtml: true,
    embedReady: true,
  }), false);
});
