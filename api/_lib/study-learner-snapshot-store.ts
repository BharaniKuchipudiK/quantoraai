import type { StudyLearnerProjection } from './study-learner-projection.js';

const SNAPSHOT_TIMEOUT_MS = 1_500;

export type StudyLearnerSnapshotCompatibility =
  | 'current'
  | 'missing'
  | 'version_mismatch'
  | 'concept_mismatch'
  | 'ledger_advanced'
  | 'snapshot_ahead'
  | 'projection_changed';

export type StoredStudyLearnerSnapshot = {
  schemaVersion: string;
  learnerModelVersion: string;
  estimatorVersion: string;
  conceptId: string;
  observedThrough: string | null;
  projectedAt: string;
  projection: StudyLearnerProjection;
};

export type StudyLearnerSnapshotSyncResult =
  | { status: 'current'; compatibility: 'current' }
  | { status: 'saved'; compatibility: Exclude<StudyLearnerSnapshotCompatibility, 'current' | 'snapshot_ahead'> }
  | { status: 'snapshot_ahead'; compatibility: 'snapshot_ahead' }
  | { status: 'unavailable'; compatibility: StudyLearnerSnapshotCompatibility | 'unavailable' };

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function snapshotRecord(value: unknown): StoredStudyLearnerSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const projection = row.projection;
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return null;
  const projectedAt = validIso(row.projected_at);
  const observedThrough = row.observed_through == null ? null : validIso(row.observed_through);
  if (!projectedAt || (row.observed_through != null && !observedThrough)) return null;
  const schemaVersion = typeof row.schema_version === 'string' ? row.schema_version : '';
  const learnerModelVersion = typeof row.learner_model_version === 'string' ? row.learner_model_version : '';
  const estimatorVersion = typeof row.estimator_version === 'string' ? row.estimator_version : '';
  const conceptId = typeof row.concept_id === 'string' ? row.concept_id : '';
  if (!schemaVersion || !learnerModelVersion || !estimatorVersion || !conceptId) return null;
  return {
    schemaVersion,
    learnerModelVersion,
    estimatorVersion,
    conceptId,
    observedThrough,
    projectedAt,
    projection: projection as StudyLearnerProjection,
  };
}

function semanticProjection(value: StudyLearnerProjection) {
  return {
    schemaVersion: value.schemaVersion,
    learnerModelVersion: value.learnerModelVersion,
    estimatorVersion: value.estimatorVersion,
    conceptId: value.conceptId,
    conceptKey: value.conceptKey,
    evidenceCount: value.evidenceCount,
    evidenceKinds: value.evidenceKinds,
    observedThrough: value.observedThrough,
    learnerModel: value.learnerModel,
  };
}

/**
 * H3.2 intentionally does not serve learner-facing state from the snapshot.
 * This classifier exists to make persistence deterministic and fail closed;
 * H3.3 may consume compatible snapshots only after bounded delta replay exists.
 */
export function classifyStudyLearnerSnapshot(
  snapshot: StoredStudyLearnerSnapshot | null,
  projection: StudyLearnerProjection,
): StudyLearnerSnapshotCompatibility {
  if (!snapshot) return 'missing';
  if (snapshot.conceptId !== projection.conceptId) return 'concept_mismatch';
  if (
    snapshot.schemaVersion !== projection.schemaVersion
    || snapshot.learnerModelVersion !== projection.learnerModelVersion
    || snapshot.estimatorVersion !== projection.estimatorVersion
  ) return 'version_mismatch';

  const snapshotThrough = snapshot.observedThrough ? Date.parse(snapshot.observedThrough) : null;
  const projectionThrough = projection.observedThrough ? Date.parse(projection.observedThrough) : null;
  if (snapshotThrough != null && projectionThrough == null) return 'snapshot_ahead';
  if (snapshotThrough != null && projectionThrough != null && snapshotThrough > projectionThrough) return 'snapshot_ahead';
  if (projectionThrough != null && (snapshotThrough == null || projectionThrough > snapshotThrough)) return 'ledger_advanced';

  return JSON.stringify(semanticProjection(snapshot.projection)) === JSON.stringify(semanticProjection(projection))
    ? 'current'
    : 'projection_changed';
}

async function snapshotRequest(path: string, init: RequestInit, operation: string): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
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
      console.warn('Study snapshot Supabase request failed', { operation, status: response.status });
      return null;
    }
    return response;
  } catch {
    console.warn('Study snapshot Supabase request failed', { operation, status: 'transport' });
    return null;
  }
}

export async function readStudyLearnerSnapshot(
  userSub: string,
  conceptId: string,
): Promise<StoredStudyLearnerSnapshot | null | 'unavailable'> {
  if (!config()) return 'unavailable';
  const response = await snapshotRequest(
    `study_learner_snapshots?select=schema_version,learner_model_version,estimator_version,concept_id,observed_through,projected_at,projection&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&limit=1`,
    { method: 'GET' },
    'learner_snapshot_read',
  );
  if (!response) return 'unavailable';
  try {
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return snapshotRecord(rows[0]) || 'unavailable';
  } catch {
    return 'unavailable';
  }
}

async function saveStudyLearnerSnapshot(
  userSub: string,
  projection: StudyLearnerProjection,
): Promise<boolean> {
  const response = await snapshotRequest(
    'rpc/save_study_learner_snapshot',
    {
      method: 'POST',
      body: JSON.stringify({
        p_user_sub: userSub,
        p_concept_id: projection.conceptId,
        p_schema_version: projection.schemaVersion,
        p_learner_model_version: projection.learnerModelVersion,
        p_estimator_version: projection.estimatorVersion,
        p_observed_through: projection.observedThrough,
        p_projected_at: projection.projectedAt,
        p_projection: projection,
      }),
    },
    'learner_snapshot_save',
  );
  if (!response) return false;
  try {
    const result = await response.json();
    return result === true || (Array.isArray(result) && result[0] === true);
  } catch {
    return false;
  }
}

/**
 * Persist the freshly replayed projection without ever letting snapshot state
 * override the event ledger. A snapshot that is ahead of this replay is left
 * untouched so a concurrent newer write cannot be regressed.
 */
export async function syncStudyLearnerSnapshot(input: {
  userSub: string;
  projection: StudyLearnerProjection;
}): Promise<StudyLearnerSnapshotSyncResult> {
  const existing = await readStudyLearnerSnapshot(input.userSub, input.projection.conceptId);
  if (existing === 'unavailable') return { status: 'unavailable', compatibility: 'unavailable' };
  const compatibility = classifyStudyLearnerSnapshot(existing, input.projection);
  if (compatibility === 'current') return { status: 'current', compatibility };
  if (compatibility === 'snapshot_ahead') return { status: 'snapshot_ahead', compatibility };
  const saved = await saveStudyLearnerSnapshot(input.userSub, input.projection);
  return saved
    ? { status: 'saved', compatibility }
    : { status: 'unavailable', compatibility };
}
