import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PREVIEW_SHELL_FAIL_MS,
  PREVIEW_SHELL_AUTO_REMOUNT_MAX,
  shouldFailPreviewShell,
  shouldHoldPreviewShellFailClock,
  shouldShowPreviewShellTombstone,
  shouldAutoRemountFailedPreviewShell,
  
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
  assert.equal(shouldShowPreviewShellTombstone({
    warmingFailed: true,
    hasDeskHtml: true,
  }), false);
  assert.equal(shouldShowPreviewShellTombstone({
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

test('auto-remount sticky fail when Files still have runnable preview', () => {
  assert.equal(shouldAutoRemountFailedPreviewShell({
    warmingFailed: true,
    hasRunnablePreview: true,
    autoRemountAttempts: 0,
  }), true);
  assert.equal(shouldAutoRemountFailedPreviewShell({
    warmingFailed: true,
    hasRunnablePreview: true,
    autoRemountAttempts: PREVIEW_SHELL_AUTO_REMOUNT_MAX - 1,
  }), true);
  assert.equal(shouldAutoRemountFailedPreviewShell({
    warmingFailed: true,
    hasRunnablePreview: true,
    autoRemountAttempts: PREVIEW_SHELL_AUTO_REMOUNT_MAX,
  }), false);
  assert.equal(shouldAutoRemountFailedPreviewShell({
    warmingFailed: true,
    hasRunnablePreview: false,
    autoRemountAttempts: 0,
  }), false);
  assert.equal(shouldAutoRemountFailedPreviewShell({
    warmingFailed: false,
    hasRunnablePreview: true,
    autoRemountAttempts: 0,
  }), false);
});

test('the component actually calls the policy it is tested against', () => {
  // This module was tested and asserted by the browser gate while the component
  // re-derived the same conditions inline and never called it — the same trap
  // that hid the COEP header bug (a test proving a copy, not the original).
  // If the component stops calling these, the policy is fiction again.
  const canvas = fs.readFileSync(
    new URL('../components/LivePreviewCanvas.jsx', import.meta.url),
    'utf8',
  );
  for (const fn of ['shouldFailPreviewShell', 'shouldHoldPreviewShellFailClock', 'shouldAutoRemountFailedPreviewShell']) {
    assert.match(canvas, new RegExp(`${fn}\\s*\\(`), `LivePreviewCanvas must call ${fn}`);
  }
});
