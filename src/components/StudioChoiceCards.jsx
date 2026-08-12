import React from 'react';

/**
 * Fellow-style choice cards rendered below an AI clarify message.
 * Selection sends choice.value as the next user message.
 */
export default function StudioChoiceCards({
  choiceSet,
  onSelect,
  disabled,
  isLight,
}) {
  if (!choiceSet?.choices?.length) return null;

  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';

  return (
    <div
      className="studio-choice-cards"
      role="group"
      aria-label={choiceSet.title || 'Follow-up options'}
    >
      {(choiceSet.title || choiceSet.prompt) && (
        <div className="studio-choice-cards__header">
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
            {choice.description && (
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
