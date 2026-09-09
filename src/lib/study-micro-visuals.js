const FRACTION_CAP = 12;
const FRACTION_CONTEXT = /\b(?:fraction|fractions|fractional|numerator|denominator|proportion|proportions)\b/i;
const EQUIVALENCE_CONTEXT = /\b(?:equivalent|equals?|equal to|same (?:value|amount|fraction)|proportion)\b|=/i;

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

function fractionsIn(text = '') {
  return [...String(text || '').matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g)]
    .map((match) => fractionPart(match[1], match[2]));
}

/**
 * Parse one-whole fraction bars from an explicit fraction caption.
 *
 * Preferred forms:
 * - Fraction model: 3/4
 * - Proportion model: 2/3 = 4/6
 *
 * Natural captions are accepted only when they explicitly say this is about
 * fractions/proportion. A two-fraction caption must also claim equivalence, and
 * that claim is checked mathematically before an equals sign is rendered.
 */
export function studyFractionSpec(caption = '') {
  const text = String(caption || '').replace(/\s+/g, ' ').trim();
  if (!text || !FRACTION_CONTEXT.test(text)) return null;
  const fractions = fractionsIn(text);
  if (fractions.length < 1 || fractions.some((part) => !part)) return null;
  const left = fractions[0];
  if (fractions.length === 1) return { left, right: null };
  if (fractions.length !== 2 || !EQUIVALENCE_CONTEXT.test(text)) return null;
  const right = fractions[1];
  if ((left.numerator * right.denominator) !== (right.numerator * left.denominator)) return null;
  return { left, right };
}

function compactState(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').replace(/[.;]+$/g, '').trim();
  if (!text || text.length > 52) return '';
  return text;
}

/**
 * Parse one explicit state transition. Generic arrows remain process flows.
 * Accepted captions must name both states rather than asking the renderer to
 * infer a transition from arbitrary lesson prose.
 */
export function studyBeforeAfterSpec(caption = '') {
  const text = String(caption || '').replace(/\s+/g, ' ').trim();
  const transition = /^before\s*(?:\/\s*after|and\s+after)\s*:\s*(.+?)\s*(?:->|→|⇒|\bbecomes?\b|\bchanges?\s+to\b)\s*(.+?)\s*[.;]?$/i.exec(text);
  const labelledPair = /^before\s*:\s*(.+?)\s*[;,]\s*after\s*:\s*(.+?)\s*[.;]?$/i.exec(text);
  const match = transition || labelledPair;
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
