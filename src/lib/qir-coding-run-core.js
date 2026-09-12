/*
 * The request and transition machinery behind useQirCodingRun. It lives here,
 * behind a dynamic import, because the Coding Desk entry chunk carries a
 * 300 KB payload budget (scripts/code-highlight-browser-gate.mjs) and none of
 * this code is needed until a durable Run actually starts. Transition
 * authority and the durable snapshot remain behind /api/qir-runs; the browser
 * keeps only a Run-id pointer.
 */

import { missingRequestedDeliverables } from './requested-deliverables.js';

const POINTER_PREFIX = 'quantora_qir_coding_run:';

async function boundedArtifactRef(value) {
  const ref = typeof value === 'string' ? value : '';
  if (ref.length <= 1024) return ref.trim();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(ref));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `coding-desk://assembly/sha256/${hex}`;
}

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
    error.reason = typeof data.reason === 'string' ? data.reason : '';
    const diagnosis = data.diagnosis;
    if (diagnosis && typeof diagnosis.cause === 'string') {
      error.diagnosis = {
        cause: diagnosis.cause,
        remedy: typeof diagnosis.remedy === 'string' ? diagnosis.remedy : '',
      };
    }
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

async function observeRequestedDeliverablesFailure(run, missing = []) {
  const artifact = currentArtifact(run);
  if (!artifact || !run.cursor?.actionId || !missing.length) return run;
  const observedAt = new Date().toISOString();
  const observationId = id('deliverables-failure');
  const names = missing.slice(0, 20).join(', ');
  return requestQir({
    action: 'coding.observe',
    runId: run.runId,
    observation: {
      observationId,
      runId: run.runId,
      actionId: run.cursor.actionId,
      artifactId: artifact.artifactId,
      artifactGeneration: artifact.generation,
      kind: 'verification',
      status: 'failure',
      evidence: [{
        evidenceId: `${observationId}-evidence`,
        source: 'verifier',
        kind: 'artifact.requested_deliverables_missing',
        actionId: run.cursor.actionId,
        ref: artifact.ref,
        observedAt,
      }],
      error: {
        code: 'VERIFICATION_FAILURE',
        message: `Requested deliverables are missing from the Coding Desk VFS: ${names}`.slice(0, 500),
        retryable: true,
        recoveryExhausted: false,
      },
      observedAt,
    },
  });
}

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

  const boot = async (goalOverride = '', force = false, assertCurrent = () => {}) => {
    const { enabled, sessionId, goal } = readOptions();
    if ((!enabled && !force) || !sessionId) return null;
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      const existingId = readPointer(sessionId);
      if (existingId) {
        try {
          const loaded = await requestQir(null, `?runId=${encodeURIComponent(existingId)}`);
          assertCurrent();
          return accept(loaded);
        } catch (resumeError) {
          if (resumeError.status !== 404) throw resumeError;
        }
      }

      const runId = id('coding-run');
      const created = await requestQir({ run: queuedRun(runId, goalOverride || goal) });
      assertCurrent();
      writePointer(sessionId, runId);
      return accept(created);
    })().finally(() => { bootPromise = null; });
    return bootPromise;
  };

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

  let storageUnconfigured = false;

  const writeWorkingContext = async (current, note, { required = false, options = null } = {}) => {
    if (!current?.runId) {
      if (required) throw new Error('Server-owned Coding requires a durable Run before context can be bound.');
      return false;
    }
    if (storageUnconfigured) {
      if (required) {
        const error = new Error('Server-owned Coding requires durable QIR context storage, but storage is not configured.');
        error.reason = 'storage-unconfigured';
        throw error;
      }
      return false;
    }

    try {
      const { vfs, goal, job, sessionId } = options || readOptions();
      const files = Object.keys(vfs || {});
      const response = await fetch('/api/qir-context', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: current.runId,
          projectState: {
            sessionId: String(sessionId || '').slice(0, 128),
            files: files.sort().slice(0, 100),
            fileCount: files.length,
            goal: String(current.goal?.statement || goal || '').slice(0, 500),
            job: String(job?.title || job?.name || '').slice(0, 200),
          },
          recentInteractions: note ? [String(note).slice(0, 500)] : [],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503 && body?.reason === 'storage-unconfigured') storageUnconfigured = true;
        if (required) {
          const error = new Error(body?.error || `Unable to bind the durable Coding context (HTTP ${response.status}).`);
          error.status = response.status;
          error.reason = typeof body?.reason === 'string' ? body.reason : 'context-bind-failed';
          throw error;
        }
        return false;
      }
      return true;
    } catch (error) {
      if (required) throw error;
      return false;
    }
  };

  /*
   * PR #709 ownership boundary.
   *
   * The browser binds the desk session BEFORE making the model step runnable,
   * then stops. The standalone worker can now discover the active coding.model
   * continuation from durable state and load the desk checkpoint chain by the
   * bound session id. Once this succeeds the browser must never execute the same
   * action through /api/chat as a fallback: one durable action has one owner.
   */
  const submitServerRun = (goal, strategy = '') => {
    const submittingOptions = { ...readOptions() };
    const assertCurrent = () => {
      if (readOptions().sessionId !== submittingOptions.sessionId) {
        const error = new Error('Coding submission stopped because the active desk changed.');
        error.reason = 'coding-session-changed';
        throw error;
      }
    };
    return enqueue(async () => {
    assertCurrent();
    let current = await boot(goal, true, assertCurrent);
    assertCurrent();
    if (!current) return null;
    const requestedGoal = String(goal || '').trim();
    const sameGoal = requestedGoal === String(current.goal?.statement || '').trim();
    if (!sameGoal && requestedGoal) {
      if (!['COMPLETE', 'FAILED_TERMINAL'].includes(current.status)) {
        const error = new Error('The current Coding task is still active. Finish or cancel it before submitting a different task.');
        error.reason = 'coding-run-active';
        throw error;
      }
      const runId = id('coding-run');
      const created = await requestQir({ run: queuedRun(runId, requestedGoal) });
      assertCurrent();
      current = accept(created);
      writePointer(submittingOptions.sessionId, runId);
    }
    if (['COMPLETE', 'FAILED_TERMINAL', 'PAUSED'].includes(current.status)) return current;

    await writeWorkingContext(current, 'browser submitted this Coding Run to the server worker', { required: true, options: submittingOptions });
    assertCurrent();
    current = runNow || current;
    if (!['QUEUED', 'REPLANNING'].includes(current.status)) return current;

    const attempted = await requestQir({
      action: 'coding.attempt',
      runId: current.runId,
      strategy: String(strategy || '').slice(0, 240),
    });
    assertCurrent();
    return accept(attempted);
  });
  };

  const refresh = () => enqueue(async (current) => {
    const snapshot = current || runNow || await boot();
    if (!snapshot?.runId) return snapshot || null;
    return accept(await requestQir(null, `?runId=${encodeURIComponent(snapshot.runId)}`));
  });

  const compactWorkingContext = (current, note) => writeWorkingContext(current, note, { required: false });

  const requestPremiumEscalation = () => enqueue(async () => {
    const current = runNow;
    const actionId = current?.cursor?.actionId;
    if (!current?.runId || !actionId) return { allowed: true, reason: 'no-durable-run' };

    let data = null;
    try {
      const response = await fetch('/api/qir-resources', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'request',
          runId: current.runId,
          actionId,
          lane: 'premium',
          units: 1,
        }),
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok) return { allowed: true, reason: `governor-unavailable-${response.status}` };
    } catch {
      return { allowed: true, reason: 'governor-unreachable' };
    }

    if (data?.stale) return { allowed: true, reason: 'stale-action' };

    const next = data?.run || null;
    if (next) accept(data);
    if (next?.status === 'WAITING_FOR_CAPACITY') {
      return { allowed: false, reason: 'premium-reserve-spent', run: next };
    }
    return { allowed: true, reason: 'debited', run: next };
  });

  const reportModelFailure = (failure = {}) => enqueue(async () => {
    const current = runNow || await boot('', true);
    if (!current?.cursor?.actionId || current.status !== 'EXECUTING') return current;
    const observedAt = new Date().toISOString();
    const observationId = id('model-failure');
    const engineIds = (Array.isArray(failure.modelIds) ? failure.modelIds : [failure.modelId])
      .map((engineId) => String(engineId || '').trim())
      .filter((engineId, index, all) => engineId && all.indexOf(engineId) === index);
    const evidence = (engineIds.length ? engineIds : [null]).map((engineId, index) => ({
      evidenceId: `${observationId}-evidence${index ? `-${index}` : ''}`,
      source: 'provider',
      kind: `provider.${String(failure.kind || 'transport').slice(0, 40)}`,
      actionId: current.cursor.actionId,
      ref: engineId ? `model:${engineId.slice(0, 160)}` : null,
      observedAt,
    }));
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
        evidence,
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

  const sync = () => enqueue(async () => {
    let current = await boot();
    if (!current) return null;
    const { artifactRef: rawArtifactRef, code } = readOptions();
    const artifactRef = await boundedArtifactRef(rawArtifactRef);

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
      artifactRef: await boundedArtifactRef(nextArtifactRef || readOptions().artifactRef),
      code: healedCode,
    }));
  });

  const reportPreviewStatus = (status) => enqueue(async () => {
    let current = runNow || await boot();
    if (!current) return null;
    const { code, vfs, goal, job } = readOptions();

    if (status && typeof status === 'object' && status.kind === 'quality') {
      if (status.passed !== true) {
        if (current.status === 'EXECUTING' || current.status === 'VERIFYING') {
          current = accept(await observePreview(current, true));
        }
        return current;
      }
      if (current.status === 'EXECUTING') current = accept(await observePreview(current, false));
      if (current.status !== 'VERIFYING') return current;

      const missing = missingRequestedDeliverables(goal, vfs);
      if (missing.length) {
        current = accept(await observeRequestedDeliverablesFailure(current, missing));
        void compactWorkingContext(current, `requested deliverables missing: ${missing.slice(0, 20).join(', ')}`);
        return current;
      }

      const promoted = await requestQir({
        action: 'coding.promote',
        runId: current.runId,
        evidenceRefs: [`preview-quality:${Number(status.score) || 0}`],
        code,
        vfs,
        brief: goal,
        job,
      });
      const next = accept(promoted);
      void compactWorkingContext(next, 'preview quality verified; artifact promoted');
      return next;
    }

    const reported = status && typeof status === 'object' && status.kind === 'runtime'
      ? String(status.status || '')
      : String(status || '');
    const failure = reported === 'failed' || reported === 'degraded';
    const success = reported === 'clean';
    if ((!failure && !success) || current.status !== 'EXECUTING') return current;
    current = accept(await observePreview(current, failure));
    void compactWorkingContext(current, failure ? 'preview reported a runtime failure' : 'preview ran clean');
    return current;
  });

  const reportToolUse = (tool, units = 1) => {
    const name = String(tool || '').trim();
    if (!name) return;
    void enqueue(async (current) => (
      current?.runId && !['COMPLETE', 'FAILED_TERMINAL'].includes(current.status)
        ? accept(await requestQir({ action: 'coding.tool', runId: current.runId, tool: name, units }))
        : current
    ));
  };

  const pause = () => enqueue(async (current) => (
    current?.runId ? accept(await requestQir({ action: 'coding.pause', runId: current.runId })) : current
  ));

  const resume = () => enqueue(async (current) => (
    current?.status === 'PAUSED' ? accept(await requestQir({ action: 'coding.resume', runId: current.runId })) : current
  ));

  const cancel = (reason = '') => enqueue(async (current) => (
    current?.runId
      ? accept(await requestQir({ action: 'coding.cancel', runId: current.runId, ...(reason ? { reason } : {}) }))
      : current
  ));

  return {
    sync,
    submitServerRun,
    refresh,
    beginModelAttempt,
    requestPremiumEscalation,
    reportModelFailure,
    reportHealedArtifact,
    reportPreviewStatus,
    reportToolUse,
    pause,
    resume,
    cancel,
  };
}
