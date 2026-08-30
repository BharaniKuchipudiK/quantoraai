import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';

export default function StudyFlashcards({ cards = [], isLight = false }) {
  const deck = cards.filter((card) => card?.front && card?.back);
  const signature = deck.map((card) => `${card.front}:${card.back}`).join('|');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setRevealed(false);
  }, [signature]);

  if (!deck.length) return null;
  const card = deck[Math.min(index, deck.length - 1)];
  const move = (nextIndex) => {
    setIndex(nextIndex);
    setRevealed(false);
  };
  const buttonStyle = {
    border: isLight ? '1px solid #dbe4ee' : '1px solid rgba(148,163,184,0.28)',
    background: isLight ? '#fff' : 'rgba(15,23,42,0.55)',
    color: isLight ? '#334155' : '#e2e8f0',
    borderRadius: '999px',
    padding: '7px 11px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    font: 'inherit',
    fontSize: '0.76rem',
    fontWeight: 700,
  };

  return (
    <section data-quantora-study-flashcards="true" aria-label={`Flashcard ${index + 1} of ${deck.length}`} style={{ maxWidth: '620px', margin: '4px 0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: isLight ? '#64748b' : '#94a3b8', fontSize: '0.76rem', marginBottom: '7px' }}>
        <span>Recall first, then reveal</span>
        <span>{index + 1} / {deck.length}</span>
      </div>
      <button
        type="button"
        data-quantora-study-flashcard={revealed ? 'back' : 'front'}
        aria-label={revealed ? 'Flashcard answer. Tap to show the prompt.' : 'Flashcard prompt. Tap to reveal the answer.'}
        onClick={() => setRevealed((value) => !value)}
        style={{
          width: '100%',
          minHeight: '190px',
          borderRadius: '18px',
          border: isLight ? '1px solid #fdba74' : '1px solid rgba(251,146,60,0.42)',
          background: revealed ? (isLight ? '#fff7ed' : 'rgba(124,45,18,0.20)') : (isLight ? '#fff' : '#111827'),
          color: isLight ? '#0f172a' : '#f8fafc',
          padding: '24px',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          boxShadow: isLight ? '0 12px 30px rgba(15,23,42,0.07)' : '0 14px 34px rgba(0,0,0,0.22)',
        }}
      >
        <span style={{ display: 'block', color: revealed ? '#f97316' : (isLight ? '#64748b' : '#94a3b8'), fontSize: '0.70rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '14px' }}>
          {revealed ? 'Answer' : 'Think'}
        </span>
        <span className="study-flashcard__face" style={{ display: 'block', fontSize: 'clamp(1.05rem, 2vw, 1.28rem)', lineHeight: 1.55, fontWeight: revealed ? 560 : 680 }}>
          {revealed ? card.back : card.front}
        </span>
        <span style={{ display: 'block', color: isLight ? '#64748b' : '#94a3b8', fontSize: '0.72rem', marginTop: '18px' }}>
          {revealed ? 'Tap to see the prompt again' : 'Tap when you have an answer in mind'}
        </span>
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '9px' }}>
        <button type="button" disabled={index === 0} onClick={() => move(index - 1)} style={{ ...buttonStyle, opacity: index === 0 ? 0.45 : 1 }}><ArrowLeft size={13} /> Previous</button>
        <button type="button" onClick={() => setRevealed(false)} style={buttonStyle}><RotateCcw size={13} /> Hide answer</button>
        <button type="button" disabled={index === deck.length - 1} onClick={() => move(index + 1)} style={{ ...buttonStyle, opacity: index === deck.length - 1 ? 0.45 : 1 }}>Next <ArrowRight size={13} /></button>
      </div>
    </section>
  );
}
