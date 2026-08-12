import React from 'react';
import { Sparkles, X } from 'lucide-react';

/** Subtle listening-layer nudge above the prompt — human proactive tone. */
export default function StudioProactiveNudge({ text, isLight, onDismiss }) {
  if (!text) return null;

  return (
    <div
      className="studio-proactive-nudge"
      role="note"
      style={{
        margin: '0 14px 6px',
        padding: '10px 12px',
        borderRadius: '12px',
        border: isLight ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.35)',
        background: isLight ? '#f0f9ff' : 'rgba(2, 132, 199, 0.12)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
      }}
    >
      <Sparkles size={16} color="#0284c7" style={{ marginTop: '2px', flexShrink: 0 }} />
      <p style={{ margin: 0, flex: 1, fontSize: '0.78rem', lineHeight: 1.5, color: isLight ? '#0c4a6e' : '#bae6fd' }}>
        {text}
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isLight ? '#0369a1' : '#7dd3fc', padding: '2px' }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
