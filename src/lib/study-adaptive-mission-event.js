export const STUDY_ADAPTIVE_MISSION_REQUEST_EVENT = 'quantora:study-adaptive-mission-request';

const SOURCES = new Set(['compass', 'guided_chip']);

/**
 * Synchronous hand-off into the persistent Study shell.
 *
 * The caller keeps its legacy behavior when nobody owns the request. This is
 * important for progressive enhancement: a Study chip rendered outside an
 * active Study shell must still behave like the ordinary continuation it was
 * before Adaptive Missions existed.
 */
export function requestStudyAdaptiveMission({ source, recommendation = null, item = null } = {}) {
  if (!SOURCES.has(source)) return false;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
    return false;
  }

  const detail = {
    handled: false,
    source,
    recommendation,
    item,
  };
  window.dispatchEvent(new CustomEvent(STUDY_ADAPTIVE_MISSION_REQUEST_EVENT, { detail }));
  return detail.handled === true;
}
