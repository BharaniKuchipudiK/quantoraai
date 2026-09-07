import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Map, RefreshCw, X } from 'lucide-react';
import { loadStudyLearningCompass } from '../lib/study-learning-compass-client.js';

const TIME_OPTIONS = Object.freeze([10, 20, 30, 45]);

const ACTION_LABELS = Object.freeze({
  independent_retrieval: 'Recall it independently',
  diagnose_misconception: 'Find the exact misconception',
  confirm_misconception: 'Confirm the tricky distinction',
  guided_repair: 'Repair the foundation',
  vary_evidence: 'Try a different kind of example',
  retention_probe: 'Refresh your recall',
  transfer_task: 'Apply it in a new situation',
});

const FACTOR_COPY = Object.freeze({
  masteryGap: 'There is a verified gap to strengthen.',
  prerequisiteLeverage: 'Strengthening it can unlock later concepts.',
  misconceptionSeverity: 'A misconception needs a focused repair.',
  retentionRisk: 'Your recall may be ready for a refresh.',
  curriculumImportance: 'It matters in the current curriculum.',
  evidenceConfidence: 'A short diagnostic can reduce uncertainty.',
  availableTimeFit: 'The activity fits the time you have.',
});

function explanationFor(recommendation) {
  if (recommendation?.dataSufficiency === 'insufficient_evidence') {
    return 'Quantora needs a little more verified evidence, so this starts with a short diagnostic.';
  }
  const reasons = [...(recommendation?.factors || [])]
    .filter((factor) => factor?.contribution > 0 && FACTOR_COPY[factor.key])
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 2)
    .map((factor) => FACTOR_COPY[factor.key]);
  return reasons.join(' ') || 'This is the strongest next step supported by your verified Study evidence.';
}

export default function StudyLearningCompass({
  topicKey,
  topic,
  curriculumKey = null,
  onClose,
  onStart,
}) {
  const [availableMinutes, setAvailableMinutes] = useState(20);
  const [state, setState] = useState({ status: 'loading', result: null, error: '' });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', result: null, error: '' });
    loadStudyLearningCompass({
      conceptKey: topicKey,
      conceptLabel: topic,
      curriculumKey,
      availableMinutes,
    }).then((result) => {
      if (active) setState({ status: 'ready', result, error: '' });
    }).catch((error) => {
      if (!active) return;
      const message = error?.code === 'unmapped'
        ? 'This topic is not mapped to the reviewed learning graph yet.'
        : error?.message || 'Your Learning Compass is unavailable right now.';
      setState({ status: 'error', result: null, error: message });
    });
    return () => { active = false; };
  }, [availableMinutes, curriculumKey, refresh, topic, topicKey]);

  const recommendations = state.result?.recommendations || [];
  const primary = recommendations[0] || null;
  const primaryExplanation = useMemo(() => explanationFor(primary), [primary]);

  return (
    <div data-quantora-study-learning-compass="true">
      <div className="study-h1-hub__header">
        <div style={{ minWidth: 0 }}>
          <div id="quantora-study-learning-compass-title" className="study-h1-hub__title">Learning Compass</div>
          <div className="study-h1-hub__topic">Your highest-value next step</div>
        </div>
        <button type="button" className="study-h1-icon-button" aria-label="Close Learning Compass" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="study-compass__time" aria-label="Time available">
        <span><Clock3 size={13} aria-hidden="true" /> I have</span>
        {TIME_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="study-h1-action"
            aria-pressed={availableMinutes === minutes}
            onClick={() => setAvailableMinutes(minutes)}
          >
            {minutes}m
          </button>
        ))}
      </div>

      {state.status === 'loading' ? (
        <div className="study-compass__state" role="status"><RefreshCw size={15} className="study-compass__spinner" /> Reading verified learning evidence…</div>
      ) : null}

      {state.status === 'error' ? (
        <div className="study-compass__state" role="status">
          <span>{state.error}</span>
          <button type="button" className="study-h1-action" onClick={() => setRefresh((value) => value + 1)}>Try again</button>
        </div>
      ) : null}

      {state.status === 'ready' && !primary ? (
        <div className="study-compass__state" role="status">No verified recommendation is available for this topic yet.</div>
      ) : null}

      {primary ? (
        <section className="study-compass__card" aria-label="Recommended next step">
          <div className="study-compass__eyebrow"><Map size={13} aria-hidden="true" /> Next best step</div>
          <h3>{primary.label}</h3>
          <div className="study-compass__action-label">{ACTION_LABELS[primary.recommendedActionType] || 'Strengthen this concept'}</div>
          <p>{primaryExplanation}</p>
          <div className="study-compass__meta">
            <span>{primary.suggestedDurationMinutes} min</span>
            <span>{primary.confidenceBand === 'insufficient' ? 'Needs a quick check' : `${primary.confidenceBand} evidence confidence`}</span>
          </div>
          <button type="button" className="study-h1-action study-h1-action--primary study-compass__start" onClick={() => onStart?.(primary)}>
            Start this step <ArrowRight size={13} aria-hidden="true" />
          </button>
          {recommendations.length > 1 ? (
            <details className="study-compass__alternatives">
              <summary>See other evidence-backed options</summary>
              <ol>
                {recommendations.slice(1, 4).map((recommendation) => (
                  <li key={recommendation.conceptId}>
                    <button type="button" onClick={() => onStart?.(recommendation)}>
                      <strong>{recommendation.label}</strong>
                      <span>{recommendation.suggestedDurationMinutes} min · {ACTION_LABELS[recommendation.recommendedActionType] || 'Strengthen this concept'}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
