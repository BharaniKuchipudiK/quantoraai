import React, { useState } from 'react';
import { Download } from 'lucide-react';
import StudyFreeBodyDiagram from './StudyFreeBodyDiagram.jsx';
import { gradeStudyCheck, studyCheckOutcomeFact } from '../lib/study-tutor-brief.js';
import { isFreeBodyDiagramRelevant } from '../lib/study-free-body-diagram.js';
import {
  studyFlashcardAsk,
  studyLessonAsk,
  studyNotesAsk,
  studyQuizAsk,
  studyResourceLinks,
} from '../lib/study-learning-resources.js';
import {
  STUDY_COMPETENCY_TAGS,
} from '../lib/study-syllabus-overlay.js';
import {
  buildStudyNotesFile,
  downloadTextFile,
  miniPracticeFor,
  studyAnswerDebriefAsk,
  studyMiniPracticeAsk,
  studyRealWorldAsk,
  studyScheduleAsk,
} from '../lib/study-practice-desk.js';

function statusTone(status, isLight) {
  if (status === 'missing') return isLight ? '#9f1239' : '#fb7185';
  if (status === 'checked') return isLight ? '#047857' : '#6ee7b7';
  return isLight ? '#c2410c' : '#fdba74';
}

function ProgressMark({ ratio, isLight }) {
  const filled = Math.max(0, Math.min(1, Number(ratio) || 0));
  return (
    <svg viewBox="0 0 120 12" width="100%" height="12" aria-hidden="true" data-quantora-study-progress="true">
      <rect x="0" y="2" width="120" height="8" rx="4" fill={isLight ? '#e2e8f0' : 'rgba(148,163,184,0.25)'} />
      <rect x="0" y="2" width={Math.max(4, filled * 120)} height="8" rx="4" fill={filled >= 0.3 ? '#10b981' : '#f97316'} />
    </svg>
  );
}

/**
 * Personal tutor board: session chrome, syllabus nodes the learner named,
 * and honest checks. Not homework chat. Not an IDE.
 */
export default function StudyTutorBoard({
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
  const [showCheck, setShowCheck] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [cardIndex, setCardIndex] = useState(0);
  const [cardBack, setCardBack] = useState(false);
  const [result, setResult] = useState(null);
  const check = brief?.check || null;
  const topic = brief?.label || 'this idea';
  const resources = studyResourceLinks(topic);
  const cards = brief?.flashcards || [];
  const practice = miniPracticeFor(brief?.conceptId, topic);
  const encouragement = brief?.encouragement || { glyph: '📗', text: 'One idea. Then one check.' };
  const nodeStates = brief?.nodeStates || (brief?.nodes || []).map((node) => ({ node, status: 'unverified' }));
  const gaps = brief?.gaps || [];
  const competencies = brief?.competencies || [];
  const tagged = new Set(competencies.map((row) => row.tag));
  const overlayLabel = brief?.overlay?.label || '';
  const subjects = brief?.subjects || [];
  const showFreeBodyDiagram = isFreeBodyDiagramRelevant({ topic, subjects });
  const progress = brief?.progress || { ratio: 0, caption: 'No fake score. A filled bar only after a real check.' };
  const barRatio = progress.ratio;
  const verifiedResult = assessment?.result || null;
  const barCaption = verifiedResult?.correct
    ? 'Verified response recorded — the evidence ledger, not self-report, now informs mastery.'
    : verifiedResult
      ? 'Verified gap recorded — repair this idea, then try a changed example.'
      : result?.correct
    ? 'Practice answered — mastery changes only after verified evidence.'
    : result
      ? 'Gap found — repair the foundation this session named.'
      : progress.caption;

  const askOrSend = (text) => {
    if (onSend) onSend(text);
    else onAsk?.(text);
  };

  const chip = (label, onClick, enabled = true) => (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      style={{
        border: isLight ? '1px solid #fdba74' : '1px solid rgba(249,115,22,0.45)',
        background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)',
        color: textColor,
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.45,
      }}
    >
      {label}
    </button>
  );

  const pill = (text, tone) => (
    <span
      key={text}
      style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        borderRadius: '999px',
        padding: '4px 9px',
        color: tone,
        border: `1px solid ${tone}`,
        background: isLight ? '#fff' : 'rgba(15,23,42,0.45)',
      }}
    >
      {text}
    </span>
  );

  return (
    <div
      data-quantora-study-board="true"
      data-quantora-workspace-capabilities="education"
      style={{
        margin: '0 auto 16px auto',
        maxWidth: '720px',
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: '16px',
        background: isLight ? '#ffffff' : 'rgba(15,23,42,0.72)',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: subtextColor }}>
          Your tutor board
        </div>
        <button
          type="button"
          title="Download notes"
          onClick={() => downloadTextFile(
            `${String(topic).replace(/[^\w]+/g, '-').slice(0, 40) || 'study'}-notes.md`,
            buildStudyNotesFile({
              topic,
              foundation: brief.foundation,
              lessonText,
              studentAttempt: attempt,
            }),
          )}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            border: 'none',
            background: 'transparent',
            color: subtextColor,
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
        >
          <Download size={14} />
          Download
        </button>
      </div>
      <div
        data-quantora-study-encouragement="true"
        style={{
          marginTop: '10px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          padding: '10px 12px',
          borderRadius: '12px',
          background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '1.25rem', lineHeight: 1 }}>{encouragement.glyph}</span>
        <div style={{ fontSize: '0.82rem', fontWeight: 650, color: textColor, lineHeight: 1.45 }}>
          {encouragement.text}
        </div>
      </div>
      <div style={{ marginTop: '10px', fontSize: '0.92rem', fontWeight: 700, color: textColor }}>
        {brief.label || 'What are we strengthening?'}
      </div>
      {overlayLabel || subjects.length ? (
        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {overlayLabel ? pill(overlayLabel, isLight ? '#c2410c' : '#fdba74') : null}
          {subjects.map((subject) => pill(subject, isLight ? '#0369a1' : '#7dd3fc'))}
        </div>
      ) : null}
      {brief.foundation ? (
        <div style={{ marginTop: '4px', fontSize: '0.8rem', color: subtextColor }}>
          Foundation under this: {brief.foundation}
        </div>
      ) : null}
      {brief.figureUrl ? (
        <figure data-quantora-study-figure="true" style={{ margin: '12px 0 0' }}>
          <img
            src={brief.figureUrl}
            alt={brief.label ? `Figure for ${brief.label}` : 'Session figure'}
            style={{
              width: '100%',
              maxHeight: '220px',
              objectFit: 'contain',
              borderRadius: '12px',
              border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.25)',
              background: isLight ? '#f8fafc' : 'rgba(15,23,42,0.55)',
            }}
          />
        </figure>
      ) : null}
      {showFreeBodyDiagram ? (
        <StudyFreeBodyDiagram isLight={isLight} textColor={textColor} subtextColor={subtextColor} />
      ) : null}
      <div style={{ marginTop: '12px' }}>
        <ProgressMark ratio={barRatio} isLight={isLight} />
      </div>
      <div style={{ marginTop: '6px', fontSize: '0.72rem', color: subtextColor }}>
        {barCaption}
      </div>
      {nodeStates.length ? (
        <div data-quantora-study-nodes="true" style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {nodeStates.map((row) => {
            const status = row.status || 'unverified';
            return pill(status === 'missing' ? `${row.node} · missing` : `${row.node} · ${status}`, statusTone(status, isLight));
          })}
        </div>
      ) : null}
      <div data-quantora-study-competencies="true" style={{ marginTop: '10px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: subtextColor }}>
          How this idea is tested
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
          {STUDY_COMPETENCY_TAGS.map((tag) => (
            <span
              key={tag}
              data-quantora-study-competency={tag}
              data-quantora-study-competency-active={tagged.has(tag) ? 'true' : 'false'}
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                borderRadius: '999px',
                padding: '4px 8px',
                opacity: tagged.has(tag) ? 1 : 0.45,
                color: textColor,
                border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.3)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div data-quantora-study-gaps="true" style={{ marginTop: '10px', fontSize: '0.78rem', color: subtextColor, lineHeight: 1.45 }}>
        {gaps.length
          ? `Unverified or missing: ${gaps.map((row) => row.node).join(', ')}.`
          : (brief.label ? 'No gap list yet — a check this session is how a node leaves unverified.' : 'Name a topic or paste chapters to build a gap list.')}
      </div>
      <div style={{ marginTop: '8px', fontSize: '0.8rem', fontWeight: 600, color: isLight ? '#c2410c' : '#fdba74' }}>
        Next: {brief.next}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        {chip('Explain', () => askOrSend(studyLessonAsk(topic)))}
        {chip('Practise', () => { setShowPractice(true); askOrSend(studyMiniPracticeAsk(topic, practice)); })}
        {chip('Plan', () => askOrSend(studyScheduleAsk(topic)))}
        {chip('Review', () => { setShowCards(true); setCardIndex(0); setCardBack(false); })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
        {chip('Real world', () => askOrSend(studyRealWorldAsk(topic)))}
        {chip('Mini practice', () => { setShowPractice(true); askOrSend(studyMiniPracticeAsk(topic, practice)); })}
        {chip('Schedule', () => askOrSend(studyScheduleAsk(topic)))}
        {chip('Quiz', () => askOrSend(studyQuizAsk(topic)))}
        {chip('Flashcards', () => { setShowCards(true); setCardIndex(0); setCardBack(false); askOrSend(studyFlashcardAsk(topic)); })}
        {chip('Notes', () => askOrSend(studyNotesAsk(topic)))}
        {chip('I got this wrong…', () => onAsk?.('I got this question wrong: '))}
        {chip(assessment?.status === 'loading' ? 'Preparing verified check…' : 'Test me on this', async () => {
          if (onRequestAssessment) {
            const outcome = await onRequestAssessment();
            if (!outcome?.fallback) return;
          }
          if (check) {
            setResult(null);
            setShowCheck(true);
            return;
          }
          askOrSend(studyQuizAsk(topic));
        }, !['loading', 'grading'].includes(assessment?.status))}
      </div>
      <div style={{ marginTop: '14px' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: subtextColor }}>
          Learn with
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
          {resources.map((resource) => (
            <a
              key={resource.id}
              href={resource.href}
              target="_blank"
              rel="noreferrer"
              title={resource.why}
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: isLight ? '#c2410c' : '#fdba74',
                textDecoration: 'none',
                border: isLight ? '1px solid #fed7aa' : '1px solid rgba(251,146,60,0.35)',
                borderRadius: '999px',
                padding: '6px 10px',
              }}
            >
              {resource.label}
            </a>
          ))}
        </div>
        <div style={{ marginTop: '6px', fontSize: '0.72rem', color: subtextColor, lineHeight: 1.4 }}>
          Official search pages — not a made-up video. NotebookLM is for your PDF or podcast; paste the key points back here and I will quiz you.
        </div>
      </div>
      {showPractice ? (
        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '12px', border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.25)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: textColor }}>{practice.title}</div>
          <div style={{ marginTop: '6px', fontSize: '0.82rem', color: subtextColor, lineHeight: 1.5 }}>{practice.setup}</div>
          <ol style={{ margin: '8px 0 0', paddingLeft: '18px', color: textColor, fontSize: '0.82rem', lineHeight: 1.5 }}>
            {practice.questions.map((question) => <li key={question}>{question}</li>)}
          </ol>
          <div style={{ marginTop: '8px', fontSize: '0.72rem', color: subtextColor }}>Answers stay hidden. Write your attempt. I will wait.</div>
          <textarea
            value={attempt}
            onChange={(event) => setAttempt(event.target.value)}
            placeholder="Your working and answers…"
            rows={4}
            style={{
              width: '100%',
              marginTop: '8px',
              resize: 'vertical',
              borderRadius: '10px',
              border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.3)',
              background: isLight ? '#f8fafc' : 'rgba(15,23,42,0.55)',
              color: textColor,
              padding: '8px 10px',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={() => {
              const text = studyAnswerDebriefAsk({
                topic,
                setup: practice.setup,
                questions: practice.questions,
                studentAnswer: attempt,
              });
              askOrSend(text);
            }}
            disabled={!String(attempt).trim()}
            style={{
              marginTop: '8px',
              border: 'none',
              background: String(attempt).trim() ? '#ea580c' : (isLight ? '#e2e8f0' : '#334155'),
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: String(attempt).trim() ? 'pointer' : 'default',
            }}
          >
            Check my attempt
          </button>
        </div>
      ) : null}
      {showCards && cards.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            if (cardBack) {
              setCardBack(false);
              setCardIndex((index) => (index + 1) % cards.length);
            } else {
              setCardBack(true);
            }
          }}
          style={{
            marginTop: '12px',
            width: '100%',
            textAlign: 'left',
            padding: '12px 14px',
            borderRadius: '12px',
            border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.25)',
            background: isLight ? '#fffbeb' : 'rgba(120, 53, 15, 0.22)',
            color: textColor,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: subtextColor, textTransform: 'uppercase' }}>
            Flashcard {cardIndex + 1} / {cards.length} · tap to {cardBack ? 'next' : 'reveal'}
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.88rem', fontWeight: 650, lineHeight: 1.45 }}>
            {cardBack ? cards[cardIndex].back : cards[cardIndex].front}
          </div>
        </button>
      ) : null}
      {assessment?.item ? (
        <div data-quantora-study-verified-check="true" style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isLight ? '#047857' : '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Server-graded check
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.85rem', fontWeight: 650, color: textColor, lineHeight: 1.45 }}>
            {assessment.item.prompt}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {assessment.item.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={assessment.status === 'grading' || Boolean(assessment.result)}
                onClick={() => onSubmitAssessment?.(option.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.25)',
                  background: isLight ? '#f8fafc' : 'rgba(15,23,42,0.5)',
                  color: textColor,
                  cursor: assessment.result ? 'default' : 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                {option.text}
              </button>
            ))}
          </div>
          {assessment.status === 'grading' ? (
            <div style={{ marginTop: '8px', fontSize: '0.78rem', color: subtextColor }}>Grading on the server…</div>
          ) : null}
          {assessment.result ? (
            <div data-quantora-study-verified-result={assessment.result.correct ? 'correct' : 'incorrect'} style={{ marginTop: '10px', fontSize: '0.82rem', lineHeight: 1.45, color: assessment.result.correct ? (isLight ? '#047857' : '#6ee7b7') : textColor }}>
              <strong>{assessment.result.correct ? 'Verified.' : 'Not yet.'}</strong> {assessment.result.explanation}
              <div style={{ marginTop: '4px', color: subtextColor }}>
                {assessment.result.mastery?.learningState === 'misconception_detected'
                  ? 'A likely misconception was recorded for targeted repair.'
                  : 'This independently graded attempt was added to your evidence history.'}
              </div>
              {assessment.result.learnerModel?.nextLearningMove?.learnerFacingText ? (
                <div data-quantora-study-next-learning-move="true" style={{ marginTop: '4px', color: subtextColor }}>
                  {assessment.result.learnerModel.nextLearningMove.learnerFacingText}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {assessment?.status === 'error' && assessment.error ? (
        <div role="status" style={{ marginTop: '10px', fontSize: '0.78rem', color: isLight ? '#b45309' : '#fbbf24' }}>
          {assessment.error} Nothing was counted.
        </div>
      ) : null}
      {showCheck && check ? (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 650, color: textColor, lineHeight: 1.45 }}>{check.prompt}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {check.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  const graded = gradeStudyCheck(check, option.id);
                  setResult(graded);
                  if (graded?.evidence && onEvidence) {
                    onEvidence(graded.evidence);
                  }
                  if (graded && onCheckOutcome) {
                    onCheckOutcome(studyCheckOutcomeFact(topic, graded.correct));
                  }
                }}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.25)',
                  background: result && option.correct ? (isLight ? '#ecfdf5' : 'rgba(16,185,129,0.15)') : (isLight ? '#f8fafc' : 'rgba(15,23,42,0.5)'),
                  color: textColor,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                {option.text}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {result ? (
        <div style={{ marginTop: '10px', fontSize: '0.82rem', lineHeight: 1.45, color: result.correct ? (isLight ? '#047857' : '#6ee7b7') : textColor }}>
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
