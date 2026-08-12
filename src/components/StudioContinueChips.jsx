import React from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * ChatGPT-style continuation chips — peer nudges after an answer, not intake forms.
 * Shown inline under the latest AI message when no choice card is pending.
 */
export default function StudioContinueChips({
  continueSet,
  isLight,
  textColor,
  subtextColor,
  onSelect,
  disabled = false,
}) {
  if (!continueSet?.items?.length) return null;

  return (
    <div className="studio-continue-chips" aria-label={continueSet.prompt || 'Continue the conversation'}>
      {continueSet.prompt && (
        <span className="studio-continue-chips__prompt" style={{ color: subtextColor }}>
          {continueSet.prompt}
        </span>
      )}
      <div className="studio-continue-chips__row">
        {continueSet.items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            className={`studio-continue-chips__chip${isLight ? ' is-light' : ''}`}
            onClick={() => onSelect(item)}
          >
            <span style={{ color: textColor }}>{item.label}</span>
            <ArrowRight size={13} className="studio-continue-chips__arrow" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
