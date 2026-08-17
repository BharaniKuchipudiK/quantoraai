/*
 * Single source of truth for "what Office artifact does this conversation want?"
 * (Roadmap: MS Office integration).
 *
 * Previously the presentation heuristic `/presentation|deck|slides|ppt|.../i`
 * was duplicated in 5+ places across AiStudio and LivePreviewCanvas, which drift
 * apart. This centralizes detection and — importantly — prefers an EXPLICIT
 * signal (the tool the user picked) over guessing from free text, which caused
 * false positives ("sundeck", "the deck of the boat").
 */

export const OFFICE_KIND = Object.freeze({
  POWERPOINT: 'powerpoint',
  EXCEL: 'excel',
  WORD: 'word',
  PDF: 'pdf',
});

// One-shot explicit selection captured by StudioToolsMenu. This closes a real
// routing hole: previously choosing PowerPoint only prefilled text; if the user
// replaced that text, useChatStream could no longer know the PowerPoint tool had
// been selected and could fall through to generic HTML generation.
let pendingOfficeTool = null;

// Free-text fallbacks, ordered by specificity. Only used when there is no
// explicit tool selection. Word-boundaried to avoid matching inside other words.
const KIND_PATTERNS = [
  [OFFICE_KIND.POWERPOINT, /\b(powerpoint|pptx?|slide deck|presentation|slideshow)\b/i],
  [OFFICE_KIND.EXCEL, /\b(excel|xlsx?|spreadsheet|worksheet)\b/i],
  [OFFICE_KIND.WORD, /\b(word(?:\s+(?:document|report|file|doc))|docx?|\.doc)\b/i],
  [OFFICE_KIND.PDF, /\b(pdf)\b/i],
];

/** Map a Tools-menu selection (e.g. "PowerPoint", "Excel") to an office kind. */
export function officeKindFromTool(tool) {
  switch (String(tool || '').toLowerCase()) {
    case 'powerpoint': return OFFICE_KIND.POWERPOINT;
    case 'excel': return OFFICE_KIND.EXCEL;
    case 'word': return OFFICE_KIND.WORD;
    case 'pdf': return OFFICE_KIND.PDF;
    default: return null;
  }
}

/**
 * Remember the next explicit Office-tool selection. Non-Office tools clear any
 * stale Office selection. The selection is deliberately one-shot and consumed
 * by detectOfficeIntent on the next send.
 */
export function rememberOfficeToolSelection(tool) {
  pendingOfficeTool = officeKindFromTool(tool);
  return pendingOfficeTool;
}

/** Primarily exposed for deterministic tests and explicit UI cancellation. */
export function clearOfficeToolSelection() {
  pendingOfficeTool = null;
}

/**
 * Resolve the office kind for a conversation.
 * @param {object} opts
 * @param {string|null} [opts.selectedTool] explicit Tools-menu choice — wins.
 * @param {Array<{sender?:string,text?:string}>} [opts.messages] chat history.
 * @returns {string|null} an OFFICE_KIND or null.
 */
export function detectOfficeIntent({ selectedTool = null, messages = [] } = {}) {
  const selected = officeKindFromTool(selectedTool);
  if (selected) {
    pendingOfficeTool = null;
    return selected;
  }

  // Consume the UI selection before any text heuristic. This ensures a user can
  // choose PowerPoint, completely rewrite the prefilled prompt, and still enter
  // the canonical Office briefing/generation path exactly once.
  if (pendingOfficeTool) {
    const explicit = pendingOfficeTool;
    pendingOfficeTool = null;
    return explicit;
  }

  const userText = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.sender === 'user' && typeof m.text === 'string')
    .map((m) => m.text)
    .join('\n');
  if (!userText) return null;

  for (const [kind, re] of KIND_PATTERNS) {
    if (re.test(userText)) return kind;
  }
  return null;
}

/** Back-compat convenience: is this a slide-deck conversation? */
export function isPresentationIntent(messages = []) {
  return detectOfficeIntent({ messages }) === OFFICE_KIND.POWERPOINT;
}

/** Any office artifact at all (presentation/sheet/doc/pdf). */
export function isOfficeIntent(opts) {
  return detectOfficeIntent(opts) !== null;
}

/** Safe file base name for a download (no extension, no path/unsafe chars). */
export function sanitizeOfficeFilename(name, fallback = 'quantora-document') {
  const base = String(name || '')
    .replace(/\.(pptx|xlsx|docx|pdf|html?)$/i, '') // drop a known extension
    .replace(/[^\w\- ]+/g, ' ')                    // then no dots/slashes (path-safe)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return base || fallback;
}
