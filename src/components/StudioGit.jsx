import React, { useEffect, useRef, useState } from 'react';
import { classifyDeskGitLine, looksLikeMissingGitRepo, studioGitBlocker, studioGitFileCount } from '../lib/studio-git.js';
import {
  GITHUB_CREATE_PR_ENDPOINT,
  buildGithubCreatePrRequestBody,
  githubCompareUrl,
  readGithubApiJson,
} from '../lib/github-import.js';
import { runGitInWorkspace } from '../lib/webcontainer.js';

/*
 * Security containment for #452.
 *
 * The backend shared-token write seam is fail-closed until Quantora can prove
 * the signed-in principal is authorized for the target GitHub repository and
 * exact action. Keep the existing request code wired so the permanent fix has
 * one path to re-enable, but do not paint a clickable door that is guaranteed
 * to fail while containment is active.
 */
const SHARED_GITHUB_WRITES_AVAILABLE = false;

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
  const [prBusy, setPrBusy] = useState(false);
  const scrollerRef = useRef(null);
  const primedKey = useRef('');
  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const fileCount = studioGitFileCount(vfs);
  const blocker = studioGitBlocker({ isolated, fileCount });
  const baseBranch = (githubBaseBranch && String(githubBaseBranch).trim()) || 'main';
  const compareUrl = githubCompareUrl(githubRepoUrl, prHead || 'quantora-desk', baseBranch);

  useEffect(() => {
    scrollerRef.current?.scrollTo?.(0, scrollerRef.current.scrollHeight);
  }, [log, busy, prBusy]);

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

  async function createPullRequest() {
    if (!SHARED_GITHUB_WRITES_AVAILABLE) {
      setLog((prev) => [
        ...prev,
        'Create PR is temporarily unavailable while Quantora hardens repository authorization. Open the GitHub compare and create the PR there for now.',
      ]);
      return;
    }
    if (prBusy) return;
    if (!githubRepoUrl) {
      setLog((prev) => [
        ...prev,
        'Create PR needs an imported repository URL. Import the repo first, push a head branch from your machine, then retry.',
      ]);
      return;
    }
    setPrBusy(true);
    setLog((prev) => [...prev, `$ create-pr ${prHead || 'quantora-desk'} → ${baseBranch}`]);
    try {
      const response = await fetch(GITHUB_CREATE_PR_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGithubCreatePrRequestBody({
          repoUrl: githubRepoUrl,
          title: message.trim() || `Quantora desk: ${prHead || 'quantora-desk'}`,
          head: prHead || 'quantora-desk',
          base: baseBranch,
          body: 'Opened from Quantora Coding Desk. Desk git commits locally only; the head branch must already exist on GitHub.',
        })),
      });
      const parsed = await readGithubApiJson(response);
      if (!parsed.ok) {
        setLog((prev) => [...prev, parsed.error || 'Could not create the pull request.']);
        return;
      }
      const url = parsed.data?.htmlUrl || parsed.data?.url;
      setLog((prev) => [
        ...prev,
        url ? `Pull request #${parsed.data.number}: ${url}` : `Pull request #${parsed.data?.number} created.`,
        parsed.data?.canMerge
          ? 'Merge is available server-side when GITHUB_TOKEN has repo scope (see docs/GITHUB.md).'
          : 'Merge is not configured until GITHUB_TOKEN is set in Vercel.',
      ]);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setLog((prev) => [...prev, error?.message || 'Could not create the pull request.']);
    } finally {
      setPrBusy(false);
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
        Git is for this app’s files on the desk. Status, diff, and commit run locally. Push still happens outside the desk. Create PR is temporarily unavailable while repository authorization is hardened; Open on GitHub remains available.
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
          disabled={busy || prBusy}
          onClick={openOnGithub}
          style={gitButtonStyle}
        >
          Open on GitHub
        </button>
        <button
          type="button"
          data-quantora-studio-git-create-pr="true"
          disabled={!SHARED_GITHUB_WRITES_AVAILABLE || busy || prBusy || !githubRepoUrl}
          onClick={createPullRequest}
          title={!SHARED_GITHUB_WRITES_AVAILABLE ? 'Temporarily unavailable while repository authorization is hardened' : undefined}
          style={gitButtonStyle}
        >
          {SHARED_GITHUB_WRITES_AVAILABLE ? (prBusy ? 'Creating PR…' : 'Create PR') : 'Create PR unavailable'}
        </button>
      </div>
      {githubRepoUrl ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <label htmlFor="quantora-pr-head" style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Head branch</label>
          <input
            id="quantora-pr-head"
            data-quantora-studio-git-pr-head="true"
            value={prHead}
            disabled={prBusy}
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
        {busy || prBusy ? <div style={{ color: '#94a3b8' }}>running…</div> : null}
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
