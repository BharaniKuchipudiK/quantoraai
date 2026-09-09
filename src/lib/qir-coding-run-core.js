/*
 * The request and transition machinery behind useQirCodingRun. It lives here,
 * behind a dynamic import, because the Coding Desk entry chunk carries a
 * 300 KB payload budget (scripts/code-highlight-browser-gate.mjs) and none of
 * this code is needed until a durable Run actually starts. Transition
 * authority and the durable snapshot remain behind /api/qir-runs; the browser
 * keeps only a Run-id pointer.
 */

const POINTER_PREFIX = 'quantora_qir_coding_run:';

// Preview's assembly key is a full content fingerprint, not a short digest.
// Keep existing locators compatible, but never POST a source-sized reference
// to the API's 1024-character field. Hash the WHOLE value so changes near the
// end of a large assembly still produce a different candidate identity.
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
    /*
     * The reason is DATA, not the sentence. Three different 503s come back from
     * this route — storage that was never configured, and two kinds of failed
     * write — and a reader that told them apart by matching English would break
     * the first time someone reworded a message. Same lesson as the server's
     * spent-engine set: prose is invisible to code.
     */
    error.reason = typeof data.reason === 'string' ? data.reason : '';
    /*
     * The classified verdict, when the store had one. Shaped rather than
     * trusted: this arrives over the wire, and the desk renders it, so only
     * the two string fields are carried and anything else is dropped.
     */
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
   * Ask the durable governor whether this mission may spend a premium
   * escalation, and debit it if so.
   *
   * This is the seam the Phase 0 re-audit named: the Resource & Budget Governor
   * was complete — lanes, ledger, debit, capacity resume, its own route — and
   * nothing called it, so premium escalation turned on whether a credential
   * existed rather than whether the mission could afford one.
   *
   * IT FAILS OPEN, DELIBERATELY. No Run, storage unconfigured, a network error,
   * a stale action — every one of those resolves to `true`. Mission memory must
   * never be the reason a request goes unanswered (the invariant #516 added when
   * a spent turn budget was sealing whole Runs). The governor may say "you have
   * spent your premium reserve"; it may never say "I could not tell, so no".
   *
   * A refusal parks the Run at WAITING_FOR_CAPACITY, which is a real state with
   * a real exit — reduceQirCapacityResume returns REPLANNING, and
   * qir-capacity-roundtrip.test.ts proves a Coding attempt can start from there.
   * Before that fix this call would have stalled the mission permanently.
   */
  /*
   * Compact the working context into durable state, after the Run advances.
   *
   * THE GAP THIS CLOSES. The Context Manager — /api/qir-context,
   * compactQirWorkingContext, the whole bounded-context contract — shipped
   * complete on 2026-09-02: typed, tested, deployed, and called by NOTHING.
   * It was the last QIR entry in the served-route baseline, and the twin of the
   * Resource Governor #523 found the same way.
   *
   * WHY THIS IS NOT A NEW EXPORTED METHOD. The obvious wiring is to expose
   * compactWorkingContext() on the client and have some caller remember to
   * invoke it. That is exactly how both subsystems came to be unwired in the
   * first place: a method nobody calls looks identical to a method nobody has
   * called YET, and the served-route gate would then report /api/qir-context as
   * reachable while no user action ever reaches it — a false clean, of the kind
   * that gate exists to prevent.
   *
   * So compaction is automatic, and fires where the Run has definitively moved:
   * reportPreviewStatus is the point at which an observation, and possibly a
   * promotion, has already been committed.
   *
   * IT IS NOT AWAITED, AND THAT IS THE FIX FOR A REAL REGRESSION.
   *
   * The first version awaited this inside reportPreviewStatus and turned the
   * desktop smoke gate red: "Cmd/Ctrl+S wrote the edit to disk" failed with a
   * console 503 beside it. The desktop app runs with no durable storage, so
   * every preview status bought a doomed network round trip on the critical
   * path — and the save check behind it lost the race.
   *
   * Compaction is an optimisation for a worker that may never arrive. Nothing
   * the user is waiting for may ever wait for it, so callers fire and forget.
   *
   * IT ALSO DOES NOT ACCEPT THE RETURNED RUN. Landing out of order with a later
   * transition would overwrite runNow with a staler snapshot. The compacted
   * context is durable server-side the moment the route commits it; the client
   * has no need of it, and taking it back is a data race for nothing.
   *
   * AND IT STOPS ASKING once the deployment says storage is not configured.
   * Repeating a request that has already been definitively refused is how a
   * console fills with 503s that mask a real one.
   */
  let storageUnconfigured = false;

  const compactWorkingContext = async (current, note) => {
    if (!current?.runId || storageUnconfigured) return;
    try {
      const { vfs, goal, job } = readOptions();
      const files = Object.keys(vfs || {});
      const response = await fetch('/api/qir-context', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: current.runId,
          /*
           * The one thing the durable Run does not already know. The server
           * compacts goal, cursor, blockers, evidence and artifacts out of the
           * Run itself; the file inventory lives only in this browser.
           *
           * Names, never contents: a VFS can hold megabytes, this has to stay
           * bounded, and the server sanitises and caps whatever arrives anyway.
           */
          projectState: {
            files: files.sort().slice(0, 100),
            fileCount: files.length,
            goal: String(goal || '').slice(0, 500),
            job: String(job?.title || job?.name || '').slice(0, 200),
          },
          recentInteractions: note ? [String(note).slice(0, 500)] : [],
        }),
      });
      if (response.status === 503) {
        const body = await response.json().catch(() => ({}));
        if (body?.reason === 'storage-unconfigured') storageUnconfigured = true;
      }
    } catch {
      /* A build must never fail, or slow down, because a snapshot was missed. */
    }
  };

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

    /*
     * A stale action means a newer attempt has moved on; the 202 carries the
     * current Run and changes no budget. Treat it as "not my call to make"
     * rather than a refusal.
     */
    if (data?.stale) return { allowed: true, reason: 'stale-action' };

    const next = data?.run || null;
    if (next) accept(data);
    if (next?.status === 'WAITING_FOR_CAPACITY') {
      return { allowed: false, reason: 'premium-reserve-spent', run: next };
    }
    return { allowed: true, reason: 'debited', run: next };
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
    /*
     * ONE observation, ONE evidence entry PER ENGINE THAT ACTUALLY RAN.
     *
     * A single chat turn is one attempt from the browser's point of view and up
     * to four from the server's: api/_lib/chat-handler.ts plans an inference
     * ladder and works down it, so a build turn routinely burns two engines
     * behind one request. Recording only the primary left the mission believing
     * the second was untried, and the next turn was routed straight into it.
     *
     * The evidence array was always an array; nothing but the writer assumed one
     * entry.
     */
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

  /*
   * Boot/resume first. Once runnable candidate bytes exist, attach them to the
   * current model action when one already exists; otherwise retain the legacy
   * QUEUED -> EXECUTING path for deterministic/skills-first artifacts.
   */
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

  /*
   * THE STOP BUTTON, client side.
   *
   * Phase 2 asks for pause/resume/cancel. PAUSED existed as a state and
   * deriveQirContinuation already honoured it, but nothing could reach it — so
   * a user with a runaway build could close the tab and stop the browser while
   * the Run carried on believing it was mid-flight.
   *
   * These are NOT fire-and-forget like compaction. A stop the user asked for
   * has to be acknowledged before the desk claims it stopped, or the button
   * lies the way "retry once on a fallback engine" lied in a state where
   * nothing would ever run again.
   */
  /*
   * TOOL ACCOUNTING, client side.
   *
   * The chat stream already announces each completed tool as
   * `{ phase: 'tool', state: 'completed', tool }`; the desk has always been
   * told and never charged for one. Reporting it here debits the same lanes a
   * model attempt does, so a Run that searched hotels twenty times no longer
   * reports the budget of one that searched none.
   *
   * FIRE-AND-FORGET, like compaction and unlike the stop button. Accounting is
   * observational: the tool has already run and its result is already on screen,
   * so making the user wait on a bookkeeping round trip would buy nothing — and
   * an awaited call here would sit on the path the user is waiting for, which
   * is the regression CI caught in the Context Manager this morning.
   */
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
