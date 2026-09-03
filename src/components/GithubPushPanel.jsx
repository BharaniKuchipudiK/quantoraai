import React, { useMemo, useState } from 'react';
import {
  GITHUB_ENDPOINTS,
  buildGithubStageBody,
  deskFilesForPush,
  pushOutcomeMessage,
  suggestRepositoryName,
} from '../lib/github-workspace.js';
import { studioWorkspaceFileEntries } from '../lib/studio-workspace-tree.js';

/*
 * The step that makes a build the user's own.
 *
 * Everything else on this desk is reversible and local: the preview, the file
 * tree, the simulated git. This panel is the first control that writes to
 * something outside Quantora, so it says what it is about to do before it does
 * it — how many files, to which repository, on which branch — and reports back
 * what actually happened rather than "Done".
 *
 * It holds no credential. The server resolves the user's sealed GitHub token
 * and asks GitHub whether they may write, on every call.
 */

const panelStyle = {
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  color: '#e2e8f0',
  padding: '6px 10px',
  font: 'inherit',
};

const buttonStyle = {
  background: 'rgba(56,189,248,0.14)',
  border: '1px solid rgba(56,189,248,0.35)',
  borderRadius: '8px',
  color: '#e0f2fe',
  padding: '6px 12px',
  font: 'inherit',
  cursor: 'pointer',
};

async function postStage(endpoint, payload) {
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

export default function GithubPushPanel({ vfs = {}, githubRepoUrl = '', projectName = '' }) {
  const [mode, setMode] = useState(githubRepoUrl ? 'existing' : 'new');
  const [repoName, setRepoName] = useState(() => suggestRepositoryName(projectName));
  const [branch, setBranch] = useState('main');
  const [message, setMessage] = useState('Initial commit from Quantora');
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');

  const files = useMemo(() => deskFilesForPush(studioWorkspaceFileEntries(vfs)), [vfs]);
  const canPush = files.length > 0 && !busy;

  async function run() {
    setBusy(true);
    setError('');
    setStatus('');
    setCreatedUrl('');

    try {
      let repoUrl = githubRepoUrl;

      if (mode === 'new') {
        setStatus('Creating the repository…');
        const created = await postStage(GITHUB_ENDPOINTS.createRepository, {
          name: repoName,
          isPrivate,
          description: 'Created with Quantora.',
        });
        if (!created.ok) {
          setError(created.error);
          return;
        }
        repoUrl = `https://github.com/${created.data.owner}/${created.data.repo}`;
        setCreatedUrl(created.data.htmlUrl || repoUrl);
        setStatus(`Created ${created.data.fullName}. Pushing ${files.length} file${files.length === 1 ? '' : 's'}…`);
      } else {
        setStatus(`Pushing ${files.length} file${files.length === 1 ? '' : 's'}…`);
      }

      const pushed = await postStage(GITHUB_ENDPOINTS.push, {
        repoUrl,
        files,
        message,
        branch,
      });
      if (!pushed.ok) {
        // A repository that was created still exists even when the push failed.
        // Saying so beats leaving the user to discover an empty repository.
        setError(mode === 'new'
          ? `${pushed.error} The repository was created and is empty — you can push again.`
          : pushed.error);
        return;
      }

      setStatus(`${pushOutcomeMessage(pushed.data)} As ${pushed.data.actedAs}.`);
      setCreatedUrl(pushed.data.htmlUrl || createdUrl);
    } catch (caught) {
      setError(caught?.message || 'The push did not complete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-quantora-github-push="true" style={panelStyle}>
      <div style={{ color: '#94a3b8', lineHeight: 1.45 }}>
        Save this desk to GitHub as yourself. Quantora asks GitHub whether you may write, every time.
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-quantora-github-push-mode="new"
          onClick={() => setMode('new')}
          style={{ ...buttonStyle, opacity: mode === 'new' ? 1 : 0.55 }}
        >
          New repository
        </button>
        <button
          type="button"
          data-quantora-github-push-mode="existing"
          onClick={() => setMode('existing')}
          disabled={!githubRepoUrl}
          title={githubRepoUrl ? undefined : 'Import a repository first to push into an existing one.'}
          style={{ ...buttonStyle, opacity: mode === 'existing' && githubRepoUrl ? 1 : 0.55 }}
        >
          Imported repository
        </button>
      </div>

      {mode === 'new' ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="quantora-push-name" style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Name</label>
          <input
            id="quantora-push-name"
            data-quantora-github-push-name="true"
            value={repoName}
            onChange={(event) => setRepoName(event.target.value)}
            style={inputStyle}
          />
          <label style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              data-quantora-github-push-private="true"
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
            />
            Private
          </label>
        </div>
      ) : (
        <div style={{ color: '#cbd5f5' }}>{githubRepoUrl || 'No repository imported.'}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="quantora-push-branch" style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Branch</label>
        <input
          id="quantora-push-branch"
          data-quantora-github-push-branch="true"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          style={{ ...inputStyle, maxWidth: '160px' }}
        />
        <label htmlFor="quantora-push-message" style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Commit</label>
        <input
          id="quantora-push-message"
          data-quantora-github-push-message="true"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-quantora-github-push-run="true"
          disabled={!canPush}
          onClick={run}
          style={{ ...buttonStyle, opacity: canPush ? 1 : 0.5, cursor: canPush ? 'pointer' : 'not-allowed' }}
        >
          {busy ? 'Working…' : mode === 'new' ? 'Create and push' : 'Push to GitHub'}
        </button>
        <span style={{ color: '#64748b' }}>
          {files.length
            ? `${files.length} file${files.length === 1 ? '' : 's'} ready`
            : 'No files on the desk yet'}
        </span>
      </div>

      {status ? (
        <div data-quantora-github-push-status="true" style={{ color: '#7dd3fc' }}>{status}</div>
      ) : null}
      {error ? (
        <div data-quantora-github-push-error="true" style={{ color: '#fca5a5', lineHeight: 1.45 }}>{error}</div>
      ) : null}
      {createdUrl ? (
        <a
          data-quantora-github-push-link="true"
          href={createdUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: '#38bdf8' }}
        >
          Open it on GitHub
        </a>
      ) : null}
    </div>
  );
}
