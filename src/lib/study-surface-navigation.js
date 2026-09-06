export const STUDY_SURFACE_REQUEST_EVENT = 'quantora:study-surface-request';

export const STUDY_SURFACE = Object.freeze({
  ASSESSMENT: 'assessment',
  NOTEBOOK: 'notebook',
});

const STUDY_SURFACES = new Set(Object.values(STUDY_SURFACE));

export function requestStudySurface(surface) {
  const target = String(surface || '').trim();
  if (!STUDY_SURFACES.has(target)) return false;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof window.CustomEvent !== 'function') return false;
  window.dispatchEvent(new window.CustomEvent(STUDY_SURFACE_REQUEST_EVENT, {
    detail: { surface: target },
  }));
  return true;
}
