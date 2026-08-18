import { validatePresentationSpec } from './presentation-v2.js';
import { verifyPresentationCommunicationQuality } from './office-artifact.js';

/**
 * Generation-time gate for new/refined PowerPoint candidates.
 *
 * Structural/composition validation and executive communication quality must both
 * pass BEFORE compilation. Keeping this gate in the AI repair loop means weak
 * headlines, thin decision support, evidence-boundary problems and similar
 * communication failures can be repaired by the model instead of being discovered
 * only after a PPTX has already been compiled.
 *
 * Deterministic compile-only requests intentionally keep their existing behavior;
 * this gate is for AI-generated/refined candidates.
 */
export function validateGeneratedPresentationSpec(input = {}) {
  const structural = validatePresentationSpec(input || {});
  if (!structural.valid) return structural;

  const communication = verifyPresentationCommunicationQuality(structural.spec || {});
  if (communication.passed) return structural;

  return {
    ...structural,
    valid: false,
    issues: [...new Set([...(structural.issues || []), ...(communication.issues || [])])],
  };
}
