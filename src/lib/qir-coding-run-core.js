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

/**
 * Candidate bytes may arrive in either of two legitimate states:
 *
 * - legacy/skills-first path: Run is still QUEUED;
 * - QIR-owned model path: `coding.attempt` already created the action, so the Run
 *   is EXECUTING but no artifact exists yet.
 *
 * In both cases the artifact is attached exactly once. A late callback cannot
 * replace an existing generation.
 */
export function qirCodingRunCanStart(run, artifactRef, code) {
  const preArtifactExecution = run?.status === 'EXECUTING' && !currentArtifact(run) && Boolean(run?.cursor?.actionId);
  return Boolean(
    run
    && (run.status === 'QUEUED' || preArtifactExecution)
    && !currentArtifact(run)
    && String(artifactRef || '').trim()
    && String(code || '').trim(),
  );
}

function failureCode(kind) {
  if (kind === 'timeout') return 'PROVIDER_TIMEOUT';
  if (kind === 'quota' || kind === 'capacity') return 'PROVIDER_QUOTA';
  if (kind === 'contract') return 'MODEL_CONTRACT';
  return 'PROVIDER_TRANSPORT';
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

  /*
   * Boot owns only goal durability. It intentionally does NOT require files.
   * The first worker may time out before producing any artifact; that must not
   * erase the mission or prevent another worker from finding the same runId.
   *
   * `force` exists for the explicit model-attempt API: that caller has already
   * proved this is a Coding turn, so it must be able to persist the goal before
   * React has had a chance to render an `enabled` prop change.
   */
  const boot = async (goalOverride = '', force = false) => {
    const { enabled, sessionId, goal } = readOptions();
    if ((!enabled && !force) || !sessionId) return null;
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
      const created = await requestQir({ run: queuedRun(runId, goalOverride || goal) });
      writePointer(sessionId, runId);
      return accept(created);
    })().finally(() => { bootPromise = null; });
    return bootPromise;
  };

  /*
   * Persist the model action BEFORE the request to /api/chat starts. The action
   * carries only a bounded strategy label/model id — never the whole prompt or
   * credentials. If the browser disappears after this call, another worker can
   * see an EXECUTING action with the same goal/runId and continue from it.
   */
  const beginModelAttempt = (goal, strategy = '') => enqueue(async () => {
    let current = await boot(goal, true);
    if (!current) return null;
    if (!['QUEUED', 'REPLANNING'].includes(current.status)) return current;
    return accept(await requestQir({
      action: 'coding.attempt',
      runId: current.runId,
      strategy: String(strategy || '').slice(0, 240),
    }));
  });

  /*
   * Provider/model failure is durable evidence even when zero candidate bytes
   * exist. It is action-bound, so a late failure from an older attempt is a
   * stale no-op at the server transition guard.
   */
  const reportModelFailure = (failure = {}) => enqueue(async () => {
    const current = runNow || await boot('', true);
    if (!current?.cursor?.actionId || current.status !== 'EXECUTING') return current;
    const observedAt = new Date().toISOString();
    const observationId = id('model-failure');
    return accept(await requestQir({
      action: 'coding.observe',
      runId: current.runId,
      observation: {
        observationId,
        runId: current.runId,
        actionId: current.cursor.actionId,
        artifactId: null,
        artifactGeneration: null,
        kind: 'model',
        status: 'failure',
        evidence: [{
          evidenceId: `${observationId}-evidence`,
          source: 'provider',
          kind: `provider.${String(failure.kind || 'transport').slice(0, 40)}`,
          actionId: current.cursor.actionId,
          ref: failure.modelId ? `model:${String(failure.modelId).slice(0, 160)}` : null,
          observedAt,
        }],
        error: {
          code: failureCode(failure.kind),
          message: String(failure.message || 'Model execution did not produce a usable result.').slice(0, 500),
          retryable: failure.retryable !== false,
          recoveryExhausted: failure.recoveryExhausted === true,
        },
        observedAt,
      },
    }));
  });

  /*
   * Boot/resume first. Once runnable candidate bytes exist, attach them to the
   * current model action when one already exists; otherwise retain the legacy
   * QUEUED -> EXECUTING path for deterministic/skills-first artifacts.
   */
  const sync = () => enqueue(async () => {
    let current = await boot();
    if (!current) return null;
    const { artifactRef, code } = readOptions();

    if (qirCodingRunCanStart(current, artifactRef, code)) {
      current = accept(await requestQir({
        action: 'coding.start',
        runId: current.runId,
        artifactRef,
        code,
      }));
    }

    const artifact = currentArtifact(current);
    const sameCandidate = artifact?.ref?.startsWith(`${artifactRef}#sha256=`) || artifact?.ref === artifactRef;
    if (['REPAIRING', 'REPLANNING'].includes(current.status) && artifactRef && !sameCandidate && code) {
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

  return {
    sync,
    beginModelAttempt,
    reportModelFailure,
    reportHealedArtifact,
    reportPreviewStatus,
  };
}
