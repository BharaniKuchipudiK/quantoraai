import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import '../styles/feedback-widget.css';

const MAX_CHARS = 500;

function hasCachedUser() {
  try { return Boolean(localStorage.getItem('quantora_user')); } catch { return false; }
}

export default function FeedbackWidget() {
  const [visible, setVisible] = useState(hasCachedUser);
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const openFromProductNav = () => {
      setVisible(true);
      setOpen(true);
    };
    window.addEventListener('quantora:open-feedback', openFromProductNav);
    return () => window.removeEventListener('quantora:open-feedback', openFromProductNav);
  }, []);

  useEffect(() => {
    const sync = () => setVisible(hasCachedUser());
    sync();
    const timer = window.setInterval(sync, 2000);
    window.addEventListener('storage', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const remaining = useMemo(() => MAX_CHARS - message.length, [message.length]);

  if (!visible) return null;

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setNotice('');
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
          surface: 'global-feedback',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send feedback.');
      setMessage('');
      setFeedbackType('feedback');
      setNotice('Thanks — we got it.');
      window.setTimeout(() => {
        setOpen(false);
        setNotice('');
      }, 1200);
    } catch (error) {
      setNotice(error?.message || 'Could not send feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="q-feedback-widget">
      {!open ? null : (
        <section className="q-feedback-card" aria-label="Give Quantora feedback">
          <div className="q-feedback-head">
            <div>
              <strong>Help shape Quantora</strong>
              <span>Short is perfect.</span>
            </div>
            <button type="button" aria-label="Close feedback" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>

          <label>
            <span>Type</span>
            <select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value)}>
              <option value="feedback">Feedback</option>
              <option value="suggestion">Suggestion</option>
            </select>
          </label>

          <label>
            <span>Message</span>
            <textarea
              value={message}
              maxLength={MAX_CHARS}
              rows={5}
              placeholder="What should we improve?"
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>

          <div className="q-feedback-foot">
            <small>{remaining}</small>
            <button type="button" disabled={!message.trim() || submitting} onClick={submit}>
              {submitting ? 'Sending…' : 'Submit'}
            </button>
          </div>
          {notice && <div className="q-feedback-notice">{notice}</div>}
        </section>
      )}
    </div>
  );
}
