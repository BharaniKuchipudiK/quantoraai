import { requireActiveSession } from "./_lib/authz.js";
import {
  createQirRun,
  isQirRunStoreConfigured,
  isValidQirRunSnapshot,
  resumeQirRun,
} from "./_lib/qir-run-store.js";
import type { QirAgentRun } from "./_lib/qir-contracts.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function safeInitialRun(run: QirAgentRun): boolean {
  return run.status === "QUEUED"
    && run.goal.status !== "achieved"
    && run.cursor.attempt === 0
    && run.cursor.actionId === null
    && run.artifacts.length === 0
    && run.observations.length === 0
    && run.verifications.length === 0
    && run.checkpoints.length === 0;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser.sub;

  if (!isQirRunStoreConfigured()) {
    return res.status(503).json({ error: "Durable QIR runtime storage is not configured." });
  }

  if (req.method === "GET") {
    const runId = String(req.query?.runId || "").trim();
    if (!SAFE_ID.test(runId)) return res.status(400).json({ error: "A valid runId is required." });
    const resumed = await resumeQirRun(userSub, runId);
    if (!resumed) return res.status(404).json({ error: "Run not found." });
    return res.status(200).json({
      run: resumed.record.run,
      storageVersion: resumed.record.storageVersion,
      continuation: resumed.continuation,
      durability: "persisted",
    });
  }

  const candidate = req.body?.run;
  if (!isValidQirRunSnapshot(candidate) || !safeInitialRun(candidate)) {
    return res.status(400).json({
      error: "A new durable Run must be a valid QUEUED QIR snapshot with no execution or completion evidence.",
    });
  }

  const record = await createQirRun(userSub, candidate);
  if (!record) return res.status(503).json({ error: "Unable to persist the durable Run." });
  return res.status(201).json({
    run: record.run,
    storageVersion: record.storageVersion,
    durability: "persisted",
  });
}
