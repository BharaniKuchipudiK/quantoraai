import { applyJourneyPreview, applyJourneyPublish, createJourneyNode, normalizeJourneyStage } from './build-journey.js';

/** Canonical event types the listening layer understands. */
export const QUANTORA_EVENTS = {
  PREVIEW_OPENED: 'preview_opened',
  PUBLISH_COMPLETED: 'publish_completed',
  PREVIEW_SHARED: 'preview_shared',
  CHOICE_SELECTED: 'choice_selected',
  CHOICE_DOCK_DISMISSED: 'choice_dock_dismissed',
  CONTINUE_SELECTED: 'continue_selected',
  PLAN_RECEIVED: 'plan_received',
  CONTEXT_UPDATED: 'context_updated',
  JOURNEY_SAVED: 'journey_saved',
};

const MAX_SIGNALS = 8;

function humanSignalLabel(type, payload = {}) {
  switch (type) {
    case QUANTORA_EVENTS.PREVIEW_OPENED:
      return 'Preview opened';
    case QUANTORA_EVENTS.PUBLISH_COMPLETED:
      return payload.publishUrl ? `Published — ${payload.publishUrl}` : 'Published';
    case QUANTORA_EVENTS.CHOICE_SELECTED:
      return payload.label ? `Chose: ${payload.label}` : 'Choice selected';
    case QUANTORA_EVENTS.CONTINUE_SELECTED:
      return payload.label ? `Next: ${payload.label}` : 'Continue selected';
    case QUANTORA_EVENTS.PLAN_RECEIVED:
      return 'Plan ready';
    case QUANTORA_EVENTS.CONTEXT_UPDATED:
      return payload.goal ? `Goal: ${payload.goal.slice(0, 60)}` : 'Context updated';
    case QUANTORA_EVENTS.PREVIEW_SHARED:
      return payload.shareUrl ? `Shared preview — ${payload.shareUrl}` : 'Preview link copied';
    case QUANTORA_EVENTS.CHOICE_DOCK_DISMISSED:
      return 'Suggestions hidden';
    case QUANTORA_EVENTS.JOURNEY_SAVED:
      return payload.title ? `Saved: ${payload.title}` : 'Saved to Journey';
    default:
      return type;
  }
}

function appendSignals(existing = [], type, payload) {
  const entry = {
    type,
    label: humanSignalLabel(type, payload),
    at: new Date().toISOString(),
  };
  return [entry, ...existing].slice(0, MAX_SIGNALS);
}

function trackProductEvent(user, eventType) {
  if (!user?.sub) return;
  fetch('/api/product-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ eventType }),
  }).catch(() => {});
}

function applyJourneyPlan(prevNodes, payload = {}) {
  const now = new Date().toISOString();
  const sessionId = payload.sessionId;
  const idx = sessionId
    ? prevNodes.findIndex((n) => n.sessionId === sessionId && normalizeJourneyStage(n.stage) !== 'done')
    : -1;

  if (idx >= 0) {
    const next = [...prevNodes];
    next[idx] = {
      ...next[idx],
      outcomeType: 'plan',
      planReceivedAt: now,
      updatedAt: now,
      title: next[idx].title || payload.title,
    };
    return next;
  }

  return [createJourneyNode({ ...payload, stage: 'captured', outcomeType: 'plan' }), ...prevNodes];
}

/**
 * Factory for the Quantora listening layer.
 * Centralizes event → state rules (journey, signals, telemetry).
 */
export function createQuantoraListener({
  setDreamNodes,
  user,
  getJourneyContext,
  onSessionSignals,
}) {
  const rules = {
    [QUANTORA_EVENTS.PREVIEW_OPENED](payload) {
      if (setDreamNodes && getJourneyContext) {
        setDreamNodes((prev) => applyJourneyPreview(prev, { ...getJourneyContext(), ...payload }));
      }
      trackProductEvent(user, 'preview_opened');
    },

    [QUANTORA_EVENTS.PUBLISH_COMPLETED](payload) {
      if (setDreamNodes && getJourneyContext) {
        setDreamNodes((prev) => applyJourneyPublish(prev, { ...getJourneyContext(), ...payload }));
      }
      trackProductEvent(user, 'publish_completed');
    },

    [QUANTORA_EVENTS.PLAN_RECEIVED](payload) {
      if (setDreamNodes && getJourneyContext) {
        setDreamNodes((prev) => applyJourneyPlan(prev, { ...getJourneyContext(), ...payload }));
      }
    },

    [QUANTORA_EVENTS.JOURNEY_SAVED]() {
      /* Journey card creation handled by caller; signal only. */
    },

    [QUANTORA_EVENTS.CHOICE_SELECTED]() {},
    [QUANTORA_EVENTS.CHOICE_DOCK_DISMISSED]() {},
    [QUANTORA_EVENTS.PREVIEW_SHARED]() {},
    [QUANTORA_EVENTS.CONTINUE_SELECTED]() {},
    [QUANTORA_EVENTS.CONTEXT_UPDATED]() {},
  };

  function emit(type, payload = {}) {
    rules[type]?.(payload);
    onSessionSignals?.(type, payload);
    return { type, payload, at: new Date().toISOString() };
  }

  return { emit, QUANTORA_EVENTS };
}

/** Merge a new listening signal into a chat session object. */
export function mergeSessionListeningSignals(session, type, payload) {
  if (!session) return session;
  return {
    ...session,
    listeningSignals: appendSignals(session.listeningSignals, type, payload),
  };
}

export { humanSignalLabel, MAX_SIGNALS };
