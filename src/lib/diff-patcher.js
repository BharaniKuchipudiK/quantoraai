/**
 * Search/replace patching — and a truthful account of what did not apply.
 *
 * WHY THIS WAS REWRITTEN
 *
 * The previous version dropped blocks it could not match. Given two edits
 * where the model got whitespace wrong on the second:
 *
 *   asked   rename the shop AND change the price 1200 -> 1500
 *   got     <h1>Hirans Coffee</h1>     applied
 *           <p>Price: 1200</p>         silently dropped
 *
 * It returned a plain string. No error, no signal, nothing the caller could
 * check — so the desk committed the file and the reply said both edits were
 * done. A build that looks right and is wrong, with a confident sentence on
 * top: the platform's signature failure, now holding the user's work.
 *
 * WHAT THIS RETURNS INSTEAD
 *
 * Every block's outcome, always. Applying four of five edits is usually fine;
 * CLAIMING five is not. The caller must be able to tell the difference, so a
 * string return is no longer offered — losing that information is how this
 * defect existed in the first place.
 *
 * MATCHING RULES
 *
 *   exact          the search text appears verbatim, exactly once.
 *   whitespace     it appears once when whitespace is normalised. Models
 *                  reindent; the intent is unambiguous, so this is a match.
 *   ambiguous      it appears more than once. That is a guess about which one
 *                  the user meant, and this module does not guess.
 *   missing        it appears nowhere.
 *
 * Ambiguity failing is deliberate. The old code used String.replace, which
 * silently took the FIRST occurrence — so a search block matching two places
 * patched one of them at random and reported nothing.
 */

const BLOCK = /<<<<\s*\n([\s\S]*?)\n====\s*\n([\s\S]*?)\n>>>>/g;

export function looksLikePatch(text = '') {
  const src = String(text || '');
  return src.includes('<<<<') && src.includes('====');
}

/** Split a patch into its blocks. Exported so callers can count before applying. */
export function parsePatchBlocks(diffText = '') {
  const blocks = [];
  const re = new RegExp(BLOCK.source, 'g');
  let match;
  while ((match = re.exec(String(diffText || ''))) !== null) {
    blocks.push({ search: match[1], replace: match[2] });
  }
  return blocks;
}

const squash = (value) => String(value).replace(/\s+/g, ' ').trim();

/**
 * Locate `search` in `source` exactly once.
 *
 * Returns { start, end, how } or { how: 'ambiguous' | 'missing' }.
 */
function locate(source, search) {
  const first = source.indexOf(search);
  if (first !== -1) {
    if (source.indexOf(search, first + 1) !== -1) return { how: 'ambiguous' };
    return { start: first, end: first + search.length, how: 'exact' };
  }

  /*
   * Whitespace-tolerant fallback. Walk real candidate windows rather than
   * comparing squashed strings and trying to map an index back — an offset in a
   * squashed string does not correspond to any offset in the original, and
   * guessing one would splice the replacement into the middle of a tag.
   */
  const wanted = squash(search);
  if (!wanted) return { how: 'missing' };
  const anchor = search.trim().split(/\s+/)[0];
  if (!anchor) return { how: 'missing' };

  const found = [];
  let from = 0;
  while (found.length < 2) {
    const at = source.indexOf(anchor, from);
    if (at === -1) break;
    from = at + 1;
    // The matching window cannot be shorter than the search with whitespace
    // collapsed, nor unboundedly longer; allow for reindentation only.
    for (let end = at + wanted.length; end <= Math.min(source.length, at + search.length * 2 + 16); end += 1) {
      if (squash(source.slice(at, end)) === wanted) {
        found.push({ start: at, end });
        break;
      }
    }
  }
  if (found.length === 1) return { ...found[0], how: 'whitespace' };
  if (found.length > 1) return { how: 'ambiguous' };
  return { how: 'missing' };
}

/**
 * Apply a patch, reporting every block.
 *
 * Returns { text, applied, failed, ok, wasPatch }:
 *   text     the patched source (unchanged where blocks failed)
 *   applied  [{ how }] one per block that landed
 *   failed   [{ reason, search }] one per block that did not
 *   ok       true only when every block landed
 *   wasPatch false when the payload held no blocks at all
 */
export function applyDiffPatch(sourceText, diffText) {
  const source = String(sourceText || '');
  const patch = String(diffText || '');

  if (!source) {
    /*
     * A patch with no base is not a file. Returning the raw <<<< text as
     * content would write the markers into the user's build.
     */
    if (looksLikePatch(patch)) {
      return { text: '', applied: [], failed: [{ reason: 'no-base', search: '' }], ok: false, wasPatch: true };
    }
    return { text: patch, applied: [], failed: [], ok: true, wasPatch: false };
  }

  const blocks = parsePatchBlocks(patch);
  if (!blocks.length) {
    // No markers: the model rewrote the whole file. That is legitimate.
    return { text: patch, applied: [], failed: [], ok: true, wasPatch: false };
  }

  let text = source;
  const applied = [];
  const failed = [];
  for (const block of blocks) {
    const spot = locate(text, block.search);
    if (spot.how === 'ambiguous' || spot.how === 'missing') {
      failed.push({ reason: spot.how, search: block.search.trim().slice(0, 120) });
      continue;
    }
    text = text.slice(0, spot.start) + block.replace + text.slice(spot.end);
    applied.push({ how: spot.how });
  }

  return { text, applied, failed, ok: failed.length === 0, wasPatch: true };
}

/** What to tell the user when part of an edit did not land. Counts, not adjectives. */
export function describePatchFailures(result, filepath = 'the file') {
  if (!result || result.ok || !result.failed?.length) return '';
  const total = result.applied.length + result.failed.length;
  const reasons = {
    missing: 'the text it was looking for is not in the file',
    ambiguous: 'the text it was looking for appears more than once, so which one was meant is a guess',
    'no-base': 'there is no existing file to patch',
  };
  const lines = [
    `${result.applied.length} of ${total} edits to \`${filepath}\` were applied. ${result.failed.length} could not be:`,
  ];
  for (const failure of result.failed) {
    lines.push(`- ${reasons[failure.reason] || failure.reason}${failure.search ? ` — \`${failure.search}\`` : ''}`);
  }
  lines.push('Ask me again and I will re-read the file first.');
  return lines.join('\n');
}
