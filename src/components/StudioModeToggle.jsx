import React, { useState } from 'react';
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
  const [hovered, setHovered] = useState(null);

  return (
    <>
      {studioModeOptions().map((option) => {
        const active = chosen === option.id;
        return (
          <span key={option.id} style={{ position: 'relative', display: 'inline-flex' }}>
          {/*
            A rendered tooltip rather than the `title` attribute it replaces.
            Two words on a toolbar cannot carry "nothing is written to the desk"
            on their own, and the native tooltip that was here waited about a
            second and then drew in the OS's own styling — long enough that the
            person reporting this had not seen it at all. Same sentence,
            immediate, and legible against the composer.
          */}
          {hovered === option.id ? (
            <span
              role="tooltip"
              data-quantora-studio-mode-tip={option.id}
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 60,
                pointerEvents: 'none',
                width: 'max-content',
                maxWidth: '230px',
                padding: '7px 10px',
                borderRadius: '9px',
                background: isLight ? '#0a0a0a' : '#1f1f1f',
                color: '#ffffff',
                border: isLight ? 'none' : '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
                fontSize: '0.72rem',
                fontWeight: 500,
                lineHeight: 1.4,
                textAlign: 'left',
                whiteSpace: 'normal',
              }}
            >
              {option.hint}
            </span>
          ) : null}
          <button
            type="button"
            data-quantora-studio-mode={option.id}
            data-quantora-studio-mode-active={active ? 'true' : 'false'}
            onClick={() => onChange?.(active ? null : option.id)}
            onMouseEnter={() => setHovered(option.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(option.id)}
            onBlur={() => setHovered(null)}
            aria-label={`${option.label} — ${option.hint}`}
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
          </span>
        );
      })}
    </>
  );
}
