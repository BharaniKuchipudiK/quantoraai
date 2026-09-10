import { describeQirPersistDiagnosis } from '../../shared/qir-persist-diagnosis.js';
import { missingRequestedDeliverables, requestedDeliverablePaths } from './requested-deliverables.js';

/**
 * What the desk should say about the durable Run — including when there isn't one.
 *
 * THE GAP THIS CLOSES.
 *
 * `api/_lib/qir-run-store.ts` is gated on SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. With either absent the route answers 503
 * "storage-unconfigured" and QIR records nothing: no Run, no failure evidence,
 * no resume. The server is honest about it. Nothing downstream was.
 *
 *   - `useQirCodingRun` catches the error and exports it as `error`.
 *   - No component read `qirCoding.error`. Not one.
 *   - The desk chip rendered `{qirCoding.run ? ... : null}`, so an unconfigured
 *     store looked exactly like a session that has not built anything yet.
 *
 * So the whole durable runtime could be switched off in production and the
 * platform could not tell you — and neither could any test, because every test
 * runs against a store that IS configured. That is the write-only pattern one
 * layer up: the fact existed, crossed two boundaries, and nobody read it.
 *
 * WHY THIS IS A FUNCTION AND NOT A TERNARY IN THE JSX.
 *
 * Because a ternary in a 5,000-line component cannot be driven by a test. This
 * can, and the states below are the ones that actually matter.
 */

/** The server's machine-readable 503 reasons. Keep in step with api/qir-*.ts. */
export const QIR_STORAGE_UNCONFIGURED = 'storage-unconfigured';
export const QIR_PERSIST_FAILED = 'persist-failed';

/**
 * @param {{ run?: object|null, error?: (Error & { reason?: string })|null, workspace?: { goal?: string, vfs?: object }|null }} input
 * @returns {{ label: string, detail: string, recording: boolean }|null}
 *   null means "say nothing" — the honest answer when there is simply no Run yet.
 */
export function describeQirDurability({ run = null, error = null, workspace = null } = {}) {
  // A restored COMPLETE Run is historical evidence, not permission to certify
  // files absent from the current desk. Reuse the existing file contract;
  // this is only a veto on the outward claim, never a new promotion authority.
  if (run?.status === 'COMPLETE' && workspace?.vfs
    && typeof workspace.vfs === 'object' && !Array.isArray(workspace.vfs)) {
    const brief = requestedDeliverablePaths(workspace.goal).length
      ? workspace.goal : run.goal?.statement || '';
    const missing = missingRequestedDeliverables(brief, workspace.vfs);
    if (missing.length) {
      return {
        label: 'Run · INCOMPLETE',
        detail: `Current workspace is missing requested files: ${missing.join(', ')}. `
          + `Durable Run ${run.runId || ''} retains its historical COMPLETE status; `
          + 'it does not certify the current file delivery. Generated work is unchanged.',
        recording: true,
      };
    }
  }
  if (run && run.status) {
    return {
      label: `Run · ${run.status}`,
      detail: `Durable Run ${run.runId || ''}`.trim(),
      recording: true,
    };
  }

  const reason = typeof error?.reason === 'string' ? error.reason : '';
  const diagnosis = error?.diagnosis || null;

  /*
   * Two conditions, deliberately worded differently, because they are different
   * problems for different people: one is a deployment that was never finished,
   * the other is a store that is configured and currently failing. Collapsing
   * them into one "something is wrong" chip would send whoever reads it looking
   * in the wrong place.
   */
  if (reason === QIR_STORAGE_UNCONFIGURED) {
    return {
      label: 'Run · not recording',
      detail: 'Durable run storage is not configured on this deployment, so this '
        + 'build is not being journaled and cannot be resumed.',
      recording: false,
    };
  }

  if (reason === QIR_PERSIST_FAILED) {
    /*
     * The store classified WHY, when it could. "Rejected the last write" alone
     * is true and unactionable: a missing table, a policy refusing the service
     * role and a stale key are three different jobs for three different people,
     * and this chip is the only place the operator ever sees the difference.
     *
     * When the store had nothing certain to say, the generic sentence stands
     * alone rather than guessing (§5) — an invented cause sends someone to fix
     * the wrong thing, which is worse than sending them to look.
     */
    const because = describeQirPersistDiagnosis(diagnosis);
    return {
      label: 'Run · not saved',
      detail: 'Durable run storage is configured but rejected the last write, so '
        + `this build may not be resumable.${because ? ` ${because}` : ''}`,
      recording: false,
    };
  }

  /*
   * Anything else says nothing at all. A 401 on a signed-out desk, a dropped
   * connection, a 404 on a stale pointer — none of those mean the runtime is
   * off, and a chip that fires on ambiguous evidence is one the next person
   * hides under pressure (CLAUDE.md §5). Silence here is the honest answer.
   */
  return null;
}
