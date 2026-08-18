/*
 * Contextual message actions (Roadmap: chat UX).
 *
 * A message's action bar should be DERIVED from its content/state, not a fixed row
 * dumped on every reply. This is the single source of truth for "which actions
 * does THIS message support?" so every bar renders the same, correct set:
 *  - always: copy, feedback (up/down), regenerate
 *  - only when useful: summarize (long replies), preview (code/deck/app)
 *  - secondary actions live in the "…" overflow, which is shown only when it
 *    actually has items.
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
  const overflow = [];
  if (clean.length > 0) overflow.push('read-aloud');
  overflow.push('report');
  return {
    copy: clean.length > 0,
    feedback: true,
    regenerate: true,
    summarize: isSummarizable(clean),
    // Verified Office artifacts already live in the right-side workspace. Their
    // presence is explicit message state; never infer this from assistant wording.
    preview: Boolean(hasPreview) && !isOfficeArtifact,
    overflow,
  };
}
