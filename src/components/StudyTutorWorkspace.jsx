import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import StudyAssessmentWorkspace from './StudyAssessmentWorkspace.jsx';
import StudyHubLauncher from './StudyHubLauncher.jsx';
import StudyReinforcement from './StudyReinforcement.jsx';
import StudyTutorShell from './StudyTutorShell.jsx';
import './study-h1.css';
import { deriveStudyTutorBrief } from '../lib/study-tutor-brief.js';
import {
  gradeStudyAssessment,
  requestStudyAssessment,
} from '../lib/study-evidence-client.js';
import { readStudyWorkingState } from '../lib/study-working-state.js';
import { loadStudyOnboarding } from '../lib/study-onboarding-client.js';
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
import { STUDY_SURFACE, STUDY_SURFACE_REQUEST_EVENT } from '../lib/study-surface-navigation.js';

const EMPTY_ASSESSMENT = Object.freeze({ status: 'idle', item: null, attemptId: '', selectedOptionId: '', result: null, error: '' });

function emptyAssessmentSession() {
  return {
    phase: 'setup',
    targetCount: 5,
    presentation: 'one_at_a_time',
    feedback: 'after_each',
    completed: 0,
    correctCount: 0,
    results: [],
    batchItems: [],
    submitting: false,
    error: '',
  };
}

function assessmentItemRef(item) {
  const key = String(item?.itemKey || '').trim();
  const version = String(item?.itemVersion || '').trim();
  return key && version ? `${key}@${version}` : '';
}

function assessmentAvailabilityMessage(code) {
  if (code === 'verified_assessment_bank_exhausted') return 'No more fresh reviewed questions are available for this topic right now.';
  if (code === 'verified_misconception_confirmation_unavailable') return 'A fresh reviewed misconception check is not available yet.';
  if (code === 'verified_retention_probe_unavailable') return 'A fresh reviewed retention question is not available yet.';
  if (code === 'verified_transfer_unavailable') return 'A governed transfer question is not available for this topic yet.';
  return 'No reviewed assessment question is available for this topic right now.';
}

function coldStartContext(profile) {
  if (!profile || profile.skipped) return '';
  const parts = [];
  if (profile.studyContext) parts.push(`context=${profile.studyContext}`);
  if (profile.curriculum) parts.push(`curriculum=${profile.curriculum}`);
  if (profile.level) parts.push(`level=${profile.level}`);
  if (Array.isArray(profile.subjects) && profile.subjects.length) parts.push(`subjects=${profile.subjects.join(', ')}`);
  if (profile.goal) parts.push(`goal=${profile.goal}`);
  if (profile.targetExam) parts.push(`target exam=${profile.targetExam}`);
  if (profile.examDate) parts.push(`exam date=${profile.examDate}`);
  if (Number.isFinite(profile.weeklyMinutes)) parts.push(`weekly study minutes=${profile.weeklyMinutes}`);
  if (profile.preferredModality) parts.push(`preferred explanation=${profile.preferredModality}`);
  if (!parts.length) return '';
  return `\n\nCold-start learner context (self-reported; planning context only, never mastery evidence): ${parts.join('; ')}.`;
}

/**
 * Persistent Study feature boundary. It is intentionally a sibling of the chat
 * feed, so streaming a new message cannot unmount an in-progress learner task.
 * The rendered shell is compact by default; secondary capabilities are exposed
 * through the progressive-disclosure Study Hub.
 */
export default function StudyTutorWorkspace({
  activeSessionId,
  conversationContext,
  messages,
  onAsk,
  onSend,
}) {
  const [assessment, setAssessment] = useState(EMPTY_ASSESSMENT);
  const [assessmentWorkspaceOpen, setAssessmentWorkspaceOpen] = useState(false);
  const [assessmentSession, setAssessmentSession] = useState(emptyAssessmentSession);
  const [onboarding, setOnboarding] = useState({ status: 'loading', profile: null });
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
  const onboardingSuffix = useMemo(() => coldStartContext(onboarding.profile), [onboarding.profile]);
  const contextualSend = useCallback((text, options) => {
    onSend?.(`${text}${onboardingSuffix}`, options);
  }, [onSend, onboardingSuffix]);

  useEffect(() => {
    let active = true;
    const handleOnboardingUpdated = (event) => {
      if (!active) return;
      setOnboarding({ status: 'done', profile: event?.detail || null });
    };
    window.addEventListener('quantora:study-onboarding-updated', handleOnboardingUpdated);
    loadStudyOnboarding()
      .then(({ profile }) => {
        if (active) setOnboarding({ status: 'done', profile });
      })
      .catch(() => {
        if (active) setOnboarding({ status: 'unavailable', profile: null });
      });
    return () => {
      active = false;
      window.removeEventListener('quantora:study-onboarding-updated', handleOnboardingUpdated);
    };
  }, []);

  // This listener lives above the onboarding render guard. A restored Study
  // session can therefore acknowledge + -> Assessment even while onboarding
  // context is still loading; the action is never dispatched into a void.
  useEffect(() => {
    const handleSurfaceRequest = (event) => {
      if (event?.detail?.surface !== STUDY_SURFACE.ASSESSMENT) return;
      if (!brief?.active) return;
      event.detail.handled = true;
      setAssessmentWorkspaceOpen(true);
    };
    window.addEventListener(STUDY_SURFACE_REQUEST_EVENT, handleSurfaceRequest);
    return () => window.removeEventListener(STUDY_SURFACE_REQUEST_EVENT, handleSurfaceRequest);
  }, [brief?.active]);

  useEffect(() => {
    assessmentGeneration.current += 1;
    dispatchLoop({ type: 'RESET' });
    setAssessment(EMPTY_ASSESSMENT);
    setAssessmentSession(emptyAssessmentSession());
    setAssessmentWorkspaceOpen(false);
  }, [activeSessionId, brief?.conceptId]);

  const handleRequestAssessment = useCallback(async ({ explicitRetry = false, conceptKey = '' } = {}) => {
    if (!brief?.conceptId || !activeSessionId) return { fallback: true, code: 'verified_assessment_unavailable' };
    const assessmentConceptKey = String(conceptKey || '').trim() || brief.conceptId;
    const generation = assessmentGeneration.current;
    setAssessment({ ...EMPTY_ASSESSMENT, status: 'loading' });
    try {
      const issued = await requestStudyAssessment({
        conceptId: assessmentConceptKey,
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
      return { fallback: false, issued };
    } catch (error) {
      if (assessmentGeneration.current !== generation) return { fallback: false, stale: true };
      if (error?.fallbackAllowed) {
        setAssessment(EMPTY_ASSESSMENT);
        return { fallback: true, code: error.code || 'verified_assessment_unavailable' };
      }
      setAssessment({ ...EMPTY_ASSESSMENT, status: 'error', error: error?.message || 'Verified check unavailable.' });
      return { fallback: false, error: error?.message || 'Verified check unavailable.', code: error?.code || '' };
    }
  }, [activeSessionId, brief?.conceptId, brief?.label, loop]);

  const handleSubmitAssessment = useCallback(async (optionId) => {
    if (!assessment.attemptId || assessment.status === 'grading' || assessment.result) return { recorded: false };
    const generation = assessmentGeneration.current;
    const selectedOption = assessment.item?.options?.find((option) => option.id === optionId);
    dispatchLoop({ type: 'ATTEMPT', answer: selectedOption?.text || optionId });
    dispatchLoop({ type: 'VERIFY' });
    setAssessment((current) => ({ ...current, status: 'grading', selectedOptionId: optionId, error: '' }));
    try {
      const hintDepth = readStudyWorkingState()?.hintDepth || 0;
      const result = await gradeStudyAssessment({
        attemptId: assessment.attemptId,
        optionId,
        retry: loop.explicitRetry === true,
        hintDepth,
      });
      if (assessmentGeneration.current !== generation) return { recorded: false, stale: true };
      dispatchLoop({ type: 'RESOLVE', correct: result.correct, misconception: result.misconceptionSignal });
      setAssessment((current) => ({ ...current, status: 'graded', result, error: '' }));
      return { recorded: true, result };
    } catch (error) {
      if (assessmentGeneration.current !== generation) return { recorded: false, stale: true };
      const message = error?.message || 'Answer not recorded.';
      setAssessment((current) => ({ ...current, status: 'error', error: message }));
      return { recorded: false, error: message };
    }
  }, [assessment.attemptId, assessment.item?.options, assessment.result, assessment.status, loop.explicitRetry]);

  const issueAssessmentBatch = useCallback(async (targetCount) => {
    if (!brief?.conceptId || !activeSessionId) {
      return { items: [], error: assessmentAvailabilityMessage('verified_assessment_unavailable') };
    }
    const generation = assessmentGeneration.current;
    const items = [];
    const exclusions = [];

    if (assessment?.item && assessment?.attemptId && !assessment?.result) {
      items.push({ attemptId: assessment.attemptId, item: assessment.item });
      const ref = assessmentItemRef(assessment.item);
      if (ref) exclusions.push(ref);
    }

    while (items.length < targetCount) {
      try {
        const issued = await requestStudyAssessment({
          conceptId: brief.conceptId,
          conceptLabel: brief.label,
          sessionId: activeSessionId,
          excludeItemRefs: exclusions,
        });
        if (assessmentGeneration.current !== generation) return { items: [], stale: true };
        const ref = assessmentItemRef(issued.item);
        if (!ref || exclusions.includes(ref)) {
          return { items, error: 'Quantora stopped because the reviewed question bank returned a duplicate reservation.' };
        }
        items.push({ attemptId: issued.attemptId, item: issued.item });
        exclusions.push(ref);
      } catch (error) {
        if (assessmentGeneration.current !== generation) return { items: [], stale: true };
        if (error?.fallbackAllowed) {
          return {
            items,
            error: items.length < targetCount ? assessmentAvailabilityMessage(error.code) : '',
          };
        }
        return { items, error: error?.message || 'The reviewed assessment could not be prepared.' };
      }
    }
    return { items, error: '' };
  }, [activeSessionId, assessment?.attemptId, assessment?.item, assessment?.result, brief?.conceptId, brief?.label]);

  const startAssessmentSession = useCallback(async (config) => {
    const targetCount = Math.max(1, Math.min(20, Number(config?.questionCount) || 5));
    const presentation = config?.presentation === 'all_at_once' ? 'all_at_once' : 'one_at_a_time';
    const feedback = presentation === 'all_at_once'
      ? 'at_end'
      : config?.feedback === 'at_end' ? 'at_end' : 'after_each';
    const base = {
      ...emptyAssessmentSession(),
      phase: 'loading',
      targetCount,
      presentation,
      feedback,
    };
    setAssessmentSession(base);

    if (presentation === 'all_at_once') {
      const prepared = await issueAssessmentBatch(targetCount);
      if (prepared?.stale) return;
      if (!prepared.items.length) {
        setAssessmentSession((current) => ({ ...current, phase: 'summary', error: prepared.error || assessmentAvailabilityMessage('verified_assessment_unavailable') }));
        return;
      }
      setAssessmentSession((current) => ({
        ...current,
        phase: 'batch',
        batchItems: prepared.items,
        error: prepared.error || '',
      }));
      return;
    }

    // If a governed quick check is already active, continue that exact server
    // attempt as question one rather than creating a conflicting second attempt.
    if (assessment?.item && assessment?.attemptId && !assessment?.result) {
      setAssessmentSession((current) => ({ ...current, phase: 'running' }));
      return;
    }

    const outcome = await handleRequestAssessment({ explicitRetry: false });
    if (outcome?.issued) {
      setAssessmentSession((current) => ({ ...current, phase: 'running', error: '' }));
      return;
    }
    setAssessmentSession((current) => ({
      ...current,
      phase: 'summary',
      error: outcome?.error || assessmentAvailabilityMessage(outcome?.code),
    }));
  }, [assessment?.attemptId, assessment?.item, assessment?.result, handleRequestAssessment, issueAssessmentBatch]);

  const answerAssessmentSession = useCallback(async (optionId) => {
    const attemptId = assessment?.attemptId || '';
    const prompt = assessment?.item?.prompt || 'Reviewed Study question';
    const outcome = await handleSubmitAssessment(optionId);
    if (!outcome?.recorded) {
      if (outcome?.error) setAssessmentSession((current) => ({ ...current, error: outcome.error }));
      return;
    }
    const result = outcome.result;
    setAssessmentSession((current) => ({
      ...current,
      completed: current.completed + 1,
      correctCount: current.correctCount + (result.correct ? 1 : 0),
      results: [...current.results, {
        attemptId,
        prompt,
        correct: result.correct,
        explanation: result.explanation || 'Answer recorded.',
      }],
      error: '',
    }));
  }, [assessment?.attemptId, assessment?.item?.prompt, handleSubmitAssessment]);

  const nextAssessmentSessionQuestion = useCallback(async () => {
    if (assessmentSession.completed >= assessmentSession.targetCount) {
      setAssessmentSession((current) => ({ ...current, phase: 'summary' }));
      return;
    }
    dispatchLoop({ type: 'ADVANCE' });
    setAssessment(EMPTY_ASSESSMENT);
    setAssessmentSession((current) => ({ ...current, phase: 'loading', error: '' }));
    const outcome = await handleRequestAssessment({ explicitRetry: false });
    if (outcome?.issued) {
      setAssessmentSession((current) => ({ ...current, phase: 'running', error: '' }));
      return;
    }
    setAssessmentSession((current) => ({
      ...current,
      phase: 'summary',
      error: outcome?.error || assessmentAvailabilityMessage(outcome?.code),
    }));
  }, [assessmentSession.completed, assessmentSession.targetCount, handleRequestAssessment]);

  const submitAssessmentBatch = useCallback(async (answers) => {
    const batchItems = assessmentSession.batchItems || [];
    if (!batchItems.length || assessmentSession.submitting) return;
    const generation = assessmentGeneration.current;
    setAssessmentSession((current) => ({ ...current, submitting: true }));

    const results = [];
    let failure = '';
    let lastResolved = null;
    for (const entry of batchItems) {
      const optionId = String(answers?.[entry.attemptId] || '');
      if (!optionId) {
        failure = 'Every question needs an answer before the assessment can be completed.';
        break;
      }
      try {
        const result = await gradeStudyAssessment({ attemptId: entry.attemptId, optionId });
        if (assessmentGeneration.current !== generation) return;
        results.push({
          attemptId: entry.attemptId,
          prompt: entry.item.prompt,
          correct: result.correct,
          explanation: result.explanation || 'Answer recorded.',
        });
        lastResolved = { entry, optionId, result };
      } catch (error) {
        failure = error?.message || 'One or more answers could not be recorded.';
        break;
      }
    }

    if (lastResolved) {
      setAssessment({
        ...EMPTY_ASSESSMENT,
        status: 'graded',
        item: lastResolved.entry.item,
        attemptId: lastResolved.entry.attemptId,
        selectedOptionId: lastResolved.optionId,
        result: lastResolved.result,
      });
    }
    setAssessmentSession((current) => ({
      ...current,
      phase: 'summary',
      submitting: false,
      completed: results.length,
      correctCount: results.filter((entry) => entry.correct).length,
      results,
      error: failure || current.error,
    }));
  }, [assessmentSession.batchItems, assessmentSession.submitting]);

  const resetAssessmentSession = useCallback(() => {
    dispatchLoop({ type: 'ADVANCE' });
    setAssessment(EMPTY_ASSESSMENT);
    setAssessmentSession(emptyAssessmentSession());
  }, []);

  const handleAdvance = useCallback(() => {
    dispatchLoop({ type: 'ADVANCE' });
    setAssessment(EMPTY_ASSESSMENT);
    contextualSend(studyNextQuestionAsk(brief?.label), {
      visibleUserText: studyActionVisibleText('next', brief?.label),
    });
  }, [brief?.label, contextualSend]);

  const handleRemediation = useCallback((kind) => {
    if (kind === 'retry') {
      handleRequestAssessment({ explicitRetry: true });
      return;
    }
    const ask = kind === 'example' ? studyAnotherExampleAsk(brief?.label) : studyUsefulReferenceAsk(brief?.label);
    contextualSend(ask, {
      visibleUserText: studyActionVisibleText(kind === 'example' ? 'example' : 'reference', brief?.label),
    });
  }, [brief?.label, contextualSend, handleRequestAssessment]);

  if (!activeSessionId) return null;
  if (onboarding.status === 'loading' || !brief?.active) {
    return (
      <StudyHubLauncher
        key={`${activeSessionId}:hub`}
        topic=""
        ready={false}
        learnerModel={null}
        onAsk={onAsk}
        onSend={contextualSend}
      />
    );
  }
  return (
    <>
      <StudyTutorShell
        brief={brief}
        onAsk={onAsk}
        onSend={contextualSend}
        assessment={assessment}
        loop={loop}
        onRequestAssessment={handleRequestAssessment}
        onSubmitAssessment={handleSubmitAssessment}
        onAdvance={handleAdvance}
        onRemediation={handleRemediation}
      />
      <StudyHubLauncher
        key={`${activeSessionId}:${brief.conceptId}:hub`}
        topicKey={brief.conceptId}
        topic={brief.label}
        ready
        learnerModel={assessment?.result?.learnerModel || null}
        onAsk={onAsk}
        onSend={contextualSend}
      />
      {assessmentWorkspaceOpen ? (
        <StudyAssessmentWorkspace
          topic={brief.label}
          assessment={assessment}
          session={assessmentSession}
          onClose={() => setAssessmentWorkspaceOpen(false)}
          onStart={startAssessmentSession}
          onAnswer={answerAssessmentSession}
          onNext={nextAssessmentSessionQuestion}
          onSubmitBatch={submitAssessmentBatch}
          onReset={resetAssessmentSession}
        />
      ) : null}
      <StudyReinforcement result={assessment.result} />
    </>
  );
}