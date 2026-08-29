/**
 * Desk Rename — rebrand a built site without asking a model to rewrite it.
 *
 * WHY THIS EXISTS
 *
 * A user asked a working 970-line storefront to be renamed from a placeholder
 * brand to their real one. That request went to a model as a full regeneration:
 * re-emit every line of index.html to change a string. It hit the 175-second
 * ceiling and produced nothing. The user got no rename, no site, and a bill.
 *
 * Renaming is a find and replace. It has exactly one right answer, it is
 * derivable from files we already hold, and it should never have involved
 * inference at all. This module is the deterministic path: it runs in
 * milliseconds, it cannot time out, it cannot hallucinate a redesign, and it
 * cannot quietly drop the other 969 lines.
 *
 * THE LINE THIS MODULE DOES NOT CROSS
 *
 * It renames a brand it can DERIVE. The current name is read from the places a
 * site states its own identity — <title>, og:site_name, and the footer
 * copyright — and must be corroborated, because replacing a guessed string
 * across every file is how you silently mangle a build.
 *
 * When the current name cannot be derived, this REFUSES and says what it needs.
 * A refusal the user can answer in four words beats a rewrite that loses their
 * site.
 */

/** Text files worth rewriting. Binary and lock files are never touched. */
const TEXT_FILE = /\.(html?|css|jsx?|tsx?|json|md|txt|svg)$/i;
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

/*
 * "rename/rebrand/call this X" — and NOT a file rename.
 *
 * `rename src/App.jsx to src/Main.jsx` is a different operation on a different
 * noun, so a target that looks like a path is rejected below rather than
 * matched loosely here.
 */
const RENAME_INTENT = /\b(?:re-?name|re-?brand|change\s+the\s+name(?:\s+of\s+\w+)?|call)\b/i;
const RENAME_TARGET = /\b(?:re-?name(?:d)?|re-?brand(?:ed)?|change\s+the\s+name)\b[^.!?\n]*?\b(?:as|to|into)\s+(.+?)\s*$/i;
const CALL_IT_TARGET = /\bcall\s+(?:it|this|the\s+\w+)\s+(.+?)\s*$/i;

/** A path, a file, or an option flag is not a brand. */
const NOT_A_BRAND = /[/\\]|\.(html?|css|jsx?|tsx?|json|md)$|^-{1,2}\w/i;

function tidyName(raw) {
  let name = String(raw || '').trim();
  // Strip a trailing "instead", "please", and terminal punctuation the user typed.
  name = name.replace(/\s*\b(?:instead|please|thanks|thank\s+you)\b\s*$/i, '').trim();
  name = name.replace(/[.,;:!?]+$/, '').trim();
  // Unwrap a quoted name without eating an apostrophe inside one.
  const quoted = name.match(/^["'“‘](.+)["'”’]$/);
  if (quoted) name = quoted[1].trim();
  return name;
}

/**
 * The new brand the user asked for, or null.
 *
 * Length is bounded on both ends: a single character is not a brand, and a
 * sentence is the user explaining rather than naming.
 */
export function detectRenameRequest(text) {
  const line = String(text || '').trim();
  if (!line || !RENAME_INTENT.test(line)) return null;
  const match = line.match(RENAME_TARGET) || line.match(CALL_IT_TARGET);
  if (!match) return null;
  const newName = tidyName(match[1]);
  if (newName.length < 2 || newName.length > 60) return null;
  if (NOT_A_BRAND.test(newName)) return null;
  // A brand is a name, not a clause. Six words is generous for a shop name.
  if (newName.split(/\s+/).length > 6) return null;
  return { newName };
}

function textOf(vfs, path) {
  const value = vfs?.[path];
  if (typeof value === 'string') return value;
  if (value && typeof value.code === 'string') return value.code;
  if (value && typeof value.content === 'string') return value.content;
  return null;
}

function firstGroup(source, re) {
  const match = String(source || '').match(re);
  return match ? tidyName(match[1]) : null;
}

/**
 * Every place this site states its own name, with duplicates kept so agreement
 * between independent locations can be counted.
 */
export function brandCandidates(html = '') {
  const src = String(html || '');
  const found = [];
  const push = (value) => {
    if (!value) return;
    /*
     * A title is often "Brand — tagline"; keep only the identity half.
     *
     * Separator ENTITIES are normalised first, because generated HTML writes
     * "&mdash;" far more often than a literal em dash — without this, the whole
     * "Kaapi Bharat &mdash; Coffee & Tea Merchants" string became the brand.
     *
     * Only separators are decoded. "&amp;" is deliberately left encoded: the
     * derived name is used as a literal needle against the source, so decoding
     * "Joe &amp; Sons" into "Joe & Sons" would produce a brand that matches
     * nothing in the file it came from.
     */
    const separated = String(value).replace(/&(?:mdash|ndash|#8212|#8211|#x2014|#x2013);/gi, '—');
    const head = separated.split(/\s*[|–—·]\s*|\s+-\s+/)[0].trim();
    if (head.length >= 2 && head.length <= 60) found.push(head);
  };
  push(firstGroup(src, /<title[^>]*>([\s\S]*?)<\/title>/i));
  push(firstGroup(src, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i));
  push(firstGroup(src, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i));
  // Footer copyright: "© 2025 Kaapi Bharat. All rights reserved."
  push(firstGroup(src, /(?:©|&copy;|\(c\))\s*\d{4}\s*(?:-\s*\d{4}\s*)?([^.<\n]{2,60}?)(?:\.|<|All\s+rights)/i));
  return found;
}

/**
 * The one brand this site can be said to have, or null.
 *
 * Corroboration is the whole point. A single mention could be a page heading
 * that happens to sit in <title>; two independent locations agreeing is the
 * site telling us its name twice. A lone candidate is accepted only when it is
 * the sole signal, because refusing a site that simply has no footer would fail
 * the common case for the sake of the rare one.
 */
export function deriveCurrentBrand(html = '') {
  const found = brandCandidates(html);
  if (!found.length) return null;
  const tally = new Map();
  for (const name of found) {
    const key = name.toLowerCase();
    tally.set(key, { name, count: (tally.get(key)?.count || 0) + 1 });
  }
  const ranked = [...tally.values()].sort((left, right) => right.count - left.count);
  if (ranked.length === 1) return ranked[0].name;
  // Two different names, neither corroborated — this site does not agree with
  // itself about what it is called, and picking one would be a coin toss.
  if (ranked[0].count === ranked[1].count) return null;
  return ranked[0].name;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The brand as a whole word.
 *
 * Without boundaries, renaming "Roastery" turns "Roasterymen" into "Hiranmen".
 * The guards are conditional because a brand may legitimately begin or end with
 * punctuation ("Joe's.", "&Sons"), and \b before a non-word character never
 * matches — an unconditional boundary would silently rename nothing at all.
 */
function brandMatcher(needle) {
  const body = escapeRegExp(needle);
  const open = /^\w/.test(needle) ? '\\b' : '';
  const close = /\w$/.test(needle) ? '\\b' : '';
  return new RegExp(`${open}${body}${close}`, 'g');
}

/**
 * Plan a rename across the desk. Nothing is written here — the caller decides
 * whether to apply, and the plan is reportable on its own.
 *
 * Returns { ok, from, to, edits, total } or { ok: false, refusal }.
 */
export function planDeskRename({ vfs = {}, html = '', newName = '' } = {}) {
  const to = tidyName(newName);
  if (!to) return { ok: false, refusal: 'No new name was given.' };

  const paths = Object.keys(vfs || {}).filter((path) => TEXT_FILE.test(path) && !SKIP_FILE.test(path));
  const haystack = html || paths.map((path) => textOf(vfs, path) || '').join('\n');
  const from = deriveCurrentBrand(haystack);
  if (!from) {
    return {
      ok: false,
      refusal: `I could not tell what this site is currently called, so I will not find-and-replace a guess across every file. Tell me the current name — "rename NAME to ${to}" — and this takes a moment.`,
    };
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    return { ok: false, refusal: `This site is already called ${from}.` };
  }

  /*
   * Case variants only. Identifiers are deliberately left alone: renaming
   * class="kaapi-header" to class="hiran-s-coffee-header" would have to be
   * perfectly consistent across HTML, CSS and JS to avoid breaking the page,
   * and an apostrophe in a brand does not survive a CSS selector. Users rename
   * what they can see; internal ids are not that.
   *
   * The all-lowercase variant is skipped for a SINGLE-WORD brand. A brand of
   * "Roastery" would otherwise rewrite "visit our roastery in Bengaluru" into
   * "visit our hiran in Bengaluru" — replacing the user's prose with their own
   * shop name. A multi-word phrase in lowercase is not prose by accident, so it
   * stays eligible.
   */
  const multiWord = /\s/.test(from);
  const variants = [
    [from, to],
    [from.toUpperCase(), to.toUpperCase()],
    ...(multiWord ? [[from.toLowerCase(), to.toLowerCase()]] : []),
  ];

  const edits = [];
  let total = 0;
  for (const path of paths) {
    const before = textOf(vfs, path);
    if (before == null) continue;
    let after = before;
    let count = 0;
    for (const [needle, replacement] of variants) {
      after = after.replace(brandMatcher(needle), () => { count += 1; return replacement; });
    }
    if (count > 0) {
      edits.push({ path, count, next: after });
      total += count;
    }
  }

  if (!total) {
    return { ok: false, refusal: `I found the name ${from} but could not locate it in any file to change.` };
  }
  return { ok: true, from, to, edits: edits.map(({ path, count }) => ({ path, count })), total, _writes: edits };
}

/** Apply a successful plan, returning a new VFS. The original is not mutated. */
export function applyDeskRename(vfs = {}, plan = null) {
  if (!plan?.ok || !plan._writes?.length) return vfs;
  const next = { ...vfs };
  for (const { path, next: text } of plan._writes) {
    const original = next[path];
    if (typeof original === 'string') next[path] = text;
    else if (original && typeof original === 'object') {
      next[path] = typeof original.code === 'string'
        ? { ...original, code: text }
        : { ...original, content: text };
    }
  }
  return next;
}

/** What actually happened, in the user's terms. Counts, not adjectives. */
export function describeDeskRename(plan) {
  if (!plan) return '';
  if (!plan.ok) return plan.refusal || '';
  const files = plan.edits.length;
  return `Renamed ${plan.from} to ${plan.to} — ${plan.total} mention${plan.total === 1 ? '' : 's'} across ${files} file${files === 1 ? '' : 's'}. No other line changed.`;
}
