import { useEffect, useState } from 'react';

// Explicit testing surface; server configuration still pins the account and desk.
export function useQirBrowserPilot(sessionId) {
  const requested = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('workerPilot') === '1';
  const [capability, setCapability] = useState(null);
  useEffect(() => {
    if (!requested || !sessionId) return undefined;
    const abort = new AbortController();
    fetch(`/api/qir-runs?workerPilot=1&sessionId=${encodeURIComponent(sessionId)}`, { credentials: 'include', signal: abort.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (!abort.signal.aborted) setCapability({ sessionId, runId: data?.enabled ? data.runId : '' }); })
      .catch(() => { if (!abort.signal.aborted) setCapability({ sessionId, runId: '' }); });
    return () => abort.abort();
  }, [requested, sessionId]);
  return { requested, runId: capability?.sessionId === sessionId ? capability.runId : '' };
}
