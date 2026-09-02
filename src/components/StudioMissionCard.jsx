import React, { useEffect, useState } from 'react';
import { isCannedProjectDescription } from '../lib/studio-mission.js';
import { planMissionCard } from '../lib/studio-surface-budget.js';
import { loadStudyOnboarding } from '../lib/study-onboarding-client.js';

const StudyOnboarding = React.lazy(() => import('./StudyOnboarding.jsx'));

/**
 * Visible world model — what this session is building. Not an IDE, not notes chrome.
 *
 * Study uniquely passes hideGoal=true. This component lives outside AiStudio's
 * empty-thread/active-thread split, so it also owns first-run Study onboarding:
 * onboarding must not require a learner to send a message before it can exist.
 * The onboarding panel itself stays lazy so Study's first-run UI does not tax the
 * main AiStudio entry chunk for every workspace.
 */
export default function StudioMissionCard({
  mission,
  isLight,
  textColor,
  subtextColor,
  onDismiss = null,
  /*
   * Labels of the suggestion chips currently on screen. mission.next IS
   * continueSet.items[0].label, so without this the card reprints the first
   * chip as a heading in its own box two hundred pixels lower — which is what
   * made three stacked cards out of one useful row.
   */
  chipLabels = [],
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
      <React.Suspense fallback={null}>
        <StudyOnboarding
          onComplete={(profile) => setStudyOnboarding({ status: 'done', profile })}
        />
      </React.Suspense>
    );
  }

  const plan = planMissionCard({ mission, chipLabels, hideGoal });
  if (!plan.show) return null;

  const understanding = plan.understanding && !isCannedProjectDescription(plan.understanding)
    ? plan.understanding
    : '';

  return (
    <div
      data-quantora-mission="true"
      style={{
        /*
         * CHROME FOR WHAT YOU ACT ON, PLAIN TEXT FOR WHAT YOU READ.
         *
         * This block holds no controls — it is ambient context, and it was
         * wearing a filled, bordered, rounded card to say so. That card was the
         * third stacked box between the last reply and the composer, and its
         * border, fill and padding cost more height than the one line of text
         * it framed. The trip board next to it keeps its card because you press
         * things in it; this does not.
         */
        margin: '0 10px 6px',
        padding: '0 0 2px',
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
            top: '-1px',
            right: '0',
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
      {plan.goal ? (
        <div
          title={plan.goal}
          style={{
            /*
             * Ambient, not a headline. At card weight this line competed with
             * the chips and the board — the two things on this screen you can
             * actually press — for a sentence that is mostly the user's own
             * last request read back to them.
             */
            fontSize: '0.75rem',
            fontWeight: 600,
            color: subtextColor,
            lineHeight: 1.35,
            paddingRight: onDismiss ? '20px' : 0,
            /* One line. A wrapped goal buys a row to finish a sentence the user wrote. */
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {mission.lead || 'Building'}: {plan.goal}
        </div>
      ) : null}
      {understanding ? (
        <div
          title={understanding}
          style={{
            fontSize: '0.72rem',
            color: subtextColor,
            opacity: 0.75,
            marginTop: '1px',
            lineHeight: 1.35,
            paddingRight: onDismiss ? '20px' : 0,
            /*
             * Clamped to one line, full text on hover. This is a summary of the
             * conversation the user just had, pinned permanently above their
             * composer; two wrapped lines of it was the single largest block of
             * low-value pixels on the screen.
             */
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {understanding}
        </div>
      ) : null}
      {plan.next ? (
        <div style={{ fontSize: '0.73rem', color: isLight ? '#c2410c' : '#fdba74', marginTop: '3px', lineHeight: 1.35, fontWeight: 600 }}>
          Next: {plan.next}
        </div>
      ) : null}
    </div>
  );
}
