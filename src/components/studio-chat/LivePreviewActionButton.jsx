import React from 'react';
import { Loader, Play } from 'lucide-react';

export default function LivePreviewActionButton({ msg, meta, onOpen, compact = false }) {
  if (!meta) return null;
  const iconSize = compact ? 10 : 13;
  return (
    <button
      type="button"
      disabled={meta.disabled}
      title={meta.title}
      onClick={() => !meta.disabled && onOpen(msg.codeSnippet || msg.text)}
      style={{
        background: meta.disabled ? 'rgba(148, 163, 184, 0.12)' : 'rgba(249, 115, 22, 0.15)',
        border: meta.disabled ? '1px solid rgba(148, 163, 184, 0.35)' : '1px solid rgba(249, 115, 22, 0.4)',
        color: meta.disabled ? '#94a3b8' : '#f97316',
        padding: compact ? '4px 8px' : '6px 12px',
        borderRadius: '8px',
        fontSize: compact ? '0.72rem' : '0.78rem',
        fontWeight: '700',
        cursor: meta.disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '4px' : '6px',
        opacity: meta.disabled ? 0.85 : 1,
      }}
    >
      {meta.disabled ? <Loader size={iconSize} className="animate-spin" /> : <Play size={iconSize} />}
      {meta.label}
    </button>
  );
}
