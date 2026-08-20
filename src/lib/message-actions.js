/*
 * Contextual message actions (Roadmap: chat UX).
 *
 * A message's action bar is derived from its content/state. Keep the primary
 * actions concise and non-duplicative: thumbs-down is the feedback/report path,
 * and the final conversation action is an explicit Fork Chat control rather
 * than an overflow menu with overlapping commands.
 */

/** Long enough that a summary adds value (not a one-liner). */
export function isSummarizable(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return false;
  const words = clean.split(/\s+/).length;
  const paragraphs = (clean.match(/\n\s*\n/g) || []).length + 1;
  return clean.length > 500 || words > 90 || paragraphs >= 3;
}

/**
 * Resolve the action set for a message.
 * @param {{ text?: string, hasPreview?: boolean, isOfficeArtifact?: boolean }} opts
 * @returns {{ copy:boolean, feedback:boolean, regenerate:boolean,
 *             summarize:boolean, preview:boolean, overflow:string[] }}
 */
export function resolveMessageActions({ text = '', hasPreview = false, isOfficeArtifact = false } = {}) {
  const clean = String(text || '').trim();
  return {
    copy: clean.length > 0,
    feedback: true,
    regenerate: true,
    summarize: isSummarizable(clean),
    // Verified Office artifacts already live in the right-side workspace. Their
    // presence is explicit message state; never infer this from assistant wording.
    preview: Boolean(hasPreview) && !isOfficeArtifact,
    // AiStudio still renders its final action from the legacy overflow slot. The
    // Studio conversation bridge turns this single semantic item into the visible
    // Fork Chat control and prevents the old menu from opening.
    overflow: ['fork-chat'],
  };
}