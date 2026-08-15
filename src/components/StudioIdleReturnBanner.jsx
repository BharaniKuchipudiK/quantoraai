import React from 'react';
import { Clock, X } from 'lucide-react';

const IDLE_MS = 24 * 60 * 60 * 1000;

export function isSessionIdle(lastActiveAt, now = Date.now()) {
  if (!lastActiveAt) return false;
  return now - lastActiveAt > IDLE_MS;
}

export function touchSessionActivity(session) {
  if (!session) return session;
  return { ...session, lastActiveAt: Date.now() };
}

/**
 * Shown when user returns after 24h+ — nudge to continue the thread.
 */
export default function StudioIdleReturnBanner({
  sessionTitle,
  isLight,
  onContinue,
  onDismiss,
}) {
  return (
    <div
      role="note"
      style={{
        margin: '0 18px 6px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: isLight ? '1px solid #fde68a' : '1px solid rgba(245, 158, 11, 0.35)',
        background: isLight ? '#fffbeb' : 'rgba(245, 158, 11, 0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
      }}
    >
      <Clock size={16} color="#d97706" />
      <div style={{ flex: 1, minWidth: '180px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isLight ? '#92400e' : '#fde68a' }}>
          Welcome back
        </div>
        <div style={{ fontSize: '0.72rem', color: isLight ? '#b45309' : '#fcd34d' }}>
          Continue {sessionTitle ? `"${sessionTitle}"` : 'where you left off'}?
        </div>
      </div>
      <button
        type="button"
        onClick={onContinue}
        style={{
          background: '#f97316',
          color: '#fff',
          border: 'none',
          padding: '6px 12px',
          borderRadius: '8px',
          fontSize: '0.72rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Continue
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: isLight ? '#92400e' : '#fde68a',
          padding: '4px',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
