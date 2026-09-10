import { validateStudyContinuityCheckpoint } from '../../src/lib/study-session-continuity.js';
import { STUDY_CONTINUITY_CLOUD_VERSION, validStudyContinuityRevision } from '../../src/lib/study-continuity-cloud.js';
import { readStudySupabaseRows, studySupabaseRequest } from './study-supabase.js';

const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
const defaults = { readRows: readStudySupabaseRows, request: studySupabaseRequest, now: Date.now };
export async function studyContinuityCloudOperation(userSub: string, body: any, deps = defaults): Promise<{ status: number; body: Record<string, any> }> {
  const sessionId = text(body?.sessionId, 128);
  const topic = text(body?.topic, 160);
  const action = body?.action;
  if (!userSub || !topic || (action !== 'continuity-list' && !sessionId)
    || !['continuity-list', 'continuity-read', 'continuity-save', 'continuity-clear'].includes(action)) {
    return { status: 400, body: { error: 'Invalid lesson continuity request.' } };
  }
  const now = deps.now();
  const scope = { sessionId, topic, now };
  if (action === 'continuity-list') {
    const rows = await deps.readRows(
      `study_session_checkpoints?select=session_id,checkpoint,expires_at&user_sub=eq.${encodeURIComponent(userSub)}&checkpoint=not.is.null&expires_at=gt.${encodeURIComponent(new Date(now).toISOString())}&order=updated_at.desc&limit=12`,
      { operation: 'study_continuity_list' },
    );
    if (rows === null) return { status: 503, body: { error: 'Cloud lesson recovery is unavailable.' } };
    const checkpoints = rows.map((row) => validateStudyContinuityCheckpoint(row.checkpoint,
      { sessionId: row.session_id, topic, now })).filter(Boolean);
    return { status: 200, body: { version: STUDY_CONTINUITY_CLOUD_VERSION, checkpoints } };
  }
  if (action === 'continuity-read') {
    const rows = await deps.readRows(
      `study_session_checkpoints?select=checkpoint,revision,expires_at&user_sub=eq.${encodeURIComponent(userSub)}&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`,
      { operation: 'study_continuity_read' },
    );
    if (rows === null) return { status: 503, body: { error: 'Cloud lesson recovery is unavailable. Local recovery is unchanged.' } };
    const row = rows[0];
    const checkpoint = row && Date.parse(row.expires_at) > now
      ? validateStudyContinuityCheckpoint(row.checkpoint, scope) : null;
    // A different topic is not a delete. Return its revision for safe subsequent writes.
    return { status: 200, body: { version: STUDY_CONTINUITY_CLOUD_VERSION,
      revision: row?.revision || null, checkpoint,
      cleared: Boolean(row && (row.checkpoint === null || Date.parse(row.expires_at) <= now)) } };
  }
  if (!Object.hasOwn(body, 'revision') || !validStudyContinuityRevision(body.revision)) {
    return { status: 400, body: { error: 'A valid checkpoint revision is required.' } };
  }
  // Discarding a stale local topic must not erase another topic on the server.
  if (action === 'continuity-clear') {
    const rows = await deps.readRows(
      `study_session_checkpoints?select=checkpoint&user_sub=eq.${encodeURIComponent(userSub)}&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`,
      { operation: 'study_continuity_discard_scope' },
    );
    if (rows === null) return { status: 503, body: { error: 'Cloud discard could not be checked.' } };
    if (rows[0]?.checkpoint && !validateStudyContinuityCheckpoint(rows[0].checkpoint, scope)) {
      return { status: 409, body: { error: 'The cloud lesson topic changed. Its saved position was retained.' } };
    }
  }
  let checkpoint = null;
  if (action === 'continuity-save') {
    if (JSON.stringify(body.checkpoint ?? null).length > 2400) return { status: 400, body: { error: 'Checkpoint is too large.' } };
    checkpoint = validateStudyContinuityCheckpoint(body.checkpoint, scope);
    if (!checkpoint) return { status: 400, body: { error: 'Invalid or expired lesson checkpoint.' } };
    checkpoint = { ...checkpoint, savedAt: now, conceptId: '', conceptKey: '' };
  }
  const response = await deps.request('rpc/write_study_session_checkpoint', {
    method: 'POST', body: JSON.stringify({ p_user_sub: userSub, p_session_id: sessionId,
      p_expected_revision: body.revision, p_checkpoint: checkpoint }),
  }, { operation: 'study_continuity_write' });
  if (!response?.ok) return { status: 503, body: { error: 'Cloud progress could not be saved. Local progress is unchanged.' } };
  let result: any;
  try { result = await response.json(); } catch { return { status: 503, body: { error: 'Invalid cloud save response.' } }; }
  if (result?.outcome === 'conflict') return { status: 409, body: { error: 'Another device changed this lesson. Reload before syncing again.' } };
  if (result?.outcome !== 'saved' || !result.revision || !validStudyContinuityRevision(result.revision)) {
    return { status: 503, body: { error: 'Cloud save was not confirmed.' } };
  }
  return { status: 200, body: { version: STUDY_CONTINUITY_CLOUD_VERSION,
    revision: result.revision, checkpoint, cleared: checkpoint === null } };
}
