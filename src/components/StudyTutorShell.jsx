import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import StudyTutorBoard from './StudyTutorBoard.jsx';
import { gradeStudyCheck, studyCheckOutcomeFact } from '../lib/study-tutor-brief.js';
import { studyLessonAsk, studyQuizAsk } from '../lib/study-learning-resources.js';
import { miniPracticeFor } from '../lib/study-practice-desk.js';

/**
 * Conversation-first Study shell.
 *
 * The old Tutor Board remains available behind More, but it no longer owns the
 * screen. The default surface is one compact learning beat: topic, honest state,
 * three actions, and only the currently-active practice/check expanded below.
 */
export default function StudyTutorShell({
  brief,
  isLight,
  textColor,
  subtextColor,
  onAsk,
  onSend,
  onCheckOutcome,
  onEvidence,
  assessment,
  onRequestAssessment,
  onSubmitAssessment,
  lessonText = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activity, setActivity] = useState(null);
  const [localResult, setLocalResult] = useState(null);

  const topic = brief?.label || 'this topic';
  const check = brief?.check || null;
  const practice = useMemo(() => miniPracticeFor(brief?.conceptId, topic), [brief?.conceptId, topic]);
  const gaps = brief?.gaps || [];
  const competencies = brief?.competencies || [];
  const encouragement = brief?.encouragement || { glyph: '📗', text: 'One idea. Then one check.' };
  const progress = brief?.progress || { caption: 'No fake score. A filled bar only after a real check.' };
  const verifiedResult = assessment?.result || null;

  const askOrSend = (text) => {
    if (onSend) onSend(text);
    else onAsk?.(text);
  };

  const requestCheck = async () => {
    setLocalResult(null);
    setActivity('check');
    if (onRequestAssessment) {
      const outcome = await onRequestAssessment();
      if (!outcome?.fallback) return;
    }
    if (!check) askOrSend(studyQuizAsk(topic));
  };

  const submitLocal = (optionId) => {
    if (!check || localResult) return;
    const graded = gradeStudyCheck(check, optionId);
    if (!graded) return;
    setLocalResult(graded);
    if (graded.evidence) onEvidence?.(graded.evidence);
    const fact = studyCheckOutcomeFact(topic, graded.correct);
    if (fact) onCheckOutcome?.(fact);
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

  const stateLabel = verifiedResult
    ? (verifiedResult.correct ? 'Verified' : 'Gap found')
    : gaps.length
      ? `${gaps.length} to check`
      : 'Not checked yet';

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
      style={{ maxWidth: '720px', margin: '0 auto 12px', textAlign: 'left' }}
    >
      <section
        aria-label={`Study focus: ${topic}`}
        style={{
          border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.20)',
          background: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.64)',
          borderRadius: '14px',
          padding: '9px 10px',
          boxShadow: isLight ? '0 5px 18px rgba(15,23,42,0.05)' : '0 8px 24px rgba(0,0,0,0.14)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '36px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', minWidth: 0 }}>
              <strong
                style={{
                  color: textColor,
                  fontSize: '0.84rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {topic}
              </strong>
              <span style={{ color: subtextColor, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>· {stateLabel}</span>
            </div>
            <div
              data-quantora-study-gaps="true"
              style={{ color: subtextColor, fontSize: '0.70rem', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              Next: {brief?.next || 'One check, then decide the next move.'}
            </div>
          </div>

          <button type="button" title={expanded ? 'Collapse Study focus' : 'More Study tools'} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} style={iconButtonStyle}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button type="button" title="Close Study focus" aria-label="Close Study focus" onClick={() => setDismissed(true)} style={iconButtonStyle}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '7px' }}>
          <button type="button" onClick={() => askOrSend(studyLessonAsk(topic))} style={actionStyle(false)}>Explain</button>
          <button type="button" onClick={() => setActivity('practice')} style={actionStyle(false)}>Practice</button>
          <button
            type="button"
            aria-label="Test me on this"
            disabled={assessment?.status === 'loading' || assessment?.status === 'grading'}
            onClick={requestCheck}
            style={{ ...actionStyle(true), opacity: ['loading', 'grading'].includes(assessment?.status) ? 0.55 : 1 }}
          >
            {assessment?.status === 'loading' ? 'Preparing…' : assessment?.status === 'grading' ? 'Checking…' : 'Check'}
          </button>
          <button type="button" onClick={() => setExpanded((value) => !value)} style={actionStyle(false)}>
            {expanded ? 'Less' : 'More'}
          </button>
        </div>

        <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', color: subtextColor, fontSize: '0.68rem' }}>
          <span data-quantora-study-encouragement="true">{encouragement.glyph} {encouragement.text}</span>
          <span aria-hidden="true">·</span>
          <span>{verifiedResult?.correct ? 'Verified evidence recorded.' : progress.caption}</span>
          <span data-quantora-study-competencies="true" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span data-quantora-study-competency-active={competencies.length ? 'true' : 'false'}>
              {competencies.length ? `${competencies.length} skill signal${competencies.length === 1 ? '' : 's'}` : 'Skills not checked'}
            </span>
          </span>
        </div>

        {activity === 'practice' ? (
          <div
            data-quantora-study-inline-activity="practice"
            style={{ marginTop: '9px', padding: '10px 11px', borderRadius: '11px', background: isLight ? '#f8fafc' : 'rgba(2,6,23,0.34)', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.18)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <strong style={{ color: textColor, fontSize: '0.78rem' }}>{practice.title}</strong>
              <button type="button" aria-label="Close practice" onClick={() => setActivity(null)} style={iconButtonStyle}><X size={14} /></button>
            </div>
            <div style={{ color: subtextColor, fontSize: '0.75rem', lineHeight: 1.45 }}>{practice.setup}</div>
            <ol style={{ color: textColor, fontSize: '0.75rem', lineHeight: 1.45, margin: '6px 0 0', paddingLeft: '18px' }}>
              {practice.questions.slice(0, 3).map((question) => <li key={question}>{question}</li>)}
            </ol>
          </div>
        ) : null}

        {activity === 'check' && assessment?.item ? (
          <div
            data-quantora-study-verified-check="true"
            data-quantora-study-inline-activity="check"
            style={{ marginTop: '9px', padding: '10px 11px', borderRadius: '11px', background: isLight ? '#f0fdf4' : 'rgba(6,78,59,0.18)', border: isLight ? '1px solid #bbf7d0' : '1px solid rgba(110,231,183,0.25)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ color: isLight ? '#047857' : '#6ee7b7', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>Verified check</div>
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
                  style={{ ...actionStyle(false), textAlign: 'left', borderRadius: '10px', width: '100%' }}
                >
                  {option.text}
                </button>
              ))}
            </div>
            {assessment?.result ? (
              <div
                data-quantora-study-verified-result={assessment.result.correct ? 'correct' : 'incorrect'}
                style={{ marginTop: '8px', color: assessment.result.correct ? (isLight ? '#047857' : '#6ee7b7') : (isLight ? '#9f1239' : '#fb7185'), fontSize: '0.75rem', lineHeight: 1.45 }}
              >
                {assessment.result.correct ? 'Verified response recorded — the evidence ledger, not self-report, now informs mastery.' : 'Verified gap recorded — repair this idea, then try a changed example.'}
                {assessment.result.explanation ? ` ${assessment.result.explanation}` : ''}
              </div>
            ) : null}
            {assessment?.error ? <div style={{ marginTop: '6px', color: isLight ? '#9f1239' : '#fb7185', fontSize: '0.72rem' }}>{assessment.error}</div> : null}
          </div>
        ) : null}

        {activity === 'check' && !assessment?.item && check ? (
          <div
            data-quantora-study-inline-activity="check"
            style={{ marginTop: '9px', padding: '10px 11px', borderRadius: '11px', background: isLight ? '#fff7ed' : 'rgba(124,45,18,0.18)', border: isLight ? '1px solid #fed7aa' : '1px solid rgba(251,146,60,0.25)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <strong style={{ color: textColor, fontSize: '0.78rem' }}>{check.prompt}</strong>
              <button type="button" aria-label="Close check" onClick={() => setActivity(null)} style={iconButtonStyle}><X size={14} /></button>
            </div>
            <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
              {(check.options || []).map((option) => (
                <button
                  type="button"
                  key={option.id}
                  disabled={Boolean(localResult)}
                  onClick={() => submitLocal(option.id)}
                  style={{ ...actionStyle(false), textAlign: 'left', borderRadius: '10px', width: '100%' }}
                >
                  {option.text}
                </button>
              ))}
            </div>
            {localResult ? <div style={{ marginTop: '8px', color: subtextColor, fontSize: '0.75rem', lineHeight: 1.45 }}>{localResult.message}</div> : null}
          </div>
        ) : null}
      </section>

      {expanded ? (
        <div style={{ marginTop: '9px' }} data-quantora-study-focus-detail="true">
          <StudyTutorBoard
            brief={brief}
            isLight={isLight}
            textColor={textColor}
            subtextColor={subtextColor}
            lessonText={lessonText}
            onAsk={onAsk}
            onSend={onSend}
            onCheckOutcome={onCheckOutcome}
            onEvidence={onEvidence}
            assessment={assessment}
            onRequestAssessment={onRequestAssessment}
            onSubmitAssessment={onSubmitAssessment}
          />
        </div>
      ) : null}
    </div>
  );
}
