import React from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { requestStudyAdaptiveMission } from '../lib/study-adaptive-mission-event.js';

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

  if (suggestions.kind === 'nudge') {
    return (
      <div className={`studio-inline-suggestions${isLight ? ' is-light' : ''}`}>
        <div className="studio-inline-nudge" role="note">
          <Sparkles size={13} aria-hidden="true" />
          <span>{suggestions.nudge.text}</span>
          {onDismiss && (
            <button
              type="button"
              className="studio-inline-suggestions__dismiss"
              onClick={onDismiss}
              title="Hide this hint"
              aria-label="Hide this hint"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    );
  }

  const isChoices = suggestions.kind === 'choices';
  const items = isChoices
    ? (suggestions.choiceSet?.choices || [])
    : (suggestions.continueSet?.items || []);

  if (!items.length) return null;

  const selectContinue = (item) => {
    if (item?.id === 'study-hint') {
      // This component is shared by every workspace. Load Study observation
      // code only when a Study hint is actually selected so non-Study desks do
      // not pay for PR4 in their entry bundle.
      void import('../lib/study-learning-interactions.js')
        .then(({ recordStudyHintRequest }) => recordStudyHintRequest({ source: 'guided_chip', hintDepth: 1 }))
        .catch(() => {});
    }
    if (item?.id === 'study-work-together' && requestStudyAdaptiveMission({ source: 'guided_chip', item })) {
      return;
    }
    onSelectContinue?.(item);
  };

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
                  : selectContinue(item)
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
