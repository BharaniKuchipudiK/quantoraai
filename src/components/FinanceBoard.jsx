import React from 'react';

/**
 * Finance desk board: the deterministic, grounded Finance tools surfaced as
 * editable templates. Tapping a chip drops a ready-to-edit example into the
 * composer so the user swaps in their own numbers; the Finance gateways then
 * answer from real data or arithmetic — never a guess. A launcher, not advice.
 * Rendered only in the Finance workspace.
 */
export default function FinanceBoard({ brief, isLight, textColor, subtextColor, onAsk, onSend }) {
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
      style={{
        border: isLight ? '1px solid #99f6e4' : '1px solid rgba(45,212,191,0.45)',
        background: isLight ? '#f0fdfa' : 'rgba(45,212,191,0.12)',
        color: textColor,
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
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.25)',
        borderRadius: '14px',
        padding: '12px 14px',
        background: isLight ? 'rgba(240,253,250,0.55)' : 'rgba(15,23,42,0.35)',
      }}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: textColor, marginBottom: '3px' }}>
        Finance desk
      </div>
      <div style={{ fontSize: '0.74rem', color: subtextColor, marginBottom: '10px', lineHeight: 1.5 }}>
        Deterministic tools — every answer is computed and cited, never guessed. Tap one, then edit the numbers.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {actions.map((action) => chip(action))}
      </div>
    </div>
  );
}
