import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';

export default function StudyFlashcards({ cards = [] }) {
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
    border: '1px solid var(--q-border)',
    background: 'var(--q-paper)',
    color: 'var(--q-ink)',
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

  const navStyle = (disabled) => ({
    ...buttonStyle,
    borderStyle: disabled ? 'dashed' : 'solid',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: disabled ? 500 : 700,
  });

  return (
    <section
      data-quantora-study-flashcards="true"
      aria-label={`Flashcard ${index + 1} of ${deck.length}`}
      style={{ maxWidth: '620px', margin: '4px 0 16px', color: 'var(--q-ink)' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--q-ink)',
          fontSize: '0.76rem',
          fontWeight: 500,
          marginBottom: '7px',
        }}
      >
        <span>Recall first, then reveal</span>
        <span>{index + 1} / {deck.length}</span>
      </div>

      <button
        type="button"
        className="q-mono-control"
        data-quantora-study-flashcard={revealed ? 'back' : 'front'}
        aria-label={revealed ? 'Flashcard answer. Tap to show the prompt.' : 'Flashcard prompt. Tap to reveal the answer.'}
        onClick={() => setRevealed((value) => !value)}
        style={{
          width: '100%',
          minHeight: '190px',
          borderRadius: '18px',
          border: '2px solid var(--q-border)',
          background: revealed ? 'var(--q-inverse-paper)' : 'var(--q-paper)',
          color: revealed ? 'var(--q-inverse-ink)' : 'var(--q-ink)',
          padding: '24px',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
        }}
      >
        <span
          style={{
            display: 'block',
            color: 'currentColor',
            fontSize: '0.70rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}
        >
          {revealed ? 'Answer' : 'Think'}
        </span>
        <span
          className="study-flashcard__face"
          style={{
            display: 'block',
            fontSize: 'clamp(1.05rem, 2vw, 1.28rem)',
            lineHeight: 1.55,
            fontWeight: revealed ? 560 : 680,
          }}
        >
          {revealed ? card.back : card.front}
        </span>
        <span
          style={{
            display: 'block',
            color: 'currentColor',
            fontSize: '0.72rem',
            fontWeight: 500,
            marginTop: '18px',
          }}
        >
          {revealed ? 'Tap to see the prompt again' : 'Tap when you have an answer in mind'}
        </span>
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '9px' }}>
        <button
          type="button"
          className="q-mono-control"
          disabled={index === 0}
          onClick={() => move(index - 1)}
          style={navStyle(index === 0)}
        >
          <ArrowLeft size={13} /> Previous
        </button>
        <button
          type="button"
          className="q-mono-control"
          onClick={() => setRevealed((value) => !value)}
          style={buttonStyle}
        >
          <RotateCcw size={13} /> {revealed ? 'Hide answer' : 'Reveal answer'}
        </button>
        <button
          type="button"
          className="q-mono-control"
          disabled={index === deck.length - 1}
          onClick={() => move(index + 1)}
          style={navStyle(index === deck.length - 1)}
        >Next <ArrowRight size={13} />
        </button>
      </div>
    </section>
  );
}
