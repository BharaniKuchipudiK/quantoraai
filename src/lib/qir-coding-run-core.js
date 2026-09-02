/*
 * The request and transition machinery behind useQirCodingRun. It lives here,
 * behind a dynamic import, because the Coding Desk entry chunk carries a
 * 300 KB payload budget (scripts/code-highlight-browser-gate.mjs) and none of
 * this code is needed until a durable Run actually starts. Transition
 * authority and the durable snapshot remain behind /api/qir-runs; the browser
 * keeps only a Run-id pointer.
 */

const POINTER_PREFIX = 'quantora_qir_coding_run:';

function id(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function pointerKey(sessionId) {
  return `${POINTER_PREFIX}${sessionId}`;
}

function readPointer(sessionId) {
  try { return localStorage.getItem(pointerKey(sessionId)); } catch { return null; }
}

function writePointer(sessionId, runId) {
  try { localStorage.setItem(pointerKey(sessionId), runId); } catch { /* durable journal remains authoritative */ }
}

async function requestQir(payload, query = '') {
  const response = await fetch(`/api/qir-runs${query}`, payload ? {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  } : { method: 'GET', credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Durable Coding Run is unavailable.');
    error.status = response.status;
    error.conflict = data.conflict === true;
    throw error;
  }
  return data;
}

function queuedRun(runId, goal) {
  const now = new Date().toISOString();
  return {
    version: 'qir-contracts-2026-09-02.1',
    runId,
    goal: { statement: goal || 'Produce and verify the Coding Desk artifact', status: 'confirmed' },
    status: 'QUEUED',
    steps: [],
    cursor: { stepId: null, actionId: null, attempt: 0 },
    artifacts: [],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: 100,
      stepUnitsRemaining: 40,
      recoveryReserveRemaining: 20,
      premiumEscalationRemaining: 5,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function currentArtifact(run) {
  return run?.artifacts?.find((artifact) => artifact.artifactId === 'coding-desk-vfs') || null;
}

async function observePreview(run, failure) {
  const artifact = currentArtifact(run);
  if (!artifact || !run.cursor?.actionId) return run;
  const observedAt = new Date().toISOString();
  const observationId = id(failure ? 'preview-failure' : 'preview-success');
  const data = await requestQir({
    action: 'coding.observe',
    runId: run.runId,
    observation: {
      observationId,
      runId: run.runId,
      actionId: run.cursor.actionId,
      artifactId: artifact.artifactId,
      artifactGeneration: artifact.generation,
      kind: 'runtime',
      status: failure ? 'failure' : 'success',
      evidence: [{
        evidenceId: `${observationId}-evidence`,
        source: 'runtime',
        kind: failure ? 'preview.runtime_failure' : 'preview.runtime_success',
        actionId: run.cursor.actionId,
        ref: artifact.ref,
        observedAt,
      }],
      error: failure ? {
        code: 'RUNTIME_FAILURE',
        message: 'Coding Desk Preview did not produce a verified runnable artifact.',
        retryable: true,
        recoveryExhausted: false,
      } : null,
      observedAt,
    },
  });
  return data;
}

/**
 * The whole client, created once per hook mount. `onRun` publishes each
 * server snapshot back to the hook's state (including intermediate ones, so
 * an interruption between observation and promotion leaves the caller holding
 * the last durable state); `readOptions` reads the hook's latest props so a
 * queued step never acts on stale code or artifact refs.
 */
export function createQirCodingRunClient({ onRun, onError, readOptions }) {
  let runNow = null;
  let bootPromise = null;
  let chain = Promise.resolve();

  const accept = (data) => {
    if (data?.run) {
      runNow = data.run;
      onRun(data.run);
    }
    return data?.run || runNow;
  };

  const enqueue = (work) => {
    const next = chain
      .catch(() => undefined)
      .then(work)
      .catch((nextError) => {
        onError(nextError);
        return null;
      });
    chain = next;
    return next;
  };

  const boot = async () => {
    const { enabled, sessionId, goal, artifactRef, code } = readOptions();
    if (!enabled || !sessionId || !artifactRef) return null;
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      const existingId = readPointer(sessionId);
      if (existingId) {
        try {
          return accept(await requestQir(null, `?runId=${encodeURIComponent(existingId)}`));
        } catch (resumeError) {
          if (resumeError.status !== 404) throw resumeError;
        }
      }

      const runId = id('coding-run');
      await requestQir({ run: queuedRun(runId, goal) });
      writePointer(sessionId, runId);
      return accept(await requestQir({ action: 'coding.start', runId, artifactRef, code }));
    })().finally(() => { bootPromise = null; });
    return bootPromise;
  };

  /* Boot or resume, then bring an interrupted repair onto the shown candidate. */
  const sync = () => enqueue(async () => {
    const current = await boot();
    if (!current) return null;
    const { artifactRef, code } = readOptions();
    const artifact = currentArtifact(current);
    const sameCandidate = artifact?.ref?.startsWith(`${artifactRef}#sha256=`) || artifact?.ref === artifactRef;
    if (['REPAIRING', 'REPLANNING'].includes(current.status) && !sameCandidate && code) {
      return accept(await requestQir({
        action: 'coding.recover',
        runId: current.runId,
        artifactRef,
        code,
      }));
    }
    return current;
  });

  const reportHealedArtifact = (nextArtifactRef, healedCode) => enqueue(async () => {
    const current = runNow || await boot();
    if (!current || !['REPAIRING', 'REPLANNING'].includes(current.status)) return current;
    return accept(await requestQir({
      action: 'coding.recover',
      runId: current.runId,
      artifactRef: nextArtifactRef || readOptions().artifactRef,
      code: healedCode,
    }));
  });

  const reportPreviewStatus = (status) => enqueue(async () => {
    let current = runNow || await boot();
    if (!current) return null;
    const { code, vfs, goal, job } = readOptions();

    if (status && typeof status === 'object' && status.kind === 'quality') {
      if (status.passed !== true) {
        // A page can render while every catalog image is broken. Runtime
        // success moves the Run to VERIFYING; a failed independent quality
        // verdict must still move that same generation into recovery.
        if (current.status === 'EXECUTING' || current.status === 'VERIFYING') {
          current = accept(await observePreview(current, true));
        }
        return current;
      }
      if (current.status === 'EXECUTING') current = accept(await observePreview(current, false));
      if (current.status !== 'VERIFYING') return current;
      const promoted = await requestQir({
        action: 'coding.promote',
        runId: current.runId,
        evidenceRefs: [`preview-quality:${Number(status.score) || 0}`],
        code,
        vfs,
        brief: goal,
        job,
      });
      return accept(promoted);
    }

    const reported = status && typeof status === 'object' && status.kind === 'runtime'
      ? String(status.status || '')
      : String(status || '');
    const failure = reported === 'failed' || reported === 'degraded';
    const success = reported === 'clean';
    if ((!failure && !success) || current.status !== 'EXECUTING') return current;
    current = accept(await observePreview(current, failure));
    return current;
  });

  return { sync, reportHealedArtifact, reportPreviewStatus };
}
