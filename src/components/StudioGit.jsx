import React, { useEffect, useRef, useState } from 'react';
import { looksLikeMissingGitRepo, studioGitBlocker, studioGitFileCount } from '../lib/studio-git.js';
import { runGitInWorkspace } from '../lib/webcontainer.js';

export default function StudioGit({ vfs = {}, workspaceKey = '', isLight, textColor }) {
  const [log, setLog] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsInit, setNeedsInit] = useState(true);
  const scrollerRef = useRef(null);
  const primedKey = useRef('');
  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const fileCount = studioGitFileCount(vfs);
  const blocker = studioGitBlocker({ isolated, fileCount });

  useEffect(() => {
    scrollerRef.current?.scrollTo?.(0, scrollerRef.current.scrollHeight);
  }, [log, busy]);

  useEffect(() => {
    if (blocker || !fileCount || primedKey.current === workspaceKey) return undefined;
    primedKey.current = workspaceKey;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const result = await runGitInWorkspace(vfs, { action: 'status', workspaceKey });
        if (cancelled) return;
        const output = result.output || '(git failed)';
        setNeedsInit(!result.ok || looksLikeMissingGitRepo(output));
        setLog((prev) => (prev.length ? prev : [`$ git status`, output]));
      } catch (error) {
        if (!cancelled) setLog((prev) => (prev.length ? prev : [error?.message || 'Git could not start.']));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [blocker, fileCount, vfs, workspaceKey]);

  async function runAction(action) {
    if (busy) return;
    if (blocker) {
      setLog((prev) => [...prev, `$ git ${action}`, blocker]);
      return;
    }
    setBusy(true);
    setLog((prev) => [...prev, `$ git ${action}`]);
    try {
      const result = await runGitInWorkspace(vfs, { action, message, workspaceKey });
      const output = result.output
        || (result.ok
          ? (action === 'init' ? 'Git is ready in this app.' : 'No local changes.')
          : '(git failed)');
      setNeedsInit(action === 'init' ? !result.ok : looksLikeMissingGitRepo(output));
      setLog((prev) => [...prev, output]);
      if (action === 'commit' && result.ok) setMessage('');
    } catch (error) {
      setLog((prev) => [...prev, error?.message || 'Git could not start.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-quantora-studio-git="true"
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
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', lineHeight: 1.45 }}>
        Git is for this app’s files on the desk. Status, diff, and commit only — not Quantora’s GitHub.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button type="button" data-quantora-studio-git-status="true" disabled={busy} onClick={() => runAction('status')} style={gitButtonStyle}>
          Status
        </button>
        <button type="button" data-quantora-studio-git-diff="true" disabled={busy} onClick={() => runAction('diff')} style={gitButtonStyle}>
          Diff
        </button>
        {needsInit ? (
          <button type="button" data-quantora-studio-git-init="true" disabled={busy} onClick={() => runAction('init')} style={gitButtonStyle}>
            Start git in this app
          </button>
        ) : null}
      </div>
      <div ref={scrollerRef} style={{ flex: 1, overflow: 'auto', padding: '12px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {blocker ? (
          <div style={{ color: '#fbbf24', marginBottom: '12px' }}>{blocker}</div>
        ) : null}
        <div data-quantora-studio-git-log="true">
        {log.map((line, index) => (
          <div key={`${index}-${line.slice(0, 24)}`} style={{ color: line.startsWith('$ ') ? '#fdba74' : '#e2e8f0' }}>
            {line}
          </div>
        ))}
        </div>
        {busy ? <div style={{ color: '#94a3b8' }}>running…</div> : null}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          runAction('commit');
        }}
        style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <input
          data-quantora-studio-git-message="true"
          value={message}
          disabled={busy || Boolean(blocker)}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={blocker ? 'Git is not available yet' : 'Commit message for this app'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: textColor || '#e2e8f0',
            padding: '10px 12px',
          }}
        />
        <button type="submit" data-quantora-studio-git-commit="true" disabled={busy || Boolean(blocker)} style={{ ...gitButtonStyle, margin: '8px 10px' }}>
          Commit
        </button>
      </form>
    </div>
  );
}

const gitButtonStyle = {
  border: '1px solid rgba(249,115,22,0.35)',
  background: 'rgba(249,115,22,0.12)',
  color: '#fdba74',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};
