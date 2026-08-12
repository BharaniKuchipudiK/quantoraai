import React from 'react';

/**
 * Fellow-style choice cards. Default: inline under an AI message.
 * Floating variant: compact chips pinned above the prompt bar.
 */
export default function StudioChoiceCards({
  choiceSet,
  onSelect,
  disabled,
  isLight,
  variant = 'inline',
}) {
  if (!choiceSet?.choices?.length) return null;

  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
  const isFloating = variant === 'floating';

  return (
    <div
      className={`studio-choice-cards${isFloating ? ' studio-choice-cards--floating' : ''}`}
      role="group"
      aria-label={choiceSet.title || 'Follow-up options'}
    >
      {(choiceSet.title || choiceSet.prompt) && (
        <div className="studio-choice-cards__header">
          {isFloating && (
            <span className="studio-choice-cards__eyebrow">Pick one to continue</span>
          )}
          {choiceSet.title && (
            <div className="studio-choice-cards__title" style={{ color: textColor }}>
              {choiceSet.title}
            </div>
          )}
          {choiceSet.prompt && (
            <div className="studio-choice-cards__prompt" style={{ color: subtextColor }}>
              {choiceSet.prompt}
            </div>
          )}
        </div>
      )}
      {!choiceSet.title && !choiceSet.prompt && isFloating && (
        <div className="studio-choice-cards__header">
          <span className="studio-choice-cards__eyebrow">Pick one to continue</span>
        </div>
      )}
      <div className="studio-choice-cards__grid">
        {choiceSet.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={disabled}
            className="studio-choice-cards__option"
            style={{ borderColor, color: textColor }}
            onClick={() => onSelect(choice)}
          >
            <span className="studio-choice-cards__option-label">{choice.label}</span>
            {choice.description && !isFloating && (
              <span className="studio-choice-cards__option-desc" style={{ color: subtextColor }}>
                {choice.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
