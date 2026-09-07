import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  Eye,
  Map,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  studyActionVisibleText,
  studyExplainDifferentlyAsk,
  studyRealWorldAsk,
  studyVisualExplainAsk,
  studyWhereNextAsk,
} from '../lib/study-learning-resources.js';
import { studyAdaptiveTutorAsk } from '../lib/study-adaptive-tutor.js';
import { STUDY_SURFACE, STUDY_SURFACE_REQUEST_EVENT } from '../lib/study-surface-navigation.js';
import StudyNotebook from './StudyNotebook.jsx';

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
    id: 'real-world',
    label: 'Real-world example',
    hint: 'Connect the idea to one concrete situation.',
    icon: BrainCircuit,
    ask: studyRealWorldAsk,
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
 * Progressive-disclosure launcher for tutor interventions only.
 *
 * The launcher itself belongs to an active Study session, so it remains
 * discoverable before a topic has been established. Tutor interventions stay
 * disabled until there is a real topic; durable learner workspaces keep their
 * own ownership boundaries.
 */
export default function StudyHubLauncher({ topic, learnerModel, onAsk, onSend, ready = true }) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState('tools');
  const rootRef = useRef(null);
  const firstActionRef = useRef(null);
  const surfaceCloseGuardRef = useRef(null);
  const label = ready
    ? String(topic || 'this topic').trim()
    : 'Start a Study topic to unlock tutor tools.';

  const registerSurfaceCloseGuard = useCallback((guard) => {
    surfaceCloseGuardRef.current = typeof guard === 'function' ? guard : null;
    return () => {
      if (surfaceCloseGuardRef.current === guard) surfaceCloseGuardRef.current = null;
    };
  }, []);

  const closeHub = useCallback(async () => {
    const guard = surfaceCloseGuardRef.current;
    if (guard && (await guard()) === false) return false;
    surfaceCloseGuardRef.current = null;
    setOpen(false);
    setSurface('tools');
    return true;
  }, []);

  useEffect(() => {
    const handleSurfaceRequest = (event) => {
      if (!ready || event?.detail?.surface !== STUDY_SURFACE.NOTEBOOK) return;
      event.detail.handled = true;
      setSurface('notebook');
      setOpen(true);
    };
    window.addEventListener(STUDY_SURFACE_REQUEST_EVENT, handleSurfaceRequest);
    return () => window.removeEventListener(STUDY_SURFACE_REQUEST_EVENT, handleSurfaceRequest);
  }, [ready]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') void closeHub();
    };
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) void closeHub();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    if (surface === 'tools') window.requestAnimationFrame(() => firstActionRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeHub, open, surface]);

  const runAction = (action) => {
    if (!ready) return;
    const text = studyAdaptiveTutorAsk(action.ask(label), learnerModel);
    if (onSend) {
      onSend(text, { visibleUserText: studyActionVisibleText(action.id, label) });
    } else {
      onAsk?.(text);
    }
    void closeHub();
  };

  const panelClass = [
    'study-h1-hub__panel',
    surface === 'notebook' ? ' study-h1-hub__panel--notebook' : '',
  ].filter(Boolean).join(' ');

  const labelledBy = surface === 'notebook'
    ? 'quantora-study-notebook-title'
    : 'quantora-study-hub-title';

  return (
    <div
      ref={rootRef}
      className="study-h1-hub"
      data-quantora-study-hub-launcher="true"
      data-quantora-study-hub-ready={ready ? 'true' : 'false'}
      data-quantora-workspace-capabilities="education"
    >
      {open ? (
        <section
          id="quantora-study-hub-panel"
          className={panelClass}
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelledBy}
        >
          {surface === 'notebook' ? (
            <StudyNotebook
              topic={label}
              onClose={() => setSurface('tools')}
              registerCloseGuard={registerSurfaceCloseGuard}
            />
          ) : (
            <>
              <div className="study-h1-hub__header">
                <div style={{ minWidth: 0 }}>
                  <div id="quantora-study-hub-title" className="study-h1-hub__title">Study AI</div>
                  <div className="study-h1-hub__topic">{label}</div>
                </div>
                <button
                  type="button"
                  className="study-h1-icon-button"
                  aria-label="Close Study AI"
                  onClick={() => void closeHub()}
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
                      disabled={!ready}
                      title={ready ? action.hint : 'Start a Study topic first.'}
                      style={{
                        opacity: ready ? 1 : 0.48,
                        cursor: ready ? 'pointer' : 'not-allowed',
                      }}
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
        aria-label={open ? 'Close Study AI' : 'Open Study AI'}
        aria-expanded={open}
        aria-controls="quantora-study-hub-panel"
        onClick={() => {
          if (open) void closeHub();
          else setOpen(true);
        }}
      >
        {open ? <X size={19} /> : <BrainCircuit size={19} />}
      </button>
    </div>
  );
}