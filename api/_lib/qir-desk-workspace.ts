import { randomUUID } from "node:crypto";
import { readDeskCheckpoints, saveDeskCheckpoints, type DeskCheckpointRow } from "./store.js";
import { readQirWorkingContext } from "./qir-context-state.js";
import type { QirAgentRun } from "./qir-contracts.js";
import { hashVfsContent } from "../../src/lib/desk-checkpoints.js";
import {
  deskCheckpointStepsFromRows,
  hydrateDeskCheckpointHistory,
  planDeskCheckpointChain,
  replayDeskCheckpointChain,
} from "../../src/lib/desk-checkpoint-delta.js";

export type QirDeskWorkspaceLoad =
  | { status: "loaded"; sessionId: string; vfs: Record<string, string>; checkpointCount: number }
  | { status: "missing-session-binding" }
  | { status: "unavailable"; reason: string };

type WorkspaceBindings = {
  readRows(userSub: string, sessionId: string): Promise<DeskCheckpointRow[] | null>;
  saveRows(userSub: string, sessionId: string, rows: DeskCheckpointRow[]): Promise<boolean>;
};

const productionBindings: WorkspaceBindings = {
  readRows: readDeskCheckpoints,
  saveRows: saveDeskCheckpoints,
};

function boundSessionId(run: QirAgentRun): string {
  const context = readQirWorkingContext(run);
  const value = context?.projectState?.sessionId;
  return typeof value === "string" ? value.trim().slice(0, 128) : "";
}

export async function loadQirDeskWorkspace(
  userSub: string,
  run: QirAgentRun,
  bindings: WorkspaceBindings = productionBindings,
): Promise<QirDeskWorkspaceLoad> {
  const sessionId = boundSessionId(run);
  if (!sessionId) return { status: "missing-session-binding" };
  const rows = await bindings.readRows(userSub, sessionId);
  if (rows === null) return { status: "unavailable", reason: "checkpoint-store-unreachable" };
  const chain = deskCheckpointStepsFromRows(rows);
  if (!chain.ok) return { status: "unavailable", reason: chain.reason };
  const replay = replayDeskCheckpointChain({ steps: chain.steps });
  if (!replay.ok) return { status: "unavailable", reason: replay.reason };
  return {
    status: "loaded",
    sessionId,
    vfs: replay.vfs as Record<string, string>,
    checkpointCount: chain.steps.length,
  };
}

export async function saveQirDeskWorkspace(
  input: {
    userSub: string;
    run: QirAgentRun;
    vfs: Record<string, unknown>;
    label?: string;
    maxHistory?: number;
    /** Stable per external action. A retry after a worker crash must reuse it. */
    checkpointId?: string;
  },
  bindings: WorkspaceBindings = productionBindings,
): Promise<{ status: "saved"; sessionId: string; checkpointId: string; replayed?: boolean } | { status: "unavailable"; reason: string }> {
  const sessionId = boundSessionId(input.run);
  if (!sessionId) return { status: "unavailable", reason: "missing-session-binding" };
  const rows = await bindings.readRows(input.userSub, sessionId);
  if (rows === null) return { status: "unavailable", reason: "checkpoint-store-unreachable" };
  const chain = deskCheckpointStepsFromRows(rows);
  if (!chain.ok) return { status: "unavailable", reason: chain.reason };
  const hydrated = hydrateDeskCheckpointHistory(chain.steps);
  if (!hydrated.ok) return { status: "unavailable", reason: hydrated.reason };

  const checkpointId = String(input.checkpointId || `qir-worker-${randomUUID()}`).trim().slice(0, 120);
  const wantedHash = hashVfsContent(input.vfs);
  const already = hydrated.entries.find((entry: any) => entry.id === checkpointId);
  if (already) {
    if (already.hash !== wantedHash) {
      return { status: "unavailable", reason: "idempotency-key-reused-for-different-workspace" };
    }
    return { status: "saved", sessionId, checkpointId, replayed: true };
  }

  const maxHistory = Math.max(1, Math.min(40, Math.round(Number(input.maxHistory) || 20)));
  const history = [
    ...hydrated.entries,
    {
      id: checkpointId,
      at: Date.now(),
      label: String(input.label || "Server worker checkpoint").slice(0, 120),
      origin: "commit",
      vfs: input.vfs,
      hash: wantedHash,
    },
  ].slice(-maxHistory);
  const plan = planDeskCheckpointChain(history);
  if (plan.stoppedAt || plan.steps.length !== history.length) {
    return { status: "unavailable", reason: plan.reason || "workspace-checkpoint-not-storable" };
  }
  const saved = await bindings.saveRows(
    input.userSub,
    sessionId,
    plan.steps.map((step: any, seq: number) => ({
      checkpoint_id: step.id,
      seq,
      label: step.label,
      origin: step.origin,
      hash: step.hash,
      delta: step.delta,
    })),
  );
  return saved
    ? { status: "saved", sessionId, checkpointId }
    : { status: "unavailable", reason: "checkpoint-store-write-failed" };
}
