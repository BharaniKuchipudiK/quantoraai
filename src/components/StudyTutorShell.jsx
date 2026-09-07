import React, { useCallback, useState } from 'react';
import { ArrowRight, Check, Lightbulb, RotateCcw, X } from 'lucide-react';
import {
  studyActionVisibleText,
  studyLessonAsk,
  studyPracticeAsk,
  studyQuizAsk,
} from '../lib/study-learning-resources.js';
import { studyAdaptiveStateLabel, studyAdaptiveTutorAsk } from '../lib/study-adaptive-tutor.js';

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
