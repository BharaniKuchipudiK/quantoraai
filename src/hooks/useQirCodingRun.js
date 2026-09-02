import { useCallback, useEffect, useRef, useState } from 'react';

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
 * Thin browser adapter for the server-owned QIR state machine. The browser
 * keeps only a Run-id pointer; transition authority and the durable snapshot
 * remain behind /api/qir-runs.
 */
export function useQirCodingRun({ enabled, sessionId, goal, artifactRef, code, vfs, job }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const runRef = useRef(null);
  const sessionRef = useRef(null);
  const bootRef = useRef(null);
  const chainRef = useRef(Promise.resolve());

  const accept = useCallback((data) => {
    if (data?.run) {
      runRef.current = data.run;
      setRun(data.run);
    }
    return data?.run || runRef.current;
  }, []);

  const enqueue = useCallback((work) => {
    const next = chainRef.current
      .catch(() => undefined)
      .then(work)
      .catch((nextError) => {
        setError(nextError);
        return null;
      });
    chainRef.current = next;
    return next;
  }, []);

  const boot = useCallback(async () => {
    if (!enabled || !sessionId || !artifactRef) return null;
    if (bootRef.current) return bootRef.current;
    bootRef.current = (async () => {
      const existingId = readPointer(sessionId);
      if (existingId) {
        try {
          const resumed = await requestQir(null, `?runId=${encodeURIComponent(existingId)}`);
          return accept(resumed);
        } catch (resumeError) {
          if (resumeError.status !== 404) throw resumeError;
        }
      }

      const runId = id('coding-run');
      await requestQir({ run: queuedRun(runId, goal) });
      writePointer(sessionId, runId);
      const started = await requestQir({ action: 'coding.start', runId, artifactRef, code });
      return accept(started);
    })().finally(() => { bootRef.current = null; });
    return bootRef.current;
  }, [accept, artifactRef, code, enabled, goal, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId || !artifactRef) return;
    if (sessionRef.current !== sessionId) {
      sessionRef.current = sessionId;
      runRef.current = null;
      setRun(null);
      setError(null);
      bootRef.current = null;
    }
    void enqueue(async () => {
      const current = await boot();
      const artifact = currentArtifact(current);
      const sameCandidate = artifact?.ref?.startsWith(`${artifactRef}#sha256=`) || artifact?.ref === artifactRef;
      if (current && ['REPAIRING', 'REPLANNING'].includes(current.status) && !sameCandidate && code) {
        return accept(await requestQir({
          action: 'coding.recover',
          runId: current.runId,
          artifactRef,
          code,
        }));
      }
      return current;
    });
  }, [accept, artifactRef, boot, code, enabled, enqueue, sessionId]);

  const reportHealedArtifact = useCallback((nextArtifactRef, healedCode) => enqueue(async () => {
    let current = runRef.current || await boot();
    if (!current || !['REPAIRING', 'REPLANNING'].includes(current.status)) return current;
    const recovered = await requestQir({
      action: 'coding.recover',
      runId: current.runId,
      artifactRef: nextArtifactRef || artifactRef,
      code: healedCode,
    });
    current = accept(recovered);
    return current;
  }), [accept, artifactRef, boot, enqueue]);

  const reportPreviewStatus = useCallback((status) => enqueue(async () => {
    let current = runRef.current || await boot();
    if (!current) return null;

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
    const observed = await observePreview(current, failure);
    current = accept(observed);
    return current;
  }), [accept, boot, code, enqueue, goal, job, vfs]);

  return { run, error, reportHealedArtifact, reportPreviewStatus };
}
