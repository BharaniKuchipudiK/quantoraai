import React, { useEffect, useMemo, useState } from 'react';
import {
  GITHUB_ENDPOINTS,
  buildGithubStageBody,
  deskFilesForPush,
  githubDestinationRepoUrl,
  normalizeGithubDestination,
  pushOutcomeMessage,
  suggestRepositoryName,
} from '../lib/github-workspace.js';
import { studioWorkspaceFileEntries } from '../lib/studio-workspace-tree.js';

/*
 * The step that makes a build the user's own.
 *
 * Existing repositories are pushed to a WORK branch by default, based on the
 * branch the user checked out. That makes the next action — Open pull request —
 * a real diff with shared history instead of either writing straight to `main`
 * or creating an unrelated root branch.
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

const DEFAULT_WORK_BRANCH = 'quantora-desk';

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

export default function GithubPushPanel({
  vfs = {},
  githubRepoUrl = '',
  githubDestination = null,
  projectName = '',
  onBranchChange = null,
}) {
  const chosen = normalizeGithubDestination(githubDestination);
  const targetRepoUrl = chosen ? githubDestinationRepoUrl(chosen) : githubRepoUrl;
  const baseBranch = chosen?.branch || chosen?.defaultBranch || 'main';

  const [mode, setMode] = useState(targetRepoUrl ? 'existing' : 'new');
  const [repoName, setRepoName] = useState(() => suggestRepositoryName(projectName));
  const [branch, setBranch] = useState(targetRepoUrl ? DEFAULT_WORK_BRANCH : 'main');
  const [message, setMessage] = useState('Update from Quantora coding desk');
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');

  const files = useMemo(() => deskFilesForPush(studioWorkspaceFileEntries(vfs)), [vfs]);
  const writeBlocked = mode === 'existing' && chosen?.canPush === false;
  const canPush = files.length > 0
    && !busy
    && !writeBlocked
    && (mode === 'new' || Boolean(targetRepoUrl));

  /*
   * The destination can be selected after this lazy panel mounted. Keep the
   * mode in step with it and hand the PR pane the same work branch the push
   * pane will use. Before this, Save to GitHub could push one branch while
   * "Open draft PR" pointed at another branch that did not exist.
   */
  useEffect(() => {
    if (!targetRepoUrl) return;
    setMode('existing');
    setBranch((current) => {
      const next = !current || current === 'main' || current === baseBranch ? DEFAULT_WORK_BRANCH : current;
      onBranchChange?.(next);
      return next;
    });
  }, [targetRepoUrl, baseBranch, onBranchChange]);

  useEffect(() => {
    onBranchChange?.(branch);
  }, [branch, onBranchChange]);

  function chooseMode(nextMode) {
    setMode(nextMode);
    if (nextMode === 'existing') {
      setBranch(DEFAULT_WORK_BRANCH);
      onBranchChange?.(DEFAULT_WORK_BRANCH);
    } else {
      setBranch('main');
    }
  }

  function changeBranch(value) {
    setBranch(value);
    if (mode === 'existing') onBranchChange?.(value);
  }

  async function run() {
    if (writeBlocked) {
      setError('This repository is read-only for your connected GitHub account. You can review its checked-out code, but GitHub will not accept a commit from this account.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    setCreatedUrl('');

    try {
      let repoUrl = targetRepoUrl;

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
        setStatus(`Committing ${files.length} file${files.length === 1 ? '' : 's'} to ${branch} from ${baseBranch}…`);
      }

      const pushed = await postStage(GITHUB_ENDPOINTS.push, {
        repoUrl,
        files,
        message,
        branch,
        // For an existing repository, a missing work branch is created from
        // the branch the user actually pulled, not as an unrelated root commit.
        ...(mode === 'existing' ? { baseBranch } : {}),
      });
      if (!pushed.ok) {
        setError(mode === 'new'
          ? `${pushed.error} The repository was created and is empty — you can push again.`
          : pushed.error);
        return;
      }

      setStatus(`${pushOutcomeMessage(pushed.data)} As ${pushed.data.actedAs}. ${mode === 'existing' ? 'The branch is ready for a pull request.' : ''}`);
      setCreatedUrl((current) => pushed.data.htmlUrl || current);
      if (mode === 'existing') onBranchChange?.(pushed.data.branch || branch);
    } catch (caught) {
      setError(caught?.message || 'The push did not complete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-quantora-github-push="true" style={panelStyle}>
      <div style={{ color: '#94a3b8', lineHeight: 1.45 }}>
        Commit this desk to GitHub as yourself. Existing repositories use a work branch so the commit can be opened as a pull request.
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-quantora-github-push-mode="new"
          onClick={() => chooseMode('new')}
          style={{ ...buttonStyle, opacity: mode === 'new' ? 1 : 0.55 }}
        >
          New repository
        </button>
        <button
          type="button"
          data-quantora-github-push-mode="existing"
          onClick={() => chooseMode('existing')}
          disabled={!targetRepoUrl}
          title={targetRepoUrl ? undefined : 'Choose a repository above the composer, or import one, to push into an existing repository.'}
          style={{ ...buttonStyle, opacity: mode === 'existing' && targetRepoUrl ? 1 : 0.55 }}
        >
          {chosen ? 'Chosen repository' : 'Imported repository'}
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
        <div style={{ color: '#cbd5f5' }}>
          {targetRepoUrl || 'No repository chosen. Pick one above the composer, or import one.'}
          {targetRepoUrl ? <span style={{ color: '#94a3b8' }}> · base {baseBranch}</span> : null}
        </div>
      )}

      {writeBlocked ? (
        <div data-quantora-github-push-readonly="true" style={{ color: '#fbbf24', lineHeight: 1.45 }}>
          Read-only repository: the code is available for review, but this GitHub account cannot commit or open a PR from it.
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="quantora-push-branch" style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {mode === 'existing' ? 'Work branch' : 'Branch'}
        </label>
        <input
          id="quantora-push-branch"
          data-quantora-github-push-branch="true"
          value={branch}
          onChange={(event) => changeBranch(event.target.value)}
          style={{ ...inputStyle, maxWidth: '180px' }}
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

      {mode === 'existing' && branch === baseBranch ? (
        <div data-quantora-github-push-base-warning="true" style={{ color: '#fbbf24', lineHeight: 1.45 }}>
          This work branch matches the base branch. Use a separate branch (for example {DEFAULT_WORK_BRANCH}) if you want to open a pull request instead of committing directly to {baseBranch}.
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-quantora-github-push-run="true"
          disabled={!canPush}
          onClick={run}
          title={writeBlocked ? 'Your connected GitHub account has read access only.' : undefined}
          style={{ ...buttonStyle, opacity: canPush ? 1 : 0.5, cursor: canPush ? 'pointer' : 'not-allowed' }}
        >
          {busy ? 'Working…' : mode === 'new' ? 'Create and push' : 'Commit to GitHub'}
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
