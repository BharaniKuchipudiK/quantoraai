function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/** Strict client boundary: non-Study turns receive no adaptive payload. */
export function buildStudyAdaptiveRequestContext({ studioDomain, brief, workingState = null } = {}) {
  if (studioDomain !== 'education') return {};
  const conceptLabel = clean(brief?.label, 300);
  const conceptKey = clean(brief?.conceptId, 160).toLowerCase();
  if (!conceptLabel) return {};
  return {
    studyContext: {
      conceptKey,
      conceptLabel,
      ...(workingState ? { workingState } : {}),
    },
  };
}