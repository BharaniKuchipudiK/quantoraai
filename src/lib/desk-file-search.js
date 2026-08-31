/**
 * Quick-open file ranking for the Coding Desk finder.
 *
 * Kept out of desk-tabs.js on purpose: the finder is lazily loaded, and the
 * desk entry chunk has a hard over-the-wire budget. Searching is also simply
 * not tab state.
 */

/**
 * Rank file paths for the quick-open finder (the `+` button and Ctrl/Cmd + P).
 *
 * Subsequence matching, the way editor file-finders work: "aj" finds "app.jsx".
 * Ranking favours, in order, a hit on the basename over one buried in the
 * directory, an earlier first character, and a tighter span — so typing "app"
 * puts app.jsx above src/application/legacy/wrapper.js.
 */
export function rankDeskFileMatches(paths = [], query = '', limit = 50) {
  const list = (Array.isArray(paths) ? paths : []).filter(Boolean).map(String);
  /*
   * Terms, not one literal string.
   *
   * The query used to be matched as a single subsequence including its spaces,
   * so "button jsx" required a literal space in the path and every multi-word
   * query returned nothing — while "buttonjsx" worked. Typing a space is the
   * most natural way to narrow a search, so the most natural input was the one
   * that silently failed.
   */
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return list.slice(0, limit);

  /*
   * Try the basename on its own before the whole path.
   *
   * A single greedy pass over the full path takes the earliest occurrence of
   * each character, so "page" consumes the `p` in `app/` and the match is then
   * classified as a directory hit — ranking `src/PageUtils.jsx` above the exact
   * `app/page.jsx`. Matching the basename independently is what makes an exact
   * filename win, which is the whole reason a file finder exists.
   */
  const subsequence = (hay, from, q) => {
    let first = -1;
    let last = -1;
    let cursor = from;
    for (const char of q) {
      const found = hay.indexOf(char, cursor);
      if (found === -1) return null;
      if (first === -1) first = found;
      last = found;
      cursor = found + 1;
    }
    return { first, last };
  };

  /** Every term must match, so adding a word narrows rather than widens. */
  const matchAll = (hay, from) => {
    let first = Infinity;
    let last = -1;
    for (const term of terms) {
      const hit = subsequence(hay, from, term);
      if (!hit) return null;
      first = Math.min(first, hit.first);
      last = Math.max(last, hit.last);
    }
    return { first, last };
  };

  const scored = [];
  for (const path of list) {
    const hay = path.toLowerCase();
    const baseAt = hay.lastIndexOf('/') + 1;

    const inBase = baseAt > 0 ? matchAll(hay, baseAt) : null;
    const hit = inBase || matchAll(hay, 0);
    if (!hit) continue;

    const isBasenameHit = Boolean(inBase) || hit.first >= baseAt;
    /*
     * Offset is measured from where the match is allowed to start, not from the
     * front of the path. Using the absolute offset cancelled the basename bonus
     * for anything deeply nested: src/app/components/ui/app.jsx scored worse
     * than a shallow fuzzy hit inside "zapper.jsx", which defeats the point.
     */
    const offset = isBasenameHit ? Math.max(0, hit.first - baseAt) : hit.first;
    const span = hit.last - hit.first;
    scored.push({
      path,
      score: (isBasenameHit ? 0 : 1000) + span * 4 + offset,
      // Tiebreak: "comp" covers all of comp.js but only a prefix of
      // component.jsx, so the tighter match on the shorter name wins.
      baseLen: hay.length - baseAt,
    });
  }

  scored.sort((a, b) => (a.score - b.score) || (a.baseLen - b.baseLen) || a.path.localeCompare(b.path));
  return scored.slice(0, limit).map((row) => row.path);
}
