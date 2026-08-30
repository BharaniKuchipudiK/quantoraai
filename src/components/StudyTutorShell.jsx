import React, { useState } from 'react';
import { ArrowRight, Check, Lightbulb, RotateCcw, X } from 'lucide-react';
import StudyReinforcementCue from './StudyReinforcementCue.jsx';
import {
  studyActionVisibleText,
  studyExplainDifferentlyAsk,
  studyLessonAsk,
  studyPracticeAsk,
  studyQuizAsk,
  studyRealWorldAsk,
  studySketchChallengeAsk,
  studyTriviaAsk,
  studyVisualExplainAsk,
  studyWhereNextAsk,
} from '../lib/study-learning-resources.js';
import { studyAdaptiveStateLabel, studyAdaptiveTutorAsk } from '../lib/study-adaptive-tutor.js';

/**
 * Conversation-first Study shell.
 *
 * One compact learning beat: topic, evidence state, and learner-directed next
 * moves. Only a server-issued check expands here; richer work belongs in the
 * conversation rather than in a permanent tutor dashboard.
 */
export default function StudyTutorShell({
  brief,
  isLight,
  textColor,
  subtextColor,
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

  const topic = brief?.label || 'this topic';
  const gaps = brief?.gaps || [];
  const verifiedResult = assessment?.result || null;
  const learnerModel = verifiedResult?.learnerModel || null;
  const completedCheck = Boolean(loop?.completedQuestionIds?.length);

  const askOrSend = (text, action) => {
    const adaptiveText = studyAdaptiveTutorAsk(text, learnerModel);
    if (onSend) onSend(adaptiveText, { visibleUserText: studyActionVisibleText(action, topic) });
    else onAsk?.(adaptiveText);
  };

  const requestCheck = async (options) => {
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
  };

  const actionStyle = (primary = false) => ({
    border: primary
      ? '1px solid rgba(249,115,22,0.68)'
      : (isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.28)'),
    background: primary
      ? (isLight ? '#fff7ed' : 'rgba(249,115,22,0.14)')
      : (isLight ? '#fff' : 'rgba(15,23,42,0.38)'),
    color: textColor,
    borderRadius: '999px',
    padding: '7px 12px',
    fontSize: '0.76rem',
    fontWeight: 750,
    cursor: 'pointer',
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  });

  const iconButtonStyle = {
    border: 'none',
    background: 'transparent',
    color: subtextColor,
    width: '30px',
    height: '30px',
    borderRadius: '9px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  };

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
        style={{ maxWidth: '720px', margin: '0 auto 10px', display: 'flex' }}
      >
        <button
          type="button"
          onClick={() => setDismissed(false)}
          aria-label={`Reopen Study focus for ${topic}`}
          style={{
            ...actionStyle(false),
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: subtextColor,
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
      style={{ maxWidth: '720px', margin: '0 auto 6px', textAlign: 'left' }}
    >
      {/*
        A row, not a card. The boxed panel read as a separate surface sitting
        between the lesson and the composer. These are learner-directed next
        moves, so they stay lightweight and inline with the conversation.
      */}
      <section
        aria-label={`Study focus: ${topic}`}
        style={{ padding: '2px 2px 0' }}
      >
        <div
          data-quantora-study-next-choices="true"
          style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', alignItems: 'center', overflowX: 'auto', paddingBottom: '2px' }}
        >
          <span
            data-quantora-study-adaptive-state={adaptiveState || undefined}
            style={{
              color: subtextColor,
              fontSize: '0.74rem',
              maxWidth: '260px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <strong style={{ color: textColor }}>{topic}</strong> · {stateLabel}
          </span>
          <button type="button" onClick={() => askOrSend(studyLessonAsk(topic), 'lesson')} style={actionStyle(false)}>Explain</button>
          <button type="button" onClick={() => askOrSend(studyExplainDifferentlyAsk(topic), 'different')} style={actionStyle(false)}>Explain differently</button>
          <button type="button" onClick={() => askOrSend(studyVisualExplainAsk(topic), 'visual')} style={actionStyle(false)}>Show visually</button>
          <button type="button" onClick={() => askOrSend(studyRealWorldAsk(topic), 'real-world')} style={actionStyle(false)}>🌍 Real world</button>
          <button type="button" onClick={() => askOrSend(studyPracticeAsk(topic), 'practice')} style={actionStyle(false)}>🧩 Mini practice</button>
          <button type="button" onClick={() => askOrSend(studySketchChallengeAsk(topic), 'sketch')} style={actionStyle(false)}>🎨 Quick sketch</button>
          <button type="button" onClick={() => askOrSend(studyTriviaAsk(topic), 'trivia')} style={actionStyle(false)}>💡 Did you know?</button>
          <button type="button" onClick={() => askOrSend(studyWhereNextAsk(topic), 'where-next')} style={actionStyle(false)}>📚 Where next?</button>
          <button
            type="button"
            aria-label="Test me on this"
            disabled={assessment?.status === 'loading' || assessment?.status === 'grading' || verifiedResult?.correct}
            onClick={() => requestCheck({ explicitRetry: completedCheck })}
            style={{ ...actionStyle(true), opacity: ['loading', 'grading'].includes(assessment?.status) || verifiedResult?.correct ? 0.55 : 1 }}
          >
            {assessment?.status === 'loading' ? 'Preparing…' : assessment?.status === 'grading' ? 'Checking…' : verifiedResult?.correct ? 'Completed' : completedCheck ? 'Retry check' : 'Check'}
          </button>
          <button type="button" title="Close Study focus" aria-label="Close Study focus" onClick={() => setDismissed(true)} style={iconButtonStyle}>
            <X size={16} />
          </button>
        </div>

        {activity === 'check' && assessment?.item ? (
          <div
            data-quantora-study-verified-check="true"
            data-quantora-study-inline-activity="check"
            data-quantora-study-loop-phase={loop?.phase}
            style={{ marginTop: '8px', padding: '10px 11px', borderRadius: '11px', background: isLight ? '#f8fafc' : 'rgba(15,23,42,0.5)', border: isLight ? '1px solid #dbe4ee' : '1px solid rgba(148,163,184,0.22)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ color: isLight ? '#475569' : '#94a3b8', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>One quick check</div>
              <button type="button" aria-label="Close check" onClick={() => setActivity(null)} style={iconButtonStyle}><X size={14} /></button>
            </div>
            <div style={{ color: textColor, fontSize: '0.80rem', fontWeight: 650, lineHeight: 1.45, marginTop: '4px' }}>{assessment.item.prompt}</div>
            <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
              {(assessment.item.options || []).map((option) => (
                <button
                  type="button"
                  key={option.id}
                  disabled={assessment?.status === 'grading' || Boolean(assessment?.result)}
                  onClick={() => onSubmitAssessment?.(option.id)}
                  style={{
                    ...actionStyle(false),
                    textAlign: 'left',
                    borderRadius: '10px',
                    width: '100%',
                    borderColor: assessment?.selectedOptionId === option.id ? '#f97316' : undefined,
                    opacity: assessment?.result && assessment?.selectedOptionId !== option.id ? 0.62 : 1,
                  }}
                >
                  {option.text}
                </button>
              ))}
            </div>
            {assessment?.result ? (
              <div
                data-quantora-study-verified-result={assessment.result.correct ? 'correct' : 'incorrect'}
                className={assessment.result.correct ? 'study-resolution study-resolution--correct' : 'study-resolution'}
                style={{
                  marginTop: '9px',
                  padding: '9px 10px',
                  borderRadius: '10px',
                  color: textColor,
                  background: assessment.result.correct
                    ? (isLight ? '#ecfdf5' : 'rgba(6,95,70,0.18)')
                    : (isLight ? '#fffbeb' : 'rgba(120,53,15,0.16)'),
                  border: assessment.result.correct
                    ? (isLight ? '1px solid #a7f3d0' : '1px solid rgba(110,231,183,0.25)')
                    : (isLight ? '1px solid #fde68a' : '1px solid rgba(251,191,36,0.24)'),
                  fontSize: '0.76rem',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 800, color: assessment.result.correct ? (isLight ? '#047857' : '#6ee7b7') : (isLight ? '#92400e' : '#fcd34d') }}>
                  {assessment.result.correct ? <Check size={15} /> : <Lightbulb size={15} />}
                  {assessment.result.correct ? 'Answer verified.' : 'Good attempt — here is the key distinction.'}
                </div>
                <StudyReinforcementCue outcome={assessment.result} />
                {!assessment.result.correct && assessment?.selectedOptionId ? (
                  <div style={{ marginTop: '5px', color: subtextColor }}>
                    You chose “{assessment.item.options.find((option) => option.id === assessment.selectedOptionId)?.text}”.
                    {assessment.result.misconceptionSignal ? ' That points to a concept mix-up, not a careless miss.' : ' It is close, but it uses the wrong relationship here.'}
                  </div>
                ) : null}
                <div style={{ marginTop: '4px' }}>
                  <strong>Why:</strong> {assessment.result.explanation || stateLabel}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {assessment.result.correct ? (
                    <>
                      <button type="button" onClick={onAdvance} style={actionStyle(true)}>Next question <ArrowRight size={12} style={{ verticalAlign: '-2px' }} /></button>
                      <button type="button" onClick={() => requestCheck({ explicitRetry: true })} style={actionStyle(false)}>Retry this one</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => onRemediation?.('retry')} style={actionStyle(true)}><RotateCcw size={12} style={{ verticalAlign: '-2px' }} /> Retry</button>
                      <button type="button" onClick={() => onRemediation?.('example')} style={actionStyle(false)}>Another example</button>
                      <button type="button" onClick={() => onRemediation?.('reference')} style={actionStyle(false)}>Useful reference</button>
                    </>
                  )}
                </div>
              </div>
            ) : null}
            {/*
              The next move is the SERVER's decision, rendered verbatim.
              buildStudyLearnerModel runs behind the assessment endpoint and
              this shell never derives mastery or picks a move.

              Landed here ahead of the server that fills it. PR #362 adds the
              learnerModel field; until it merges this reads undefined and
              renders nothing, which is why it is safe in either order. It sits
              in this file because THIS file is the one that survives — #362
              writes the same five lines into StudyTutorBoard.jsx, which this PR
              deletes, and without a copy here that render is lost on whichever
              of the two merges second.
            */}
            {assessment?.result?.learnerModel?.nextLearningMove?.learnerFacingText ? (
              <div
                data-quantora-study-next-learning-move="true"
                style={{ marginTop: '4px', color: subtextColor, fontSize: '0.72rem', lineHeight: 1.45 }}
              >
                {assessment.result.learnerModel.nextLearningMove.learnerFacingText}
              </div>
            ) : null}
            {assessment?.error ? <div style={{ marginTop: '6px', color: isLight ? '#92400e' : '#fcd34d', fontSize: '0.72rem' }}>{assessment.error}</div> : null}
          </div>
        ) : null}

        {activity === 'check' && assessment?.status === 'error' ? (
          <div
            role="status"
            aria-live="polite"
            data-quantora-study-inline-activity="check-error"
            style={{ marginTop: '9px', padding: '10px 11px', borderRadius: '11px', background: isLight ? '#fff7ed' : 'rgba(124,45,18,0.18)', border: isLight ? '1px solid #fed7aa' : '1px solid rgba(251,146,60,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
          >
            <span style={{ color: subtextColor, fontSize: '0.75rem', lineHeight: 1.45 }}>{assessment.error}</span>
            <button type="button" aria-label="Close check" onClick={() => setActivity(null)} style={iconButtonStyle}><X size={14} /></button>
          </div>
        ) : null}

      </section>

    </div>
  );
}
