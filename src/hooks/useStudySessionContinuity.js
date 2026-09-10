import { useCallback, useEffect, useRef, useState } from 'react';
import '../components/study-session-continuity.css';
import {
  clearStudyContinuity,
  makeStudyContinuityCheckpoint,
  readStudyContinuity,
  saveStudyContinuity,
  studyContinuityResumeEvents,
  validateStudyContinuityCheckpoint,
} from '../lib/study-session-continuity.js';
import { createStudyContinuityCloud, remapStudyContinuityCheckpoint, subscribeStudyContinuityImports } from '../lib/study-continuity-cloud.js';
import { advanceStudyContinuityHint, subscribeStudyContinuityHints } from '../lib/study-continuity-hints.js';

function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

/** UI progress and historical support only; verified learning stays server-owned. */
export function useStudySessionContinuity({ sessionId, topic, mission, dispatchMission }) {
  const [identity, setIdentity] = useState(null);
  const [checkpoint, setCheckpoint] = useState(null);
  const [restored, setRestored] = useState(false);
  const [hintRevision, setHintRevision] = useState(0);
  const currentMission = useRef(mission);
  const activeScope = useRef('');
  const cloud = useRef(null);
  const intent = useRef(0);
  const hintHistory = useRef(null);
  const historicalSupport = useRef(null);
  const currentScope = useRef('');
  currentMission.current = mission;
  const scopeId = JSON.stringify([sessionId || '', topic || '']);
  currentScope.current = scopeId;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let remote = null;
    setIdentity(null);
    setCheckpoint(null);
    setRestored(false);
    activeScope.current = '';
    hintHistory.current = null;
    historicalSupport.current = null;
    intent.current += 1;
    cloud.current = null;
    if (!sessionId || !topic) return () => controller.abort();

    // The server session, never editable browser account data, owns the scope.
    fetch('/api/auth/session?purpose=product-telemetry', {
      credentials: 'include', cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      const accountKey = typeof data?.user?.email === 'string' ? data.user.email.trim().toLowerCase() : '';
      return accountKey ? { accountKey, sessionId, topic, scopeId } : null;
    }).then(async (scope) => {
      if (!active || !scope || currentScope.current !== scopeId) return;
      remote = createStudyContinuityCloud(scope);
      cloud.current = { scopeId, remote };
      setIdentity(scope);
      if (currentMission.current?.status === 'idle') setCheckpoint(readStudyContinuity(browserStorage(), scope));
      const beforeRead = intent.current;
      const result = await remote.read();
      if (!active || !result || currentScope.current !== scopeId || intent.current !== beforeRead
        || currentMission.current?.status !== 'idle') return;
      // A server discard is a tombstone, not a missing value to resurrect locally.
      if (result.cleared) {
        clearStudyContinuity(browserStorage(), scope);
        setCheckpoint(null);
      } else if (result.checkpoint) {
        saveStudyContinuity(browserStorage(), scope, result.checkpoint);
        setCheckpoint(result.checkpoint);
      }
    }).catch(() => { /* Local recovery never becomes an auth fallback. */ });
    return () => {
      active = false; controller.abort();
      remote?.dispose();
      if (cloud.current?.remote === remote) cloud.current = null;
    };
  }, [sessionId, topic, scopeId]);

  useEffect(() => {
    if (!identity || identity.scopeId !== scopeId) return undefined;
    return subscribeStudyContinuityHints(() => {
      if (currentScope.current !== scopeId) return false;
      hintHistory.current = advanceStudyContinuityHint(hintHistory.current, scopeId);
      setHintRevision((value) => value + 1);
      return true;
    });
  }, [identity, scopeId]);

  useEffect(() => {
    if (!identity || identity.scopeId !== scopeId) return undefined;
    const current = currentMission.current;
    const remote = cloud.current?.scopeId === scopeId ? cloud.current.remote : null;
    if (current?.status === 'active') {
      const saved = makeStudyContinuityCheckpoint({ mission: current, sessionId });
      if (!saved) return undefined;
      const hint = hintHistory.current?.scopeId === scopeId ? hintHistory.current : null;
      saved.priorSupport = hint
        ? { hintDependence: hint.hintDependence, observedAt: hint.observedAt }
        : historicalSupport.current;
      const clean = validateStudyContinuityCheckpoint(saved, identity);
      if (!clean) return undefined;
      saveStudyContinuity(browserStorage(), identity, clean);
      activeScope.current = scopeId;
      intent.current += 1;
      remote?.save(clean);
    } else if (current?.status === 'completed' || activeScope.current === scopeId) {
      intent.current += 1;
      clearStudyContinuity(browserStorage(), identity);
      remote?.clear();
      activeScope.current = '';
      historicalSupport.current = null;
      setCheckpoint(null);
      setRestored(false);
    }
    return undefined;
  }, [identity, mission, scopeId, sessionId, hintRevision]);

  const resume = useCallback(() => {
    if (!identity || identity.scopeId !== scopeId || currentMission.current?.status !== 'idle') return;
    const events = studyContinuityResumeEvents(checkpoint, identity);
    if (!events.length) { setCheckpoint(null); return; }
    intent.current += 1;
    // Historical timestamps are not refreshed, and never become working state.
    historicalSupport.current = validateStudyContinuityCheckpoint(checkpoint, identity)?.priorSupport || null;
    for (const event of events) dispatchMission(event);
    setCheckpoint(null);
    setRestored(true);
  }, [checkpoint, dispatchMission, identity, scopeId]);

  useEffect(() => {
    if (!identity || identity.scopeId !== scopeId) return undefined;
    return subscribeStudyContinuityImports(async (saved) => {
      if (currentScope.current !== scopeId || currentMission.current?.status !== 'idle') return false;
      if (!remapStudyContinuityCheckpoint(saved, identity)) return false;
      const generation = ++intent.current;
      const source = createStudyContinuityCloud({ ...identity, sessionId: saved.sessionId });
      const fresh = await source.read();
      source.dispose();
      if (currentScope.current !== scopeId || intent.current !== generation
        || currentMission.current?.status !== 'idle' || !fresh?.checkpoint || fresh.cleared) return false;
      const clean = remapStudyContinuityCheckpoint(fresh.checkpoint, identity);
      const events = clean ? studyContinuityResumeEvents(clean, identity) : [];
      if (!events.length) return false;
      intent.current += 1;
      historicalSupport.current = clean.priorSupport;
      for (const event of events) dispatchMission(event);
      setCheckpoint(null);
      setRestored(true);
      return true;
    });
  }, [dispatchMission, identity, scopeId]);

  const discard = useCallback(() => {
    if (!identity || identity.scopeId !== scopeId) return;
    intent.current += 1;
    clearStudyContinuity(browserStorage(), identity);
    if (cloud.current?.scopeId === scopeId) cloud.current.remote.clear();
    historicalSupport.current = null;
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
