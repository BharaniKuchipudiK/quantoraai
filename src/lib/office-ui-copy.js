const OFFICE_LABELS = Object.freeze({
  powerpoint: 'presentation',
  pptx: 'presentation',
  presentation: 'presentation',
  word: 'document',
  docx: 'document',
  document: 'document',
  excel: 'spreadsheet',
  xlsx: 'spreadsheet',
  spreadsheet: 'spreadsheet',
  pdf: 'PDF',
});

function officeLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return OFFICE_LABELS[key] || 'document';
}

/**
 * Translate internal Office lifecycle language into concise user-facing copy.
 * Verification remains enforced by the artifact pipeline; it does not need to
 * be repeated in a transient progress message.
 */
export function polishOfficeUiCopy(value = '') {
  if (typeof value !== 'string' || !value) return value || '';

  return value
    .replace(
      /⏳\s*\*\*Updating the verified\s+([a-z0-9_-]+)\s+artifact\.\.\.\*\*/gi,
      (_match, kind) => `Updating your ${officeLabel(kind)}…`,
    )
    .replace(
      /⏳\s*\*\*Architecting\s+([a-z0-9_-]+)\s+document from the approved briefing\.\.\.\*\*/gi,
      (_match, kind) => `Creating your ${officeLabel(kind)}…`,
    );
}
