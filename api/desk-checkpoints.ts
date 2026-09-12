/**
 * Durable rewind for the Coding Desk (Phase 7).
 *
 * The desk keeps a rewind history in memory and loses it with the tab. This
 * endpoint gives that history a server-side home, so the work outlives the
 * browser, the container, and the day.
 *
 * IT REFUSES RATHER THAN GUESSES, ON BOTH SIDES
 *
 * A save that cannot reach the store answers 503, because a caller told "saved"
 * will believe its work is safe and stop holding it. A restore whose chain does
 * not verify answers 409 with the checkpoint that broke, never a working tree
 * assembled from two different moments — that tree looks fine, and the person
 * would keep building on it until the good state was gone.
 *
 * A SESSION ID IS A HANDLE, NOT AN AUTHORISATION
 *
 * Both directions are scoped to the signed-in subject as well as the session,
 * so knowing or guessing an id never reaches another person's source. The
 * store enforces the same pairing in its queries.
 */
import { requireActiveSession } from "./_lib/authz.js";
import { isStoreConfigured, readDeskCheckpoints, saveDeskCheckpointsRevision } from "./_lib/store.js";
import {
  deskCheckpointStepsFromRows,
  planDeskCheckpointChain,
  replayDeskCheckpointChain,
} from "../src/lib/desk-checkpoint-delta.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function safeSessionId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return SAFE_ID.test(id) ? id : null;
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  if (!isStoreConfigured()) {
    return res.status(503).json({
      error: "Durable checkpoint storage is not configured.",
      reason: "storage-unconfigured",
    });
  }

  const userSub = auth.value.sessionUser.sub;
  const sessionId = safeSessionId(req.method === "GET" ? req.query?.sessionId : req.body?.sessionId);
  if (!sessionId) return res.status(400).json({ error: "A valid sessionId is required." });

  if (req.method === "POST") {
    const expectedRevision = req.body?.expectedRevision;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return res.status(409).json({ reason: "revision-required", error: "Reload the saved history before saving. Your local files are unchanged." });
    }
    const history = Array.isArray(req.body?.history) ? req.body.history : null;
    if (!history) return res.status(400).json({ error: "history must be an array of checkpoints." });

    const plan = planDeskCheckpointChain(history);
    if (plan.stoppedAt || plan.steps.length !== history.length) {
      return res.status(422).json({ saved: 0, reason: plan.reason || 'invalid-history', error: 'The complete history could not be stored. Local files are unchanged.' });
    }
    if (!plan.steps.length) {
      return res.status(200).json({ saved: 0, stoppedAt: plan.stoppedAt, reason: plan.reason });
    }
    const saved = await saveDeskCheckpointsRevision(
      userSub,
      sessionId,
      plan.steps.map((step, seq) => ({
        checkpoint_id: step.id,
        seq,
        label: step.label,
        origin: step.origin,
        hash: step.hash,
        delta: step.delta,
      })),
      expectedRevision,
    );
    // Never answer "saved" on a write that did not land: the desk would drop
    // the in-memory history it is still the only holder of.
    if (saved.status === "conflict") {
      return res.status(409).json({ reason: "save-conflict", error: "Newer work was saved elsewhere. Your local files are unchanged; reload and reconcile before saving." });
    }
    if (saved.status !== "saved") {
      return res.status(503).json({
        error: "The checkpoints could not be stored, so keep the history you have.",
        reason: "store-unreachable",
      });
    }
    return res.status(200).json({
      revision: saved.revision,
      saved: plan.steps.length,
      stoppedAt: plan.stoppedAt,
      reason: plan.reason,
    });
  }

  const rows = await readDeskCheckpoints(userSub, sessionId);
  // null is "could not ask", which must not render as an empty rewind menu —
  // that tells someone their work never existed.
  if (rows === null) {
    return res.status(503).json({
      error: "The stored history could not be read, so it is not known whether there is one.",
      reason: "store-unreachable",
    });
  }

  const chain = deskCheckpointStepsFromRows(rows);
  const upTo = safeSessionId(req.query?.checkpointId) ? String(req.query.checkpointId) : null;
  const wanted = upTo
    ? chain.steps.slice(0, chain.steps.findIndex((step) => step.id === upTo) + 1)
    : chain.steps;
  if (upTo && !wanted.length) {
    return res.status(404).json({ error: "That checkpoint is not in this session's stored history." });
  }

  const replay = replayDeskCheckpointChain({ steps: wanted });
  const checkpoints = chain.steps.map((step) => ({
    id: step.id,
    at: step.at,
    label: step.label,
    origin: step.origin,
  }));

  if (!chain.ok || !replay.ok) {
    return res.status(409).json({
      error: chain.ok ? replay.reason : chain.reason,
      reason: "chain-broken",
      brokeAt: replay.brokeAt,
      verifiedSteps: replay.verifiedSteps,
      // The last state that actually verified, offered as itself and never as
      // the state that was asked for.
      lastVerifiedVfs: replay.vfs,
      checkpoints,
    });
  }

  return res.status(200).json({
    sessionId,
    revision: rows[0]?.generation ?? 0,
    vfs: replay.vfs,
    verifiedSteps: replay.verifiedSteps,
    checkpoints,
    /*
     * The chain itself, so the desk can rebuild its history and verify it
     * independently rather than trusting this answer. Deltas, not trees, so the
     * payload stays the size of what changed.
     */
    steps: wanted.map((step) => ({
      id: step.id,
      at: step.at,
      label: step.label,
      origin: step.origin,
      hash: step.hash,
      delta: step.delta,
    })),
  });
}
