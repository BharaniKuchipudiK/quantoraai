import { useEffect, useState } from 'react';

// Explicit testing surface; server configuration still pins the account and desk.
// Capability refresh is intentional: in bounded dynamic-run mode the server keeps
// the same identity while work is active, then issues a fresh identity only after
// the previous durable run reaches a terminal state.
export function useQirBrowserPilot(sessionId) {
  const requested = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('workerPilot') === '1';
  const [capability, setCapability] = useState(null);
  useEffect(() => {
    if (!requested || !sessionId) return undefined;
    const abort = new AbortController();
    let timer = null;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/qir-runs?workerPilot=1&sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: 'include', signal: abort.signal, cache: 'no-store',
        });
        const data = response.ok ? await response.json() : null;
        if (!abort.signal.aborted) setCapability({ sessionId, runId: data?.enabled ? data.runId : '' });
      } catch {
        if (!abort.signal.aborted) setCapability({ sessionId, runId: '' });
      }
      if (!abort.signal.aborted) timer = setTimeout(refresh, 2500);
    };
    void refresh();
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [requested, sessionId]);
  return { requested, runId: capability?.sessionId === sessionId ? capability.runId : '' };
}
