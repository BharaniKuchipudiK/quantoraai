import { randomUUID } from "node:crypto";
import { requireActiveSession } from "./_lib/authz.js";
import { isQirRunStoreConfigured, readQirRun } from "./_lib/qir-run-store.js";
import {
  persistQirCapacityResume,
  persistQirResourceRequest,
} from "./_lib/qir-resource-ledger.js";
import type { QirResourceLane } from "./_lib/qir-resource-governor.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const LANES = new Set<QirResourceLane>(["ordinary", "recovery", "premium"]);

function safeId(value: unknown, max = 192): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max && SAFE_ID.test(text) ? text : null;
}

function sendCommit(res: any, result: any) {
  if (result.status === "conflict") return res.status(409).json({ error: "Run changed; resume the durable snapshot and retry.", conflict: true });
  if (result.status === "not_found") return res.status(404).json({ error: "Run not found." });
  if (result.status === "stale") return res.status(202).json({ run: result.record.run, storageVersion: result.record.storageVersion, stale: true, durability: "persisted" });
  if (result.status === "invalid") return res.status(409).json({ error: "Run is not waiting for capacity.", run: result.record.run, storageVersion: result.record.storageVersion });
  if (result.status !== "committed") return res.status(503).json({ error: "Unable to persist the resource transition." });
  return res.status(200).json({ run: result.record.run, storageVersion: result.record.storageVersion, durability: "persisted" });
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  if (!isQirRunStoreConfigured()) return res.status(503).json({ error: "Durable QIR runtime storage is not configured." });

  const userSub = auth.value.sessionUser.sub;
  const runId = safeId(req.body?.runId, 128);
  const actionId = safeId(req.body?.actionId, 128);
  if (!runId || !actionId) return res.status(400).json({ error: "Valid runId and actionId are required." });

  const record = await readQirRun(userSub, runId);
  if (!record) return res.status(404).json({ error: "Run not found." });
  const now = new Date().toISOString();
  const operation = String(req.body?.operation || "request");

  if (operation === "resume") {
    const eventId = safeId(req.body?.eventId) || `capacity-resume-${randomUUID()}`;
    return sendCommit(res, await persistQirCapacityResume({ userSub, record, actionId, eventId, now }));
  }

  if (operation !== "request") return res.status(400).json({ error: "Unsupported resource operation." });
  const lane = String(req.body?.lane || "") as QirResourceLane;
  const units = Number(req.body?.units);
  if (!LANES.has(lane) || !Number.isInteger(units) || units <= 0) {
    return res.status(400).json({ error: "A valid resource lane and positive integer units are required." });
  }
  const capacityAvailable = req.body?.capacityAvailable !== false;
  const eventId = safeId(req.body?.eventId) || `resource-${randomUUID()}`;
  const checkpointId = safeId(req.body?.checkpointId) || `resource-checkpoint-${randomUUID()}`;
  return sendCommit(res, await persistQirResourceRequest({
    userSub,
    record,
    request: { actionId, lane, units, capacityAvailable, eventId, checkpointId, now },
  }));
}
