import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Thin browser adapter for the server-owned QIR state machine. The browser
 * keeps only a Run-id pointer; transition authority and the durable snapshot
 * remain behind /api/qir-runs. The whole client lives in
 * qir-coding-run-core.js behind a dynamic import: the Desk entry chunk has a
 * 300 KB payload budget and none of the machinery is needed until a durable Run
 * actually starts.
 *
 * A Coding goal is durable BEFORE Preview exists. That distinction is critical:
 * the common was-red failure is a model timing out before it writes even one
 * runnable file. Requiring artifactRef here made that exact failure invisible to
 * QIR, so the 175s step deadline still behaved like mission lifetime.
 */
const loadCore = () => import('../lib/qir-coding-run-core.js');

export function useQirCodingRun(options) {
  const { enabled, sessionId, artifactRef, code } = options;
  const serverOwned = options.executionOwner === 'server';
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const clientRef = useRef(null);
  const sessionRef = useRef(null);
  const appliedServerCheckpointRef = useRef('');

  const withClient = useCallback((use) => loadCore().then((core) => {
    let entry = clientRef.current;
    if (!entry || entry.sessionId !== optionsRef.current.sessionId) {
      const forSession = optionsRef.current.sessionId;
      // A superseded session's in-flight steps must not write into the new
      // session's state, so each publish checks it still owns the ref.
      const next = {
        sessionId: forSession,
        client: null,
      };
      next.client = core.createQirCodingRunClient({
        onRun: (value) => { if (clientRef.current === next) { setRun(value); setError(null); } },
        onError: (value) => { if (clientRef.current === next) setError(value); },
        readOptions: () => optionsRef.current,
      });
      clientRef.current = next;
      entry = next;
    }
    return use(entry.client);
  }), []);

  useEffect(() => {
    if (sessionRef.current !== sessionId) {
      sessionRef.current = sessionId;
      clientRef.current = null;
      appliedServerCheckpointRef.current = '';
      setRun(null);
      setError(null);
    }
    if (!enabled || !sessionId) return;
    // Compatibility mode still reconciles browser-produced artifacts. Once the
    // server owns execution the browser only resumes/observes the durable Run;
    // it must never attach its own candidate bytes to that same action.
    void withClient((client) => (serverOwned ? client.refresh() : client.sync()));
  }, [enabled, sessionId, artifactRef, code, serverOwned, withClient]);

  /*
   * Server-owned Runs outlive the tab. Polling is observation, not execution:
   * every transition still happens behind /api/qir-runs or in the worker. A
   * reopened browser resumes the run id pointer and immediately sees whatever
   * the worker committed while the tab was gone.
   */
  useEffect(() => {
    if (!serverOwned || !enabled || !sessionId) return undefined;
    let stopped = false;
    const refresh = () => {
      if (stopped) return;
      void withClient((client) => client.refresh());
    };
    refresh();
    const timer = setInterval(refresh, 1_500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [serverOwned, enabled, sessionId, withClient]);

  /*
   * The worker writes verified source into the same durable desk checkpoint
   * chain the browser already knows how to restore. Completion therefore loads
   * the verified checkpoint; it never trusts model text that happened to be in
   * a browser response. Retry the read while the Run remains complete because
   * checkpoint visibility can lag the Run commit by a network round trip.
   */
  useEffect(() => {
    const onServerWorkspace = optionsRef.current.onServerWorkspace;
    if (!serverOwned || run?.status !== 'COMPLETE' || !run?.runId || !sessionId || typeof onServerWorkspace !== 'function') {
      return undefined;
    }
    const artifact = run.artifacts?.find((candidate) => candidate.artifactId === 'coding-desk-vfs' && candidate.state === 'verified');
    const checkpointKey = `${run.runId}:${artifact?.generation || 0}:${run.updatedAt || ''}`;
    if (appliedServerCheckpointRef.current === checkpointKey) return undefined;

    let stopped = false;
    let retryTimer = null;
    const restore = async () => {
      try {
        const { loadDeskCheckpoints } = await import('../lib/desk-checkpoint-client.js');
        const restored = await loadDeskCheckpoints(sessionId);
        if (stopped) return;
        if (restored.ok && restored.vfs && Object.keys(restored.vfs).length) {
          const accepted = await onServerWorkspace(restored.vfs, run, restored);
          if (accepted !== false) { appliedServerCheckpointRef.current = checkpointKey; return; }
        }
      } catch (restoreError) {
        if (!stopped) setError(restoreError);
      }
      if (!stopped) retryTimer = setTimeout(restore, 1_500);
    };
    void restore();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [serverOwned, run?.runId, run?.status, run?.updatedAt, sessionId]);

  const submitServerRun = useCallback((goal, strategy) => (
    withClient((client) => client.submitServerRun(goal, strategy))
  ), [withClient]);

  /*
   * Resolves true whenever the governor cannot answer — no Run, storage
   * unconfigured, network error. A budget nobody can read must never be the
   * reason a compatibility-mode browser build does not run. Server-owned model
   * spend is accounted by the worker path instead of browser callbacks.
   */
  const requestPremiumEscalation = useCallback(() => {
    if (serverOwned) return Promise.resolve({ allowed: true, reason: 'server-owned' });
    return withClient((client) => client.requestPremiumEscalation())
      ?.then?.((verdict) => verdict || { allowed: true, reason: 'no-verdict' })
      ?? Promise.resolve({ allowed: true, reason: 'no-client' });
  }, [serverOwned, withClient]);

  const beginModelAttempt = useCallback((goal, strategy) => (
    withClient((client) => (serverOwned
      ? client.submitServerRun(goal, strategy)
      : client.beginModelAttempt(goal, strategy)))
  ), [serverOwned, withClient]);

  const reportModelFailure = useCallback((failure) => {
    if (serverOwned) return Promise.resolve(null);
    return withClient((client) => client.reportModelFailure(failure));
  }, [serverOwned, withClient]);

  const reportHealedArtifact = useCallback((nextArtifactRef, healedCode) => {
    if (serverOwned) return Promise.resolve(null);
    return withClient((client) => client.reportHealedArtifact(nextArtifactRef, healedCode));
  }, [serverOwned, withClient]);

  const reportPreviewStatus = useCallback((status) => {
    if (serverOwned) return Promise.resolve(null);
    return withClient((client) => client.reportPreviewStatus(status));
  }, [serverOwned, withClient]);

  const reportToolUse = useCallback((tool, units = 1) => {
    if (serverOwned) return;
    return withClient((client) => client.reportToolUse(tool, units));
  }, [serverOwned, withClient]);

  const pause = useCallback(() => withClient((client) => client.pause()), [withClient]);
  const resume = useCallback(() => withClient((client) => client.resume()), [withClient]);
  const cancel = useCallback((reason) => withClient((client) => client.cancel(reason)), [withClient]);

  return {
    run,
    error,
    serverOwned,
    // Current files travel with the historical Run; the header may veto a
    // completion claim without rewriting the server-owned journal.
    workspace: { goal: options.goal, vfs: options.vfs },
    submitServerRun,
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
