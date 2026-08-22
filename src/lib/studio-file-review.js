/**
 * Honest file review for the coding desk.
 * Counts come from a line LCS on the real file text. No invented +/−.
 */

const MAX_LCS_LINES = 800;

function linesOf(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return text.split('\n');
}

function lcsLength(left, right) {
  const n = left.length;
  const m = right.length;
  if (!n || !m) return 0;
  let prev = new Array(m + 1).fill(0);
  let next = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      next[j] = left[i - 1] === right[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], next[j - 1]);
    }
    const swap = prev;
    prev = next;
    next = swap;
    next.fill(0);
  }
  return prev[m];
}

export function lineDiffStats(before = '', after = '') {
  if (before === after) return { added: 0, removed: 0, exact: true };
  const oldLines = linesOf(before);
  const newLines = linesOf(after);
  if (oldLines.length > MAX_LCS_LINES || newLines.length > MAX_LCS_LINES) {
    return { added: 0, removed: 0, exact: false };
  }
  const common = lcsLength(oldLines, newLines);
  return {
    added: newLines.length - common,
    removed: oldLines.length - common,
    exact: true,
  };
}

export function diffVfsReview(before = {}, after = {}) {
  const paths = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const rows = [];
  for (const path of paths) {
    if (!path) continue;
    const previous = before?.[path]?.content;
    const next = after?.[path]?.content;
    const had = typeof previous === 'string';
    const has = typeof next === 'string';
    if (!had && !has) continue;
    if (had && has && previous === next) continue;
    const stats = lineDiffStats(had ? previous : '', has ? next : '');
    if (stats.exact && stats.added === 0 && stats.removed === 0) continue;
    rows.push({
      path,
      added: stats.exact ? stats.added : 0,
      removed: stats.exact ? stats.removed : 0,
      exact: stats.exact,
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}
