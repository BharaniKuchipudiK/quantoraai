import type { ConversationDecision, ConversationSnapshot } from "./conversation-engine.js";
import { activeCognitiveLedgerEntries, formatCognitiveLedgerForPrompt } from "./cognitive-ledger.js";
import { inferPclActionContext } from "./pcl-action-policy.js";
import {
  assessPclCognition,
  formatPclCognitiveContract,
  type PclCognitiveAssessment,
} from "./pcl-cognitive-kernel.js";

/**
 * Thin integration seam between the existing Outcome Navigator and PCL.
 *
 * The Navigator still decides the conversational move. PCL adds consequence,
 * reversibility, project continuity, evidence and human-governance policy. No
 * provider/model call is made here, and no second memory/state store is introduced.
 */
export function assessPclNavigatorTurn(
  snapshot: ConversationSnapshot,
  decision: ConversationDecision,
): PclCognitiveAssessment {
  const action = inferPclActionContext(snapshot, decision);
  return assessPclCognition({
    snapshot,
    decision,
    action,
    projectContext: snapshot.projectContext,
  });
}

export function formatPclNavigatorDirective(
  snapshot: ConversationSnapshot,
  decision: ConversationDecision,
): string {
  const governance = formatPclCognitiveContract(assessPclNavigatorTurn(snapshot, decision));
  const ledger = formatCognitiveLedgerForPrompt(snapshot.cognitiveLedger);
  return governance + ledger;
}

/** Safe additive metadata for observability and future evaluation. */
export function publicPclNavigatorMetadata(
  snapshot: ConversationSnapshot,
  decision: ConversationDecision,
) {
  const cognition = assessPclNavigatorTurn(snapshot, decision);
  const action = inferPclActionContext(snapshot, decision);
  const activeLedger = activeCognitiveLedgerEntries(snapshot.cognitiveLedger);
  return {
    kernelVersion: cognition.kernelVersion,
    outcomeAlignment: cognition.outcomeAlignment,
    autonomy: cognition.autonomy,
    humanGate: cognition.humanGate,
    risk: cognition.risk,
    reversibility: cognition.reversibility,
    confidence: cognition.confidence,
    completion: cognition.completion,
    evidenceCoverage: cognition.evidenceCoverage,
    sideEffect: action.sideEffect,
    actionReasonCode: action.reasonCode,
    projectContextAvailable: cognition.continuity.projectContextAvailable,
    ledgerEntries: snapshot.cognitiveLedger.length,
    activeRejections: activeLedger.filter((entry) => entry.type === "rejection").length,
    activeCorrections: activeLedger.filter((entry) => entry.type === "correction").length,
  };
}
