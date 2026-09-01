import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpenText,
  BrainCircuit,
  CreditCard,
  Eye,
  History,
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
import StudyAssessmentHistory from './StudyAssessmentHistory.jsx';

const HUB_ACTIONS = Object.freeze([
  {
    id: 'history',
    label: 'Assessment history',
    hint: 'Review your verified checks from the last 30 days.',
    icon: History,
    surface: 'history',
  },
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
 * The launcher exposes only capabilities with real contracts. Assessment
 * History is the first durable learner surface in the Hub; future Notebook and
 * Progress surfaces join only after their persistence/telemetry contracts land.
 */
export default function StudyHubLauncher({ topic, learnerModel, onAsk, onSend }) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState('tools');
  const rootRef = useRef(null);
  const firstActionRef = useRef(null);
  const label = String(topic || 'this topic').trim();

  const closeHub = () => {
    setOpen(false);
    setSurface('tools');
  };

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeHub();
    };
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) closeHub();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    if (surface === 'tools') window.requestAnimationFrame(() => firstActionRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, surface]);

  const runAction = (action) => {
    if (action.surface === 'history') {
      setSurface('history');
      return;
    }
    const text = studyAdaptiveTutorAsk(action.ask(label), learnerModel);
    if (onSend) {
      onSend(text, { visibleUserText: studyActionVisibleText(action.id, label) });
    } else {
      onAsk?.(text);
    }
    closeHub();
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
          className={`study-h1-hub__panel${surface === 'history' ? ' study-h1-hub__panel--history' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={surface === 'history' ? 'quantora-study-history-title' : 'quantora-study-hub-title'}
        >
          {surface === 'history' ? (
            <StudyAssessmentHistory onClose={() => setSurface('tools')} />
          ) : (
            <>
              <div className="study-h1-hub__header">
                <div style={{ minWidth: 0 }}>
                  <div id="quantora-study-hub-title" className="study-h1-hub__title">Study tools</div>
                  <div className="study-h1-hub__topic">{label}</div>
                </div>
                <button
                  type="button"
                  className="study-h1-icon-button"
                  aria-label="Close Study tools"
                  onClick={closeHub}
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
            </>
          )}
        </section>
      ) : null}

      <button
        type="button"
        className="study-h1-hub__launcher"
        aria-label={open ? 'Close Study tools' : 'Open Study tools'}
        aria-expanded={open}
        aria-controls="quantora-study-hub-panel"
        onClick={() => {
          if (open) closeHub();
          else setOpen(true);
        }}
      >
        {open ? <X size={19} /> : <BrainCircuit size={19} />}
      </button>
    </div>
  );
}
