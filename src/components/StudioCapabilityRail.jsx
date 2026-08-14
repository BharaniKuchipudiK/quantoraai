import React from 'react';
import { Brain, Workflow, X } from 'lucide-react';

const ICONS = {
  memory: Brain,
  journey: Workflow,
};

/** Quiet, outcome-aware proposals immediately above the prompt. */
export default function StudioCapabilityRail({
  proposals = [],
  dismissedIds = [],
  disabled = false,
  isLight = false,
  onActivate,
  onDismiss,
}) {
  const visible = proposals.filter(({ capability }) => !dismissedIds.includes(capability.id));
  if (!visible.length) return null;

  return (
    <section className={`studio-capability-rail${isLight ? ' is-light' : ''}`} aria-label="Suggested capabilities">
      <span className="studio-capability-rail__eyebrow">Useful now</span>
      <div className="studio-capability-rail__items">
        {visible.map(({ capability, reasonCode }) => {
          const Icon = ICONS[capability.icon] || Brain;
          return (
            <div className="studio-capability-chip" key={capability.id} data-reason={reasonCode}>
              <button
                type="button"
                className="studio-capability-chip__action"
                disabled={disabled}
                onClick={() => onActivate?.(capability)}
                title={capability.description}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{capability.label}</span>
              </button>
              <button
                type="button"
                className="studio-capability-chip__dismiss"
                aria-label={`Hide ${capability.label}`}
                onClick={() => onDismiss?.(capability.id)}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
