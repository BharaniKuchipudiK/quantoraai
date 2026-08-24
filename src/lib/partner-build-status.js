/**
 * Keep partner status honest after the user agreed to a smaller catalog.
 * Models still stream "Building: 100 unique…" — replace that with the agreed target.
 */

export function sanitizePartnerBuildStatus(status, {
  catalogTarget = 10,
  intakeAccepted = false,
} = {}) {
  if (!status || typeof status !== 'object') return status;
  if (!intakeAccepted) return status;
  const label = String(status.label || status.message || '');
  if (!label.trim()) return status;
  const liesAboutScale = (
    /\b(?:100|50|80|60)\b/.test(label)
    && /\b(unique|merchandise|design|mockup|collection|photos?|images?)\b/i.test(label)
  ) || /\bdiverse collection of at least\b/i.test(label);
  if (!liesAboutScale) return status;
  const target = Number(catalogTarget) || 10;
  return {
    ...status,
    label: `Building about ${target} working catalog photos — not the full unique-image ask`,
  };
}
