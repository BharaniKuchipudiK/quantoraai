/**
 * Deterministic repair loop for Office generation candidates.
 */
export async function runOfficeSemanticLoop(options) {
  const {
    format,
    maxAttempts,
    requestCandidate,
    materializeCandidate = (value) => value,
    validateCandidate,
  } = options || {};

  if (typeof requestCandidate !== 'function') throw new Error('Office semantic loop requires requestCandidate.');
  if (typeof validateCandidate !== 'function') throw new Error('Office semantic loop requires validateCandidate.');

  let attempts = 0;
  let lastError = '';
  let lastStage = 'provider';
  let repairCandidate = null;
  const warnings = [];

  while (attempts < maxAttempts) {
    attempts += 1;
    let raw;
    try {
      raw = await requestCandidate({
        attemptIndex: attempts - 1,
        lastError,
        repairCandidate,
      });
    } catch (error) {
      lastStage = 'provider';
      lastError = String(error?.message || error);
      continue;
    }

    let parsed;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      lastStage = 'parse';
      lastError = `Model returned malformed JSON: ${String(error?.message || error)}`;
      continue;
    }

    const candidate = materializeCandidate(parsed);
    const validation = validateCandidate(candidate);
    if (!validation?.valid) {
      lastStage = 'semantic-gate';
      lastError = (validation?.issues || ['Office semantic validation failed.']).join(' ');
      repairCandidate = format === 'powerpoint' ? parsed : null;
      continue;
    }

    warnings.push(...(validation.warnings || []));
    return {
      validJson: validation.spec,
      attempts,
      warnings: [...new Set(warnings)],
      lastError: '',
      lastStage: 'success',
      repaired: attempts > 1,
    };
  }

  return {
    validJson: null,
    attempts,
    warnings: [...new Set(warnings)],
    lastError,
    lastStage,
    repaired: false,
  };
}
