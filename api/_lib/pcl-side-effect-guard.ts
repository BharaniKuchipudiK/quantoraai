import { appendCognitiveLedgerEntry, type CognitiveLedgerEntry } from "./cognitive-ledger.js";
import { appendExplicitHumanLedgerEvent } from "./cognitive-ledger-transitions.js";
import { normalizeOutcomeSessionId } from "./outcome-state.js";
import { authorizePclExecution, createPclActionRef, type PclExecutionAuthorization } from "./pcl-execution-gate.js";
import { PCL_COGNITIVE_KERNEL_VERSION, type PclCognitiveAssessment, type PclReversibility, type PclRisk } from "./pcl-cognitive-kernel.js";
import type { PclActionAssessment } from "./pcl-action-policy.js";
import { isStoreConfigured, readOutcomeState, saveOutcomeState } from "./store.js";

export type PclSideEffectKind = "internal" | "external" | "transactional" | "destructive";

export type PclSideEffectInput = {
  userSub: string;
  sessionId?: unknown;
  humanConfirmed?: boolean;
  confirmationSource?: string | null;
  description: string;
  tool: string;
  args?: unknown;
  scope?: string | null;
  risk: PclRisk;
  reversibility: PclReversibility;
  sideEffect: PclSideEffectKind;
  requiresApproval: boolean;
};

export type PclSideEffectGuardResult = PclExecutionAuthorization & {
  durable: boolean;
  confirmationSource: string | null;
};

function cognitionForAdapter(input: PclSideEffectInput): PclCognitiveAssessment {
  const humanGate = input.requiresApproval
    ? "approve" as const
    : input.risk === "medium" || input.reversibility === "partial"
      ? "inform" as const
      : "none" as const;
  const autonomy = humanGate === "approve" ? "gated" as const : humanGate === "inform" ? "supervised" as const : "autonomous" as const;
  return {
    kernelVersion: PCL_COGNITIVE_KERNEL_VERSION,
    outcomeAlignment: "aligned",
    autonomy,
    humanGate,
    risk: input.risk,
    reversibility: input.reversibility,
    confidence: 1,
    completion: 0,
    evidenceCoverage: 0,
    missingCritical: [],
    conflicts: [],
    reasons: [input.requiresApproval ? "adapter_side_effect_requires_approval" : "adapter_side_effect_reversible"],
    responsePolicy: {
      questionBudget: input.requiresApproval ? 1 : 0,
      leadWithOutcome: !input.requiresApproval,
      discloseMaterialAssumption: false,
      requireApprovalBeforeAction: input.requiresApproval,
      surfaceConflict: false,
      verifyBeforeClaimingDone: true,
      stopWhenOutcomeAchieved: true,
    },
    continuity: {
      stateAuthority: "authoritative",
      projectContextAvailable: false,
      decisionsKnown: 0,
      artifactsKnown: 0,
      verifiedArtifacts: 0,
      ledgerEntriesKnown: 0,
      activeRejectionsKnown: 0,
      activeCorrectionsKnown: 0,
    },
  };
}

function actionForAdapter(input: PclSideEffectInput): PclActionAssessment {
  return {
    description: input.description.trim().slice(0, 800),
    risk: input.risk,
    reversibility: input.reversibility,
    sideEffect: input.sideEffect,
    reasonCode: input.requiresApproval ? "adapter_consequential_side_effect" : "adapter_reversible_side_effect",
  };
}

function ephemeralApproval(actionRef: string, source: string | null): CognitiveLedgerEntry {
  return {
    id: `ephemeral-${actionRef}`,
    type: "approval",
    statement: "User confirmed this exact side effect in the current interaction.",
    rationale: source ? `First-party confirmation surface: ${source}` : "First-party confirmation surface.",
    actor: "user",
    status: "active",
    sourceTurn: null,
    createdAt: new Date().toISOString(),
    ref: actionRef,
    supersedes: null,
    confidence: 1,
  };
}

async function appendDurableApproval(input: {
  userSub: string;
  sessionId: string;
  actionRef: string;
  confirmationSource: string | null;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record = await readOutcomeState(input.userSub, input.sessionId);
    if (!record?.state.memory.consented) return record;
    if (record.state.cognitiveLedger.some((entry) => entry.status === "active" && entry.type === "approval" && entry.ref === input.actionRef)) {
      return record;
    }
    const state = appendExplicitHumanLedgerEvent(record.state, {
      type: "approval",
      statement: "Approved the exact consequential action.",
      rationale: input.confirmationSource ? `Confirmed through ${input.confirmationSource}.` : undefined,
      ref: input.actionRef,
    }, { sourceTurn: input.confirmationSource || "side-effect-confirmation" });
    if (!state) return record;
    const saved = await saveOutcomeState({
      userSub: input.userSub,
      sessionId: input.sessionId,
      expectedVersion: record.version,
      state,
      sourceTurn: input.confirmationSource || "side-effect-confirmation",
    });
    if (saved.status === "saved") return saved.record;
    if (saved.status !== "conflict") return record;
  }
  return readOutcomeState(input.userSub, input.sessionId);
}

/**
 * Mandatory adapter authorization seam for external side effects.
 *
 * Durable PCL approval/evidence is used when the user opted into Session Outcome
 * Memory. Without memory consent, a first-party human confirmation is valid only
 * for this request and is never written to another hidden store.
 */
export async function guardPclSideEffect(input: PclSideEffectInput): Promise<PclSideEffectGuardResult> {
  const action = actionForAdapter(input);
  const cognition = cognitionForAdapter(input);
  const actionRef = createPclActionRef({ action, tool: input.tool, args: input.args, scope: input.scope });
  const sessionId = normalizeOutcomeSessionId(input.sessionId);
  const canUseDurableLedger = Boolean(input.userSub && sessionId && isStoreConfigured());
  let record = canUseDurableLedger ? await readOutcomeState(input.userSub, sessionId as string) : null;
  const durable = Boolean(record?.state.memory.consented);

  if (input.requiresApproval && input.humanConfirmed && durable && sessionId) {
    record = await appendDurableApproval({
      userSub: input.userSub,
      sessionId,
      actionRef,
      confirmationSource: input.confirmationSource || null,
    });
  }

  const ledger: CognitiveLedgerEntry[] = record?.state.cognitiveLedger ? [...record.state.cognitiveLedger] : [];
  if (input.requiresApproval && input.humanConfirmed && !durable) {
    ledger.push(ephemeralApproval(actionRef, input.confirmationSource || null));
  }

  const authorization = authorizePclExecution({
    cognition,
    action,
    ledger,
    actionRef,
    tool: input.tool,
    args: input.args,
    scope: input.scope,
  });

  return {
    ...authorization,
    durable,
    confirmationSource: input.confirmationSource || null,
  };
}

export async function recordPclExecutionEvidence(input: {
  userSub: string;
  sessionId?: unknown;
  actionRef: string;
  statement: string;
  evidenceRef?: string | null;
  sourceTurn?: string | null;
}): Promise<boolean> {
  const sessionId = normalizeOutcomeSessionId(input.sessionId);
  if (!sessionId || !input.userSub || !isStoreConfigured()) return false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record = await readOutcomeState(input.userSub, sessionId);
    if (!record?.state.memory.consented) return false;
    if (record.state.cognitiveLedger.some((entry) => entry.status === "active" && entry.type === "evidence" && entry.ref === input.actionRef)) {
      return true;
    }
    const state = {
      ...record.state,
      cognitiveLedger: appendCognitiveLedgerEntry(record.state.cognitiveLedger, {
        type: "evidence",
        statement: String(input.statement || "External action completed").trim().slice(0, 800),
        rationale: input.evidenceRef ? `Provider evidence: ${String(input.evidenceRef).slice(0, 1200)}` : undefined,
        actor: "tool",
        status: "active",
        sourceTurn: input.sourceTurn || "side-effect-result",
        createdAt: new Date().toISOString(),
        ref: input.actionRef,
        confidence: 1,
      }),
    };
    const saved = await saveOutcomeState({
      userSub: input.userSub,
      sessionId,
      expectedVersion: record.version,
      state,
      sourceTurn: input.sourceTurn || "side-effect-result",
    });
    if (saved.status === "saved") return true;
    if (saved.status !== "conflict") return false;
  }
  return false;
}

export function pclHumanConfirmation(req: any, allowedSources: string[]): { confirmed: boolean; source: string | null } {
  const raw = req?.headers?.["x-quantora-human-confirmed"];
  const source = typeof raw === "string" ? raw.trim().slice(0, 80) : null;
  return {
    confirmed: Boolean(source && allowedSources.includes(source)),
    source,
  };
}
