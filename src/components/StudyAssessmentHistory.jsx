import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, History, RotateCcw } from 'lucide-react';
import { loadStudyAssessmentHistory } from '../lib/study-assessment-history-client.js';
import './study-assessment-history.css';

function titleCase(value) {
  return String(value || '')
    .replace(/[._:-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

export default function StudyAssessmentHistory({ onClose, backLabel = 'Back to Assessment' }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  const load = async () => {
    setState({ status: 'loading', data: null, error: null });
    try {
      const data = await loadStudyAssessmentHistory();
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const assessments = useMemo(
    () => state.data?.assessments || [],
    [state.data],
  );

  return (
    <section
      className="study-h1-history"
      aria-labelledby="quantora-study-history-title"
      data-quantora-study-assessment-history="true"
    >
      <div className="study-h1-hub__header">
        <div style={{ minWidth: 0 }}>
          <div id="quantora-study-history-title" className="study-h1-hub__title">Assessment history</div>
          <div className="study-h1-hub__topic">Last {state.data?.windowDays || 30} days</div>
        </div>
        <button
          type="button"
          className="study-h1-icon-button"
          aria-label={backLabel}
          onClick={onClose}
        >
          <ArrowLeft size={16} />
        </button>
      </div>

      {state.status === 'loading' ? (
        <div className="study-h1-history__state" role="status">Loading your recent checks…</div>
      ) : null}

      {state.status === 'error' ? (
        <div className="study-h1-history__state" role="alert">
          <History size={18} aria-hidden="true" />
          <div>
            <strong>History is unavailable right now.</strong>
            <span>{state.error?.message || 'Try again in a moment.'}</span>
          </div>
          <button type="button" className="study-h1-action" onClick={load}>
            <RotateCcw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : null}

      {state.status === 'ready' && assessments.length === 0 ? (
        <div className="study-h1-history__state">
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            <strong>No completed assessments yet.</strong>
            <span>Your verified checks from the last 30 days will appear here.</span>
          </div>
        </div>
      ) : null}

      {state.status === 'ready' && assessments.length > 0 ? (
        <div className="study-h1-history__list">
          {assessments.map((entry, index) => {
            const conceptLabel = entry?.concept?.label || 'Topic unavailable';
            const transferSource = entry?.evidenceFor?.label || null;
            return (
              <article
                className="study-h1-history__row"
                key={`${entry.submittedAt || 'assessment'}:${index}`}
              >
                <div className="study-h1-history__meta">
                  <span>{formatDate(entry.submittedAt)}</span>
                  <span>{titleCase(entry.subject) || 'Study'}</span>
                  <span>{entry.assessmentType || 'Assessment'}</span>
                </div>
                <div className="study-h1-history__concept">{conceptLabel}</div>
                {transferSource ? (
                  <div className="study-h1-history__transfer">Transfer from {transferSource}</div>
                ) : null}
                <div className="study-h1-history__result">
                  <span className="study-h1-history__score">{Number(entry.scorePercent) || 0}%</span>
                  <span className="study-h1-history__outcome">
                    {entry.correct ? <Check size={14} aria-hidden="true" /> : null}
                    {entry.correct ? 'Correct' : 'Needs review'}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
