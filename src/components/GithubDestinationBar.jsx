import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, GitBranch, Github } from 'lucide-react';
import {
  GITHUB_CONNECT_URL,
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
 * The question a builder asks first is not "what model" but "where does this
 * end up". Answering it up front is also the only point at which the answer is
 * cheap: a repository you cannot write to costs nothing to swap now, and costs
 * the whole build to discover at the push.
 *
 * Not choosing is a first-class answer. The default is no repository at all,
 * and the bar says so in words rather than showing an empty slot — most builds
 * never want one, and a picker that blocks the composer until it is satisfied
 * would be a worse product than no picker.
 *
 * ---------------------------------------------------------------------------
 * PRESENTATION: this lives IN the composer's bottom toolbar, beside Engine.
 *
 * The first version put it in its own row above the textarea as outlined blue
 * pills. Two things were wrong and both were visible in one screenshot:
 *
 * 1. It read as an alert, not a setting. A loud bordered pill above the prompt
 *    competes with the thing the user came to type. The destination is the same
 *    class of control as the engine picker — quiet until you look for it — so it
 *    is styled exactly like it and sits in the same row.
 *
 * 2. The label was cut mid-word: "Connect GitHub to choose where th". That was
 *    not merely a long string. `text-overflow: ellipsis` DOES NOTHING on a flex
 *    container, and the button was `display: inline-flex` with `overflow:
 *    hidden` — so the browser hard-clipped and drew no ellipsis. Truncation has
 *    to happen on a block-level child, which is what `truncate` below is for.
 *    The copy is also short now, because a control that needs a sentence is a
 *    control in the wrong place.
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

  const muted = subtextColor || (isLight ? '#64748b' : '#94a3b8');
  const strong = textColor || (isLight ? '#0f172a' : '#e5e5e5');
  const border = isLight ? '1px solid #e5e5e5' : '1px solid rgba(255,255,255,0.1)';
  const surface = isLight ? '#ffffff' : '#0b1220';
  const activeBackground = isLight ? '#f5f5f5' : 'rgba(255, 255, 255, 0.1)';

  /*
   * The Engine button's exact idiom: transparent until it is open, then the
   * same wash and the same orange. Matching it by copy rather than by a shared
   * token is deliberate — there is no token, and inventing one here would style
   * this control to a standard nothing else in the toolbar follows.
   */
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

  // Ellipsis needs a block box. On the flex parent it does nothing at all.
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

  /*
    Shown in place of the inert red line when GitHub has refused the stored
    token. The remedy the server names has to be reachable from where the
    refusal is read — see isGithubTokenRejected.
  */
  const renderError = () => {
    if (!error) return null;
    if (!isGithubTokenRejected(error)) {
      return <div style={{ ...itemStyle, color: '#fca5a5' }}>{error}</div>;
    }
    const prompt = githubReconnectPrompt();
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

  if (connection && connection.connected !== true) {
    return (
      <a
        href={GITHUB_CONNECT_URL}
        data-quantora-github-destination="disconnected"
        data-quantora-github-destination-connect="true"
        title="Connect GitHub to choose where this build is saved"
        style={{ ...control(false), textDecoration: 'none' }}
      >
        <Github size={15} />
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
              ? `Branch this build is saved to: ${chip.label}`
              : chip.id === 'owner'
                ? `Signed in to GitHub as ${chip.label}`
                : 'Repository this build is saved to'}
          >
            {chip.id === 'branch' ? <GitBranch size={15} /> : <Github size={15} />}
            <span style={truncate}>{chip.label}</span>
            {chip.id !== 'owner' ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : null}
          </button>

          {open === 'repo' && chip.id === 'repo' ? (
            <div style={menuStyle} data-quantora-github-destination-menu="repo">
              <button type="button" style={{ ...itemStyle, color: muted }} onClick={() => { onChange?.(null); setOpen(''); }}>
                <span style={{ fontWeight: 600 }}>Don&apos;t save to GitHub</span>
                <span style={{ fontSize: '0.7rem' }}>Build here only. You can choose a repository later.</span>
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
                  disabled={!row.canPush}
                  onClick={() => chooseRepository(row)}
                  style={{ ...itemStyle, opacity: row.canPush ? 1 : 0.45, cursor: row.canPush ? 'pointer' : 'not-allowed' }}
                  title={row.canPush ? undefined : 'You have read access to this repository, not write.'}
                >
                  <span style={{ fontWeight: 600 }}>{row.fullName}</span>
                  <span style={{ fontSize: '0.7rem', color: muted }}>
                    {row.isPrivate ? 'Private' : 'Public'} · {row.defaultBranch}
                    {row.canPush ? '' : ' · read only'}
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
          title={`Load ${target.owner}/${target.repo} at ${target.branch} into the desk`}
        >
          <span style={truncate}>Open in desk</span>
        </button>
      ) : null}

      {/*
        * The one case that still gets a colour: a repository the user cannot
        * write to. It is a warning about work that is going to be lost, so it
        * does not get to be quiet — but it is a tooltip-width sentence on a
        * toolbar, so it is truncated with the full text in `title`.
        */}
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
