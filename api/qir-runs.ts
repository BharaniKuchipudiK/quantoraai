import { requireActiveSession } from "./_lib/authz.js";
import {
  commitQirRunEvent,
  createQirRun,
  isQirRunStoreConfigured,
  isValidQirRunSnapshot,
  persistQirObservation,
  readQirRun,
  resumeQirRun,
} from "./_lib/qir-run-store.js";
import {
  beginQirCodingRecovery,
  promoteQirCodingCheckpoint,
  resumeQirCodingFromSnapshot,
} from "./_lib/qir-coding-runtime.js";
import type { QirAgentRun, QirObservation, QirVerificationResult } from "./_lib/qir-contracts.js";
import { createHash, randomUUID } from "node:crypto";
import { verifyBuild } from "./_lib/verify-build.js";

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

function safeText(value: unknown, max = 512): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function artifactRefWithDigest(ref: string, code: string): string {
  return `${ref}#sha256=${createHash("sha256").update(code).digest("hex")}`;
}

function artifactMatchesCode(ref: string, code: string): boolean {
  const expected = /#sha256=([a-f0-9]{64})$/i.exec(ref)?.[1]?.toLowerCase();
  if (!expected) return false;
  return expected === createHash("sha256").update(code).digest("hex");
}

function sendCommit(res: any, result: Awaited<ReturnType<typeof commitQirRunEvent>>) {
  if (result.status === "conflict") return res.status(409).json({ error: "Run changed; resume the durable snapshot and retry.", conflict: true });
  if (result.status === "not_found") return res.status(404).json({ error: "Run not found." });
  if (result.status !== "committed") return res.status(503).json({ error: "Unable to persist the durable Run transition." });
  return res.status(200).json({
    run: result.record.run,
    storageVersion: result.record.storageVersion,
    durability: "persisted",
  });
}

async function readOwnedRun(userSub: string, runId: unknown) {
  const id = safeText(runId, 128);
  if (!id || !SAFE_ID.test(id)) return null;
  return readQirRun(userSub, id);
}

function startModelAttempt(run: QirAgentRun, now: string): {
  run: QirAgentRun;
  stepId: string;
  actionId: string;
} {
  const existingStep = run.cursor.stepId
    ? run.steps.find((step) => step.stepId === run.cursor.stepId) || null
    : null;
  const stepId = existingStep?.stepId || `coding-model-${randomUUID()}`;
  const actionId = `coding-model-action-${randomUUID()}`;
  const step = existingStep
    ? {
      ...existingStep,
      status: "active" as const,
      actionId,
    }
    : {
      stepId,
      taskId: "coding.model",
      objective: run.goal.statement || "Produce and verify the Coding Desk artifact",
      dependsOn: [],
      status: "active" as const,
      requiresVerification: true,
      actionId,
    };
  const steps = existingStep
    ? run.steps.map((candidate) => candidate.stepId === stepId ? step : candidate)
    : [...run.steps, step];

  return {
    stepId,
    actionId,
    run: {
      ...run,
      status: "EXECUTING",
      steps,
      cursor: { ...run.cursor, stepId, actionId },
      updatedAt: now,
    },
  };
}

function attachFirstArtifact(run: QirAgentRun, artifactRef: string, code: string, now: string): QirAgentRun {
  if (run.artifacts.length > 0) return run;
  const actionId = run.cursor.actionId || `coding-action-${randomUUID()}`;
  const stepId = run.cursor.stepId || `coding-render-${randomUUID()}`;
  const hasStep = run.steps.some((step) => step.stepId === stepId);
  const steps = hasStep
    ? run.steps.map((step) => step.stepId === stepId ? { ...step, status: "active" as const, actionId } : step)
    : [{
      stepId,
      taskId: "coding.render",
      objective: run.goal.statement || "Produce and verify the Coding Desk artifact",
      dependsOn: [],
      status: "active" as const,
      requiresVerification: true,
      actionId,
    }];

  return {
    ...run,
    status: "EXECUTING",
    steps,
    cursor: { ...run.cursor, stepId, actionId },
    artifacts: [{
      artifactId: "coding-desk-vfs",
      generation: 1,
      ref: artifactRefWithDigest(artifactRef, code),
      state: "candidate",
      createdByActionId: actionId,
      verifiedByActionId: null,
    }],
    updatedAt: now,
  };
}

async function handleCodingAction(req: any, res: any, userSub: string) {
  const action = String(req.body?.action || "");
  const record = await readOwnedRun(userSub, req.body?.runId);
  if (!record) return res.status(404).json({ error: "Run not found." });
  const now = new Date().toISOString();

  if (action === "coding.attempt") {
    if (!["QUEUED", "REPLANNING"].includes(record.run.status)) {
      return res.status(409).json({ error: `A Coding model attempt cannot start from ${record.run.status}.` });
    }
    if (record.run.artifacts.some((artifact) => artifact.state === "candidate")) {
      return res.status(409).json({ error: "A candidate artifact already exists; recover or verify that generation instead." });
    }
    const started = startModelAttempt(record.run, now);
    const strategy = safeText(req.body?.strategy, 240);
    return sendCommit(res, await commitQirRunEvent({
      userSub,
      runId: started.run.runId,
      expectedVersion: record.storageVersion,
      eventId: `coding-attempt-${randomUUID()}`,
      eventType: "coding.model_attempt_started",
      run: started.run,
      payload: {
        stepId: started.stepId,
        actionId: started.actionId,
        attempt: started.run.cursor.attempt + 1,
        ...(strategy ? { strategy } : {}),
      },
    }));
  }

  if (action === "coding.start") {
    const preArtifactExecution = record.run.status === "EXECUTING"
      && record.run.artifacts.length === 0
      && Boolean(record.run.cursor.actionId);
    if (record.run.status !== "QUEUED" && !preArtifactExecution) {
      return res.status(409).json({ error: `Run cannot attach its first artifact from ${record.run.status}.` });
    }
    const artifactRef = safeText(req.body?.artifactRef, 1024);
    const code = safeText(req.body?.code, 1_500_000);
    if (!artifactRef || !code) return res.status(400).json({ error: "A durable Coding artifact is required." });
    const run = attachFirstArtifact(record.run, artifactRef, code, now);
    const artifact = run.artifacts[0];
    return sendCommit(res, await commitQirRunEvent({
      userSub,
      runId: run.runId,
      expectedVersion: record.storageVersion,
      eventId: `coding-start-${randomUUID()}`,
      eventType: preArtifactExecution ? "coding.artifact_produced" : "coding.started",
      run,
      payload: {
        stepId: run.cursor.stepId,
        actionId: run.cursor.actionId,
        artifactId: artifact.artifactId,
        artifactGeneration: artifact.generation,
      },
    }));
  }

  if (action === "coding.observe") {
    const observation = req.body?.observation as QirObservation;
    if (!observation || observation.runId !== record.run.runId) {
      return res.status(400).json({ error: "A current Run observation is required." });
    }
    const result = await persistQirObservation({
      userSub,
      record,
      observation,
      proofOfDoneStatus: "not_ready",
    });
    if (result.status === "stale") {
      return res.status(202).json({
        run: result.record.run,
        storageVersion: result.record.storageVersion,
        stale: true,
        durability: "persisted",
      });
    }
    return sendCommit(res, result);
  }

  if (action === "coding.recover") {
    // A replacement browser/worker proves it can continue from the journal
    // before it is allowed to allocate a new recovery action/generation.
    const continuation = resumeQirCodingFromSnapshot(record.run);
    const artifact = record.run.artifacts.find((candidate) => candidate.artifactId === "coding-desk-vfs");
    const artifactRef = safeText(req.body?.artifactRef, 1024);
    const code = safeText(req.body?.code, 1_500_000);
    if (!artifact || !artifactRef || !code) return res.status(400).json({ error: "A current Coding artifact is required for recovery." });
    const actionId = `coding-recovery-${randomUUID()}`;
    const run = beginQirCodingRecovery({
      run: record.run,
      actionId,
      artifactId: artifact.artifactId,
      artifactGeneration: artifact.generation + 1,
      artifactRef: artifactRefWithDigest(artifactRef, code),
      now,
    });
    const result = await commitQirRunEvent({
      userSub,
      runId: run.runId,
      expectedVersion: record.storageVersion,
      eventId: `coding-recover-${randomUUID()}`,
      eventType: "coding.recovery_started",
      run,
      payload: { continuation, actionId, artifactId: artifact.artifactId, artifactGeneration: artifact.generation + 1 },
    });
    return sendCommit(res, result);
  }

  if (action === "coding.promote") {
    const artifact = record.run.artifacts.find((candidate) => candidate.artifactId === "coding-desk-vfs");
    const evidenceRefs = Array.isArray(req.body?.evidenceRefs)
      ? req.body.evidenceRefs.map((value: unknown) => safeText(value, 512)).filter(Boolean) as string[]
      : [];
    if (!artifact || artifact.state !== "candidate") {
      return res.status(409).json({ error: "The current candidate is not ready for verification." });
    }
    const code = safeText(req.body?.code, 1_500_000);
    if (!code) return res.status(400).json({ error: "The current Coding artifact is required for independent verification." });
    if (!artifactMatchesCode(artifact.ref, code)) {
      return res.status(409).json({ error: "Verification bytes do not match the current candidate artifact generation." });
    }
    const report = await verifyBuild({
      code,
      vfs: req.body?.vfs && typeof req.body.vfs === "object" ? req.body.vfs : {},
      brief: safeText(req.body?.brief, 8_000) || "",
      job: req.body?.job && typeof req.body.job === "object" ? req.body.job : null,
    });
    if (!report.passed) {
      return res.status(422).json({
        error: "Independent Coding verification did not pass.",
        run: record.run,
        storageVersion: record.storageVersion,
        verification: report,
        durability: "persisted",
      });
    }
    const verification: QirVerificationResult = {
      verificationId: `coding-verification-${randomUUID()}`,
      runId: record.run.runId,
      actionId: `coding-independent-verifier-${randomUUID()}`,
      passed: true,
      proofOfDoneStatus: "verified",
      evidenceRefs: [...evidenceRefs, `build-verifier:score:${report.score}`],
      verifiedAt: now,
    };
    const run = promoteQirCodingCheckpoint({
      run: record.run,
      verification,
      proofOfDoneStatus: verification.proofOfDoneStatus,
      artifactId: artifact.artifactId,
      artifactGeneration: artifact.generation,
      checkpointId: `coding-checkpoint-${randomUUID()}`,
      now,
    });
    return sendCommit(res, await commitQirRunEvent({
      userSub,
      runId: run.runId,
      expectedVersion: record.storageVersion,
      eventId: verification.verificationId,
      eventType: "coding.checkpoint_promoted",
      run,
      payload: { verificationId: verification.verificationId, evidenceRefs: verification.evidenceRefs, score: report.score },
    }));
  }

  return res.status(400).json({ error: "Unsupported Coding Run action." });
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
    let codingContinuation = null;
    try {
      codingContinuation = resumeQirCodingFromSnapshot(resumed.record.run);
    } catch {
      // COMPLETE/terminal/empty Runs correctly have no Coding continuation.
    }
    return res.status(200).json({
      run: resumed.record.run,
      storageVersion: resumed.record.storageVersion,
      continuation: codingContinuation || resumed.continuation,
      durability: "persisted",
    });
  }

  if (req.body?.action) return handleCodingAction(req, res, userSub);

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
