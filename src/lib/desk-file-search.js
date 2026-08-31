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
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice(0, limit);

  const scored = [];
  for (const path of list) {
    const hay = path.toLowerCase();
    const baseAt = hay.lastIndexOf('/') + 1;

    let first = -1;
    let last = -1;
    let cursor = 0;
    for (const char of q) {
      const found = hay.indexOf(char, cursor);
      if (found === -1) { cursor = -1; break; }
      if (first === -1) first = found;
      last = found;
      cursor = found + 1;
    }
    if (cursor === -1) continue;

    const inBasename = first >= baseAt;
    const span = last - first;
    // Lower is better. The basename bonus dominates; span and offset break ties.
    scored.push({ path, score: (inBasename ? 0 : 1000) + span * 4 + first });
  }

  scored.sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path));
  return scored.slice(0, limit).map((row) => row.path);
}
