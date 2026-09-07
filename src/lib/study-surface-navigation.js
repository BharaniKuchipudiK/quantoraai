export const STUDY_SURFACE_REQUEST_EVENT = 'quantora:study-surface-request';

export const STUDY_SURFACE = Object.freeze({
  ASSESSMENT: 'assessment',
  NOTEBOOK: 'notebook',
});

const STUDY_SURFACES = new Set(Object.values(STUDY_SURFACE));

/**
 * Dispatch a synchronous Study-surface request.
 *
 * The boolean return means a mounted consumer actually accepted the request,
 * not merely that the browser could dispatch an event. This matters while an
 * existing Study session is restoring onboarding/context: the + menu must not
 * close and silently lose Assessment/Notebook before their consumers mount.
 */
export function requestStudySurface(surface) {
  const target = String(surface || '').trim();
  if (!STUDY_SURFACES.has(target)) return false;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof window.CustomEvent !== 'function') return false;
  const detail = { surface: target, handled: false };
  window.dispatchEvent(new window.CustomEvent(STUDY_SURFACE_REQUEST_EVENT, { detail }));
  return detail.handled === true;
}
