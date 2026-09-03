import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Cloud, GitBranch, Code2 } from 'lucide-react';
import {
  GITHUB_CONNECT_URL,
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
 * The question a builder asks first is not "what model" but "where does this
 * end up". Answering it up front is also the only point at which the answer is
 * cheap: a repository you cannot write to costs nothing to swap now, and costs
 * the whole build to discover at the push.
 *
 * Not choosing is a first-class answer. The default is no repository at all,
 * and the bar says so in words rather than showing an empty slot — most builds
 * never want one, and a picker that blocks the composer until it is satisfied
 * would be a worse product than no picker.
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
  isLight = false,
  compact = false,
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
    onChange?.({
      owner: row.owner,
      repo: row.repo,
      defaultBranch: row.defaultBranch,
      branch: row.defaultBranch,
      canPush: row.canPush,
      isPrivate: row.isPrivate,
    });
    setBranches([]);
    setOpen('');
  }

  function chooseBranch(name) {
    if (!target) return;
    onChange?.({ ...target, branch: name });
    setOpen('');
  }

  const border = isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.10)';
  const chipBackground = isLight ? '#f8fafc' : 'rgba(255,255,255,0.04)';
  const bodyColor = isLight ? '#334155' : '#cbd5f5';
  const mutedColor = isLight ? '#64748b' : '#94a3b8';
  const surface = isLight ? '#ffffff' : '#0b1220';

  const chipStyle = (tone) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: compact ? '3px 8px' : '4px 10px',
    borderRadius: '999px',
    border,
    background: chipBackground,
    color: tone === 'invite' ? '#38bdf8' : tone === 'warn' ? '#f59e0b' : tone === 'muted' ? mutedColor : bodyColor,
    font: 'inherit',
    fontSize: '0.75rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  const menuStyle = {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: 0,
    zIndex: 40,
    minWidth: '280px',
    maxWidth: '380px',
    maxHeight: '320px',
    overflowY: 'auto',
    background: surface,
    border,
    borderRadius: '12px',
    boxShadow: '0 18px 40px rgba(2,6,23,0.35)',
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
    color: bodyColor,
    font: 'inherit',
    fontSize: '0.78rem',
    cursor: 'pointer',
  };

  if (connection && connection.connected !== true) {
    return (
      <div data-quantora-github-destination="disconnected" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 2px 8px' }}>
        <a
          href={GITHUB_CONNECT_URL}
          data-quantora-github-destination-connect="true"
          style={{ ...chipStyle('invite'), textDecoration: 'none' }}
        >
          <Cloud size={13} />
          Connect GitHub to choose where this lands
        </a>
      </div>
    );
  }

  return (
    <div
      data-quantora-github-destination="true"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', padding: '0 2px 8px' }}
    >
      {chips.map((chip) => (
        <div key={chip.id} style={{ position: 'relative' }}>
          <button
            type="button"
            data-quantora-github-destination-chip={chip.id}
            onClick={() => toggle(chip.id === 'owner' ? 'repo' : chip.id)}
            style={chipStyle(chip.tone)}
            title={chip.id === 'branch' ? 'Branch this build will be saved to' : 'Repository this build will be saved to'}
          >
            {chip.id === 'owner' ? <Cloud size={13} /> : chip.id === 'branch' ? <GitBranch size={13} /> : <Code2 size={13} />}
            {chip.label}
            {chip.id !== 'owner' ? <ChevronDown size={12} /> : null}
          </button>

          {open === 'repo' && chip.id === 'repo' ? (
            <div style={menuStyle} data-quantora-github-destination-menu="repo">
              <button type="button" style={{ ...itemStyle, color: mutedColor }} onClick={() => { onChange?.(null); setOpen(''); }}>
                <span style={{ fontWeight: 600 }}>Don&apos;t save to GitHub</span>
                <span style={{ fontSize: '0.7rem' }}>Build here only. You can choose a repository later.</span>
              </button>
              {busy ? <div style={{ ...itemStyle, color: mutedColor }}>Loading your repositories…</div> : null}
              {error ? <div style={{ ...itemStyle, color: '#fca5a5' }}>{error}</div> : null}
              {!busy && !error && repositories.length === 0 ? (
                <div style={{ ...itemStyle, color: mutedColor }}>No repositories found on your account.</div>
              ) : null}
              {repositories.map((row) => (
                <button
                  key={row.fullName}
                  type="button"
                  disabled={!row.canPush}
                  onClick={() => chooseRepository(row)}
                  style={{ ...itemStyle, opacity: row.canPush ? 1 : 0.45, cursor: row.canPush ? 'pointer' : 'not-allowed' }}
                  title={row.canPush ? undefined : 'You have read access to this repository, not write.'}
                >
                  <span style={{ fontWeight: 600 }}>{row.fullName}</span>
                  <span style={{ fontSize: '0.7rem', color: mutedColor }}>
                    {row.isPrivate ? 'Private' : 'Public'} · {row.defaultBranch}
                    {row.canPush ? '' : ' · read only'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {open === 'branch' && chip.id === 'branch' ? (
            <div style={menuStyle} data-quantora-github-destination-menu="branch">
              {busy ? <div style={{ ...itemStyle, color: mutedColor }}>Loading branches…</div> : null}
              {error ? <div style={{ ...itemStyle, color: '#fca5a5' }}>{error}</div> : null}
              {branches.map((row) => (
                <button key={row.name} type="button" onClick={() => chooseBranch(row.name)} style={itemStyle}>
                  <span style={{ fontWeight: 600 }}>{row.name}</span>
                  {row.isDefault || row.protected ? (
                    <span style={{ fontSize: '0.7rem', color: mutedColor }}>
                      {[row.isDefault ? 'default' : '', row.protected ? 'protected' : ''].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}

      {blocker ? (
        <span data-quantora-github-destination-blocker="true" style={{ fontSize: '0.72rem', color: '#f59e0b', flexBasis: '100%' }}>
          {blocker}
        </span>
      ) : null}
    </div>
  );
}
