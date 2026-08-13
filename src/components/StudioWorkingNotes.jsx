import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Database, NotebookPen, Radio, Trash2 } from 'lucide-react';
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
  memoryConsented = false,
  onMemoryConsentChange,
}) {
  const [open, setOpen] = useState(readDefaultOpen);
  const ctx = normalizeSessionContext(conversationContext);
  const hasNotes = hasSessionMemory(ctx) || listeningSignals.length > 0;

  if (!hasNotes && !memoryConsented) return null;

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
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px',
              borderRadius: '8px',
              background: isLight ? '#eef2ff' : 'rgba(99, 102, 241, 0.12)',
            }}
          >
            <Database size={14} color="#6366f1" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: textColor }}>Outcome Memory</div>
              <div style={{ fontSize: '0.68rem', color: subtextColor }}>
                Save confirmed goals and decisions for this session. You can remove them at any time.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={memoryConsented}
              onClick={() => onMemoryConsentChange?.(!memoryConsented)}
              style={{
                width: '38px', height: '22px', borderRadius: '999px', padding: '2px', border: 'none',
                cursor: 'pointer', background: memoryConsented ? '#4f46e5' : '#94a3b8',
              }}
              title={memoryConsented ? 'Disable and delete saved Outcome Memory' : 'Enable Outcome Memory'}
            >
              <span style={{
                display: 'block', width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                transform: memoryConsented ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 160ms ease',
              }} />
            </button>
          </div>

          {memoryConsented && (
            <button
              type="button"
              onClick={() => onMemoryConsentChange?.(false)}
              style={{
                alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '5px',
                border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer',
                padding: '2px 0', fontSize: '0.69rem', fontWeight: 600,
              }}
            >
              <Trash2 size={12} /> Forget saved memory
            </button>
          )}

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
