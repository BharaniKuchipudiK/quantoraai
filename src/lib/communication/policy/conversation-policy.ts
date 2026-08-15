import type { ConversationDecision, ConversationSnapshot } from '../../../../api/_lib/conversation-engine.js';
import type { ResponseContract } from './response-contract';

function depthFromDecision(decision: ConversationDecision): ResponseContract['depth'] {
  if (decision.move === 'clarify' || decision.move === 'close') return 'light';
  if (decision.move === 'verify' || decision.move === 'challenge') return 'deep';
  return 'standard';
}

function toneFromSnapshot(snapshot: ConversationSnapshot): ResponseContract['tone'] {
  if (snapshot.currentTurn.studioDomain === 'education' || snapshot.currentTurn.studioDomain === 'travel') return 'warm';
  if (snapshot.currentTurn.studioDomain === 'finance' || snapshot.currentTurn.taskCategory === 'research') return 'analytical';
  return 'practical';
}

export function buildResponseContract(
  snapshot: ConversationSnapshot,
  decision: ConversationDecision,
): ResponseContract {
  return {
    action: decision.move === 'recommend' ? 'answer' : decision.move === 'act' ? 'plan' : decision.move,
    tone: toneFromSnapshot(snapshot),
    depth: depthFromDecision(decision),
    safetyLevel: snapshot.safetyFlags.length > 0 || decision.move === 'challenge' ? 'high' : snapshot.currentTurn.studioDomain === 'finance' ? 'guarded' : 'normal',
    includeMemory: snapshot.stateSource === 'authoritative' || snapshot.confirmedFacts.length > 0,
    allowBuildArtifact: snapshot.currentTurn.studioMode === 'build' || snapshot.currentTurn.guidedBuild || snapshot.currentTurn.refineMode,
    requireEvidenceFraming: snapshot.currentTurn.studioDomain === 'finance' || snapshot.currentTurn.studioDomain === 'research' || decision.move === 'verify',
  };
}
