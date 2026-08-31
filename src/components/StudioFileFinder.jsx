import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCode, Search } from 'lucide-react';
import { rankDeskFileMatches } from '../lib/desk-file-search.js';
import { listStudioFiles } from '../lib/studio-file-tree.js';

/**
 * Quick-open, on the `+` in the tab strip and on Ctrl/Cmd + P.
 *
 * With a real tab strip, reaching a file by scrolling a tree is the slow path.
 * This is the fast one: type a few letters, Enter, it opens in a tab.
 */
export default function StudioFileFinder({ open, vfs = {}, onPick, onClose, isLight }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  const files = useMemo(() => listStudioFiles(vfs), [vfs]);
  const matches = useMemo(() => rankDeskFileMatches(files, query, 40), [files, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    // Focus after paint so the palette is actually mounted and typable.
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // A stale cursor after the list shrinks would open the wrong file on Enter.
  useEffect(() => {
    setCursor((current) => (current < matches.length ? current : 0));
  }, [matches.length]);

  if (!open || typeof document === 'undefined') return null;

  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';

  const commit = (path) => {
    if (!path) return;
    onPick?.(path);
    onClose?.();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (matches.length ? (c + 1) % matches.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (matches.length ? (c - 1 + matches.length) % matches.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(matches[cursor]);
    }
  };

  return createPortal(
    <div
      data-quantora-desk-finder-backdrop="true"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50000,
        background: 'rgba(2, 6, 23, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
      }}
    >
      <div
        data-quantora-desk-finder="true"
        role="dialog"
        aria-label="Open a file"
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: isLight ? '#ffffff' : '#0f172a',
          border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.12)',
          borderRadius: '14px',
          boxShadow: '0 28px 64px rgba(2,6,23,0.5)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 14px',
          borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
        }}>
          <Search size={15} color={subtextColor} style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            data-quantora-desk-finder-input="true"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Open a file…"
            aria-label="Open a file"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: textColor,
              fontSize: '0.9rem',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', padding: '6px' }}>
          {matches.length === 0 ? (
            <div style={{ padding: '18px 12px', color: subtextColor, fontSize: '0.8rem' }}>
              {files.length === 0 ? 'No files on the desk yet.' : 'No file matches that.'}
            </div>
          ) : matches.map((path, index) => (
            <button
              key={path}
              type="button"
              data-quantora-desk-finder-row={path}
              onClick={() => commit(path)}
              onMouseEnter={() => setCursor(index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontFamily: 'inherit',
                color: index === cursor ? '#f97316' : textColor,
                background: index === cursor
                  ? (isLight ? 'rgba(249,115,22,0.10)' : 'rgba(249,115,22,0.14)')
                  : 'transparent',
              }}
            >
              <FileCode size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {path}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
