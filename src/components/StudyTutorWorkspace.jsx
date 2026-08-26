import React, { useCallback, useMemo } from 'react';
import StudyTutorBoard from './StudyTutorBoard.jsx';
import { getChatDisplayText } from '../lib/build-communication.js';
import { deriveStudyTutorBrief } from '../lib/study-tutor-brief.js';
import {
  createStudyEvidenceEventKey,
  recordStudySelfConfidenceEvidence,
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
  const brief = useMemo(
    () => deriveStudyTutorBrief({ conversationContext, messages }),
    [conversationContext, messages],
  );
  const lessonText = useMemo(() => {
    const lastAiMessage = [...(messages || [])].reverse()
      .find((message) => message.sender === 'ai' && message.type !== 'greeting');
    return getChatDisplayText(lastAiMessage?.text?.replace(/<!--\s*quantora-[\s\S]*?-->/g, '') || '');
  }, [messages]);

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
    />
  );
}
