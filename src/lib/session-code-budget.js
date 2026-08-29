/**
 * Session code budget — stop paying for the same page five times.
 *
 * WHY THIS EXISTS
 *
 * A user hit "Browser storage was full. Your chats were kept, but 1 saved
 * Coding desk build was dropped — they will not survive a refresh."
 *
 * Measured on a realistic 5-turn storefront session (a 970-line index.html):
 *
 *   whole session as stored   774 KB
 *     message text            645 KB   <- the same page, five times over
 *     desk snapshot           129 KB   <- the build that actually matters
 *
 * Six such sessions exhaust a ~5MB localStorage origin. The desk snapshot was
 * never the expensive part; the chat transcript was, because every rebuild
 * leaves another complete copy of a page that has since been superseded.
 *
 * WHAT THIS KEEPS
 *
 * The newest build's code stays verbatim — it is what Preview replays, and it
 * matches what is on the desk. Only genuinely superseded copies are folded
 * away, and each one leaves a marker naming the file and the size it used to
 * be. Nothing disappears quietly: a transcript that silently loses a code block
 * is the same defect as a proof gate that silently claimed a pass.
 *
 * Small fences are left alone. A ten-line snippet is cheap and is often the
 * point of the message.
 */

/** A fenced block, with its optional language and attribute line. */
const FENCE = /^```([^\n]*)\n([\s\S]*?)\n```$/gm;

/** Below this, a code block costs little and reads as part of the answer. */
export const MIN_COMPACT_CHARS = 2000;

/** How many of the most recent code-bearing replies keep their code verbatim. */
export const KEEP_RECENT_BUILDS = 1;

function fileNameFrom(info = '') {
  const named = String(info).match(/filepath\s*=\s*["']([^"']+)["']/i);
  if (named) return named[1];
  const lang = String(info).trim().split(/\s+/)[0];
  return lang ? `a ${lang} file` : 'a file';
}

function sizeLabel(chars) {
  const kb = chars / 1024;
  return kb >= 1 ? `${Math.round(kb)} KB` : `${chars} characters`;
}

/** Does this message carry a code block big enough to be worth folding? */
export function hasHeavyCode(text, minChars = MIN_COMPACT_CHARS) {
  const src = String(text || '');
  FENCE.lastIndex = 0;
  let match;
  while ((match = FENCE.exec(src)) !== null) {
    if (match[2].length >= minChars) return true;
  }
  return false;
}

/**
 * Replace this message's heavy code blocks with a marker that says what was
 * there. Prose around the fences is preserved exactly.
 */
export function foldHeavyCode(text, minChars = MIN_COMPACT_CHARS) {
  const src = String(text || '');
  FENCE.lastIndex = 0;
  return src.replace(FENCE, (whole, info, body) => {
    if (body.length < minChars) return whole;
    return `*(An earlier version of ${fileNameFrom(info)} — ${sizeLabel(body.length)} — was here. The current files are on the desk.)*`;
  });
}

/**
 * Fold superseded builds out of a transcript before it is persisted.
 *
 * Idempotent: a folded message contains no fence, so a second pass finds
 * nothing to fold and the newest build is re-identified the same way.
 *
 * Returns { messages, foldedCount, savedChars } so the caller can report a real
 * number rather than assert that something was saved.
 */
export function compactSupersededBuilds(messages = [], {
  keep = KEEP_RECENT_BUILDS,
  minChars = MIN_COMPACT_CHARS,
} = {}) {
  const list = Array.isArray(messages) ? messages : [];
  // Which assistant messages carry heavy code, oldest to newest.
  const heavy = [];
  list.forEach((message, index) => {
    if (message?.sender !== 'ai') return;
    if (message?.isGenerating) return;
    if (hasHeavyCode(message.text, minChars)) heavy.push(index);
  });

  // The newest `keep` stay verbatim — that is the build Preview replays.
  const spare = new Set(heavy.slice(Math.max(0, heavy.length - keep)));
  const foldable = heavy.filter((index) => !spare.has(index));
  if (!foldable.length) return { messages: list, foldedCount: 0, savedChars: 0 };

  const foldSet = new Set(foldable);
  let savedChars = 0;
  const next = list.map((message, index) => {
    if (!foldSet.has(index)) return message;
    const before = String(message.text || '');
    const after = foldHeavyCode(before, minChars);
    if (after === before) return message;
    savedChars += before.length - after.length;
    return { ...message, text: after, codeFolded: true };
  });

  return { messages: next, foldedCount: foldable.length, savedChars };
}
