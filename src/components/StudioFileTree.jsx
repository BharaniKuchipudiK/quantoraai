import React from 'react';
import { FileCode, Play, Terminal } from 'lucide-react';
import { listStudioFiles, studioFileLabel } from '../lib/studio-file-tree.js';

export default function StudioFileTree({
  vfs,
  activePath,
  onSelect,
  isLight,
  textColor,
  subtextColor,
}) {
  const files = listStudioFiles(vfs);

  return (
    <div
      data-quantora-file-tree="true"
      style={{
        width: '168px',
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        borderRight: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
        background: isLight ? '#f8fafc' : '#070913',
        padding: '8px 6px',
      }}
    >
      <div style={{
        fontSize: '0.65rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        color: subtextColor,
        padding: '4px 8px 8px',
        textTransform: 'uppercase',
      }}
      >
        Files
      </div>
      <button
        type="button"
        onClick={() => onSelect('preview')}
        style={rowStyle(activePath === 'preview', isLight, textColor, subtextColor)}
      >
        <Play size={12} />
        Preview
      </button>
      <button
        type="button"
        onClick={() => onSelect('terminal')}
        style={rowStyle(activePath === 'terminal', isLight, textColor, subtextColor)}
      >
        <Terminal size={12} />
        Terminal
      </button>
      {files.length === 0 ? (
        <div style={{ padding: '10px 8px', fontSize: '0.72rem', color: subtextColor, lineHeight: 1.45 }}>
          No files yet. Ask me to build something.
        </div>
      ) : files.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => onSelect(path)}
          title={path}
          style={rowStyle(activePath === path, isLight, textColor, subtextColor)}
        >
          <FileCode size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {studioFileLabel(path)}
          </span>
        </button>
      ))}
    </div>
  );
}

function rowStyle(active, isLight, textColor, subtextColor) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderRadius: '8px',
    padding: '7px 8px',
    marginBottom: '2px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: active ? 700 : 500,
    color: active ? '#f97316' : textColor,
    background: active
      ? (isLight ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.12)')
      : 'transparent',
  };
}
