import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import StudyTutorShell from './StudyTutorShell.jsx';
import { deriveStudyTutorBrief } from '../lib/study-tutor-brief.js';
import {
  gradeStudyAssessment,
  requestStudyAssessment,
} from '../lib/study-evidence-client.js';
import {
  createStudyLoopState,
  isStudyQuestionCompleted,
  studyQuestionId,
  transitionStudyLoop,
} from '../lib/study-conversation-loop.js';
import {
  studyActionVisibleText,
  studyAnotherExampleAsk,
  studyNextQuestionAsk,
  studyUsefulReferenceAsk,
} from '../lib/study-learning-resources.js';

const EMPTY_ASSESSMENT = Object.freeze({ status: 'idle', item: null, attemptId: '', selectedOptionId: '', result: null, error: '' });

/**
 * Persistent Study feature boundary. It is intentionally a sibling of the chat
 * feed, so streaming a new message cannot unmount an in-progress learner task.
 * The rendered shell is compact by default; rich learning activities expand
 * only when the learner asks for them.
 */
export default function StudyTutorWorkspace({
  activeSessionId,
  conversationContext,
  messages,
  isLight,
  textColor,
  subtextColor,
  onAsk,
  onSend,
}) {
  const [assessment, setAssessment] = useState(EMPTY_ASSESSMENT);
  const [loop, dispatchLoop] = useReducer(
    (state, event) => transitionStudyLoop(state, event, 'education'),
    undefined,
    createStudyLoopState,
  );
  const assessmentGeneration = useRef(0);
  const brief = useMemo(
    () => deriveStudyTutorBrief({ conversationContext, messages }),
    [conversationContext, messages],
  );
  useEffect(() => {
    assessmentGeneration.current += 1;
    dispatchLoop({ type: 'RESET' });
    setAssessment(EMPTY_ASSESSMENT);
  }, [activeSessionId, brief?.conceptId]);

  const handleRequestAssessment = useCallback(async ({ explicitRetry = false } = {}) => {
    if (!brief?.conceptId || !activeSessionId) return { fallback: true };
    const generation = assessmentGeneration.current;
    setAssessment({ ...EMPTY_ASSESSMENT, status: 'loading' });
    try {
      const issued = await requestStudyAssessment({
        conceptId: brief.conceptId,
        conceptLabel: brief.label,
        sessionId: activeSessionId,
      });
      if (assessmentGeneration.current !== generation) return { fallback: false, stale: true };
      if (!explicitRetry && isStudyQuestionCompleted(loop, issued.item)) {
        setAssessment(EMPTY_ASSESSMENT);
        return { fallback: false, completed: true };
      }
      const questionId = studyQuestionId(issued.item);
      dispatchLoop({ type: 'ASK', questionId, explicitRetry });
      dispatchLoop({ type: 'PRESENT', questionId });
      setAssessment({ ...EMPTY_ASSESSMENT, status: 'ready', item: issued.item, attemptId: issued.attemptId });
      return { fallback: false };
    } catch (error) {
      if (assessmentGeneration.current !== generation) return { fallback: false, stale: true };
      if (error?.fallbackAllowed) {
        setAssessment(EMPTY_ASSESSMENT);
        return { fallback: true };
      }
      setAssessment({ ...EMPTY_ASSESSMENT, status: 'error', error: error?.message || 'Verified check unavailable.' });
      return { fallback: false };
    }
  }, [activeSessionId, brief?.conceptId, brief?.label, loop]);

  const handleSubmitAssessment = useCallback(async (optionId) => {
    if (!assessment.attemptId || assessment.status === 'grading' || assessment.result) return;
    const generation = assessmentGeneration.current;
    const selectedOption = assessment.item?.options?.find((option) => option.id === optionId);
    dispatchLoop({ type: 'ATTEMPT', answer: selectedOption?.text || optionId });
    dispatchLoop({ type: 'VERIFY' });
    setAssessment((current) => ({ ...current, status: 'grading', selectedOptionId: optionId, error: '' }));
    try {
      const result = await gradeStudyAssessment({ attemptId: assessment.attemptId, optionId });
      if (assessmentGeneration.current !== generation) return;
      dispatchLoop({ type: 'RESOLVE', correct: result.correct, misconception: result.misconceptionSignal });
      setAssessment((current) => ({ ...current, status: 'graded', result, error: '' }));
    } catch (error) {
      if (assessmentGeneration.current !== generation) return;
      setAssessment((current) => ({ ...current, status: 'error', error: error?.message || 'Answer not recorded.' }));
    }
  }, [assessment.attemptId, assessment.item?.options, assessment.result, assessment.status]);

  const handleAdvance = useCallback(() => {
    dispatchLoop({ type: 'ADVANCE' });
    setAssessment(EMPTY_ASSESSMENT);
    onSend?.(studyNextQuestionAsk(brief?.label), {
      visibleUserText: studyActionVisibleText('next', brief?.label),
    });
  }, [brief?.label, onSend]);

  const handleRemediation = useCallback((kind) => {
    if (kind === 'retry') {
      handleRequestAssessment({ explicitRetry: true });
      return;
    }
    const ask = kind === 'example' ? studyAnotherExampleAsk(brief?.label) : studyUsefulReferenceAsk(brief?.label);
    onSend?.(ask, {
      visibleUserText: studyActionVisibleText(kind === 'example' ? 'example' : 'reference', brief?.label),
    });
  }, [brief?.label, handleRequestAssessment, onSend]);

  if (!brief?.active) return null;
  return (
    <StudyTutorShell
      key={`${activeSessionId}:${brief.conceptId}`}
      brief={brief}
      isLight={isLight}
      textColor={textColor}
      subtextColor={subtextColor}
      onAsk={onAsk}
      onSend={onSend}
      assessment={assessment}
      loop={loop}
      onRequestAssessment={handleRequestAssessment}
      onSubmitAssessment={handleSubmitAssessment}
      onAdvance={handleAdvance}
      onRemediation={handleRemediation}
    />
  );
}
