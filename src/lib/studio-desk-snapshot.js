/**
 * The running desk is the product. Chat is not the source of truth.
 * Persist files + Preview with the session, or lose the outcome on refresh.
 */

export function normalizeDeskReview(review = []) {
  if (!Array.isArray(review)) return [];
  return review.slice(0, 24).flatMap((row) => {
    if (!row || typeof row.path !== 'string' || !row.path.trim()) return [];
    return [{
      path: row.path,
      added: Number.isFinite(row.added) ? Math.max(0, Math.floor(row.added)) : 0,
      removed: Number.isFinite(row.removed) ? Math.max(0, Math.floor(row.removed)) : 0,
      exact: row.exact !== false,
    }];
  });
}
export const STUDIO_DESK_SNAPSHOT_VERSION = 1;
export const MAX_STUDIO_DESK_CHARS = 800_000;

export function buildStudioDeskSnapshot({
  vfs = {},
  workspaceCode = '',
  codingDeskOpen = false,
  lastProcessedMessageId = null,
  review = [],
} = {}) {
  const files = {};
  let chars = 0;
  for (const [path, file] of Object.entries(vfs || {})) {
    if (!path || !file || typeof file.content !== 'string') continue;
    chars += file.content.length;
    if (chars > MAX_STUDIO_DESK_CHARS) {
      return { ok: false, snapshot: null };
    }
    files[path] = {
      content: file.content,
      language: typeof file.language === 'string' ? file.language : '',
    };
  }
  const code = String(workspaceCode || '');
  if (code.length > MAX_STUDIO_DESK_CHARS) {
    return { ok: false, snapshot: null };
  }
  if (!Object.keys(files).length && !code.trim()) {
    return {
      ok: true,
      snapshot: null,
    };
  }
  return {
    ok: true,
    snapshot: {
      version: STUDIO_DESK_SNAPSHOT_VERSION,
      vfs: files,
      workspaceCode: code,
      codingDeskOpen: Boolean(codingDeskOpen),
      lastProcessedMessageId: lastProcessedMessageId ?? null,
      review: normalizeDeskReview(review),
      savedAt: Date.now(),
    },
  };
}

export function restoreStudioDeskSnapshot(session) {
  const snap = session?.desk;
  if (!snap || snap.version !== STUDIO_DESK_SNAPSHOT_VERSION || typeof snap !== 'object') {
    return null;
  }
  const vfs = {};
  for (const [path, file] of Object.entries(snap.vfs || {})) {
    if (!path || !file || typeof file.content !== 'string') continue;
    vfs[path] = {
      content: file.content,
      language: typeof file.language === 'string' ? file.language : '',
    };
  }
  const workspaceCode = typeof snap.workspaceCode === 'string' ? snap.workspaceCode : '';
  if (!Object.keys(vfs).length && !workspaceCode.trim()) return null;
  return {
    vfs,
    workspaceCode,
    codingDeskOpen: snap.codingDeskOpen === true,
    lastProcessedMessageId: snap.lastProcessedMessageId ?? null,
    review: normalizeDeskReview(snap.review),
  };
}
