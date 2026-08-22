import React, { useState } from 'react';
import { gradeStudyCheck } from '../lib/study-tutor-brief.js';
import {
  studyFlashcardAsk,
  studyLessonAsk,
  studyNotesAsk,
  studyQuizAsk,
  studyResourceLinks,
} from '../lib/study-learning-resources.js';

/**
 * Personal tutor board: one concept, real checks, flashcards, and honest
 * links to Khan / SWAYAM / PW / YouTube search. Not homework chat. Not an IDE.
 */
export default function StudyTutorBoard({
  brief,
  isLight,
  textColor,
  subtextColor,
  onAsk,
}) {
  const [showCheck, setShowCheck] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardBack, setCardBack] = useState(false);
  const [result, setResult] = useState(null);
  const check = brief?.check || null;
  const topic = brief?.label || 'this idea';
  const resources = studyResourceLinks(topic);
  const cards = brief?.flashcards || [];

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
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: subtextColor }}>
        Your tutor board
      </div>
      <div style={{ marginTop: '8px', fontSize: '0.92rem', fontWeight: 700, color: textColor }}>
        {brief.label || 'What are we strengthening?'}
      </div>
      {brief.foundation ? (
        <div style={{ marginTop: '4px', fontSize: '0.8rem', color: subtextColor }}>
          Foundation under this: {brief.foundation}
        </div>
      ) : null}
      <div style={{
        marginTop: '10px',
        height: '8px',
        borderRadius: '999px',
        background: isLight ? '#e2e8f0' : 'rgba(148,163,184,0.25)',
        overflow: 'hidden',
      }}
      >
        <div style={{
          width: result?.correct ? '40%' : result ? '12%' : brief.label ? '20%' : '6%',
          height: '100%',
          background: result?.correct ? '#10b981' : '#f97316',
        }}
        />
      </div>
      <div style={{ marginTop: '6px', fontSize: '0.72rem', color: subtextColor }}>
        {result?.correct ? 'Check passed — not an exam rank.' : result ? 'Gap found — repair the foundation.' : 'No fake score. A filled bar only after a real check.'}
      </div>
      <div style={{ marginTop: '8px', fontSize: '0.8rem', fontWeight: 600, color: isLight ? '#c2410c' : '#fdba74' }}>
        Next: {brief.next}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        {chip('Explain', () => onAsk?.(studyLessonAsk(topic)))}
        {chip('Practise', () => onAsk?.(studyQuizAsk(topic)))}
        {chip('Plan', () => onAsk?.(`Make a short study plan for ${topic}: foundation first, then this idea, then one mixed check. No fake timetable.`))}
        {chip('Review', () => { setShowCards(true); setCardIndex(0); setCardBack(false); })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
        {chip('Quiz', () => onAsk?.(studyQuizAsk(topic)))}
        {chip('Flashcards', () => { setShowCards(true); setCardIndex(0); setCardBack(false); onAsk?.(studyFlashcardAsk(topic)); })}
        {chip('Notes', () => onAsk?.(studyNotesAsk(topic)))}
        {chip('I got this wrong…', () => onAsk?.('I got this question wrong: '))}
        {chip('Test me on this', () => { setResult(null); setShowCheck(true); }, Boolean(check))}
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
      {showCheck && check ? (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 650, color: textColor, lineHeight: 1.45 }}>{check.prompt}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {check.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setResult(gradeStudyCheck(check, option.id))}
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
