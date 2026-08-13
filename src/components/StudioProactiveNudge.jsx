import React from 'react';
import { Sparkles, X } from 'lucide-react';

/** Compact listening-layer hint above the prompt — not a full-width banner. */
export default function StudioProactiveNudge({ text, isLight, onDismiss }) {
  if (!text) return null;

  return (
    <div
      className={`studio-proactive-nudge${isLight ? ' is-light' : ''}`}
      role="note"
    >
      <Sparkles size={14} className="studio-proactive-nudge__icon" aria-hidden="true" />
      <p className="studio-proactive-nudge__text">{text}</p>
      {onDismiss && (
        <button
          type="button"
          className="studio-proactive-nudge__close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
