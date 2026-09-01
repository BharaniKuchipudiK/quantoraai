import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpenText,
  BrainCircuit,
  CreditCard,
  Eye,
  Map,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  studyActionVisibleText,
  studyExplainDifferentlyAsk,
  studyFlashcardAsk,
  studyNotesAsk,
  studyRealWorldAsk,
  studyVisualExplainAsk,
  studyWhereNextAsk,
} from '../lib/study-learning-resources.js';
import { studyAdaptiveTutorAsk } from '../lib/study-adaptive-tutor.js';

const HUB_ACTIONS = Object.freeze([
  {
    id: 'different',
    label: 'Explain differently',
    hint: 'Switch the representation, example, or analogy.',
    icon: RotateCcw,
    ask: studyExplainDifferentlyAsk,
  },
  {
    id: 'visual',
    label: 'Show visually',
    hint: 'Use a diagram or visual relationship when it helps.',
    icon: Eye,
    ask: studyVisualExplainAsk,
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    hint: 'Turn the current topic into focused recall cards.',
    icon: CreditCard,
    ask: studyFlashcardAsk,
  },
  {
    id: 'real-world',
    label: 'Real-world example',
    hint: 'Connect the idea to one concrete situation.',
    icon: BrainCircuit,
    ask: studyRealWorldAsk,
  },
  {
    id: 'notes',
    label: 'Make concise notes',
    hint: 'Summarize only what this conversation has established.',
    icon: BookOpenText,
    ask: studyNotesAsk,
  },
  {
    id: 'where-next',
    label: 'Where next?',
    hint: 'Choose the next useful learning direction.',
    icon: Map,
    ask: studyWhereNextAsk,
  },
]);

/**
 * Progressive-disclosure launcher for secondary Study capabilities.
 *
 * The launcher intentionally exposes only capabilities that already work. New
 * learner surfaces such as Assessment History and Notebook plug into this hub
 * only when their real data contracts exist; there are no placeholder tiles.
 */
export default function StudyHubLauncher({ topic, learnerModel, onAsk, onSend }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const firstActionRef = useRef(null);
  const label = String(topic || 'this topic').trim();

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    window.requestAnimationFrame(() => firstActionRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  const runAction = (action) => {
    const text = studyAdaptiveTutorAsk(action.ask(label), learnerModel);
    if (onSend) {
      onSend(text, { visibleUserText: studyActionVisibleText(action.id, label) });
    } else {
      onAsk?.(text);
    }
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="study-h1-hub"
      data-quantora-study-hub-launcher="true"
      data-quantora-workspace-capabilities="education"
    >
      {open ? (
        <section
          id="quantora-study-hub-panel"
          className="study-h1-hub__panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="quantora-study-hub-title"
        >
          <div className="study-h1-hub__header">
            <div style={{ minWidth: 0 }}>
              <div id="quantora-study-hub-title" className="study-h1-hub__title">Study tools</div>
              <div className="study-h1-hub__topic">{label}</div>
            </div>
            <button
              type="button"
              className="study-h1-icon-button"
              aria-label="Close Study tools"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="study-h1-hub__actions">
            {HUB_ACTIONS.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  ref={index === 0 ? firstActionRef : undefined}
                  key={action.id}
                  type="button"
                  className="study-h1-hub__action"
                  aria-label={action.label}
                  onClick={() => runAction(action)}
                >
                  <span className="study-h1-hub__action-icon" aria-hidden="true"><Icon size={16} /></span>
                  <span className="study-h1-hub__action-copy">
                    <strong>{action.label}</strong>
                    <span>{action.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="study-h1-hub__launcher"
        aria-label={open ? 'Close Study tools' : 'Open Study tools'}
        aria-expanded={open}
        aria-controls="quantora-study-hub-panel"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={19} /> : <BrainCircuit size={19} />}
      </button>
    </div>
  );
}
