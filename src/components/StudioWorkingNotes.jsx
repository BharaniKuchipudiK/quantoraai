import React, { useState } from 'react';
import { ChevronDown, ChevronUp, NotebookPen, Radio } from 'lucide-react';
import { hasSessionMemory, normalizeSessionContext } from '../lib/session-context.js';

const STORAGE_KEY = 'quantora_working_notes_open';

function readDefaultOpen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(open) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
  } catch { /* best effort */ }
}

/**
 * Visible session brief — fed by conversation memory + listening layer signals.
 */
export default function StudioWorkingNotes({
  isLight,
  textColor,
  subtextColor,
  conversationContext,
  listeningSignals = [],
  onUpdateContext,
}) {
  const [open, setOpen] = useState(readDefaultOpen);
  const ctx = normalizeSessionContext(conversationContext);
  const hasNotes = hasSessionMemory(ctx) || listeningSignals.length > 0;

  if (!hasNotes) return null;

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      writeOpen(next);
      return next;
    });
  };

  return (
    <div
      className={`studio-working-notes${isLight ? ' is-light' : ''}`}
      style={{
        margin: '0 18px 4px',
        borderRadius: '12px',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
        background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.55)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: textColor,
          fontSize: '0.78rem',
          fontWeight: 700,
        }}
      >
        <NotebookPen size={14} color="#0284c7" />
        Working notes
        <span style={{ color: subtextColor, fontWeight: 500, fontSize: '0.72rem' }}>
          Quantora is listening
        </span>
        <span style={{ marginLeft: 'auto', color: subtextColor }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ctx.goal && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', color: subtextColor }}>
              Goal
              <input
                value={ctx.goal}
                onChange={(e) => onUpdateContext?.({ goal: e.target.value })}
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.12)',
                  background: isLight ? '#fff' : 'rgba(0,0,0,0.2)',
                  color: textColor,
                  fontSize: '0.8rem',
                }}
              />
            </label>
          )}

          {ctx.understanding && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', color: subtextColor }}>
              Understanding
              <textarea
                value={ctx.understanding}
                onChange={(e) => onUpdateContext?.({ understanding: e.target.value })}
                rows={2}
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.12)',
                  background: isLight ? '#fff' : 'rgba(0,0,0,0.2)',
                  color: textColor,
                  fontSize: '0.8rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </label>
          )}

          {ctx.facts?.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', color: subtextColor, marginBottom: '4px' }}>Facts</div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: textColor, lineHeight: 1.5 }}>
                {ctx.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
          )}

          {listeningSignals.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', color: subtextColor, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Radio size={12} /> Recent activity
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {listeningSignals.slice(0, 5).map((signal, i) => (
                  <li
                    key={`${signal.at}-${i}`}
                    style={{
                      fontSize: '0.72rem',
                      color: subtextColor,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: isLight ? '#eff6ff' : 'rgba(2, 132, 199, 0.12)',
                    }}
                  >
                    {signal.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
