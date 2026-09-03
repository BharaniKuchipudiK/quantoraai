import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { classifyDeskGitLine, looksLikeMissingGitRepo, studioGitBlocker, studioGitFileCount } from '../lib/studio-git.js';
import { githubCompareUrl } from '../lib/github-import.js';
import { runGitInWorkspace } from '../lib/webcontainer.js';

/*
 * Pull request work moved out of this pane and into GithubPullRequests.
 *
 * Security issue #452 is resolved rather than contained: Quantora no longer
 * holds a shared credential that can write to GitHub, and every pull request
 * action now runs on the signed-in user's own GitHub authorization, checked
 * against that repository on each request. The single "Create PR" button that
 * was disabled here is replaced by a panel that can also read the pull requests
 * already in flight — which is where most of the value was all along.
 *
 * Desk git itself is unchanged and still local-only: status, diff, commit, no
 * push. Nothing below should imply otherwise.
 */
const GithubPullRequests = lazy(() => import('./GithubPullRequests.jsx'));

export default function StudioGit({
  vfs = {},
  workspaceKey = '',
  githubRepoUrl = '',
  githubBaseBranch = 'main',
  isLight,
  textColor,
}) {
  const [log, setLog] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsInit, setNeedsInit] = useState(true);
  const [prHead, setPrHead] = useState('quantora-desk');
  const scrollerRef = useRef(null);
  const primedKey = useRef('');
  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const fileCount = studioGitFileCount(vfs);
  const blocker = studioGitBlocker({ isolated, fileCount });
  const baseBranch = (githubBaseBranch && String(githubBaseBranch).trim()) || 'main';
  const compareUrl = githubCompareUrl(githubRepoUrl, prHead || 'quantora-desk', baseBranch);

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

  function openOnGithub() {
    if (!compareUrl) {
      setLog((prev) => [
        ...prev,
        'Open on GitHub needs an imported repository URL (use Import Repository in the composer). Desk git still does not push.',
      ]);
      return;
    }
    window.open(compareUrl, '_blank', 'noopener,noreferrer');
    setLog((prev) => [
      ...prev,
      `$ open ${compareUrl}`,
      'Opened GitHub compare. Push the head branch from your machine first — desk git cannot push to Quantora’s GitHub.',
    ]);
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
        Git is for this app’s files on the desk. Status, diff, and commit run locally — the desk never pushes. Pull requests below run on your own connected GitHub account, so a branch must already exist on GitHub before a pull request can open against it.
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
        <button
          type="button"
          data-quantora-studio-git-open-github="true"
          disabled={busy}
          onClick={openOnGithub}
          style={gitButtonStyle}
        >
          Open on GitHub
        </button>
      </div>
      {githubRepoUrl ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <label htmlFor="quantora-pr-head" style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Head branch</label>
          <input
            id="quantora-pr-head"
            data-quantora-studio-git-pr-head="true"
            value={prHead}
            onChange={(event) => setPrHead(event.target.value)}
            placeholder="quantora-desk"
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              color: '#e2e8f0',
              padding: '6px 10px',
              font: 'inherit',
            }}
          />
        </div>
      ) : null}
      <Suspense fallback={<div style={{ padding: '10px 12px', color: '#94a3b8' }}>Loading pull requests…</div>}>
        <GithubPullRequests
          repoUrl={githubRepoUrl}
          headBranch={prHead || 'quantora-desk'}
          baseBranch={baseBranch}
        />
      </Suspense>
      <div ref={scrollerRef} style={{ flex: 1, overflow: 'auto', padding: '12px 14px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {blocker ? (
          <div style={{ color: '#fbbf24', marginBottom: '12px' }}>{blocker}</div>
        ) : null}
        <div data-quantora-studio-git-log="true">
        {log.flatMap((entry, index) => String(entry).split('\n').map((line, lineIndex) => {
          const kind = classifyDeskGitLine(line);
          return (
            <div
              key={`${index}-${lineIndex}-${line.slice(0, 24)}`}
              data-quantora-studio-git-line={kind}
              style={{ color: GIT_LINE_COLORS[kind], minHeight: '1.15em' }}
            >
              {line}
            </div>
          );
        }))}
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

const GIT_LINE_COLORS = {
  command: '#fdba74',
  hunk: '#38bdf8',
  file: '#a5b4fc',
  add: '#4ade80',
  del: '#f87171',
  plain: '#e2e8f0',
};

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
