// Synchronous click-time capture. Never read the global adaptive working state.
// If more than one mounted owner exists, do not guess which chat owns the hint.
const owners = new Set();
export function subscribeStudyContinuityHints(listener) {
  if (typeof listener !== 'function') return () => {};
  owners.add(listener);
  return () => owners.delete(listener);
}
export function requestStudyContinuityHint() {
  if (owners.size !== 1) return false;
  return [...owners][0]() === true;
}
export function advanceStudyContinuityHint(previous, scopeId, now = Date.now()) {
  if (!scopeId || !Number.isFinite(now) || now < 0) return null;
  const same = previous?.scopeId === scopeId && Number.isInteger(previous.count)
    && previous.count >= 1 && previous.count <= 6 && previous.observedAt <= now
    && now - previous.observedAt <= 20 * 60 * 1000;
  const count = Math.min(6, (same ? previous.count : 0) + 1);
  return { scopeId, count, observedAt: now, hintDependence: count >= 3 ? 'high' : 'emerging' };
}
