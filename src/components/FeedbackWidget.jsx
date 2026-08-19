import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Lightbulb,
  MessageSquareText,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import '../styles/feedback-widget.css';

const MAX_CHARS = 500;
const DEFAULT_SURFACE = 'studio-sidebar';

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState('form'); // form | success
  const [error, setError] = useState('');
  const [surface, setSurface] = useState(DEFAULT_SURFACE);
  const textareaRef = useRef(null);

  const characterCount = useMemo(() => message.length, [message.length]);

  const reset = () => {
    setFeedbackType('feedback');
    setMessage('');
    setSubmitting(false);
    setPhase('form');
    setError('');
    setSurface(DEFAULT_SURFACE);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
    window.setTimeout(reset, 180);
  };

  useEffect(() => {
    const openFromProductNav = (event) => {
      const requestedSurface = event?.detail?.surface;
      setSurface(typeof requestedSurface === 'string' && requestedSurface.trim()
        ? requestedSurface.trim().slice(0, 80)
        : DEFAULT_SURFACE);
      setPhase('form');
      setError('');
      setOpen(true);
    };

    window.addEventListener('quantora:open-feedback', openFromProductNav);
    return () => window.removeEventListener('quantora:open-feedback', openFromProductNav);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);

    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, submitting]);

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetStage: 'feedback',
          feedbackType,
          message: trimmed,
          pagePath: `${window.location.pathname}${window.location.search}`.slice(0, 240),
          surface,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send feedback.');

      setPhase('success');
      setMessage('');
      window.setTimeout(() => {
        setOpen(false);
        window.setTimeout(reset, 180);
      }, 1600);
    } catch (submitError) {
      setError(submitError?.message || 'Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="q-feedback-modal-root"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="q-feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="q-feedback-title"
        aria-describedby="q-feedback-description"
      >
        {phase === 'success' ? (
          <div className="q-feedback-success" role="status" aria-live="polite">
            <div className="q-feedback-success__icon"><CheckCircle2 size={28} /></div>
            <div>
              <span className="q-feedback-eyebrow">Feedback received</span>
              <h2>Thank you for helping shape Quantora.</h2>
              <p>Your note is now in the product feedback queue for review.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="q-feedback-modal__header">
              <div>
                <span className="q-feedback-eyebrow">Help improve Quantora</span>
                <h2 id="q-feedback-title">Tell us what would make the product better.</h2>
                <p id="q-feedback-description">
                  Share something that is not working well, or an idea you would like us to consider.
                </p>
              </div>
              <button type="button" className="q-feedback-close" aria-label="Close feedback" onClick={close}>
                <X size={18} />
              </button>
            </header>

            <div className="q-feedback-type" role="group" aria-label="Feedback type">
              <button
                type="button"
                className={feedbackType === 'feedback' ? 'is-active' : ''}
                aria-pressed={feedbackType === 'feedback'}
                onClick={() => setFeedbackType('feedback')}
              >
                <MessageSquareText size={17} />
                <span>
                  <strong>Feedback</strong>
                  <small>Something we should improve</small>
                </span>
              </button>
              <button
                type="button"
                className={feedbackType === 'suggestion' ? 'is-active' : ''}
                aria-pressed={feedbackType === 'suggestion'}
                onClick={() => setFeedbackType('suggestion')}
              >
                <Lightbulb size={17} />
                <span>
                  <strong>Suggestion</strong>
                  <small>An idea for what comes next</small>
                </span>
              </button>
            </div>

            <label className="q-feedback-field">
              <span>Your message</span>
              <textarea
                ref={textareaRef}
                value={message}
                maxLength={MAX_CHARS}
                rows={7}
                placeholder={feedbackType === 'suggestion'
                  ? 'What would you like Quantora to do that it cannot do today?'
                  : 'What happened, and what would a better experience look like?'}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="q-feedback-field__meta">
                <span><ShieldCheck size={13} /> Current product area is included automatically.</span>
                <strong>{characterCount} / {MAX_CHARS}</strong>
              </div>
            </label>

            {error && <div className="q-feedback-error" role="alert">{error}</div>}

            <footer className="q-feedback-modal__footer">
              <button type="button" className="q-feedback-secondary" onClick={close} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="q-feedback-primary"
                disabled={!message.trim() || submitting}
                onClick={submit}
              >
                <Send size={15} />
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
