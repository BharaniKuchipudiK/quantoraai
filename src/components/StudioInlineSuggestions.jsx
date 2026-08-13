import React from 'react';
import { ArrowRight, X } from 'lucide-react';

/**
 * Unified inline suggestions — lives under the latest AI message in the thread.
 * Choices take priority over continue chips. No persistent dock chrome.
 */
export default function StudioInlineSuggestions({
  suggestions,
  isLight,
  disabled = false,
  onSelectChoice,
  onSelectContinue,
  onDismiss,
}) {
  if (!suggestions) return null;

  const isChoices = suggestions.kind === 'choices';
  const items = isChoices
    ? (suggestions.choiceSet?.choices || [])
    : (suggestions.continueSet?.items || []);

  if (!items.length) return null;

  return (
    <div
      className={`studio-inline-suggestions${isLight ? ' is-light' : ''}`}
      role="group"
      aria-label="Suggested replies"
    >
      <div className="studio-inline-suggestions__row">
        <div className="studio-inline-suggestions__pills">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              className="studio-inline-suggestions__pill"
              title={item.description || item.label}
              onClick={() => (
                isChoices
                  ? onSelectChoice(item)
                  : onSelectContinue(item)
              )}
            >
              <span>{item.label}</span>
              <ArrowRight size={12} className="studio-inline-suggestions__arrow" aria-hidden="true" />
            </button>
          ))}
        </div>
        {onDismiss && (
          <button
            type="button"
            className="studio-inline-suggestions__dismiss"
            onClick={onDismiss}
            title="Hide suggestions"
            aria-label="Hide suggestions"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
