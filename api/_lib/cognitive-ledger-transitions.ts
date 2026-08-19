import {
  appendCognitiveLedgerEntry,
  normalizeCognitiveLedger,
  type CognitiveLedgerEntry,
} from "./cognitive-ledger.js";
import { normalizeOutcomeState, type OutcomeState } from "./outcome-state.js";

type NormalizedOutcome = ReturnType<typeof normalizeOutcomeState>;

type TransitionOptions = {
  sourceTurn?: string | null;
  now?: string;
};

function clean(value: unknown, max = 800): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function key(value: string): string {
  return clean(value).toLocaleLowerCase();
}

function mapBy<T>(values: T[], getKey: (value: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const value of values) {
    const k = key(getKey(value));
    if (k) map.set(k, value);
  }
  return map;
}

function append(
  ledger: CognitiveLedgerEntry[],
  entry: Omit<CognitiveLedgerEntry, "id" | "status" | "actor"> & { id?: string },
): CognitiveLedgerEntry[] {
  return appendCognitiveLedgerEntry(ledger, {
    ...entry,
    actor: "system",
    status: "active",
  });
}

function transitionRef(kind: string, value: string): string {
  return `outcome:${kind}:${key(value).slice(0, 120)}`;
}

/**
 * Derive durable cognitive history from trusted Outcome State changes.
 *
 * This is deliberately deterministic. The model never decides what to remember.
 * The server records only meaningful state transitions, not raw chat transcripts.
 */
export function deriveCognitiveLedgerTransitions(
  previousValue: OutcomeState | unknown,
  nextValue: OutcomeState | unknown,
  options: TransitionOptions = {},
): CognitiveLedgerEntry[] {
  const previous = normalizeOutcomeState(previousValue);
  const next = normalizeOutcomeState(nextValue);
  let ledger = normalizeCognitiveLedger(previous.cognitiveLedger);
  const sourceTurn = clean(options.sourceTurn, 128) || null;
  const createdAt = clean(options.now, 80) || new Date().toISOString();

  const previousGoal = clean(previous.goal?.statement);
  const nextGoal = clean(next.goal?.statement);
  if (nextGoal && previousGoal && key(nextGoal) !== key(previousGoal)) {
    ledger = append(ledger, {
      type: "correction",
      statement: `Outcome goal changed from "${previousGoal}" to "${nextGoal}"`,
      rationale: "Derived from a persisted Outcome State goal change.",
      sourceTurn,
      createdAt,
      ref: transitionRef("goal", nextGoal),
    });
  } else if (nextGoal && !previousGoal) {
    ledger = append(ledger, {
      type: "outcome_transition",
      statement: `Outcome goal established: ${nextGoal}`,
      sourceTurn,
      createdAt,
      ref: transitionRef("goal", nextGoal),
    });
  }

  const previousDecisions = mapBy(previous.decisions, (item) => item.value);
  for (const decision of next.decisions) {
    if (previousDecisions.has(key(decision.value))) continue;
    ledger = append(ledger, {
      type: "decision",
      statement: decision.value,
      ...(decision.rationale ? { rationale: decision.rationale } : {}),
      sourceTurn: decision.sourceTurn || sourceTurn,
      createdAt,
      ref: transitionRef("decision", decision.value),
    });
  }

  const previousAssumptions = mapBy(previous.assumptions, (item) => item.value);
  for (const assumption of next.assumptions) {
    if (assumption.status !== "rejected") continue;
    const prior = previousAssumptions.get(key(assumption.value));
    if (prior?.status === "rejected") continue;
    ledger = append(ledger, {
      type: "rejection",
      statement: assumption.value,
      rationale: prior
        ? `Previously ${prior.status}; now rejected in Outcome State.`
        : "Rejected in Outcome State.",
      sourceTurn: assumption.sourceTurn || sourceTurn,
      createdAt,
      ref: transitionRef("assumption", assumption.value),
    });
  }

  const previousArtifacts = new Map(previous.artifacts.map((item) => [
    `${key(item.type)}\u0000${key(item.ref)}`,
    item,
  ]));
  for (const artifact of next.artifacts) {
    const artifactKey = `${key(artifact.type)}\u0000${key(artifact.ref)}`;
    const prior = previousArtifacts.get(artifactKey);
    if (!prior) {
      ledger = append(ledger, {
        type: "artifact_version",
        statement: `${artifact.type} artifact added`,
        sourceTurn,
        createdAt,
        ref: artifact.ref,
      });
    }
    if (artifact.verifiedAt && artifact.verifiedAt !== prior?.verifiedAt) {
      ledger = append(ledger, {
        type: "evidence",
        statement: `${artifact.type} artifact verified`,
        rationale: `Verification recorded at ${artifact.verifiedAt}`,
        sourceTurn,
        createdAt,
        ref: artifact.ref,
      });
    }
  }

  const previousDone = mapBy(previous.definitionOfDone, (item) => item.criterion);
  for (const criterion of next.definitionOfDone) {
    const prior = previousDone.get(key(criterion.criterion));
    if (!criterion.confirmed || prior?.confirmed === true) continue;
    ledger = append(ledger, {
      type: "evidence",
      statement: `Definition of done confirmed: ${criterion.criterion}`,
      sourceTurn: criterion.sourceTurn || sourceTurn,
      createdAt,
      ref: transitionRef("done", criterion.criterion),
    });
  }

  if (next.goal?.status === "achieved" && previous.goal?.status !== "achieved") {
    ledger = append(ledger, {
      type: "outcome_transition",
      statement: nextGoal ? `Outcome achieved: ${nextGoal}` : "Outcome marked achieved",
      sourceTurn,
      createdAt,
      ref: nextGoal ? transitionRef("goal", nextGoal) : "outcome:goal:achieved",
    });
  }

  return ledger;
}

/**
 * Reconcile a normal Outcome State save. Existing server ledger history cannot
 * be silently deleted or rewritten by sending a replacement state document.
 * New cognitive events are derived from the trusted state transition instead.
 */
export function reconcileOutcomeCognitiveLedger(
  previousValue: OutcomeState | unknown,
  nextValue: OutcomeState | unknown,
  options: TransitionOptions = {},
): NormalizedOutcome {
  const next = normalizeOutcomeState(nextValue);
  return {
    ...next,
    cognitiveLedger: deriveCognitiveLedgerTransitions(previousValue, next, options),
  };
}

export type ExplicitHumanLedgerInput = {
  type: "decision" | "rejection" | "correction" | "approval";
  statement: string;
  rationale?: string;
  ref?: string | null;
  supersedes?: string | null;
};

/**
 * Explicit human judgment is the only path that receives actor="user".
 * Caller authentication and optimistic version control are handled by the API.
 */
export function appendExplicitHumanLedgerEvent(
  stateValue: OutcomeState | unknown,
  input: ExplicitHumanLedgerInput,
  options: TransitionOptions = {},
): NormalizedOutcome | null {
  const state = normalizeOutcomeState(stateValue);
  const statement = clean(input.statement);
  if (!statement) return null;
  const type = ["decision", "rejection", "correction", "approval"].includes(input.type)
    ? input.type
    : null;
  if (!type) return null;

  return {
    ...state,
    cognitiveLedger: appendCognitiveLedgerEntry(state.cognitiveLedger, {
      type,
      statement,
      rationale: clean(input.rationale, 1_200) || undefined,
      actor: "user",
      status: "active",
      sourceTurn: clean(options.sourceTurn, 128) || null,
      createdAt: clean(options.now, 80) || new Date().toISOString(),
      ref: clean(input.ref, 2_000) || null,
      supersedes: clean(input.supersedes, 160) || null,
      confidence: 1,
    }),
  };
}
