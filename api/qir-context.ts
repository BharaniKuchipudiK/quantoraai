import { randomUUID } from "node:crypto";
import { requireActiveSession } from "./_lib/authz.js";
import {
  attachQirWorkingContext,
  compactQirWorkingContext,
  deriveQirContinuationFromContext,
  readQirWorkingContext,
} from "./_lib/qir-context-state.js";
import { commitQirRunEvent, isQirRunStoreConfigured, readQirRun } from "./_lib/qir-run-store.js";
import { deriveQirContinuation } from "./_lib/qir-contracts.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function safeRunId(value: unknown): string | null {
  const runId = typeof value === "string" ? value.trim() : "";
  return SAFE_ID.test(runId) ? runId : null;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  if (!isQirRunStoreConfigured()) return res.status(503).json({ error: "Durable QIR runtime storage is not configured.", reason: "storage-unconfigured" });

  const userSub = auth.value.sessionUser.sub;
  const runId = safeRunId(req.method === "GET" ? req.query?.runId : req.body?.runId);
  if (!runId) return res.status(400).json({ error: "A valid runId is required." });
  const record = await readQirRun(userSub, runId);
  if (!record) return res.status(404).json({ error: "Run not found." });

  if (req.method === "GET") {
    const context = readQirWorkingContext(record.run);
    if (!context) return res.status(409).json({ error: "No compatible compacted working context is available; reconstruct from the durable Run." });
    return res.status(200).json({
      runId,
      context,
      continuation: deriveQirContinuationFromContext(context),
      parityContinuation: deriveQirContinuation(record.run),
      storageVersion: record.storageVersion,
      durability: "persisted",
    });
  }

  const projectState = req.body?.projectState && typeof req.body.projectState === "object" && !Array.isArray(req.body.projectState)
    ? req.body.projectState
    : {};
  const recentInteractions = Array.isArray(req.body?.recentInteractions) ? req.body.recentInteractions : [];
  const context = compactQirWorkingContext({
    run: record.run,
    projectState,
    recentInteractions,
    compactedAt: new Date().toISOString(),
  });
  const run = attachQirWorkingContext(record.run, context);
  const result = await commitQirRunEvent({
    userSub,
    runId,
    expectedVersion: record.storageVersion,
    eventId: `context-compacted-${randomUUID()}`,
    eventType: "context.compacted",
    run,
    payload: {
      contextVersion: context.version,
      contextHash: context.hash,
      contextRef: `qir-context://${runId}/${context.hash}`,
      recentInteractionCount: context.recentInteractionResidue.length,
    },
  });

  if (result.status === "conflict") return res.status(409).json({ error: "Run changed; reload the durable Run and compact again.", conflict: true });
  if (result.status === "not_found") return res.status(404).json({ error: "Run not found." });
  if (result.status !== "committed") return res.status(503).json({ error: "Unable to persist compacted working context.", reason: "persist-failed", ...(result.diagnosis ? { diagnosis: result.diagnosis } : {}) });

  return res.status(200).json({
    runId,
    context,
    continuation: deriveQirContinuationFromContext(context),
    storageVersion: result.record.storageVersion,
    durability: "persisted",
  });
}
