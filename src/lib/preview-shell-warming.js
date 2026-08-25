/**
 * Preview shell fail clock — pure policy.
 * Never declare "shell did not start" while the coding turn is still streaming.
 * When Files already have runnable preview HTML, auto-remount before sticky fail.
 */

export const PREVIEW_SHELL_FAIL_MS = 12_000;
export const PREVIEW_SHELL_RETRY_MS = 6_000;
export const PREVIEW_SHELL_AUTO_REMOUNT_MS = 3_000;
export const PREVIEW_SHELL_AUTO_REMOUNT_MAX = 2;
/** Idle remounts before the first fail (after turnBusy ends). */
export const PREVIEW_SHELL_IDLE_REMOUNT_MAX = 2;

/**
 * @param {{ turnBusy?: boolean, embedReady?: boolean, warmingFailed?: boolean }} state
 * @returns {boolean} true = hold timers / do not fail the shell yet
 */
export function shouldHoldPreviewShellFailClock({
  turnBusy = false,
  embedReady = false,
  warmingFailed = false,
} = {}) {
  if (embedReady) return false;
  if (warmingFailed) return false;
  return Boolean(turnBusy);
}

/**
 * @param {{ turnBusy?: boolean, embedReady?: boolean, idleElapsedMs?: number, failMs?: number }} state
 * @returns {boolean}
 */
export function shouldFailPreviewShell({
  turnBusy = false,
  embedReady = false,
  idleElapsedMs = 0,
  failMs = PREVIEW_SHELL_FAIL_MS,
} = {}) {
  if (embedReady) return false;
  if (turnBusy) return false;
  return Number(idleElapsedMs) >= Number(failMs);
}

/**
 * After a sticky warmingFailed, auto-remount when desk Files still have code —
 * up to AUTO_REMOUNT_MAX quiet tries (~3s apart) before the Retry tombstone sticks.
 *
 * @param {{
 *   warmingFailed?: boolean,
 *   embedReady?: boolean,
 *   hasRunnablePreview?: boolean,
 *   autoRemountAttempts?: number,
 *   maxAttempts?: number,
 * }} state
 * @returns {boolean}
 */
export function shouldAutoRemountFailedPreviewShell({
  warmingFailed = false,
  embedReady = false,
  hasRunnablePreview = false,
  autoRemountAttempts = 0,
  maxAttempts = PREVIEW_SHELL_AUTO_REMOUNT_MAX,
} = {}) {
  if (embedReady) return false;
  if (!warmingFailed) return false;
  if (!hasRunnablePreview) return false;
  return Number(autoRemountAttempts) < Number(maxAttempts);
}
