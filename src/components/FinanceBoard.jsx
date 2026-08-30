import React from 'react';

/**
 * Finance desk board: the deterministic, grounded Finance tools surfaced as
 * editable templates. Tapping a chip drops a ready-to-edit example into the
 * composer so the user swaps in their own numbers; the Finance gateways then
 * answer from real data or arithmetic — never a guess. A launcher, not advice.
 * Rendered only in the Finance workspace.
 *
 * Monochrome (Quantora design system). This board used to carry a teal accent
 * and slate borders, with light and dark handled by an `isLight` prop and two
 * inherited colour props. All four are gone: the tokens in
 * quantora-monochrome.css already flip on [data-theme], so a component that
 * asks its parent what colour to be is both redundant and a way for a stray
 * shade to re-enter.
 *
 * Hierarchy here is type, space and border — the heading is larger and heavier
 * than the note under it, and the chips are separated by a rule rather than a
 * tint. The chips invert on hover and focus, which is the system's substitute
 * for a highlight colour.
 */
export default function FinanceBoard({ brief, onAsk, onSend }) {
  const actions = brief?.actions || [];
  if (!actions.length) return null;

  const use = (prompt) => {
    if (onAsk) onAsk(prompt);
    else onSend?.(prompt);
  };

  const chip = (action) => (
    <button
      key={action.id}
      type="button"
      onClick={() => use(action.prompt)}
      title={action.prompt}
      data-quantora-finance-action={action.id}
      className="q-mono-control q-mono-chip"
      style={{
        border: '1px solid var(--q-border)',
        background: 'var(--q-paper)',
        color: 'var(--q-ink)',
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {action.label}
    </button>
  );

  return (
    <div
      data-quantora-finance-board="true"
      style={{
        marginTop: '10px',
        border: '1px solid var(--q-border)',
        borderRadius: '14px',
        padding: '12px 14px',
        background: 'var(--q-paper)',
        color: 'var(--q-ink)',
      }}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.02em', marginBottom: '3px' }}>
        Finance desk
      </div>
      {/*
        Secondary, without being a lighter grey: one step down in size and back
        to normal weight carries the same "this is the note, that was the
        heading" reading that a muted colour used to.
      */}
      <div style={{ fontSize: '0.74rem', fontWeight: 400, marginBottom: '10px', lineHeight: 1.5 }}>
        Deterministic tools — every answer is computed and cited, never guessed. Tap one, then edit the numbers.
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          borderTop: '1px solid var(--q-border)',
          paddingTop: '10px',
        }}
      >
        {actions.map((action) => chip(action))}
      </div>
    </div>
  );
}
