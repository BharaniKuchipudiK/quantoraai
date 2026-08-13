import React from 'react';
import { ArrowRight, X } from 'lucide-react';

/**
 * Continuation chips — peer nudges after an answer.
 * Floating variant: pinned above the prompt bar (does not consume chat scroll space).
 */
export default function StudioContinueChips({
  continueSet,
  isLight,
  textColor,
  subtextColor,
  onSelect,
  disabled = false,
  variant = 'inline',
  onDismiss,
}) {
  if (!continueSet?.items?.length) return null;

  const isFloating = variant === 'floating';

  return (
    <div
      className={`studio-continue-chips${isFloating ? ' studio-continue-chips--floating' : ''}`}
      aria-label={continueSet.prompt || 'Continue the conversation'}
    >
      {isFloating && onDismiss && (
        <div className="studio-continue-chips__toolbar">
          <span className="studio-continue-chips__prompt" style={{ color: subtextColor }}>
            {continueSet.prompt || 'Keep going'}
          </span>
          <button
            type="button"
            className="studio-choice-cards__icon-btn"
            onClick={onDismiss}
            title="Hide suggestions"
            aria-label="Hide suggestions"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {!isFloating && continueSet.prompt && (
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
            title={item.label}
          >
            <span style={{ color: textColor }}>{item.label}</span>
            <ArrowRight size={13} className="studio-continue-chips__arrow" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
