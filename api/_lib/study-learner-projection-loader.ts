import {
  readVerifiedStudyMasteryEvidenceDelta,
  readVerifiedStudyMasteryEvidenceWithCursor,
} from './study-evidence-loader.js';
import {
  replayStudyLearnerProjection,
  type StudyLearnerProjection,
} from './study-learner-projection.js';
import {
  readStudyLearnerCheckpoint,
  syncStudyLearnerCheckpoint,
  syncStudyLearnerSnapshot,
} from './study-learner-snapshot-store.js';
import {
  buildStudyReplayCheckpoint,
  replayStudyLearnerProjectionFromCheckpoint,
} from './study-replay-checkpoint.js';

export const STUDY_PROJECTION_LOADER_VERSION = 'study-projection-loader-2026-09-02.1';

export type StudyLearnerProjectionLoadResult = {
  projection: StudyLearnerProjection;
  source: 'checkpoint_delta' | 'full_replay';
};

async function fullReplay(input: {
  userSub: string;
  conceptId: string;
  conceptKey: string;
  asOf: string;
}): Promise<StudyLearnerProjectionLoadResult | null> {
  const full = await readVerifiedStudyMasteryEvidenceWithCursor(
    input.userSub,
    input.conceptId,
    input.conceptKey,
  );
  if (!full) return null;
  const projection = replayStudyLearnerProjection({
    conceptId: input.conceptId,
    conceptKey: input.conceptKey,
    evidence: full.evidence,
    asOf: input.asOf,
  });

  if (full.cursor) {
    const checkpoint = buildStudyReplayCheckpoint({
      conceptId: input.conceptId,
      conceptKey: input.conceptKey,
      evidence: full.evidence,
      cursor: full.cursor,
    });
    await syncStudyLearnerCheckpoint({ userSub: input.userSub, projection, checkpoint });
  } else {
    // Empty ledgers have no append cursor. Preserve the H3.2 derived projection,
    // but do not treat it as delta-replay eligible until a real ledger cursor exists.
    await syncStudyLearnerSnapshot({ userSub: input.userSub, projection });
  }
  return { projection, source: 'full_replay' };
}

/**
 * Single H3 learner reconstruction seam.
 *
 * Checkpoints are only an optimization. If checkpoint read, delta read,
 * compatibility, ordering, or validation is uncertain, this function performs
 * the bounded authoritative full replay instead. No stale checkpoint state is
 * returned solely because a storage dependency is unavailable.
 */
export async function loadVerifiedStudyLearnerProjection(input: {
  userSub: string;
  conceptId: string;
  conceptKey: string;
  asOf: string;
}): Promise<StudyLearnerProjectionLoadResult | null> {
  const checkpointRead = await readStudyLearnerCheckpoint(input.userSub, input.conceptId);
  if (checkpointRead.status === 'hit' && checkpointRead.checkpoint.cursor) {
    const delta = await readVerifiedStudyMasteryEvidenceDelta(
      input.userSub,
      input.conceptId,
      input.conceptKey,
      checkpointRead.checkpoint.cursor,
    );
    if (delta.status === 'complete') {
      const replayed = replayStudyLearnerProjectionFromCheckpoint({
        checkpoint: checkpointRead.checkpoint,
        conceptId: input.conceptId,
        conceptKey: input.conceptKey,
        deltaEvidence: delta.evidence,
        asOf: input.asOf,
        cursor: delta.cursor,
      });
      if (replayed.status === 'replayed') {
        await syncStudyLearnerCheckpoint({
          userSub: input.userSub,
          projection: replayed.projection,
          checkpoint: replayed.nextCheckpoint,
        });
        return { projection: replayed.projection, source: 'checkpoint_delta' };
      }
    }
  }

  return fullReplay(input);
}
