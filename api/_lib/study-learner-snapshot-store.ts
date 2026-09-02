import type { StudyLearnerProjection } from './study-learner-projection.js';
import type { StudyReplayCheckpoint } from './study-replay-checkpoint.js';
import { readStudySupabaseRows, studySupabaseRequest } from './study-supabase.js';

const SNAPSHOT_TIMEOUT_MS = 1_000;

export type StudyLearnerSnapshotSyncResult =
  | { status: 'current' }
  | { status: 'saved' }
  | { status: 'snapshot_ahead' }
  | { status: 'unavailable' };

export type StudyLearnerCheckpointReadResult =
  | { status: 'hit'; checkpoint: StudyReplayCheckpoint }
  | { status: 'miss' }
  | { status: 'unavailable' };

async function legacySnapshotRequest(init: RequestInit): Promise<Response | null> {
  return studySupabaseRequest(
    'rpc/save_study_learner_snapshot',
    init,
    { operation: 'learner_snapshot_sync', timeoutMs: SNAPSHOT_TIMEOUT_MS },
  );
}

/**
 * H3.2 compatibility path. H3.3 full replay may still use this when the ledger
 * has no append cursor yet (for example, a concept with zero persisted events).
 */
export async function syncStudyLearnerSnapshot(input: {
  userSub: string;
  projection: StudyLearnerProjection;
}): Promise<StudyLearnerSnapshotSyncResult> {
  const projection = input.projection;
  const response = await legacySnapshotRequest({
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
  if (!response?.ok) return { status: 'unavailable' };
  try {
    const result = await response.json();
    return result === 'current' || result === 'saved' || result === 'snapshot_ahead'
      ? { status: result }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

function checkpointObject(value: unknown): StudyReplayCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as StudyReplayCheckpoint;
  return typeof candidate.checkpointVersion === 'string'
    && typeof candidate.projectionSchemaVersion === 'string'
    && typeof candidate.learnerModelVersion === 'string'
    && typeof candidate.estimatorVersion === 'string'
    && typeof candidate.admissionVersion === 'string'
    && typeof candidate.conceptId === 'string'
    && Array.isArray(candidate.seenAssessmentItemRefs)
    && candidate.masteryState != null
    && candidate.learnerState != null
    ? candidate
    : null;
}

/** Read one server-owned derived checkpoint. Missing/legacy rows are a cache miss. */
export async function readStudyLearnerCheckpoint(
  userSub: string,
  conceptId: string,
): Promise<StudyLearnerCheckpointReadResult> {
  const rows = await readStudySupabaseRows(
    `study_learner_snapshots?select=checkpoint_version,admission_version,append_cursor_created_at,append_cursor_id,checkpoint&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&limit=1`,
    { operation: 'learner_checkpoint_read', timeoutMs: SNAPSHOT_TIMEOUT_MS },
  );
  if (rows === null) return { status: 'unavailable' };
  const row = rows[0];
  if (!row || !row.checkpoint || !row.append_cursor_created_at || !row.append_cursor_id) return { status: 'miss' };
  const checkpoint = checkpointObject(row.checkpoint);
  const cursorMillis = Date.parse(String(row.append_cursor_created_at));
  if (!checkpoint || !Number.isFinite(cursorMillis)) return { status: 'miss' };
  return {
    status: 'hit',
    checkpoint: {
      ...checkpoint,
      cursor: {
        createdAt: new Date(cursorMillis).toISOString(),
        id: String(row.append_cursor_id),
      },
    },
  };
}

/**
 * Persist projection + sufficient replay state atomically under a monotonic
 * server-owned append cursor. The event ledger remains authoritative.
 */
export async function syncStudyLearnerCheckpoint(input: {
  userSub: string;
  projection: StudyLearnerProjection;
  checkpoint: StudyReplayCheckpoint;
}): Promise<StudyLearnerSnapshotSyncResult> {
  const cursor = input.checkpoint.cursor;
  if (!cursor) return { status: 'unavailable' };
  const response = await studySupabaseRequest(
    'rpc/save_study_learner_checkpoint',
    {
      method: 'POST',
      body: JSON.stringify({
        p_user_sub: input.userSub,
        p_concept_id: input.projection.conceptId,
        p_schema_version: input.projection.schemaVersion,
        p_learner_model_version: input.projection.learnerModelVersion,
        p_estimator_version: input.projection.estimatorVersion,
        p_admission_version: input.checkpoint.admissionVersion,
        p_checkpoint_version: input.checkpoint.checkpointVersion,
        p_observed_through: input.projection.observedThrough,
        p_projected_at: input.projection.projectedAt,
        p_append_cursor_created_at: cursor.createdAt,
        p_append_cursor_id: cursor.id,
        p_projection: input.projection,
        p_checkpoint: input.checkpoint,
      }),
    },
    { operation: 'learner_checkpoint_sync', timeoutMs: SNAPSHOT_TIMEOUT_MS },
  );
  if (!response?.ok) return { status: 'unavailable' };
  try {
    const result = await response.json();
    return result === 'current' || result === 'saved' || result === 'snapshot_ahead'
      ? { status: result }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
