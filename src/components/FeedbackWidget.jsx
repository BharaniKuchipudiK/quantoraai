import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { composeFeedbackMessage, deriveFeedbackType } from '../lib/feedback-compose.js';
import '../styles/feedback-widget.css';

/*
 * Share feedback, ChatGPT-style: tap chips, optionally add details, submit.
 *
 * The old form demanded a typed paragraph before Submit would enable, which is
 * the single biggest reason feedback never gets sent. Chips lower the cost of
 * saying *something* to one click, and the composed message still travels
 * through the existing /api/pipeline feedback contract — chips are folded into
 * the message text, so no schema change and the admin panel reads it as-is.
 */
const MAX_DETAIL_CHARS = 400;
const DEFAULT_SURFACE = 'studio-sidebar';

const CHIPS = [
  'Solved my task',
  'Great output quality',
  'Fast and efficient',
  'Easy to use',
  'Something broke',
  'Confusing to use',
  'Missing a capability',
  'Feature idea',
  'Other',
];

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [selectedChips, setSelectedChips] = useState([]);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState('form'); // form | success
  const [error, setError] = useState('');
  const [surface, setSurface] = useState(DEFAULT_SURFACE);
  const textareaRef = useRef(null);

  const canSubmit = useMemo(
    () => selectedChips.length > 0 || detail.trim().length > 0,
    [selectedChips.length, detail],
  );

  const reset = () => {
    setSelectedChips([]);
    setDetail('');
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

  const toggleChip = (chip) => {
    setSelectedChips((prev) => (
      prev.includes(chip) ? prev.filter((item) => item !== chip) : [...prev, chip]
    ));
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetStage: 'feedback',
          feedbackType: deriveFeedbackType(selectedChips),
          message: composeFeedbackMessage(selectedChips, detail),
          pagePath: `${window.location.pathname}${window.location.search}`.slice(0, 240),
          surface,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send feedback.');

      setPhase('success');
      setSelectedChips([]);
      setDetail('');
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
      >
        {phase === 'success' ? (
          <div className="q-feedback-success" role="status" aria-live="polite">
            <div className="q-feedback-success__icon"><CheckCircle2 size={28} /></div>
            <div>
              <h2>Thank you.</h2>
              <p>Your feedback is with the Quantora team.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="q-feedback-modal__header">
              <h2 id="q-feedback-title">Share feedback</h2>
              <button type="button" className="q-feedback-close" aria-label="Close feedback" onClick={close}>
                <X size={18} />
              </button>
            </header>

            <div className="q-feedback-chips" role="group" aria-label="What describes your experience?">
              {CHIPS.map((chip) => {
                const selected = selectedChips.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    className={`q-feedback-chip${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleChip(chip)}
                  >
                    <Plus size={14} className="q-feedback-chip__icon" />
                    <span>{chip}</span>
                  </button>
                );
              })}
            </div>

            <textarea
              ref={textareaRef}
              className="q-feedback-detail"
              value={detail}
              maxLength={MAX_DETAIL_CHARS}
              rows={5}
              placeholder="Share details (optional)"
              aria-label="Share details (optional)"
              onChange={(event) => setDetail(event.target.value)}
            />

            <p className="q-feedback-note">
              Your feedback helps improve Quantora. The current product area is included automatically.
            </p>

            {error && <div className="q-feedback-error" role="alert">{error}</div>}

            <button
              type="button"
              className="q-feedback-submit"
              disabled={!canSubmit || submitting}
              onClick={submit}
            >
              {submitting ? 'Sending…' : 'Submit'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
