const STAGE_ORDER = ['captured', 'in_progress', 'done'];

const LEGACY_STAGE_MAP = {
  dream: 'captured',
  idea: 'in_progress',
  thought: 'in_progress',
  action: 'done',
};

export function normalizeJourneyStage(stage) {
  if (!stage) return 'captured';
  return LEGACY_STAGE_MAP[stage] || stage;
}

export function normalizeJourneyNode(node) {
  if (!node || typeof node !== 'object') return null;
  const stage = normalizeJourneyStage(node.stage);
  const source = node.brief || node.dreamText || node.sourceText || '';
  const title = node.title || (source ? source.split('\n')[0].slice(0, 80) : 'Untitled outcome');
  return {
    ...node,
    stage,
    title,
    brief: node.brief || source.slice(0, 300),
    studioPrompt: node.studioPrompt || source,
    domain: node.domain || null,
    mode: node.mode || 'build',
    createdAt: node.createdAt || new Date().toISOString(),
    updatedAt: node.updatedAt || node.createdAt || new Date().toISOString(),
  };
}

export function createJourneyNode(payload = {}) {
  const now = new Date().toISOString();
  const brief = payload.brief || payload.sourceText || payload.studioPrompt || '';
  const title = payload.title || (brief ? brief.split('\n')[0].slice(0, 80) : 'Untitled outcome');
  return normalizeJourneyNode({
    id: payload.id || `journey-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    brief,
    studioPrompt: payload.studioPrompt || brief,
    stage: payload.stage || (payload.hasPreview ? 'in_progress' : 'captured'),
    sessionId: payload.sessionId || null,
    domain: payload.domain || null,
    mode: payload.mode || 'build',
    previewUrl: payload.previewUrl || null,
    publishUrl: payload.publishUrl || null,
    previewOpenedAt: payload.previewOpenedAt || null,
    publishedAt: payload.publishedAt || null,
    createdAt: now,
    updatedAt: now,
  });
}

function findActiveJourneyIndex(nodes, sessionId) {
  if (sessionId) {
    const bySession = nodes.findIndex(
      (n) => n.sessionId === sessionId && normalizeJourneyStage(n.stage) !== 'done',
    );
    if (bySession >= 0) return bySession;
  }

  let bestIdx = -1;
  let bestTime = 0;
  nodes.forEach((node, index) => {
    if (normalizeJourneyStage(node.stage) === 'done') return;
    const t = new Date(node.updatedAt || node.createdAt || 0).getTime();
    if (t >= bestTime) {
      bestTime = t;
      bestIdx = index;
    }
  });
  return bestIdx;
}

/** Advance or create a journey card when the user opens Live Preview. */
export function applyJourneyPreview(prevNodes, payload = {}) {
  const now = new Date().toISOString();
  const idx = findActiveJourneyIndex(prevNodes, payload.sessionId);

  if (idx >= 0) {
    const next = [...prevNodes];
    const node = next[idx];
    next[idx] = {
      ...node,
      stage: 'in_progress',
      sessionId: payload.sessionId || node.sessionId,
      title: node.title || payload.title,
      brief: node.brief || payload.brief,
      studioPrompt: node.studioPrompt || payload.studioPrompt,
      domain: payload.domain ?? node.domain,
      mode: payload.mode ?? node.mode,
      previewOpenedAt: now,
      updatedAt: now,
    };
    return next;
  }

  return [createJourneyNode({ ...payload, stage: 'in_progress', hasPreview: true }), ...prevNodes];
}

/** Mark journey done when publish completes. */
export function applyJourneyPublish(prevNodes, payload = {}) {
  const now = new Date().toISOString();
  const idx = findActiveJourneyIndex(prevNodes, payload.sessionId);

  if (idx >= 0) {
    const next = [...prevNodes];
    const node = next[idx];
    next[idx] = {
      ...node,
      stage: 'done',
      sessionId: payload.sessionId || node.sessionId,
      title: node.title || payload.title,
      brief: node.brief || payload.brief,
      studioPrompt: node.studioPrompt || payload.studioPrompt,
      domain: payload.domain ?? node.domain,
      mode: payload.mode ?? node.mode,
      publishUrl: payload.publishUrl || node.publishUrl,
      publishedAt: now,
      updatedAt: now,
    };
    return next;
  }

  return [createJourneyNode({
    ...payload,
    stage: 'done',
    publishUrl: payload.publishUrl,
    publishedAt: now,
  }), ...prevNodes];
}

export { STAGE_ORDER };
