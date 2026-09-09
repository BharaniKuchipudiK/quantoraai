import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  History,
  ListChecks,
  Rows3,
  X,
} from 'lucide-react';
import { recordStudyAnswerChange } from '../lib/study-learning-interactions.js';
import StudyAssessmentHistory from './StudyAssessmentHistory.jsx';
import './study-assessment-workspace.css';

const COUNT_CHOICES = [5, 10, 20];

function clampCount(value) {
  const number = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(number)) return 5;
  return Math.max(1, Math.min(20, number));
}

function ChoiceCard({ active, disabled = false, icon: Icon, title, detail, onClick }) {
  return (
    <button
      type="button"
      className={`study-assessment-choice${active ? ' study-assessment-choice--active' : ''}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="study-assessment-choice__icon" aria-hidden="true"><Icon size={18} /></span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

function Setup({ topic, onStart, onHistory }) {
  const [countChoice, setCountChoice] = useState(5);
  const [customCount, setCustomCount] = useState('');
  const [presentation, setPresentation] = useState('one_at_a_time');
  const [feedback, setFeedback] = useState('after_each');
  const questionCount = customCount ? clampCount(customCount) : countChoice;

  const choosePresentation = (next) => {
    setPresentation(next);
    if (next === 'all_at_once') setFeedback('at_end');
  };

  return (
    <div data-quantora-study-assessment-setup="true">
      <div className="study-assessment-workspace__intro">
        <div>
          <span className="study-assessment-workspace__eyebrow">Verified assessment</span>
          <h2>{topic}</h2>
          <p>Build a reviewed MCQ session. Only server-graded questions can affect verified learning evidence.</p>
        </div>
        <button type="button" className="study-h1-action" onClick={onHistory}>
          <History size={14} aria-hidden="true" /> History
        </button>
      </div>

      <section className="study-assessment-config" aria-labelledby="assessment-format-title">
        <h3 id="assessment-format-title">Question format</h3>
        <div className="study-assessment-grid study-assessment-grid--two">
          <ChoiceCard
            active
            icon={ListChecks}
            title="MCQ"
            detail="Reviewed single-answer questions"
            onClick={() => {}}
          />
        </div>
      </section>

      <section className="study-assessment-config" aria-labelledby="assessment-count-title">
        <h3 id="assessment-count-title">How many questions?</h3>
        <div className="study-assessment-counts">
          {COUNT_CHOICES.map((count) => (
            <button
              type="button"
              key={count}
              aria-pressed={!customCount && countChoice === count}
              className={!customCount && countChoice === count ? 'study-assessment-pill study-assessment-pill--active' : 'study-assessment-pill'}
              onClick={() => {
                setCustomCount('');
                setCountChoice(count);
              }}
            >
              {count}
            </button>
          ))}
          <label className="study-assessment-custom-count">
            <span>Custom</span>
            <input
              aria-label="Custom question count"
              type="number"
              min="1"
              max="20"
              inputMode="numeric"
              value={customCount}
              placeholder="1–20"
              onChange={(event) => setCustomCount(event.target.value)}
            />
          </label>
        </div>
        <p className="study-assessment-config__hint">Quantora will stop earlier if the reviewed bank has fewer fresh questions.</p>
      </section>

      <section className="study-assessment-config" aria-labelledby="assessment-presentation-title">
        <h3 id="assessment-presentation-title">How should questions appear?</h3>
        <div className="study-assessment-grid study-assessment-grid--two">
          <ChoiceCard
            active={presentation === 'one_at_a_time'}
            icon={ClipboardCheck}
            title="One at a time"
            detail="Answer, then move to the next question"
            onClick={() => choosePresentation('one_at_a_time')}
          />
          <ChoiceCard
            active={presentation === 'all_at_once'}
            icon={Rows3}
            title="All at once"
            detail="See every available reviewed question, then submit together"
            onClick={() => choosePresentation('all_at_once')}
          />
        </div>
      </section>

      <section className="study-assessment-config" aria-labelledby="assessment-feedback-title">
        <h3 id="assessment-feedback-title">When should feedback appear?</h3>
        <div className="study-assessment-grid study-assessment-grid--two">
          <ChoiceCard
            disabled={presentation === 'all_at_once'}
            active={feedback === 'after_each'}
            icon={CheckCircle2}
            title="After each question"
            detail={presentation === 'all_at_once' ? 'All-at-once sessions are assessed after submit' : 'See the verdict and explanation immediately'}
            onClick={() => setFeedback('after_each')}
          />
          <ChoiceCard
            active={feedback === 'at_end'}
            icon={ClipboardCheck}
            title="At the end"
            detail="Keep outcomes hidden until the session summary"
            onClick={() => setFeedback('at_end')}
          />
        </div>
      </section>

      <div className="study-assessment-workspace__footer">
        <div>
          <strong>{questionCount} question{questionCount === 1 ? '' : 's'}</strong>
          <span> · Verified MCQ · {presentation === 'all_at_once' ? 'All at once' : 'One at a time'}</span>
        </div>
        <button
          type="button"
          className="study-h1-action study-h1-action--primary"
          onClick={() => onStart({ questionCount, presentation, feedback })}
        >
          Start assessment
        </button>
      </div>
    </div>
  );
}

function Running({ assessment, session, onAnswer, onNext }) {
  const item = assessment?.item || null;
  const result = assessment?.result || null;
  const currentNumber = Math.min(session.completed + 1, session.targetCount);
  const immediateFeedback = session.feedback === 'after_each';
  const busy = assessment?.status === 'grading' || assessment?.status === 'loading';

  if (!item) {
    return (
      <div className="study-assessment-workspace__state" role="status">
        <ClipboardCheck size={22} aria-hidden="true" />
        <strong>{session.error || 'Preparing the next reviewed question…'}</strong>
      </div>
    );
  }

  return (
    <div data-quantora-study-assessment-running="one_at_a_time">
      <div className="study-assessment-progress">
        <span>Question {currentNumber} of {session.targetCount}</span>
        <span>{session.completed} answered</span>
      </div>
      <div className="study-assessment-question">
        <h3>{item.prompt}</h3>
        <div className="study-assessment-options">
          {(item.options || []).map((option) => (
            <button
              type="button"
              key={option.id}
              disabled={busy || Boolean(result)}
              aria-pressed={assessment?.selectedOptionId === option.id}
              onClick={() => onAnswer(option.id)}
            >
              <span>{option.id.toUpperCase()}</span>
              {option.text}
            </button>
          ))}
        </div>
      </div>

      {result ? (
        <div className="study-assessment-answer-state">
          {immediateFeedback ? (
            <>
              <strong>{result.correct ? 'Correct' : 'Needs review'}</strong>
              <p>{result.explanation || 'Answer recorded.'}</p>
            </>
          ) : (
            <>
              <strong>Answer recorded</strong>
              <p>The verdict stays hidden until the end of this assessment.</p>
            </>
          )}
          <button type="button" className="study-h1-action study-h1-action--primary" onClick={onNext}>
            {session.completed >= session.targetCount ? 'View results' : 'Next question'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BatchRunning({ session, onSubmit, topic }) {
  const [answers, setAnswers] = useState({});
  const items = session.batchItems || [];
  const answered = Object.keys(answers).filter((attemptId) => answers[attemptId]).length;
  const complete = items.length > 0 && answered === items.length;

  const chooseAnswer = (entry, optionId) => {
    recordStudyAnswerChange({
      previousChoiceId: answers[entry.attemptId],
      nextChoiceId: optionId,
      source: 'assessment_batch',
      conceptId: entry.item?.conceptKey,
      conceptLabel: topic,
      attemptId: entry.attemptId,
    });
    setAnswers((current) => ({ ...current, [entry.attemptId]: optionId }));
  };

  return (
    <div data-quantora-study-assessment-running="all_at_once">
      <div className="study-assessment-progress">
        <span>{items.length} reviewed question{items.length === 1 ? '' : 's'}</span>
        <span>{answered} answered</span>
      </div>
      <div className="study-assessment-batch">
        {items.map((entry, index) => (
          <section className="study-assessment-question" key={entry.attemptId} aria-labelledby={`assessment-batch-q-${index}`}>
            <span className="study-assessment-workspace__eyebrow">Question {index + 1}</span>
            <h3 id={`assessment-batch-q-${index}`}>{entry.item.prompt}</h3>
            <div className="study-assessment-options">
              {(entry.item.options || []).map((option) => (
                <button
                  type="button"
                  key={option.id}
                  disabled={session.submitting}
                  aria-pressed={answers[entry.attemptId] === option.id}
                  onClick={() => chooseAnswer(entry, option.id)}
                >
                  <span>{option.id.toUpperCase()}</span>
                  {option.text}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="study-assessment-workspace__footer">
        <span>Feedback appears after all answers are submitted.</span>
        <button
          type="button"
          className="study-h1-action study-h1-action--primary"
          disabled={!complete || session.submitting}
          onClick={() => onSubmit(answers)}
        >
          {session.submitting ? 'Assessing…' : 'Submit all answers'}
        </button>
      </div>
    </div>
  );
}

function Summary({ session, onRestart, onHistory }) {
  const percent = session.completed > 0 ? Math.round((session.correctCount / session.completed) * 100) : 0;
  return (
    <div data-quantora-study-assessment-summary="true">
      <div className="study-assessment-summary__hero">
        <span className="study-assessment-workspace__eyebrow">Assessment complete</span>
        <strong>{session.correctCount}/{session.completed}</strong>
        <span>{percent}% correct</span>
        {session.error ? <p role="status">{session.error}</p> : null}
        {!session.error && session.completed < session.targetCount ? (
          <p>The reviewed bank had {session.completed} fresh question{session.completed === 1 ? '' : 's'} available for this topic.</p>
        ) : null}
      </div>

      <div className="study-assessment-summary__review">
        {session.results.map((entry, index) => (
          <article key={`${entry.attemptId}:${index}`}>
            <div>
              <span>Q{index + 1}</span>
              <strong>{entry.correct ? 'Correct' : 'Needs review'}</strong>
            </div>
            <p>{entry.prompt}</p>
            <small>{entry.explanation}</small>
          </article>
        ))}
      </div>

      <div className="study-assessment-workspace__footer">
        <button type="button" className="study-h1-action" onClick={onHistory}>
          <History size={14} aria-hidden="true" /> Assessment history
        </button>
        <button type="button" className="study-h1-action study-h1-action--primary" onClick={onRestart}>
          New assessment
        </button>
      </div>
    </div>
  );
}

export default function StudyAssessmentWorkspace({
  topic,
  assessment,
  session,
  onClose,
  onStart,
  onAnswer,
  onNext,
  onSubmitBatch,
  onReset,
}) {
  const [view, setView] = useState('assessment');
  const label = useMemo(() => String(topic || 'this topic').trim(), [topic]);

  return (
    <div className="study-assessment-backdrop" data-quantora-study-assessment-workspace="true">
      <section className="study-assessment-workspace" role="dialog" aria-modal="true" aria-labelledby="quantora-study-assessment-title">
        <header className="study-assessment-workspace__header">
          <div>
            <span className="study-assessment-workspace__eyebrow">Study</span>
            <h1 id="quantora-study-assessment-title">Assessment</h1>
          </div>
          <button type="button" className="study-h1-icon-button" aria-label="Close Assessment" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        {view === 'history' ? (
          <StudyAssessmentHistory onClose={() => setView('assessment')} backLabel="Back to Assessment" />
        ) : session.phase === 'setup' ? (
          <Setup topic={label} onStart={onStart} onHistory={() => setView('history')} />
        ) : session.phase === 'batch' ? (
          <BatchRunning session={session} onSubmit={onSubmitBatch} topic={label} />
        ) : session.phase === 'running' || session.phase === 'loading' ? (
          <Running assessment={assessment} session={session} onAnswer={onAnswer} onNext={onNext} />
        ) : (
          <Summary session={session} onRestart={onReset} onHistory={() => setView('history')} />
        )}
      </section>
    </div>
  );
}
