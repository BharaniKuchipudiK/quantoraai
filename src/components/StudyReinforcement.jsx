import React, { useEffect, useState } from 'react';
import { CheckCircle2, Link2, RotateCcw, X } from 'lucide-react';
import {
  advanceStudyReinforcement,
  createStudyReinforcementState,
} from '../lib/study-reinforcement.js';

const ICONS = {
  transfer: Link2,
  return: RotateCcw,
  repair: CheckCircle2,
  retrieval: CheckCircle2,
  understanding: CheckCircle2,
  continuation: Link2,
};

export default function StudyReinforcement({ result, attemptId, itemRef, scopeKey, resultScopeKey, hintDepth, suppressed = false }) {
  const [state, setState] = useState(() => createStudyReinforcementState(scopeKey));
  const [dismissed, setDismissed] = useState('');

  useEffect(() => {
    setState((previous) => advanceStudyReinforcement(previous, {
      result, attemptId, itemRef, scopeKey, resultScopeKey, hintDepth, suppressed,
    }));
  }, [result, attemptId, itemRef, scopeKey, resultScopeKey, hintDepth, suppressed]);

  // Check scope and identity during render too: an old result must not flash
  // during the render before the parent's session-reset effect has executed.
  const reinforcement = !suppressed && state.scopeKey === scopeKey && resultScopeKey === scopeKey
    && result?.correct === true && result?.duplicate === false
    && state.feedback?.attemptId === attemptId && state.feedback?.itemRef === itemRef
    ? state.feedback : null;
  const feedbackKey = reinforcement ? JSON.stringify([scopeKey, attemptId, itemRef]) : '';
  const visible = Boolean(feedbackKey && dismissed !== feedbackKey);

  useEffect(() => {
    if (!feedbackKey) return undefined;
    const timer = window.setTimeout(() => setDismissed(feedbackKey), 5200);
    return () => window.clearTimeout(timer);
  }, [feedbackKey]);

  const Icon = ICONS[reinforcement?.kind] || CheckCircle2;
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {visible ? (
        <div
          key={feedbackKey}
          className={`study-h1-reinforcement study-h1-reinforcement--${reinforcement.kind}`}
          data-quantora-study-reinforcement={reinforcement.kind}
        >
          <span className="study-h1-reinforcement__mark" aria-hidden="true"><Icon size={17} /></span>
          <span className="study-h1-reinforcement__copy">
            <strong>{reinforcement.title}</strong>
            <span>{reinforcement.detail}</span>
          </span>
          <button
            type="button"
            className="study-h1-reinforcement__dismiss"
            aria-label="Dismiss learning feedback"
            onClick={() => setDismissed(feedbackKey)}
          ><X size={15} aria-hidden="true" /></button>
        </div>
      ) : null}
    </div>
  );
}
