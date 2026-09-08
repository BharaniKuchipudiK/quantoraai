import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { ArrowRight, Check, Lightbulb, RotateCcw, X } from 'lucide-react';
import {
  studyActionVisibleText,
  studyLessonAsk,
  studyPracticeAsk,
  studyQuizAsk,
} from '../lib/study-learning-resources.js';
import { studyAdaptiveStateLabel, studyAdaptiveTutorAsk } from '../lib/study-adaptive-tutor.js';
import { STUDY_ADAPTIVE_MISSION_REQUEST_EVENT } from '../lib/study-adaptive-mission-event.js';
import {
  STUDY_ADAPTIVE_MISSION_PHASE,
  createStudyAdaptiveMissionState,
  sameStudyMissionLabel,
  studyAdaptiveMissionFocusAsk,
  studyAdaptiveMissionGuidedPracticeAsk,
  studyAdaptiveMissionPhaseCopy,
  studyAdaptiveMissionReviewAsk,
  studyAdaptiveMissionStartAsk,
  studyAdaptiveMissionStartPhase,
  transitionStudyAdaptiveMission,
} from '../lib/study-adaptive-mission.js';

function missionCheckError(outcome = {}) {
  if (outcome?.error) return outcome.error;
  if (outcome?.code === 'verified_assessment_bank_exhausted') return 'No fresh reviewed question remains for this topic right now.';
  if (outcome?.code === 'verified_misconception_confirmation_unavailable') return 'A fresh reviewed misconception check is not available yet.';
  if (outcome?.code === 'verified_retention_probe_unavailable') return 'A fresh reviewed retention question is not available yet.';
  if (outcome?.code === 'verified_transfer_unavailable') return 'A governed transfer question is not available for this topic yet.';
  return 'The governed verified check is unavailable for this topic right now.';
}

function normalizedConceptKey(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Conversation-first Study shell.
 *
 * H1 keeps only three permanent learner moves visible: Explain, Practice and
 * Check. Secondary tools live in the progressive-disclosure Study Hub rather
 * than competing with the lesson for permanent screen space.
 */
export default function StudyTutorShell({
  brief,
  onAsk,
  onSend,
  assessment,
  loop,
  onRequestAssessment,
  onSubmitAssessment,
  onAdvance,
  onRemediation,
}) {
  const [dismissed, setDismissed] = useState(false);
  const [activity, setActivity] = useState(null);
  const [mission, dispatchMission] = useReducer(
    transitionStudyAdaptiveMission,
    undefined,
    createStudyAdaptiveMissionState,
  );

  const topic = brief?.label || 'this topic';
  const gaps = brief?.gaps || [];
  const verifiedResult = assessment?.result || null;
  const learnerModel = verifiedResult?.learnerModel || null;
  const completedCheck = Boolean(loop?.completedQuestionIds?.length);

  const askOrSend = useCallback((text, action) => {
    const adaptiveText = studyAdaptiveTutorAsk(text, learnerModel);
    if (onSend) onSend(adaptiveText, { visibleUserText: studyActionVisibleText(action, topic) });
    else onAsk?.(adaptiveText);
  }, [learnerModel, onAsk, onSend, topic]);

  const sendMission = useCallback((text, visibleUserText) => {
    if (onSend) onSend(text, { visibleUserText });
    else onAsk?.(text);
  }, [onAsk, onSend]);

  const requestCheck = useCallback(async (options) => {
    setActivity('check');
    if (onRequestAssessment) {
      const outcome = await onRequestAssessment(options);
      if (!outcome?.fallback) return;
      askOrSend(studyQuizAsk(topic), 'quiz');
      setActivity(null);
      return;
    }
    askOrSend(studyQuizAsk(topic), 'quiz');
    setActivity(null);
  }, [askOrSend, onRequestAssessment, topic]);

  const requestMissionCheck = useCallback(async ({
    targetLabel = mission.label,
    targetConceptKey = mission.conceptKey,
    explicitRetry = completedCheck,
  } = {}) => {
    const label = String(targetLabel || '').trim();
    if (!label || !sameStudyMissionLabel(topic, label)) {
      dispatchMission({
        type: 'CHECK_UNAVAILABLE',
        error: label
          ? `Study is still focused on ${topic}. The verified check will not run against a different concept.`
          : 'The mission has no verified Study topic.',
      });
      return { issued: false, focusMismatch: true };
    }

    dispatchMission({ type: 'CHECK_REQUESTED' });
    setActivity('check');

    // A topic switch resets Assessment in StudyTutorWorkspace, but React effects
    // may observe the new topic before that reset is committed. Reuse an active
    // attempt only when its public canonical concept key agrees with the Compass
    // target. Guided-chip missions have no Compass key and stay on the already
    // aligned current topic, so their existing same-topic attempt remains usable.
    const targetKey = normalizedConceptKey(targetConceptKey);
    const activeItemKey = normalizedConceptKey(assessment?.item?.conceptKey);
    const activeAttemptMatchesTarget = !targetKey || (activeItemKey && activeItemKey === targetKey);
    if (assessment?.item && assessment?.attemptId && !assessment?.result && activeAttemptMatchesTarget) {
      return { issued: true, reused: true };
    }

    if (!onRequestAssessment) {
      const outcome = { fallback: false, error: 'The governed verified checker is not connected.' };
      dispatchMission({ type: 'CHECK_UNAVAILABLE', error: outcome.error });
      setActivity(null);
      return outcome;
    }

    const outcome = await onRequestAssessment({ explicitRetry });
    if (outcome?.issued || outcome?.stale) return outcome;

    const error = missionCheckError(outcome);
    dispatchMission({ type: 'CHECK_UNAVAILABLE', error });
    setActivity(null);
    return { ...outcome, issued: false, error };
  }, [assessment?.attemptId, assessment?.item, assessment?.result, completedCheck, mission.conceptKey, mission.label, onRequestAssessment, topic]);

  const beginCompassMission = useCallback((recommendation) => {
    const label = String(recommendation?.label || '').trim();
    if (!label) return;
    const phase = studyAdaptiveMissionStartPhase(recommendation);
    const aligned = sameStudyMissionLabel(topic, label);
    setActivity(null);
    dispatchMission({ type: 'START_COMPASS', recommendation, activeTopic: topic });

    if (phase === STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK) {
      if (aligned) {
        void requestMissionCheck({
          targetLabel: label,
          targetConceptKey: recommendation?.conceptKey,
          explicitRetry: completedCheck,
        });
      } else {
        sendMission(studyAdaptiveMissionFocusAsk(recommendation), `Help me with ${label}`);
      }
      return;
    }

    sendMission(studyAdaptiveMissionStartAsk(recommendation), `Teach me ${label}`);
  }, [completedCheck, requestMissionCheck, sendMission, topic]);

  const beginGuidedMission = useCallback((item) => {
    if (!brief?.active || !String(topic || '').trim()) return;
    setActivity(null);
    dispatchMission({ type: 'START_GUIDED', topic });
    sendMission(
      studyAdaptiveMissionGuidedPracticeAsk(topic),
      String(item?.label || 'Let’s work through it together').trim(),
    );
  }, [brief?.active, sendMission, topic]);

  useEffect(() => {
    const handleMissionRequest = (event) => {
      const detail = event?.detail;
      if (!detail || detail.handled === true || !brief?.active) return;
      if (detail.source === 'compass' && detail.recommendation?.label) {
        detail.handled = true;
        beginCompassMission(detail.recommendation);
        return;
      }
      if (detail.source === 'guided_chip' && String(topic || '').trim()) {
        detail.handled = true;
        beginGuidedMission(detail.item);
      }
    };

    window.addEventListener(STUDY_ADAPTIVE_MISSION_REQUEST_EVENT, handleMissionRequest);
    return () => window.removeEventListener(STUDY_ADAPTIVE_MISSION_REQUEST_EVENT, handleMissionRequest);
  }, [beginCompassMission, beginGuidedMission, brief?.active, topic]);

  // A Compass recommendation can legitimately target a prerequisite rather
  // than the concept that was active when Compass opened. The visible Study
  // turn changes the canonical session focus first. Mark alignment in its own
  // render and let the learner open the governed check from the mission card;
  // this avoids racing StudyTutorWorkspace's assessment reset for the old topic.
  useEffect(() => {
    if (mission.status !== 'active' || mission.topicAligned || !mission.label) return;
    if (!sameStudyMissionLabel(topic, mission.label)) return;
    dispatchMission({ type: 'TOPIC_ALIGNED' });
  }, [mission.label, mission.status, mission.topicAligned, topic]);

  // Once a mission has aligned, a later explicit topic change supersedes it.
  // Session changes already unmount this shell because StudyTutorWorkspace is
  // keyed by activeSessionId.
  useEffect(() => {
    if (mission.status === 'idle' || !mission.topicAligned || !mission.label) return;
    if (!String(topic || '').trim() || sameStudyMissionLabel(topic, mission.label)) return;
    dispatchMission({ type: 'RESET' });
    setActivity(null);
  }, [mission.label, mission.status, mission.topicAligned, topic]);

  useEffect(() => {
    if (mission.status !== 'active'
      || mission.phase !== STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK
      || typeof assessment?.result?.correct !== 'boolean') return;
    dispatchMission({ type: 'VERIFIED_RESULT', correct: assessment.result.correct });
  }, [assessment?.result?.correct, mission.phase, mission.status]);

  const runMissionPractice = useCallback(() => {
    const label = mission.label || topic;
    const repair = mission.repairRequired === true;
    dispatchMission({ type: 'PRACTICE', repair });
    sendMission(
      studyAdaptiveMissionGuidedPracticeAsk(label, {
        repair,
        explanation: repair ? assessment?.result?.explanation : '',
      }),
      repair ? 'Work through the repair with me' : 'Let’s work through it together',
    );
  }, [assessment?.result?.explanation, mission.label, mission.repairRequired, sendMission, topic]);

  const runMissionReview = useCallback(() => {
    const label = mission.label || topic;
    sendMission(
      studyAdaptiveMissionReviewAsk(label, assessment?.result),
      'Review what I proved and what I should retain',
    );
    dispatchMission({ type: 'REVIEW_SENT' });
  }, [assessment?.result, mission.label, sendMission, topic]);

  const adaptiveState = studyAdaptiveStateLabel(learnerModel);
  const stateLabel = adaptiveState || (verifiedResult
    ? (verifiedResult.correct ? 'Question complete' : 'Ready to repair')
    : gaps.length
      ? `${gaps.length} to check`
      : 'Not checked yet');

  if (dismissed) {
    return (
      <div
        data-quantora-study-board="true"
        data-quantora-workspace-capabilities="education"
        className="study-h1-focus"
        style={{ display: 'flex', marginBottom: '10px' }}
      >
        <button
          type="button"
          onClick={() => setDismissed(false)}
          aria-label={`Reopen Study focus for ${topic}`}
          className="study-h1-action"
          style={{
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--study-h1-muted)',
          }}
        >
          Study focus · {topic}
        </button>
      </div>
    );
  }

  return (
    <div
      data-quantora-study-board="true"
      data-quantora-workspace-capabilities="education"
      className="study-h1-focus"
    >
      <section aria-label={`Study focus: ${topic}`}>
        <div data-quantora-study-next-choices="true" className="study-h1-focus__row">
          <span
            data-quantora-study-adaptive-state={adaptiveState || undefined}
            className="study-h1-focus__state"
          >
            <strong>{topic}</strong> · {stateLabel}
          </span>

          <button
            type="button"
            onClick={() => askOrSend(studyLessonAsk(topic), 'lesson')}
            className="study-h1-action"
          >
            Explain
          </button>
          <button
            type="button"
            onClick={() => askOrSend(studyPracticeAsk(topic), 'practice')}
            className="study-h1-action"
          >
            Practice
          </button>
          <button
            type="button"
            aria-label="Test me on this"
            disabled={assessment?.status === 'loading' || assessment?.status === 'grading' || verifiedResult?.correct}
            onClick={() => requestCheck({ explicitRetry: completedCheck })}
            className="study-h1-action study-h1-action--primary"
          >
            {assessment?.status === 'loading'
              ? 'Preparing…'
              : assessment?.status === 'grading'
                ? 'Checking…'
                : verifiedResult?.correct
                  ? 'Completed'
                  : completedCheck
                    ? 'Retry check'
                    : 'Check'}
          </button>
          <button
            type="button"
            title="Close Study focus"
            aria-label="Close Study focus"
            onClick={() => setDismissed(true)}
            className="study-h1-icon-button"
          >
            <X size={16} />
          </button>
        </div>

        {mission.status !== 'idle' ? (
          <div
            data-quantora-study-adaptive-mission={mission.phase}
            className="study-h1-next-move"
            style={{ marginTop: '8px', fontSize: '0.72rem', lineHeight: 1.45 }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '6px' }}>
              <strong>Learning mission · {mission.label}</strong>
              {mission.durationMinutes ? <span>{mission.durationMinutes} min</span> : null}
            </div>
            <div style={{ marginTop: '2px' }}>Explain → Guided practice → Verified check → Review/retention</div>
            <div style={{ marginTop: '3px' }}>{studyAdaptiveMissionPhaseCopy(mission)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '7px' }}>
              {mission.phase === STUDY_ADAPTIVE_MISSION_PHASE.EXPLAIN ? (
                <button type="button" className="study-h1-action study-h1-action--primary" onClick={runMissionPractice}>
                  Work through it together
                </button>
              ) : null}
              {mission.phase === STUDY_ADAPTIVE_MISSION_PHASE.GUIDED_PRACTICE ? (
                <>
                  {mission.repairRequired ? (
                    <button type="button" className="study-h1-action" onClick={runMissionPractice}>
                      Work through the repair
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="study-h1-action study-h1-action--primary"
                    disabled={!mission.topicAligned || assessment?.status === 'loading' || assessment?.status === 'grading'}
                    onClick={() => void requestMissionCheck({
                      targetLabel: mission.label,
                      targetConceptKey: mission.conceptKey,
                      explicitRetry: completedCheck,
                    })}
                  >
                    Verified check
                  </button>
                </>
              ) : null}
              {mission.phase === STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK
                && mission.topicAligned
                && !assessment?.item
                && !mission.error ? (
                  <button
                    type="button"
                    className="study-h1-action study-h1-action--primary"
                    disabled={assessment?.status === 'loading' || assessment?.status === 'grading'}
                    onClick={() => void requestMissionCheck({
                      targetLabel: mission.label,
                      targetConceptKey: mission.conceptKey,
                      explicitRetry: completedCheck,
                    })}
                  >
                    {assessment?.status === 'loading' ? 'Preparing…' : 'Open verified check'}
                  </button>
                ) : null}
              {mission.phase === STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK && assessment?.item && activity !== 'check' ? (
                <button type="button" className="study-h1-action study-h1-action--primary" onClick={() => setActivity('check')}>
                  Open verified check
                </button>
              ) : null}
              {mission.phase === STUDY_ADAPTIVE_MISSION_PHASE.VERIFIED_CHECK && mission.error && !assessment?.item ? (
                <button
                  type="button"
                  className="study-h1-action"
                  disabled={!mission.topicAligned || assessment?.status === 'loading' || assessment?.status === 'grading'}
                  onClick={() => void requestMissionCheck({
                    targetLabel: mission.label,
                    targetConceptKey: mission.conceptKey,
                    explicitRetry: completedCheck,
                  })}
                >
                  Try verified check again
                </button>
              ) : null}
              {mission.phase === STUDY_ADAPTIVE_MISSION_PHASE.REVIEW ? (
                <button type="button" className="study-h1-action study-h1-action--primary" onClick={runMissionReview}>
                  Review & retention
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {activity === 'check' && assessment?.item ? (
          <div
            data-quantora-study-verified-check="true"
            data-quantora-study-inline-activity="check"
            data-quantora-study-loop-phase={loop?.phase}
            className="study-h1-check"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <div className="study-h1-check__eyebrow">One quick check</div>
              <button
                type="button"
                aria-label="Close check"
                onClick={() => setActivity(null)}
                className="study-h1-icon-button"
              >
                <X size={14} />
              </button>
            </div>

            <div className="study-h1-check__prompt">{assessment.item.prompt}</div>
            <div className="study-h1-check__options">
              {(assessment.item.options || []).map((option) => (
                <button
                  type="button"
                  key={option.id}
                  disabled={assessment?.status === 'grading' || Boolean(assessment?.result)}
                  aria-pressed={assessment?.selectedOptionId === option.id}
                  onClick={() => onSubmitAssessment?.(option.id)}
                  className="study-h1-action study-h1-check__option"
                  style={{ opacity: assessment?.result && assessment?.selectedOptionId !== option.id ? 0.62 : 1 }}
                >
                  {option.text}
                </button>
              ))}
            </div>

            {assessment?.result ? (
              <div
                data-quantora-study-verified-result={assessment.result.correct ? 'correct' : 'incorrect'}
                className={assessment.result.correct ? 'study-resolution study-resolution--correct' : 'study-resolution'}
              >
                <div className="study-resolution__title">
                  {assessment.result.correct ? <Check size={15} /> : <Lightbulb size={15} />}
                  {assessment.result.correct ? 'Exactly — that fits.' : 'Good attempt — here is the key distinction.'}
                </div>
                {!assessment.result.correct && assessment?.selectedOptionId ? (
                  <div className="study-resolution__detail" style={{ marginTop: '5px' }}>
                    You chose “{assessment.item.options.find((option) => option.id === assessment.selectedOptionId)?.text}”.
                    {assessment.result.misconceptionSignal
                      ? ' That points to a concept mix-up, not a careless miss.'
                      : ' It is close, but it uses the wrong relationship here.'}
                  </div>
                ) : null}
                <div style={{ marginTop: '4px' }}>
                  <strong>Why:</strong> {assessment.result.explanation || stateLabel}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {assessment.result.correct ? (
                    <>
                      <button type="button" onClick={onAdvance} className="study-h1-action study-h1-action--primary">
                        Next question <ArrowRight size={12} style={{ verticalAlign: '-2px' }} />
                      </button>
                      <button type="button" onClick={() => requestCheck({ explicitRetry: true })} className="study-h1-action">
                        Retry this one
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => onRemediation?.('retry')} className="study-h1-action study-h1-action--primary">
                        <RotateCcw size={12} style={{ verticalAlign: '-2px' }} /> Retry
                      </button>
                      <button type="button" onClick={() => onRemediation?.('example')} className="study-h1-action">
                        Another example
                      </button>
                      <button type="button" onClick={() => onRemediation?.('reference')} className="study-h1-action">
                        Useful reference
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {assessment?.result?.learnerModel?.nextLearningMove?.learnerFacingText ? (
              <div
                data-quantora-study-next-learning-move="true"
                className="study-h1-next-move"
                style={{ marginTop: '4px', fontSize: '0.72rem', lineHeight: 1.45 }}
              >
                {assessment.result.learnerModel.nextLearningMove.learnerFacingText}
              </div>
            ) : null}

            {assessment?.error ? (
              <div className="study-h1-error__copy" style={{ marginTop: '6px', fontSize: '0.72rem' }}>
                {assessment.error}
              </div>
            ) : null}
          </div>
        ) : null}

        {activity === 'check' && assessment?.status === 'error' ? (
          <div
            role="status"
            aria-live="polite"
            data-quantora-study-inline-activity="check-error"
            className="study-h1-error"
          >
            <span className="study-h1-error__copy">{assessment.error}</span>
            <button
              type="button"
              aria-label="Close check"
              onClick={() => setActivity(null)}
              className="study-h1-icon-button"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}