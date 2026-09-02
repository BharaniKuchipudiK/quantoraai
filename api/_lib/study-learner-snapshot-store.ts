import type { StudyLearnerProjection } from './study-learner-projection.js';

const SNAPSHOT_TIMEOUT_MS = 1_000;

export type StudyLearnerSnapshotSyncResult =
  | { status: 'current' }
  | { status: 'saved' }
  | { status: 'snapshot_ahead' }
  | { status: 'unavailable' };

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function snapshotRequest(init: RequestInit): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const response = await fetch(`${cfg.url}/rest/v1/rpc/save_study_learner_snapshot`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn('Study snapshot Supabase request failed', {
        operation: 'learner_snapshot_sync',
        status: response.status,
      });
      return null;
    }
    return response;
  } catch {
    console.warn('Study snapshot Supabase request failed', {
      operation: 'learner_snapshot_sync',
      status: 'transport',
    });
    return null;
  }
}

/**
 * Persist the freshly replayed projection in one monotonic database round trip.
 * The RPC classifies current/saved/snapshot-ahead while holding the write
 * boundary; snapshot state never becomes learner truth for this request.
 */
export async function syncStudyLearnerSnapshot(input: {
  userSub: string;
  projection: StudyLearnerProjection;
}): Promise<StudyLearnerSnapshotSyncResult> {
  if (!config()) return { status: 'unavailable' };
  const projection = input.projection;
  const response = await snapshotRequest({
    method: 'POST',
    body: JSON.stringify({
      p_user_sub: input.userSub,
      p_concept_id: projection.conceptId,
      p_schema_version: projection.schemaVersion,
      p_learner_model_version: projection.learnerModelVersion,
      p_estimator_version: projection.estimatorVersion,
      p_observed_through: projection.observedThrough,
      p_projected_at: projection.projectedAt,
      p_projection: projection,
    }),
  });
  if (!response) return { status: 'unavailable' };
  try {
    const result = await response.json();
    return result === 'current' || result === 'saved' || result === 'snapshot_ahead'
      ? { status: result }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
