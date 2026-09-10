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
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const clientRef = useRef(null);
  const sessionRef = useRef(null);

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
        onRun: (value) => { if (clientRef.current === next) setRun(value); },
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
      setRun(null);
      setError(null);
    }
    // Do not wait for artifactRef/code. QIR must own the user's Coding goal even
    // when the first worker dies before producing files. `enabled` is the
    // declarative/background sync path; beginModelAttempt below can force the
    // same boot synchronously once the turn planner has proved this is Coding.
    if (!enabled || !sessionId) return;
    void withClient((client) => client.sync());
  }, [enabled, sessionId, artifactRef, code, withClient]);

  /*
   * Resolves true whenever the governor cannot answer — no Run, storage
   * unconfigured, network error. A budget nobody can read must never be the
   * reason a build does not run.
   */
  const requestPremiumEscalation = useCallback(() => (
    withClient((client) => client.requestPremiumEscalation())
      ?.then?.((verdict) => verdict || { allowed: true, reason: 'no-verdict' })
      ?? Promise.resolve({ allowed: true, reason: 'no-client' })
  ), [withClient]);

  const beginModelAttempt = useCallback((goal, strategy) => (
    withClient((client) => client.beginModelAttempt(goal, strategy))
  ), [withClient]);

  const reportModelFailure = useCallback((failure) => (
    withClient((client) => client.reportModelFailure(failure))
  ), [withClient]);

  const reportHealedArtifact = useCallback((nextArtifactRef, healedCode) => (
    withClient((client) => client.reportHealedArtifact(nextArtifactRef, healedCode))
  ), [withClient]);

  const reportPreviewStatus = useCallback((status) => (
    withClient((client) => client.reportPreviewStatus(status))
  ), [withClient]);

  /*
   * Phase 3's tool half. The chat stream announces every completed tool call;
   * this is what turns that announcement into a debit on the Run.
   */
  const reportToolUse = useCallback((tool, units = 1) => (
    withClient((client) => client.reportToolUse(tool, units))
  ), [withClient]);

  return {
    run,
    error,
    // Current files travel with the historical Run; the header may veto a
    // completion claim without rewriting the server-owned journal.
    workspace: { goal: options.goal, vfs: options.vfs },
    beginModelAttempt,
    requestPremiumEscalation,
    reportModelFailure,
    reportHealedArtifact,
    reportPreviewStatus,
    reportToolUse,
  };
}
