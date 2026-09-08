import React from 'react';
import { turnBudgetView } from '../../shared/turn-budget-view.js';

/*
 * The allowance, drawn.
 *
 * Quantora showed a person nothing about their own budget until it refused
 * them, and the refusal said only that turns "reset within 24 hours" -- true,
 * and useless for deciding whether to wait or come back tomorrow. This is the
 * bar and the countdown, from numbers hit_rate_limit has returned all along.
 *
 * It renders NOTHING when the standing is unknown. That is deliberate: a bar
 * drawn from a missing count reads as a full, untouched allowance, which is
 * the most reassuring picture available and the one produced by knowing
 * nothing at all.
 */
export default function TurnBudgetMeter({ budget, isLight = false, now = Date.now() }) {
  const view = turnBudgetView(budget, now);
  if (!view) return null;

  /* Green while there is room, amber as it runs down, red once it is spent --
   * severity in form as well as number, so it reads at a glance. */
  const tone = view.exhausted ? '#ef4444' : view.percentUsed >= 80 ? '#f59e0b' : '#22c55e';
  const label = view.shared ? "Quantora's shared daily turns" : 'Your daily turns';

  return (
    <div
      data-quantora-turn-meter={view.exhausted ? 'exhausted' : 'available'}
      data-quantora-turn-remaining={view.remaining}
      style={{
        padding: '10px 12px',
        borderRadius: '10px',
        background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
        border: isLight ? '1px solid rgba(0,0,0,0.07)' : '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontSize: '0.78rem', color: isLight ? '#334155' : '#cbd5e1' }}>{label}</span>
        <span style={{ fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', color: isLight ? '#0f172a' : '#f1f5f9' }}>
          {view.used} / {view.limit}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={view.percentUsed}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${view.used} of ${view.limit} used`}
        style={{
          height: '6px',
          borderRadius: '999px',
          background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${view.percentUsed}%`, height: '100%', background: tone, borderRadius: '999px' }} />
      </div>

      <div style={{ fontSize: '0.72rem', color: isLight ? '#475569' : '#94a3b8' }}>
        {view.exhausted
          ? (view.resetsIn
            /* "All of them" because the window is fixed: the allowance returns
             * whole at midnight UTC rather than trickling back, and someone
             * told otherwise retries every ten minutes for half a day. */
            ? `Spent — all of them come back ${view.resetsIn}.`
            : 'Spent for now.')
          : (view.resetsIn
            ? `${view.remaining} left · resets ${view.resetsIn}`
            : `${view.remaining} left`)}
      </div>
    </div>
  );
}
