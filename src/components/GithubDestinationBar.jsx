import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, GitBranch, Github } from 'lucide-react';
import {
  githubConnectUrl,
  githubReconnectPrompt,
  isGithubTokenRejected,
  GITHUB_ENDPOINTS,
  buildGithubStageBody,
  githubDestinationBlocker,
  githubDestinationChips,
  githubDestinationRepoUrl,
  normalizeGithubDestination,
} from '../lib/github-workspace.js';

/*
 * Where this work is going to sit, chosen before it starts.
 *
 * Selecting a repository is also the point at which the coding desk should get
 * a real working copy. A selected owner/repo/branch that remains only toolbar
 * state is actively misleading: the user sees GitHub connected while the model
 * still has no source to review. The picker therefore loads the chosen branch
 * through the existing checkout path immediately; the explicit refresh control
 * remains for pulling the branch again later.
 */

async function postStage(endpoint, payload = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(buildGithubStageBody(endpoint, payload)),
  });
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, data: null, error: `GitHub returned an unreadable response (HTTP ${response.status}).` };
  }
  if (!response.ok) {
    return { ok: false, data, error: String(data?.error || `That did not complete (HTTP ${response.status}).`) };
  }
  return { ok: true, data, error: '' };
}

export default function GithubDestinationBar({
  destination = null,
  onChange,
  onOpenInDesk,
  isLight = false,
  textColor = null,
  subtextColor = null,
}) {
  const [connection, setConnection] = useState(null);
  const [open, setOpen] = useState('');
  const [repositories, setRepositories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const target = normalizeGithubDestination(destination);
  const chips = githubDestinationChips(target, connection);
  const blocker = githubDestinationBlocker(target);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await postStage(GITHUB_ENDPOINTS.connection, {});
      if (!cancelled) setConnection(result.ok ? result.data : { connected: false });
    })();
    return () => { cancelled = true; };
  }, []);

  const loadRepositories = useCallback(async () => {
    setBusy(true);
    setError('');
    const result = await postStage(GITHUB_ENDPOINTS.listRepositories, { limit: 50 });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRepositories(Array.isArray(result.data?.repositories) ? result.data.repositories : []);
  }, []);

  const loadBranches = useCallback(async () => {
    if (!target) return;
    setBusy(true);
    setError('');
    const result = await postStage(GITHUB_ENDPOINTS.listBranches, {
      repoUrl: githubDestinationRepoUrl(target),
      defaultBranch: target.defaultBranch,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBranches(Array.isArray(result.data?.branches) ? result.data.branches : []);
  }, [target]);

  function toggle(panel) {
    if (open === panel) {
      setOpen('');
      return;
    }
    setOpen(panel);
    setError('');
    if (panel === 'repo') loadRepositories();
    if (panel === 'branch') loadBranches();
  }

  function chooseRepository(row) {
    const next = {
      owner: row.owner,
      repo: row.repo,
      defaultBranch: row.defaultBranch,
      branch: row.defaultBranch,
      canPush: row.canPush,
      isPrivate: row.isPrivate,
    };
    onChange?.(next);
    setBranches([]);
    setOpen('');
    // Selecting a repository means "work on this repository", not merely
    // "remember this name for a later push". The existing checkout callback
    // owns the real clone/pull semantics and protects unsaved desk work.
    if (onOpenInDesk) void onOpenInDesk(next);
  }

  function chooseBranch(name) {
    if (!target) return;
    const next = { ...target, branch: name };
    onChange?.(next);
    setOpen('');
    // A branch switch is a pull of that branch into the working copy. Without
    // this, the chip changes while the desk still contains the previous branch.
    if (onOpenInDesk) void onOpenInDesk(next);
  }

  const muted = subtextColor || (isLight ? '#64748b' : '#94a3b8');
  const strong = textColor || (isLight ? '#0f172a' : '#e5e5e5');
  const border = isLight ? '1px solid #e5e5e5' : '1px solid rgba(255,255,255,0.1)';
  const surface = isLight ? '#ffffff' : '#0b1220';
  const activeBackground = isLight ? '#f5f5f5' : 'rgba(255, 255, 255, 0.1)';

  const control = (active, tone) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    maxWidth: '160px',
    background: active ? activeBackground : 'transparent',
    border: 'none',
    color: active ? '#f97316' : tone === 'warn' ? '#f59e0b' : tone === 'set' ? strong : muted,
    padding: '4px 10px',
    borderRadius: '12px',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: '0.75rem',
    fontWeight: 600,
    transition: 'all 0.2s ease',
  });

  const truncate = {
    display: 'block',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const menuStyle = {
    position: 'absolute',
    bottom: 'calc(100% + 10px)',
    left: 0,
    zIndex: 101,
    minWidth: '260px',
    maxWidth: '340px',
    maxHeight: '320px',
    overflowY: 'auto',
    background: surface,
    border,
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    padding: '6px',
  };

  const itemStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: strong,
    font: 'inherit',
    fontSize: '0.78rem',
    cursor: 'pointer',
  };

  const renderError = () => {
    if (!error) return null;
    if (!isGithubTokenRejected(error)) {
      return <div style={{ ...itemStyle, color: '#fca5a5' }}>{error}</div>;
    }
    const prompt = githubReconnectPrompt(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '');
    return (
      <a
        href={prompt.href}
        data-quantora-github-reconnect="true"
        style={{ ...itemStyle, color: '#fca5a5', textDecoration: 'none', display: 'block' }}
      >
        <span style={{ fontWeight: 600, display: 'block' }}>{prompt.title}</span>
        <span style={{ fontSize: '0.7rem', display: 'block', marginTop: '2px' }}>{prompt.detail}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f97316', display: 'block', marginTop: '6px' }}>
          {prompt.action} →
        </span>
      </a>
    );
  };

  if (!connection || connection.connected !== true) {
    const reason = connection && !connection.connected ? String(connection.reason || '') : '';
    return (
      <a
        href={githubConnectUrl(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}
        data-quantora-github-destination="disconnected"
        data-quantora-github-destination-connect="true"
        data-quantora-github-destination-reason={reason || undefined}
        title={reason || 'Connect GitHub to load a repository into the coding desk'}
        style={{ ...control(false), textDecoration: 'none' }}
      >
        <Github size={15} color={reason ? '#f97316' : undefined} />
        <span style={truncate}>GitHub</span>
      </a>
    );
  }

  return (
    <div
      data-quantora-github-destination="true"
      style={{ display: 'flex', alignItems: 'center', gap: '2px', minWidth: 0 }}
    >
      {chips.map((chip) => (
        <div key={chip.id} style={{ position: 'relative', minWidth: 0 }}>
          <button
            type="button"
            data-quantora-github-destination-chip={chip.id}
            onClick={() => toggle(chip.id === 'owner' ? 'repo' : chip.id)}
            style={control(open === chip.id || (open === 'repo' && chip.id === 'owner'), chip.tone)}
            title={chip.id === 'branch'
              ? `Working branch: ${chip.label}`
              : chip.id === 'owner'
                ? `Signed in to GitHub as ${chip.label}`
                : 'Repository loaded into the coding desk and used for GitHub writes'}
          >
            {chip.id === 'branch' ? <GitBranch size={15} /> : <Github size={15} />}
            <span style={truncate}>{chip.label}</span>
            {chip.id !== 'owner' ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : null}
          </button>

          {open === 'repo' && chip.id === 'repo' ? (
            <div style={menuStyle} data-quantora-github-destination-menu="repo">
              <button type="button" style={{ ...itemStyle, color: muted }} onClick={() => { onChange?.(null); setOpen(''); }}>
                <span style={{ fontWeight: 600 }}>No GitHub repository</span>
                <span style={{ fontSize: '0.7rem' }}>Keep the current desk local only.</span>
              </button>
              {busy ? <div style={{ ...itemStyle, color: muted }}>Loading your repositories…</div> : null}
              {renderError()}
              {!busy && !error && repositories.length === 0 ? (
                <div style={{ ...itemStyle, color: muted }}>No repositories found on your account.</div>
              ) : null}
              {repositories.map((row) => (
                <button
                  key={row.fullName}
                  type="button"
                  data-quantora-github-destination-repo={row.fullName}
                  data-quantora-github-destination-writable={row.canPush ? 'true' : 'false'}
                  onClick={() => chooseRepository(row)}
                  style={itemStyle}
                  title={row.canPush
                    ? 'Load this repository into the coding desk'
                    : 'Read-only: Quantora can load and review it, but GitHub will refuse pushes.'}
                >
                  <span style={{ fontWeight: 600 }}>{row.fullName}</span>
                  <span style={{ fontSize: '0.7rem', color: muted }}>
                    {row.isPrivate ? 'Private' : 'Public'} · {row.defaultBranch}
                    {row.canPush ? ' · read/write' : ' · read only'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {open === 'branch' && chip.id === 'branch' ? (
            <div style={menuStyle} data-quantora-github-destination-menu="branch">
              {busy ? <div style={{ ...itemStyle, color: muted }}>Loading branches…</div> : null}
              {renderError()}
              {branches.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  data-quantora-github-destination-branch={row.name}
                  onClick={() => chooseBranch(row.name)}
                  style={itemStyle}
                >
                  <span style={{ fontWeight: 600 }}>{row.name}</span>
                  {row.isDefault || row.protected ? (
                    <span style={{ fontSize: '0.7rem', color: muted }}>
                      {[row.isDefault ? 'default' : '', row.protected ? 'protected' : ''].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}

      {target && onOpenInDesk ? (
        <button
          type="button"
          data-quantora-github-destination-open="true"
          onClick={() => onOpenInDesk(target)}
          style={control(false)}
          title={`Pull the latest ${target.owner}/${target.repo} at ${target.branch} into the desk`}
        >
          <span style={truncate}>Pull latest</span>
        </button>
      ) : null}

      {blocker ? (
        <span
          data-quantora-github-destination-blocker="true"
          title={blocker}
          style={{ ...truncate, maxWidth: '200px', fontSize: '0.72rem', color: '#f59e0b' }}
        >
          {blocker}
        </span>
      ) : null}
    </div>
  );
}
