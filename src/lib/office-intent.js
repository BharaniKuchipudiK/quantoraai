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

/*
 * A request for a WEB build cancels any older Office intent.
 *
 * The bug this closes: detection used to join EVERY user message in the thread
 * and return the first pattern that matched anywhere. One "presentation" early
 * in a long chat turned every later turn into a PowerPoint turn — permanently.
 * A later "build a one-page site" was generated as HTML and then compiled as a
 * deck, producing "this is not a website and must not be published" and
 * host-time failures on a PPTX nobody asked for.
 */
const WEB_BUILD_RE = /\b(website|web ?site|web ?app|web ?page|landing page|one[\s-]?pager?|one[\s-]?page site|single[\s-]?page|html file|storefront|frontend layout|site for)\b/i;

/*
 * How many recent user turns may still carry Office intent forward. A briefing
 * exchange ("make a deck about X" → questions → "yes, focus on Q3") must keep
 * working, so intent is not strictly last-message-only — but it is bounded, and
 * a web-build request stops the lookback immediately.
 */
const OFFICE_INTENT_LOOKBACK = 4;

function matchOfficeKind(text) {
  for (const [kind, re] of KIND_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return null;
}

/** True when this text asks for a web page/app rather than an Office file. */
export function looksLikeWebBuildRequest(text = '') {
  return WEB_BUILD_RE.test(String(text || ''));
}

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

  // Walk the most recent user turns newest-first, within a bounded window.
  // Never join the whole thread: that made Office intent sticky for the life of
  // the conversation and hijacked later website builds.
  const userTexts = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.sender === 'user' && typeof m.text === 'string')
    .map((m) => m.text);
  if (!userTexts.length) return null;

  const window = userTexts.slice(-OFFICE_INTENT_LOOKBACK).reverse();
  for (const text of window) {
    // Office wins inside a single message ("a presentation about our website"):
    // the artifact noun is the explicit ask.
    const kind = matchOfficeKind(text);
    if (kind) return kind;
    // A newer web-build request cancels any older Office intent behind it.
    if (looksLikeWebBuildRequest(text)) return null;
  }
  return null;
}

/** Back-compat convenience: is this a slide-deck conversation? */
export function isPresentationIntent(messages = []) {
  return detectOfficeIntent({ messages }) === OFFICE_KIND.POWERPOINT;
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
