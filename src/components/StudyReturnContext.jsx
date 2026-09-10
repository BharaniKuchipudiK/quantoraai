import React, { useEffect, useState } from 'react';
import { STUDY_CONTINUITY_CLOUD_VERSION, requestStudyContinuityImport } from '../lib/study-continuity-cloud.js';
import { STUDY_RETURN_CONTEXT_VERSION } from '../lib/study-return-context.js';

export default function StudyReturnContext({ scopeKey, topic, onClose, onStart }) {
  const [state, setState] = useState({ status: 'loading', result: null });
  const [refresh, setRefresh] = useState(0);
  const [saved, setSaved] = useState({ status: 'loading', checkpoints: [] });
  const [resumeError, setResumeError] = useState('');
  const [resuming, setResuming] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    setSaved({ status: 'loading', checkpoints: [] });
    setResumeError('');
    fetch('/api/study-learning-compass', { method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ action: 'continuity-list', topic }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (data?.version !== STUDY_CONTINUITY_CLOUD_VERSION || !Array.isArray(data.checkpoints)
        || data.checkpoints.length > 12) throw new Error('invalid');
      if (active) setSaved({ status: 'ready', checkpoints: data.checkpoints });
    }).catch(() => { if (active) setSaved({ status: 'unavailable', checkpoints: [] }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [scopeKey, topic, refresh]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setState({ status: 'loading', result: null });
    fetch('/api/study-learning-compass', { method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ action: 'continuity-summary' }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      if (result?.version !== STUDY_RETURN_CONTEXT_VERSION
        || !['complete', 'partial'].includes(result.coverage)
        || !['unresolvedMisconceptions', 'recentMastery', 'retentionDue'].every((key) => Array.isArray(result[key]) && result[key].length <= 12)) throw new Error('invalid');
      if (active) setState({ status: 'ready', result });
    }).catch(() => { if (active) setState({ status: 'unavailable', result: null }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [scopeKey, refresh]);
  const result = state.result;
  return (
    <details className="study-compass__alternatives" data-quantora-study-return-context={state.status}>
      <summary>Your learning across topics</summary>
      {saved.checkpoints.length ? <section aria-label="Cloud lesson position">
        <p>A saved position for this topic is available from your account. This restores the lesson stage, not another chat’s transcript.</p>
        <button type="button" className="study-h1-action" data-quantora-study-cloud-resume="true" disabled={resuming} onClick={async () => {
          setResuming(true);
          try {
            if (await requestStudyContinuityImport(saved.checkpoints[0])) onClose?.();
            else setResumeError('The saved position changed or a mission is already active. Refresh history or close the current mission.');
          } catch { setResumeError('Cloud recovery could not be confirmed. Refresh history to retry.'); }
          finally { setResuming(false); }
        }}>Resume saved lesson</button>
      </section> : null}
      {saved.status === 'unavailable' ? <p>Cloud lesson positions are unavailable. Same-browser recovery is unchanged.</p> : null}
      {resumeError ? <p role="status">{resumeError} <button type="button" className="study-h1-action" onClick={() => setRefresh((value) => value + 1)}>Refresh history</button></p> : null}
      {state.status === 'loading' ? <p role="status">Refreshing verified learning history…</p> : null}
      {state.status === 'unavailable' ? <p role="status">Learning history is unavailable, not empty. <button type="button" className="study-h1-action" onClick={() => setRefresh((value) => value + 1)}>Retry history</button></p> : null}
      {result ? <>
        <p>{result.coverage === 'partial' ? 'Partial history: counts below cover only the evidence that could be refreshed.' : 'Refreshed from verified learning evidence.'} Saved lesson positions and hint use are not mastery evidence.</p>
        {[
          ['retentionDue', 'Retention checks due'],
          ['unresolvedMisconceptions', 'Misconception signals to recheck'],
          ['recentMastery', 'Recently verified'],
        ].map(([key, label]) => <section key={key} aria-label={label}>
          <strong>{label}: {result[key].length}</strong>
          {result[key].length ? <ol>{result[key].map((item) => <li key={item.conceptId}>
            <button type="button" onClick={() => onStart?.(item)}><strong>{item.label}</strong><span>Review this topic</span></button>
          </li>)}</ol> : null}
        </section>)}
        {!result.observedConcepts && result.coverage === 'complete' ? <p>No verified learning history yet. Start with a reviewed check.</p> : null}
      </> : null}
    </details>
  );
}
