/**
 * Keep partner status honest after the user agreed to a smaller catalog.
 * Models still stream "Building: 100 unique…" — replace that with the agreed target.
 */

export function sanitizePartnerBuildStatus(status, {
  catalogTarget = 10,
  intakeAccepted = false,
  userAsked = 0,
} = {}) {
  if (!status || typeof status !== 'object') return status;
  if (!intakeAccepted) return status;
  const label = String(status.label || status.message || '');
  if (!label.trim()) return status;
  const target = Number(catalogTarget) || 10;
  const asked = Number(userAsked) || 0;
  const mentioned = Number((label.match(/\b(\d{2,3})\b/) || [])[1] || 0);
  const liesAboutScale = (
    (mentioned >= 20 && mentioned !== target)
    || (asked >= 20 && mentioned === asked)
    || /\bdiverse collection of at least\b/i.test(label)
  ) && /\b(unique|merchandise|design|mockup|collection|photos?|images?|building)\b/i.test(label);
  if (!liesAboutScale) return status;
  return {
    ...status,
    label: `Building about ${target} working catalog photos — not the full unique-image ask`,
  };
}
