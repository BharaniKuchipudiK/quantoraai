import React, { useEffect, useRef, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';

function timeLabel(at) {
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * The desk's rewind control: every accepted workspace change is a restore
 * point, listed newest first. Restoring never loses work — the engine records
 * the current state first (see desk-checkpoints.js), so the copy here can
 * promise "go back" without a confirmation dialog standing in the way.
 */
export default function DeskRewindMenu({
  checkpoints = [],
  onRestore,
  isLight,
  textColor,
  subtextColor,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!checkpoints.length) return null;

  const border = isLight ? 'rgba(15,23,26,0.14)' : 'rgba(230,236,236,0.16)';
  const menuBg = isLight ? '#ffffff' : '#161d1f';
  const hoverBg = isLight ? 'rgba(15,23,26,0.05)' : 'rgba(230,236,236,0.07)';

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Rewind workspace"
        aria-haspopup="menu"
        aria-expanded={open}
        data-quantora-desk-rewind
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: '26px',
          padding: '0 7px',
          borderRadius: '7px',
          border: `1px solid ${border}`,
          background: 'transparent',
          color: subtextColor,
          fontSize: '0.72rem',
          cursor: 'pointer',
        }}
      >
        <History size={13} />
        Rewind
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '30px',
            right: 0,
            zIndex: 60,
            minWidth: '230px',
            maxHeight: '280px',
            overflowY: 'auto',
            background: menuBg,
            border: `1px solid ${border}`,
            borderRadius: '9px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: '5px',
          }}
        >
          {checkpoints.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              disabled={entry.isCurrent}
              onClick={() => {
                setOpen(false);
                if (!entry.isCurrent) onRestore?.(entry.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 8px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: textColor,
                textAlign: 'left',
                fontSize: '0.76rem',
                cursor: entry.isCurrent ? 'default' : 'pointer',
                opacity: entry.isCurrent ? 0.55 : 1,
              }}
              onMouseEnter={(event) => { if (!entry.isCurrent) event.currentTarget.style.background = hoverBg; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
            >
              <RotateCcw size={12} style={{ flexShrink: 0, opacity: entry.isCurrent ? 0.4 : 0.8 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.isCurrent ? 'Current workspace' : entry.label}
              </span>
              <span style={{ color: subtextColor, fontSize: '0.68rem', flexShrink: 0 }}>
                {timeLabel(entry.at)} · {entry.fileCount}f
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
