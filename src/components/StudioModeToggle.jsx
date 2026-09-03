import React from 'react';
import { Hammer, ListChecks } from 'lucide-react';
import { studioModeOptions } from '../lib/studio-mode.js';

/*
 * Plan or Build — the choice Claude Code puts in front of you before it
 * touches anything.
 *
 * Two positions and no third. An unpressed control means "decide for me",
 * which is exactly the behaviour that existed before this toggle: pressing the
 * active one again clears the choice rather than leaving the user stuck in a
 * mode they only meant for one turn.
 *
 * It is a lazy chunk for a reason that is not architectural taste. The desk's
 * entry bundle is capped at 300,000 bytes by
 * scripts/code-highlight-browser-gate.mjs, and this markup inline left 103
 * bytes of headroom — one comment away from a red build for whoever touched
 * AiStudio next. Anything in the composer toolbar that is not needed to render
 * the first frame belongs out here.
 *
 * The promise the labels make is kept in openCanvasWithCode, not in the system
 * prompt: see guardPlanTurn and src/lib/studio-mode.test.js.
 */
export default function StudioModeToggle({
  chosen = null,
  onChange,
  isLight = false,
  subtextColor = null,
}) {
  const muted = subtextColor || (isLight ? '#64748b' : '#94a3b8');

  return (
    <>
      {studioModeOptions().map((option) => {
        const active = chosen === option.id;
        return (
          <button
            key={option.id}
            type="button"
            data-quantora-studio-mode={option.id}
            data-quantora-studio-mode-active={active ? 'true' : 'false'}
            onClick={() => onChange?.(active ? null : option.id)}
            title={option.hint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: active ? (isLight ? '#f5f5f5' : 'rgba(255,255,255,0.1)') : 'transparent',
              border: 'none',
              color: active ? '#f97316' : muted,
              padding: '4px 10px',
              borderRadius: '12px',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
          >
            {option.id === 'plan' ? <ListChecks size={15} /> : <Hammer size={15} />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </>
  );
}
