import {
  readVerifiedStudyMasteryEvidenceDelta,
  readVerifiedStudyMasteryEvidenceWithCursor,
} from './study-evidence-loader.js';
import {
  estimateStudyMastery,
  estimateStudyMasteryFromAccumulator,
  type StudyMasteryEstimate,
} from './study-mastery-estimator.js';
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
  currentStudyDbCalls,
  emitStudyTelemetry,
  studyTelemetryElapsedMs,
  studyTelemetryStartedAt,
  type StudyReplayFallbackReason,
} from './study-observability.js';
import {
  buildStudyReplayCheckpoint,
  replayStudyLearnerProjectionFromCheckpoint,
} from './study-replay-checkpoint.js';

export const STUDY_PROJECTION_LOADER_VERSION = 'study-projection-loader-2026-09-02.2';

export type StudyLearnerProjectionLoadResult = {
  projection: StudyLearnerProjection;
  masteryEstimate: StudyMasteryEstimate;
  source: 'checkpoint_delta' | 'full_replay';
};

async function fullReplay(input: {
  userSub: string;
  conceptId: string;
  conceptKey: string;
  asOf: string;
}, telemetry: {
  startedAtMs: number;
  startingDbCalls: number;
  fallbackReason?: StudyReplayFallbackReason;
}): Promise<StudyLearnerProjectionLoadResult | null> {
  const full = await readVerifiedStudyMasteryEvidenceWithCursor(
    input.userSub,
    input.conceptId,
    input.conceptKey,
  );
  if (!full) {
    emitStudyTelemetry({
      event: 'projection_load',
      operation: 'learner_projection_load',
      status: 'unavailable',
      fallbackReason: telemetry.fallbackReason || 'full_replay_unavailable',
      durationMs: studyTelemetryElapsedMs(telemetry.startedAtMs),
      dbCalls: currentStudyDbCalls() - telemetry.startingDbCalls,
    });
    return null;
  }
  const masteryEstimate = estimateStudyMastery(full.evidence);
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
  emitStudyTelemetry({
    event: 'projection_load',
    operation: 'learner_projection_load',
    status: 'success',
    source: 'full_replay',
    fallbackReason: telemetry.fallbackReason,
    durationMs: studyTelemetryElapsedMs(telemetry.startedAtMs),
    dbCalls: currentStudyDbCalls() - telemetry.startingDbCalls,
  });
  return { projection, masteryEstimate, source: 'full_replay' };
}

/**
 * Single H3 learner reconstruction seam.
 *
 * Checkpoints are only an optimization. If checkpoint read, delta read,
 * compatibility, ordering, or validation is uncertain, this function performs
 * the bounded authoritative full replay instead. No stale checkpoint state is
 * returned solely because a storage dependency is unavailable.
 *
 * The returned mastery estimate is derived from the same canonical replay state
 * as the learner model. This keeps downstream read-only decision services from
 * recomputing or inventing a parallel learner truth.
 */
export async function loadVerifiedStudyLearnerProjection(input: {
  userSub: string;
  conceptId: string;
  conceptKey: string;
  asOf: string;
}): Promise<StudyLearnerProjectionLoadResult | null> {
  const startedAtMs = studyTelemetryStartedAt();
  const startingDbCalls = currentStudyDbCalls();
  let fallbackReason: StudyReplayFallbackReason | undefined;

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
        const masteryEstimate = estimateStudyMasteryFromAccumulator(replayed.nextCheckpoint.masteryState);
        await syncStudyLearnerCheckpoint({
          userSub: input.userSub,
          projection: replayed.projection,
          checkpoint: replayed.nextCheckpoint,
        });
        emitStudyTelemetry({
          event: 'projection_load',
          operation: 'learner_projection_load',
          status: 'success',
          source: 'checkpoint_delta',
          durationMs: studyTelemetryElapsedMs(startedAtMs),
          dbCalls: currentStudyDbCalls() - startingDbCalls,
        });
        return { projection: replayed.projection, masteryEstimate, source: 'checkpoint_delta' };
      }
      fallbackReason = 'checkpoint_replay_rejected';
    } else if (delta.status === 'requires_full_replay') {
      fallbackReason = 'delta_overflow';
    } else {
      fallbackReason = 'delta_unavailable';
    }
  } else {
    fallbackReason = checkpointRead.status === 'unavailable'
      ? 'checkpoint_unavailable'
      : 'checkpoint_miss';
  }

  return fullReplay(input, { startedAtMs, startingDbCalls, fallbackReason });
}
