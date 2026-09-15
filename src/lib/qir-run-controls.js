const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TERMINAL = new Set(['COMPLETE', 'FAILED_TERMINAL']);
const ACTIONS = new Set(['pause', 'resume', 'cancel']);

export function qirRunControlState(status) {
  const state = String(status || '').trim().toUpperCase();
  if (!state || TERMINAL.has(state)) return Object.freeze({ pause: false, resume: false, cancel: false });
  if (state === 'PAUSED') return Object.freeze({ pause: false, resume: true, cancel: true });
  return Object.freeze({ pause: true, resume: false, cancel: true });
}

export async function sendQirRunControl(runId, action, {
  reason = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  const id = String(runId || '').trim();
  const signal = String(action || '').trim().toLowerCase();
  if (!SAFE_RUN_ID.test(id)) return { ok: false, error: 'This run reference is not valid.' };
  if (!ACTIONS.has(signal)) return { ok: false, error: 'That run control is not supported.' };
  if (typeof fetchImpl !== 'function') return { ok: false, error: 'Run controls are unavailable.' };

  const body = {
    action: `coding.${signal}`,
    runId: id,
    ...(signal === 'cancel' && String(reason || '').trim() ? { reason: String(reason).trim().slice(0, 512) } : {}),
  };

  try {
    const response = await fetchImpl('/api/qir-runs', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        run: data?.run || null,
        error: data?.error || `Run control failed (${response.status}).`,
      };
    }
    return {
      ok: true,
      status: response.status,
      run: data?.run || null,
      continuation: data?.continuation || null,
      durability: data?.durability || null,
    };
  } catch {
    return { ok: false, error: 'Run control could not reach the durable runtime.' };
  }
}
