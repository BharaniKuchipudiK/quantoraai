import React from 'react';
import { turnBudgetView } from '../../shared/turn-budget-view.js';

/*
 * THE ALLOWANCE, WHERE YOU ARE ABOUT TO SPEND IT.
 *
 * The first version of this only appeared on the refusal -- which is the same
 * defect it was built to fix, in a nicer font. The moment the number is worth
 * knowing is at turn 45, while you still have the choice to slow down; at
 * turn 61 it is only an explanation.
 *
 * Renders NOTHING until a turn has reported the standing, and nothing at all
 * when the count is unknown: a ring drawn from a missing number is a full,
 * untouched allowance, which is the most reassuring picture available and the
 * one produced by knowing nothing.
 */
export default function TurnBudgetRing({ budget, isLight = false, now = Date.now() }) {
  const view = turnBudgetView(budget, now);
  if (!view) return null;

  /* An exempt account has no allowance to run down; a ring implying one would
   * be false, so it says what is actually true instead. */
  if (budget?.exempt) {
    return (
      <span
        data-quantora-turn-ring="exempt"
        title="This account is exempt from the daily turn limit."
        style={{ fontSize: '0.68rem', color: isLight ? '#64748b' : '#94a3b8', whiteSpace: 'nowrap' }}
      >
        no daily limit
      </span>
    );
  }

  const size = 22;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  /* Clamped in the view model: the refusal is itself a counted hit, so used
   * can pass the limit and an unclamped arc would wind past its own start. */
  const dash = (view.percentUsed / 100) * circumference;
  const tone = view.exhausted ? '#ef4444' : view.percentUsed >= 80 ? '#f59e0b' : '#22c55e';
  const label = view.exhausted
    ? (view.resetsIn ? `No turns left — all of them come back ${view.resetsIn}.` : 'No turns left.')
    : `${view.remaining} of ${view.limit} turns left${view.resetsIn ? ` · resets ${view.resetsIn}` : ''}`;

  return (
    <span
      data-quantora-turn-ring={view.exhausted ? 'exhausted' : 'available'}
      data-quantora-turn-ring-remaining={view.remaining}
      title={label}
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.14)'}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          /* Start the arc at twelve o'clock rather than three. */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span style={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums', color: isLight ? '#475569' : '#94a3b8' }}>
        {view.remaining}
      </span>
    </span>
  );
}
