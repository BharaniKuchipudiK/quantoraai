import React, { useEffect, useState } from 'react';
import { isCannedProjectDescription } from '../lib/studio-mission.js';
import { loadStudyOnboarding } from '../lib/study-onboarding-client.js';
import StudyOnboarding from './StudyOnboarding.jsx';

/**
 * Visible world model — what this session is building. Not an IDE, not notes chrome.
 *
 * Study uniquely passes hideGoal=true. This component lives outside AiStudio's
 * empty-thread/active-thread split, so it also owns first-run Study onboarding:
 * onboarding must not require a learner to send a message before it can exist.
 */
export default function StudioMissionCard({
  mission,
  isLight,
  textColor,
  subtextColor,
  onDismiss = null,
  /*
   * The Study shell already carries the topic above this card, so printing the
   * goal here too showed the same truncated sentence twice, stacked, in the
   * scarcest space on the screen. The "Next:" line is not duplicated and is the
   * part worth keeping.
   */
  hideGoal = false,
}) {
  const [studyOnboarding, setStudyOnboarding] = useState({ status: hideGoal ? 'loading' : 'off', profile: null });

  useEffect(() => {
    if (!hideGoal) {
      setStudyOnboarding({ status: 'off', profile: null });
      return undefined;
    }
    let active = true;
    loadStudyOnboarding()
      .then(({ profile, needsOnboarding }) => {
        if (active) setStudyOnboarding({ status: needsOnboarding ? 'needed' : 'done', profile });
      })
      .catch(() => {
        if (active) setStudyOnboarding({ status: 'unavailable', profile: null });
      });
    return () => { active = false; };
  }, [hideGoal]);

  if (studyOnboarding.status === 'needed') {
    return (
      <StudyOnboarding
        onComplete={(profile) => setStudyOnboarding({ status: 'done', profile })}
      />
    );
  }

  const showGoal = Boolean(mission?.goal) && !hideGoal;
  if (!showGoal && !mission?.next) return null;

  return (
    <div
      data-quantora-mission="true"
      style={{
        margin: '0 8px 10px',
        padding: '10px 14px',
        borderRadius: '14px',
        background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.65)',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
        position: 'relative',
      }}
    >
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide the session goal"
          title="Hide"
          style={{
            position: 'absolute',
            top: '6px',
            right: '8px',
            background: 'transparent',
            border: 'none',
            color: subtextColor,
            cursor: 'pointer',
            fontSize: '0.95rem',
            lineHeight: 1,
            padding: '4px',
          }}
        >
          ×
        </button>
      ) : null}
      {showGoal ? (
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: textColor, lineHeight: 1.4, paddingRight: onDismiss ? '18px' : 0 }}>
          {mission.lead || 'Building'}: {mission.goal}
        </div>
      ) : null}
      {mission.understanding && !isCannedProjectDescription(mission.understanding) ? (
        <div style={{ fontSize: '0.75rem', color: subtextColor, marginTop: '4px', lineHeight: 1.4 }}>
          {mission.understanding}
        </div>
      ) : null}
      {mission.next ? (
        <div style={{ fontSize: '0.75rem', color: isLight ? '#c2410c' : '#fdba74', marginTop: '6px', lineHeight: 1.4, fontWeight: 600 }}>
          Next: {mission.next}
        </div>
      ) : null}
    </div>
  );
}
