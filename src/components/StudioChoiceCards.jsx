import React from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

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
  dockState = 'open',
  onCollapse,
  onExpand,
  onDismiss,
}) {
  if (!choiceSet?.choices?.length) return null;

  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
  const isFloating = variant === 'floating';
  const isCollapsed = isFloating && dockState === 'collapsed';

  return (
    <div
      className={`studio-choice-cards${isFloating ? ' studio-choice-cards--floating' : ''}${isCollapsed ? ' studio-choice-cards--collapsed' : ''}`}
      role="group"
      aria-label={choiceSet.title || 'Follow-up options'}
    >
      {isFloating && (
        <div className="studio-choice-cards__toolbar">
          {!isCollapsed && (
            <span className="studio-choice-cards__eyebrow">Pick one to continue</span>
          )}
          {isCollapsed && (
            <span className="studio-choice-cards__collapsed-label" style={{ color: subtextColor }}>
              {choiceSet.choices.length} suggestion{choiceSet.choices.length === 1 ? '' : 's'}
            </span>
          )}
          <div className="studio-choice-cards__toolbar-actions">
            {isCollapsed ? (
              <button
                type="button"
                className="studio-choice-cards__icon-btn"
                onClick={onExpand}
                title="Expand suggestions"
                aria-label="Expand suggestions"
              >
                <ChevronUp size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="studio-choice-cards__icon-btn"
                onClick={onCollapse}
                title="Collapse suggestions"
                aria-label="Collapse suggestions"
              >
                <ChevronDown size={14} />
              </button>
            )}
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
        </div>
      )}

      {!isCollapsed && (choiceSet.title || choiceSet.prompt) && (
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
            title={choice.label}
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
