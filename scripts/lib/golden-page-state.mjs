/*
 * What the page was actually doing when a golden-transaction wait ran out.
 *
 * The gate's timeout messages used to name the symptom and nothing else
 * ("the generated artifact never reached the deployed project preview"), so
 * telling a failed chat turn from a slow one from a broken preview meant
 * downloading the run's uploaded artifact. That cost is not academic: it is
 * why this gate sat mislabelled "flaky" while it was permanently red, and
 * being muted is how the ESM outage of 2026-08-31 reached production. A gate
 * has to be diagnosable from its own log, so every timeout now carries the
 * page state that produced it.
 *
 * This module never throws. A diagnostic that can fail would replace the
 * real failure with its own, which is strictly worse than no diagnostic.
 */

/*
 * Every query here is bounded by PROBE_TIMEOUT_MS.
 *
 * Playwright's innerText() and getAttribute() are auto-waiting: on a selector
 * that matches nothing they block for the default 30s before rejecting. This
 * snapshot runs on the path where a wait has ALREADY expired, and its hooks
 * are absent precisely then, so the defaults would add minutes to a failure
 * that is already late. A diagnostic must be cheap or it will be removed.
 */
export const PROBE_TIMEOUT_MS = 1_500;

/** Visible text of a locator, collapsed and truncated; null if absent. */
export async function textOf(locator, limit = 300) {
  const value = await locator.innerText({ timeout: PROBE_TIMEOUT_MS }).catch(() => null);
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) || null : null;
}

export async function pageStateSnapshot(page, consoleErrors = []) {
  try {
    const count = (selector) => page.locator(selector).count().catch(() => -1);
    const preview = page.locator('[data-quantora-real-project-preview="true"]').first();
    const previewCount = await count('[data-quantora-real-project-preview="true"]');
    return {
      url: typeof page.url === 'function' ? page.url() : null,
      assistantMessages: await count('[data-quantora-assistant-prose]'),
      lastAssistantText: await textOf(page.locator('[data-quantora-assistant-prose]').last()),
      previewMounted: previewCount > 0,
      previewCompiling: (await count('[data-quantora-preview-loading="true"]')) > 0,
      previewError: await preview.getAttribute('data-quantora-preview-error', { timeout: PROBE_TIMEOUT_MS }).catch(() => null),
      previewCorrelationId: await preview.getAttribute('data-quantora-correlation-id', { timeout: PROBE_TIMEOUT_MS }).catch(() => null),
      buildJobs: await count('[data-quantora-build-job]'),
      storageFault: await textOf(page.locator('[data-quantora-storage-fault]').first()),
      alert: await textOf(page.locator('[role="alert"]').first()),
      consoleErrors: Array.isArray(consoleErrors) ? consoleErrors.slice(-5) : [],
    };
  } catch (error) {
    return { snapshotFailed: error?.message || String(error) };
  }
}

/** The snapshot as a single log-safe line appended to a failure message. */
export async function describePageState(page, consoleErrors = []) {
  const snapshot = await pageStateSnapshot(page, consoleErrors);
  try {
    return JSON.stringify(snapshot);
  } catch {
    return '{"snapshotFailed":"page state was not serialisable"}';
  }
}
