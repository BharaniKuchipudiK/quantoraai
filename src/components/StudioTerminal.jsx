import React, { useEffect, useRef, useState } from 'react';
import { studioFileCount, studioTerminalBlocker } from '../lib/studio-terminal.js';
import { runCommandInWorkspace } from '../lib/webcontainer.js';

export default function StudioTerminal({ vfs = {}, isLight, textColor, subtextColor }) {
  const [lines, setLines] = useState([]);
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef(null);
  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const fileCount = studioFileCount(vfs);
  const blocker = studioTerminalBlocker({ isolated, fileCount });

  useEffect(() => {
    scrollerRef.current?.scrollTo?.(0, scrollerRef.current.scrollHeight);
  }, [lines, busy]);

  async function runLine(event) {
    event?.preventDefault?.();
    const line = command.trim();
    if (!line || busy) return;
    if (blocker) {
      setLines((prev) => [...prev, `$ ${line}`, blocker]);
      setCommand('');
      return;
    }
    setBusy(true);
    setLines((prev) => [...prev, `$ ${line}`]);
    setCommand('');
    try {
      const result = await runCommandInWorkspace(vfs, line);
      setLines((prev) => [...prev, result.output || '(no output)']);
    } catch (error) {
      setLines((prev) => [...prev, error?.message || 'The shell could not start.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-quantora-studio-terminal="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: isLight ? '#0f172a' : '#05070f',
        color: '#e2e8f0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '0.78rem',
      }}
    >
      <div ref={scrollerRef} style={{ flex: 1, overflow: 'auto', padding: '12px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {blocker ? (
          <div style={{ color: '#fbbf24', marginBottom: '12px' }}>{blocker}</div>
        ) : (
          <div style={{ color: '#94a3b8', marginBottom: '12px' }}>
            Shell runs against the files on this desk. Real output only.
          </div>
        )}
        {lines.map((line, index) => (
          <div key={`${index}-${line.slice(0, 24)}`} style={{ color: line.startsWith('$ ') ? '#fdba74' : '#e2e8f0' }}>
            {line}
          </div>
        ))}
        {busy ? <div style={{ color: '#94a3b8' }}>running…</div> : null}
      </div>
      <form onSubmit={runLine} style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ padding: '10px 0 10px 12px', color: '#f97316' }}>$</span>
        <input
          data-quantora-studio-terminal-input="true"
          value={command}
          disabled={busy}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={blocker ? 'Shell is not available yet' : 'ls'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: textColor || '#e2e8f0',
            padding: '10px 12px',
          }}
        />
      </form>
    </div>
  );
}
