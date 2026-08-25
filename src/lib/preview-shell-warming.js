/**
 * Preview shell fail clock — pure policy.
 * Never declare "shell did not start" while the coding turn is still streaming.
 */

export const PREVIEW_SHELL_FAIL_MS = 12_000;

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
