import React from 'react';
import { studyHumanReinforcement } from '../lib/study-human-reinforcement.js';

function ReinforcementGlyph({ kind }) {
  if (kind === 'repair') {
    return (
      <svg viewBox="0 0 32 20" width="32" height="20" fill="none" aria-hidden="true">
        <path d="M2 10h9M21 10h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path data-quantora-motion="repair" d="M11 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'mastery') {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
        <circle data-quantora-motion="mastery" cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 20" width="32" height="20" fill="none" aria-hidden="true">
      <path d="M2 10h28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle data-quantora-motion="progress" cx="24" cy="10" r="4" fill="var(--q-ink)" />
    </svg>
  );
}

export default function StudyReinforcementCue({ outcome }) {
  const cue = studyHumanReinforcement(outcome);
  if (!cue) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-quantora-study-reinforcement={cue.kind}
      className="q-study-reinforcement"
    >
      <span className="q-study-reinforcement__glyph">
        <ReinforcementGlyph kind={cue.kind} />
      </span>
      <span>{cue.label}</span>
    </div>
  );
}
