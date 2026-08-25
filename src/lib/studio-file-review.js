/**
 * Honest file review for the coding desk.
 * Counts come from a line LCS on the real file text. No invented +/−.
 */

const MAX_LCS_LINES = 800;
const DIFF_CONTEXT = 3;
const MAX_DIFF_LINES_PER_FILE = 240;
const MAX_DIFF_LINES_TOTAL = 600;

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

/** Line-level alignment of two files. Every op is a line that really exists. */
function alignLines(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = oldLines[i] === newLines[j]
        ? table[(i + 1) * width + (j + 1)] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: ' ', text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      ops.push({ kind: '-', text: oldLines[i] });
      i += 1;
    } else {
      ops.push({ kind: '+', text: newLines[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: '-', text: oldLines[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: '+', text: newLines[j] });
    j += 1;
  }
  return ops;
}

function groupHunks(ops, context) {
  const keep = new Array(ops.length).fill(false);
  for (let index = 0; index < ops.length; index += 1) {
    if (ops[index].kind === ' ') continue;
    const from = Math.max(0, index - context);
    const to = Math.min(ops.length - 1, index + context);
    for (let near = from; near <= to; near += 1) keep[near] = true;
  }
  const oldNumbers = [];
  const newNumbers = [];
  let oldLine = 1;
  let newLine = 1;
  for (const op of ops) {
    oldNumbers.push(oldLine);
    newNumbers.push(newLine);
    if (op.kind !== '+') oldLine += 1;
    if (op.kind !== '-') newLine += 1;
  }
  const hunks = [];
  let cursor = 0;
  while (cursor < ops.length) {
    if (!keep[cursor]) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    while (cursor < ops.length && keep[cursor]) cursor += 1;
    const slice = ops.slice(start, cursor);
    const oldCount = slice.filter((op) => op.kind !== '+').length;
    const newCount = slice.filter((op) => op.kind !== '-').length;
    hunks.push({
      header: `@@ -${oldCount ? oldNumbers[start] : oldNumbers[start] - 1},${oldCount} +${newCount ? newNumbers[start] : newNumbers[start] - 1},${newCount} @@`,
      lines: slice.map((op) => `${op.kind}${op.text}`),
    });
  }
  return hunks;
}

/**
 * Unified diff for one desk file. Nothing is summarised into a filename:
 * either the real changed lines are printed or the reason they are not.
 */
export function unifiedFileDiff(path, before, after, { context = DIFF_CONTEXT, maxLines = MAX_DIFF_LINES_PER_FILE } = {}) {
  const had = typeof before === 'string';
  const has = typeof after === 'string';
  const lines = [`diff --git a/${path} b/${path}`];
  if (!had) lines.push('new file');
  else if (!has) lines.push('deleted file');
  lines.push(`--- ${had ? `a/${path}` : '/dev/null'}`);
  lines.push(`+++ ${has ? `b/${path}` : '/dev/null'}`);

  const oldLines = had ? linesOf(before) : [];
  const newLines = has ? linesOf(after) : [];
  if (oldLines.length > MAX_LCS_LINES || newLines.length > MAX_LCS_LINES) {
    lines.push(`${oldLines.length} lines before, ${newLines.length} after — too large to diff exactly. No hunks were invented.`);
    return { path, exact: false, truncated: false, lines };
  }

  const hunks = groupHunks(alignLines(oldLines, newLines), context);
  let budget = maxLines;
  let truncated = false;
  for (const hunk of hunks) {
    if (budget <= 0) {
      truncated = true;
      break;
    }
    lines.push(hunk.header);
    budget -= 1;
    for (const line of hunk.lines) {
      if (budget <= 0) {
        truncated = true;
        break;
      }
      lines.push(line);
      budget -= 1;
    }
  }
  if (truncated) lines.push(`… diff cut off after ${maxLines} lines. Open ${path} to read the rest.`);
  return { path, exact: true, truncated, lines };
}

/**
 * Unified diff across a desk tree. Values are file contents keyed by path,
 * so this reads the same snapshot Git committed and the tree Preview runs.
 */
export function unifiedTreeDiff(before = {}, after = {}, { context = DIFF_CONTEXT, maxLines = MAX_DIFF_LINES_TOTAL } = {}) {
  const paths = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const lines = [];
  let budget = maxLines;
  for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
    if (!path) continue;
    const previous = before?.[path];
    const next = after?.[path];
    const had = typeof previous === 'string';
    const has = typeof next === 'string';
    if (!had && !has) continue;
    if (had && has && previous === next) continue;
    if (budget <= 0) {
      lines.push('… more files changed than this pane can show. Commit, then diff one file at a time.');
      break;
    }
    const file = unifiedFileDiff(path, had ? previous : undefined, has ? next : undefined, {
      context,
      maxLines: Math.min(MAX_DIFF_LINES_PER_FILE, budget),
    });
    lines.push(...file.lines);
    budget -= file.lines.length;
  }
  return lines;
}

/**
 * Hunks for the Review rail: the real added and removed lines, not a +/− count.
 * Same alignment as the Git pane. Nothing is invented when the file is too large.
 */
export function fileReviewHunks(before, after, { context = DIFF_CONTEXT, maxLines = MAX_DIFF_LINES_PER_FILE } = {}) {
  const had = typeof before === 'string';
  const has = typeof after === 'string';
  const oldLines = had ? linesOf(before) : [];
  const newLines = has ? linesOf(after) : [];
  if (oldLines.length > MAX_LCS_LINES || newLines.length > MAX_LCS_LINES) {
    return {
      exact: false,
      truncated: false,
      hunks: [],
      note: `${oldLines.length} lines before, ${newLines.length} after — too large to diff exactly. No hunks were invented.`,
    };
  }
  const raw = groupHunks(alignLines(oldLines, newLines), context);
  let budget = maxLines;
  const hunks = [];
  let truncated = false;
  for (const hunk of raw) {
    if (budget <= 0) {
      truncated = true;
      break;
    }
    const take = Math.max(0, budget - 1);
    const lines = hunk.lines.slice(0, take);
    hunks.push({ header: hunk.header, lines });
    budget -= 1 + lines.length;
    if (lines.length < hunk.lines.length) {
      truncated = true;
      break;
    }
  }
  return {
    exact: true,
    truncated,
    hunks,
    note: truncated ? `… diff cut off after ${maxLines} lines. Open the file to read the rest.` : '',
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
    const hunkView = fileReviewHunks(had ? previous : undefined, has ? next : undefined);
    rows.push({
      path,
      added: stats.exact ? stats.added : 0,
      removed: stats.exact ? stats.removed : 0,
      exact: stats.exact && hunkView.exact,
      hunks: hunkView.hunks,
      note: hunkView.note,
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Keep Review honest across prove → re-apply races.
 * - Prefer a real before→after diff.
 * - Never wipe an existing Review with an empty re-apply.
 * - If files land and Review is still empty, surface the after tree vs {}.
 */
export function mergeDeskReview(prevReview = [], before = {}, after = {}) {
  const next = diffVfsReview(before, after);
  if (next.length) return next;
  if (Array.isArray(prevReview) && prevReview.length) return prevReview;
  if (after && Object.keys(after).length > 0) return diffVfsReview({}, after);
  return Array.isArray(prevReview) ? prevReview : [];
}
