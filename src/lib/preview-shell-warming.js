/**
 * Preview shell fail clock — pure policy.
 * Never declare "shell did not start" while the coding turn is still streaming,
 * or when the desk already has a preview page to show.
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
} = {}) {
  if (embedReady) return false;
  // A busy turn holds the clock even after an earlier failure: the component
  // clears a stale `warmingFailed` when a new turn starts building, so treating
  // a past failure as a reason NOT to hold would leave the red tombstone up
  // while the desk is actively producing files.
  return Boolean(turnBusy);
}

/**
 * @param {{ turnBusy?: boolean, embedReady?: boolean, idleElapsedMs?: number, failMs?: number, hasDeskHtml?: boolean }} state
 * @returns {boolean}
 */
export function shouldFailPreviewShell({
  turnBusy = false,
  embedReady = false,
  idleElapsedMs = 0,
  failMs = PREVIEW_SHELL_FAIL_MS,
  hasDeskHtml = false,
} = {}) {
  if (embedReady) return false;
  if (turnBusy) return false;
  // Files already on the desk — remount quietly; never hard-fail the shell overlay.
  if (hasDeskHtml) return false;
  return Number(idleElapsedMs) >= Number(failMs);
}

/**
 * Red "Preview shell did not start" tombstone — only when the desk has NOTHING
 * runnable. If index.html / preview code exists, keep trying; never leave the
 * boutique screenshot (Files full + red shell fail) as the product.
 */
export function shouldShowPreviewShellTombstone({
  warmingFailed = false,
  hasDeskHtml = false,
  embedReady = false,
} = {}) {
  if (embedReady) return false;
  if (hasDeskHtml) return false;
  return Boolean(warmingFailed);
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
