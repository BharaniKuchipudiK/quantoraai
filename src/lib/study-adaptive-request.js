import {
  readStudyWorkingState,
  setStudyWorkingConcept,
} from './study-working-state.js';

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/** Strict client boundary: non-Study turns receive no adaptive payload. */
export function buildStudyAdaptiveRequestContext({ studioDomain, brief } = {}) {
  if (studioDomain !== 'education') return {};
  const conceptLabel = clean(brief?.label, 300);
  const conceptKey = clean(brief?.conceptId, 160).toLowerCase();
  if (!conceptLabel) return {};

  setStudyWorkingConcept({ conceptKey, conceptLabel });
  const workingState = readStudyWorkingState();
  return {
    studyContext: {
      conceptKey,
      conceptLabel,
      ...(workingState ? { workingState } : {}),
    },
  };
}