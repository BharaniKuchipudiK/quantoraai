const FRACTION_CAP = 12;

function wholeNumber(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function fractionPart(numeratorRaw, denominatorRaw) {
  const numerator = wholeNumber(numeratorRaw);
  const denominator = wholeNumber(denominatorRaw);
  if (numerator == null || denominator == null) return null;
  if (denominator < 1 || denominator > FRACTION_CAP) return null;
  if (numerator < 0 || numerator > denominator) return null;
  return { numerator, denominator };
}

/**
 * Intentionally narrow grammar for one-whole fraction bars.
 *
 * Supported forms:
 * - Fraction model: 3/4
 * - Proportion model: 2/3 = 4/6
 *
 * Equivalent-fraction pairs are checked mathematically before they earn an
 * equals sign. Invalid or oversized inputs fail closed instead of drawing a
 * confident but false teaching visual.
 */
export function studyFractionSpec(caption = '') {
  const text = String(caption || '').replace(/\s+/g, ' ').trim();
  const match = /^(?:fraction|fraction model|proportion|proportion model)\s*:\s*(\d+)\s*\/\s*(\d+)(?:\s*=\s*(\d+)\s*\/\s*(\d+))?\s*[.;]?$/i.exec(text);
  if (!match) return null;
  const left = fractionPart(match[1], match[2]);
  if (!left) return null;
  if (!match[3] && !match[4]) return { left, right: null };
  const right = fractionPart(match[3], match[4]);
  if (!right) return null;
  if ((left.numerator * right.denominator) !== (right.numerator * left.denominator)) return null;
  return { left, right };
}

function compactState(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 52) return '';
  return text;
}

/** Parse one explicit state transition. Generic arrows remain process flows. */
export function studyBeforeAfterSpec(caption = '') {
  const text = String(caption || '').replace(/\s+/g, ' ').trim();
  const match = /^before\s*\/\s*after\s*:\s*(.+?)\s*(?:->|→|⇒)\s*(.+?)\s*[.;]?$/i.exec(text);
  if (!match) return null;
  const before = compactState(match[1]);
  const after = compactState(match[2]);
  if (!before || !after || before.toLowerCase() === after.toLowerCase()) return null;
  return { before, after };
}

export function studyMicroVisualKind(caption = '') {
  if (studyFractionSpec(caption)) return 'fraction-model';
  if (studyBeforeAfterSpec(caption)) return 'before-after';
  return null;
}

/**
 * Grammar offered to the tutor only. The visible renderer still validates every
 * value and fails closed, so this prompt hint is not visual authority by itself.
 */
export function studyMicroVisualPromptHint() {
  return [
    'For a small inline fraction visual, use the exact caption form “Fraction model: 3/4”.',
    'For equivalent fractions, use “Proportion model: 2/3 = 4/6” only when the equality is mathematically true.',
    'For one explicit state change, use “Before/after: starting state -> resulting state”.',
    'These are compact teaching visuals, not decoration; omit them when the values or states are not explicit.',
  ].join(' ');
}
