import { activeCognitiveLedgerEntries, type CognitiveLedgerEntry } from "./cognitive-ledger.js";
import type { PclActionAssessment } from "./pcl-action-policy.js";
import type { PclCognitiveAssessment } from "./pcl-cognitive-kernel.js";

export type PclExecutionStatus = "allow" | "allow_inform" | "require_approval" | "require_choice" | "block";

export type PclExecutionAuthorization = {
  status: PclExecutionStatus;
  canExecute: boolean;
  actionRef: string;
  reasonCode: string;
  approvalEntryId?: string | null;
  evidenceEntryId?: string | null;
};

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canonical(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${canonical(record[key])}`).join(",")}}`;
  }
  return String(value).toLocaleLowerCase();
}

/** Stable idempotency/approval reference for one concrete consequential action. */
export function createPclActionRef(input: {
  action: PclActionAssessment;
  tool?: string | null;
  args?: unknown;
  scope?: string | null;
}): string {
  return `pcl-action:${stableHash([
    canonical(input.scope),
    canonical(input.tool),
    canonical(input.action.sideEffect),
    canonical(input.action.description),
    canonical(input.args),
  ].join("\u0000"))}`;
}

function matchingEntry(
  ledger: CognitiveLedgerEntry[] | unknown,
  type: "approval" | "evidence",
  actionRef: string,
): CognitiveLedgerEntry | null {
  return activeCognitiveLedgerEntries(ledger, [type])
    .find((entry) => entry.ref === actionRef) || null;
}

/**
 * Adapter-level authorization. PCL prompt instructions are advisory to models;
 * this gate is the enforceable boundary for side effects.
 *
 * A consequential action needs a matching explicit human approval event. After
 * successful execution the adapter must append evidence with the same actionRef;
 * that evidence prevents accidental replay of the same action.
 */
export function authorizePclExecution(input: {
  cognition: PclCognitiveAssessment;
  action: PclActionAssessment;
  ledger?: CognitiveLedgerEntry[] | unknown;
  actionRef?: string;
  tool?: string | null;
  args?: unknown;
  scope?: string | null;
}): PclExecutionAuthorization {
  const actionRef = input.actionRef || createPclActionRef({
    action: input.action,
    tool: input.tool,
    args: input.args,
    scope: input.scope,
  });
  const approval = matchingEntry(input.ledger || [], "approval", actionRef);
  const evidence = matchingEntry(input.ledger || [], "evidence", actionRef);

  // Idempotency safety: evidence means this exact action already succeeded.
  if (evidence) {
    return {
      status: "block",
      canExecute: false,
      actionRef,
      reasonCode: "action_already_evidenced",
      approvalEntryId: approval?.id || null,
      evidenceEntryId: evidence.id,
    };
  }

  if (input.cognition.outcomeAlignment === "complete") {
    return {
      status: "block",
      canExecute: false,
      actionRef,
      reasonCode: "outcome_already_complete",
      approvalEntryId: approval?.id || null,
      evidenceEntryId: null,
    };
  }

  if (input.cognition.humanGate === "choose") {
    return {
      status: "require_choice",
      canExecute: false,
      actionRef,
      reasonCode: "material_choice_required",
      approvalEntryId: null,
      evidenceEntryId: null,
    };
  }

  if (input.cognition.humanGate === "approve" && !approval) {
    return {
      status: "require_approval",
      canExecute: false,
      actionRef,
      reasonCode: "explicit_human_approval_required",
      approvalEntryId: null,
      evidenceEntryId: null,
    };
  }

  if (input.cognition.humanGate === "approve" && approval) {
    return {
      status: "allow",
      canExecute: true,
      actionRef,
      reasonCode: "explicit_human_approval_present",
      approvalEntryId: approval.id,
      evidenceEntryId: null,
    };
  }

  if (input.cognition.humanGate === "inform") {
    return {
      status: "allow_inform",
      canExecute: true,
      actionRef,
      reasonCode: "reversible_supervised_action",
      approvalEntryId: null,
      evidenceEntryId: null,
    };
  }

  return {
    status: "allow",
    canExecute: true,
    actionRef,
    reasonCode: "safe_reversible_action",
    approvalEntryId: null,
    evidenceEntryId: null,
  };
}
