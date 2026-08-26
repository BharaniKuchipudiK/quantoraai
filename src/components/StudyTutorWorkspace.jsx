import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StudyTutorBoard from './StudyTutorBoard.jsx';
import { getChatDisplayText } from '../lib/build-communication.js';
import { deriveStudyTutorBrief } from '../lib/study-tutor-brief.js';
import {
  createStudyEvidenceEventKey,
  gradeStudyAssessment,
  recordStudySelfConfidenceEvidence,
  requestStudyAssessment,
} from '../lib/study-evidence-client.js';

/**
 * Persistent Study feature boundary. It is intentionally a sibling of the chat
 * feed, so streaming a new message cannot unmount an in-progress learner task.
 */
export default function StudyTutorWorkspace({
  activeSessionId,
  conversationContext,
  messages,
  updateActiveSession,
  isLight,
  textColor,
  subtextColor,
  onAsk,
  onSend,
}) {
  const [assessment, setAssessment] = useState({ status: 'idle', item: null, attemptId: '', result: null, error: '' });
  const brief = useMemo(
    () => deriveStudyTutorBrief({ conversationContext, messages }),
    [conversationContext, messages],
  );
  const lessonText = useMemo(() => {
    const lastAiMessage = [...(messages || [])].reverse()
      .find((message) => message.sender === 'ai' && message.type !== 'greeting');
    return getChatDisplayText(lastAiMessage?.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '') || '');
  }, [messages]);

  useEffect(() => {
    setAssessment({ status: 'idle', item: null, attemptId: '', result: null, error: '' });
  }, [activeSessionId, brief?.conceptId]);

  const handleCheckOutcome = useCallback((fact) => {
    const line = String(fact || '').trim();
    if (!line) return;
    const facts = conversationContext?.facts || [];
    if (facts.some((row) => String(row).toLowerCase() === line.toLowerCase())) return;
    updateActiveSession({
      conversationContext: {
        ...(conversationContext || {}),
        facts: [...facts, line],
      },
    });
  }, [conversationContext, updateActiveSession]);

  const handleEvidence = useCallback((evidence) => {
    if (evidence?.kind !== 'self_confidence' || !brief?.conceptId || !activeSessionId) return;
    void recordStudySelfConfidenceEvidence({
      eventKey: createStudyEvidenceEventKey({ sessionId: activeSessionId, conceptId: brief.conceptId }),
      conceptId: brief.conceptId,
      conceptLabel: brief.label,
      sessionId: activeSessionId,
      selfConfidence: evidence.selfConfidence,
    }).catch((error) => {
      // Storage failure never blocks practice and never becomes a local pass.
      if (!error?.requiresAuth) console.warn('Study evidence sync failed:', error?.message || error);
    });
  }, [activeSessionId, brief?.conceptId, brief?.label]);

  const handleRequestAssessment = useCallback(async () => {
    if (!brief?.conceptId || !activeSessionId) return { fallback: true };
    setAssessment({ status: 'loading', item: null, attemptId: '', result: null, error: '' });
    try {
      const issued = await requestStudyAssessment({
        conceptId: brief.conceptId,
        conceptLabel: brief.label,
        sessionId: activeSessionId,
      });
      setAssessment({ status: 'ready', item: issued.item, attemptId: issued.attemptId, result: null, error: '' });
      return { fallback: false };
    } catch (error) {
      if (error?.fallbackAllowed) {
        setAssessment({ status: 'idle', item: null, attemptId: '', result: null, error: '' });
        return { fallback: true };
      }
      setAssessment({ status: 'error', item: null, attemptId: '', result: null, error: error?.message || 'Verified check unavailable.' });
      return { fallback: false };
    }
  }, [activeSessionId, brief?.conceptId, brief?.label]);

  const handleSubmitAssessment = useCallback(async (optionId) => {
    if (!assessment.attemptId || assessment.status === 'grading' || assessment.result) return;
    setAssessment((current) => ({ ...current, status: 'grading', error: '' }));
    try {
      const result = await gradeStudyAssessment({ attemptId: assessment.attemptId, optionId });
      setAssessment((current) => ({ ...current, status: 'graded', result, error: '' }));
    } catch (error) {
      setAssessment((current) => ({ ...current, status: 'error', error: error?.message || 'Answer not recorded.' }));
    }
  }, [assessment.attemptId, assessment.result, assessment.status]);

  if (!brief?.active) return null;
  return (
    <StudyTutorBoard
      key={`${activeSessionId}:${brief.conceptId}`}
      brief={brief}
      isLight={isLight}
      textColor={textColor}
      subtextColor={subtextColor}
      lessonText={lessonText}
      onAsk={onAsk}
      onSend={onSend}
      onCheckOutcome={handleCheckOutcome}
      onEvidence={handleEvidence}
      assessment={assessment}
      onRequestAssessment={handleRequestAssessment}
      onSubmitAssessment={handleSubmitAssessment}
    />
  );
}
