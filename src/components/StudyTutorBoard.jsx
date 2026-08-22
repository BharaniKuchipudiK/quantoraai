import React, { useState } from 'react';
import { gradeStudyCheck } from '../lib/study-tutor-brief.js';

/**
 * Personal tutor board: one concept, one real check, repair the foundation.
 * Not homework chat. Not a coding studio. Not an official IIT/NEET score.
 */
export default function StudyTutorBoard({
  brief,
  isLight,
  textColor,
  subtextColor,
  onAsk,
}) {
  const [showCheck, setShowCheck] = useState(false);
  const [result, setResult] = useState(null);
  const check = brief?.check || null;

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
        {chip('I got this wrong…', () => onAsk?.('I got this question wrong: '))}
        {chip('Test me on this', () => { setResult(null); setShowCheck(true); }, Boolean(check))}
        {chip('Explain the foundation', () => onAsk?.(`Explain ${brief.foundation || 'the foundation'} simply, then give me one check.`), Boolean(brief.foundation))}
      </div>
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
