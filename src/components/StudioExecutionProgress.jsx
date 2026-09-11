import React, { useEffect, useRef } from 'react';
import './StudioExecutionProgress.css';

/** Display recorded events, including the period before the first response token. */
export default function StudioExecutionProgress({ history = [], active = false, label, elapsedSec = 0, isLight = false }) {
  const events = Array.isArray(history) ? history.filter((event) => event?.label) : [];
  const eventsRef = useRef(null);
  useEffect(() => {
    if (active && eventsRef.current) eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
  }, [active, history]);
  if (!active && !events.length) return null;
  const currentLabel = label || events.at(-1)?.label || 'Waiting for a status update…';
  const content = (
    <>
      {active && <div className="studio-progress__current" role="status" aria-live="polite">{currentLabel}</div>}
      <ol className="studio-progress__events" ref={eventsRef}>
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`} aria-current={active && index === events.length - 1 ? 'step' : undefined}>
            <span className="studio-progress__dot" aria-hidden="true" />
            <span>{event.label}</span>
            <time title="Recorded at">{Number.isFinite(Number(event.at)) ? new Date(Number(event.at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</time>
          </li>
        ))}
      </ol>
      {active && <p className="studio-progress__note">Updates appear as the system reports them. Waiting does not mean a step has completed.</p>}
    </>
  );
  return active ? (
    <section className={`studio-progress${isLight ? ' is-light' : ''}`} data-quantora-execution-history="true" data-quantora-live-progress="true" aria-label="Run progress">
      <div className="studio-progress__heading"><span>Activity</span><span>Elapsed {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}</span></div>
      {content}
    </section>
  ) : (
    <details className={`studio-progress${isLight ? ' is-light' : ''}`} data-quantora-execution-history="true">
      <summary>Activity · {events.length} updates</summary>
      {content}
    </details>
  );
}
