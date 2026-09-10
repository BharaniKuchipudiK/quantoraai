import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearStudyContinuity,
  makeStudyContinuityCheckpoint,
  readStudyContinuity,
  saveStudyContinuity,
  studyContinuityResumeEvents,
} from '../lib/study-session-continuity.js';
import { readStudyWorkingState } from '../lib/study-working-state.js';
import { STUDY_LEARNING_INTERACTION_EVENT } from '../lib/study-learning-interactions.js';

function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

/** A resumable UI checkpoint, not an assessment/evidence or model-call owner. */
export function useStudySessionContinuity({ sessionId, topic, mission, dispatchMission }) {
  const [identity, setIdentity] = useState(null);
  const [checkpoint, setCheckpoint] = useState(null);
  const [restored, setRestored] = useState(false);
  const currentMission = useRef(mission);
  const activeScope = useRef('');
  currentMission.current = mission;
  const scopeId = JSON.stringify([sessionId || '', topic || '']);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setIdentity(null);
    setCheckpoint(null);
    setRestored(false);
    activeScope.current = '';
    if (!sessionId || !topic) return () => controller.abort();

    // Reuse the authenticated, no-store session reader. The read-only purpose
    // also prevents a signed-out probe from inflating the site's hit counter.
    fetch('/api/auth/session?purpose=product-telemetry', {
      credentials: 'include', cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      const accountKey = typeof data?.user?.email === 'string' ? data.user.email.trim().toLowerCase() : '';
      return accountKey ? { accountKey, sessionId, topic, scopeId } : null;
    }).then((scope) => {
      if (!active || !scope) return;
      setIdentity(scope);
      if (currentMission.current?.status === 'idle') setCheckpoint(readStudyContinuity(browserStorage(), scope));
    }).catch(() => { /* No authenticated identity means no persistence/restoration. */ });
    return () => { active = false; controller.abort(); };
  }, [sessionId, topic, scopeId]);

  useEffect(() => {
    if (!identity || identity.scopeId !== scopeId) return undefined;
    const persist = () => {
      const current = currentMission.current;
      if (current?.status === 'active') {
        const saved = makeStudyContinuityCheckpoint({
          mission: current, sessionId, workingState: readStudyWorkingState(),
        });
        if (saved && saveStudyContinuity(browserStorage(), identity, saved)) activeScope.current = scopeId;
      } else if (current?.status === 'completed' || activeScope.current === scopeId) {
        clearStudyContinuity(browserStorage(), identity);
        activeScope.current = '';
        setCheckpoint(null);
        setRestored(false);
      }
    };
    persist();
    window.addEventListener(STUDY_LEARNING_INTERACTION_EVENT, persist);
    return () => window.removeEventListener(STUDY_LEARNING_INTERACTION_EVENT, persist);
  }, [identity, mission, scopeId, sessionId]);

  const resume = useCallback(() => {
    if (!identity || identity.scopeId !== scopeId || currentMission.current?.status !== 'idle') return;
    const events = studyContinuityResumeEvents(checkpoint, identity);
    if (!events.length) { setCheckpoint(null); return; }
    for (const event of events) dispatchMission(event);
    setCheckpoint(null);
    setRestored(true);
  }, [checkpoint, dispatchMission, identity, scopeId]);

  const discard = useCallback(() => {
    if (!identity || identity.scopeId !== scopeId) return;
    clearStudyContinuity(browserStorage(), identity);
    setCheckpoint(null);
  }, [identity, scopeId]);

  const matches = identity?.scopeId === scopeId;
  return {
    checkpoint: matches && mission?.status === 'idle' ? checkpoint : null,
    restored: matches && mission?.status === 'active' && restored,
    resume,
    discard,
  };
}
