import React, { useCallback, useEffect, useState } from 'react';
import {
  GITHUB_CONNECT_URL,
  GITHUB_ENDPOINTS,
  buildGithubStageBody,
  checkStateLabel,
  githubConnectionNotice,
  mergeBlockedReason,
  pullRequestStateLabel,
} from '../lib/github-workspace.js';
import { readGithubApiJson } from '../lib/github-import.js';

/*
 * Pull request intelligence for the coding desk.
 *
 * Everything here runs as the signed-in user's own GitHub principal — Quantora
 * holds no credential that can write to GitHub. That is why "Connect GitHub" is
 * a separate, explicit step rather than something sign-in did silently, and why
 * a refusal here reads as "your account cannot do this" rather than "Quantora
 * is not configured".
 *
 * The panel deliberately never renders a green tick for a commit with no
 * checks. `checkStateLabel` owns that wording; see its test.
 */

const TONE_COLORS = {
  good: '#4ade80',
  bad: '#f87171',
  wait: '#fbbf24',
  unknown: '#94a3b8',
};

async function postStage(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(buildGithubStageBody(endpoint, payload)),
  });
  return readGithubApiJson(response);
}

export default function GithubPullRequests({ repoUrl = '', headBranch = '', baseBranch = 'main' }) {
  const [connection, setConnection] = useState(null);
  const [pullRequests, setPullRequests] = useState([]);
  const [brief, setBrief] = useState(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadConnection = useCallback(async () => {
    const parsed = await postStage(GITHUB_ENDPOINTS.connection, {});
    if (!parsed.ok) {
      setConnection({ connected: false, reason: parsed.error });
      return null;
    }
    setConnection(parsed.data);
    return parsed.data;
  }, []);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  // A repository change invalidates every pull request on screen. Leaving the
  // old list up while the header says a new repo is the kind of stale surface
  // that gets acted on.
  useEffect(() => {
    setPullRequests([]);
    setBrief(null);
    setStatus('');
    setError('');
  }, [repoUrl]);

  async function run(work) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err?.message || 'That GitHub action did not complete.');
    } finally {
      setBusy(false);
    }
  }

  const loadPullRequests = () => run(async () => {
    setStatus('');
    const parsed = await postStage(GITHUB_ENDPOINTS.listPullRequests, { repoUrl, state: 'open', limit: 20 });
    if (!parsed.ok) {
      if (parsed.data?.needsGithubConnection) await loadConnection();
      throw new Error(parsed.error);
    }
    setPullRequests(parsed.data.pullRequests || []);
    setBrief(null);
    if (!parsed.data.pullRequests?.length) setStatus('No open pull requests in this repository.');
  });

  const openPullRequest = (number) => run(async () => {
    setStatus('');
    const parsed = await postStage(GITHUB_ENDPOINTS.readPullRequest, { repoUrl, number });
    if (!parsed.ok) throw new Error(parsed.error);
    setBrief(parsed.data);
  });

  const postComment = () => run(async () => {
    const parsed = await postStage(GITHUB_ENDPOINTS.comment, {
      repoUrl,
      number: brief?.summary?.number,
      body: comment,
    });
    if (!parsed.ok) throw new Error(parsed.error);
    setComment('');
    setStatus(`Comment posted as ${parsed.data.actedAs}.`);
  });

  const openDraftPullRequest = () => run(async () => {
    const parsed = await postStage(GITHUB_ENDPOINTS.createPullRequest, {
      repoUrl,
      title: `Quantora desk changes from ${headBranch || 'quantora-desk'}`,
      head: headBranch || 'quantora-desk',
      base: baseBranch || 'main',
      body: 'Opened from the Quantora coding desk. The desk commits locally, so this branch was pushed outside Quantora.',
      draft: true,
    });
    if (!parsed.ok) throw new Error(parsed.error);
    /*
     * The refresh comes FIRST, because loadPullRequests opens with setStatus('')
     * and would erase this sentence the moment it ran. Written the other way
     * round, the panel reported that it had opened a pull request and then
     * silently blanked -- a click that visibly did nothing, on a write that had
     * actually happened. Same shape as the push link that vanished after a
     * successful push on 2026-09-06.
     */
    await loadPullRequests();
    setStatus(`Draft pull request #${parsed.data.number} opened as ${parsed.data.actedAs}.`);
  });

  const mergeCurrent = () => run(async () => {
    const parsed = await postStage(GITHUB_ENDPOINTS.mergePullRequest, {
      repoUrl,
      number: brief?.summary?.number,
      // Bound to the commit actually on screen: if the head moved since this
      // brief was loaded, the server refuses rather than merging unread code.
      expectedHeadSha: brief?.summary?.headSha,
      mergeMethod: 'squash',
    });
    if (!parsed.ok) throw new Error(parsed.error);
    // Refresh first, then report: see openDraftPullRequest.
    await loadPullRequests();
    setStatus(`Merged as ${parsed.data.sha?.slice(0, 12) || 'a new commit'}.`);
  });

  const notice = githubConnectionNotice(connection);
  const connected = connection?.connected === true;
  const blockedReason = brief ? mergeBlockedReason(brief) : '';

  return (
    <div data-quantora-github-prs="true" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ color: '#e2e8f0' }}>Pull requests</strong>
        {connected ? (
          <span data-quantora-github-connected="true" style={{ color: '#4ade80' }}>as {connection.login}</span>
        ) : (
          <a
            data-quantora-github-connect="true"
            href={GITHUB_CONNECT_URL}
            style={{ ...buttonStyle, textDecoration: 'none', display: 'inline-block' }}
          >
            Connect GitHub
          </a>
        )}
        {connected ? (
          <button type="button" data-quantora-github-refresh="true" disabled={busy || !repoUrl} onClick={loadPullRequests} style={buttonStyle}>
            {busy ? 'Loading…' : 'Load open PRs'}
          </button>
        ) : null}
      </div>

      {notice ? <div data-quantora-github-notice="true" style={{ color: '#94a3b8', lineHeight: 1.45 }}>{notice}</div> : null}
      {!repoUrl ? (
        <div style={{ color: '#94a3b8' }}>Import a repository in the composer to point this panel at one.</div>
      ) : null}
      {error ? <div data-quantora-github-error="true" style={{ color: '#f87171', lineHeight: 1.45 }}>{error}</div> : null}
      {status ? <div data-quantora-github-status="true" style={{ color: '#4ade80' }}>{status}</div> : null}

      {pullRequests.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {pullRequests.map((pullRequest) => (
            <li key={pullRequest.number}>
              <button
                type="button"
                data-quantora-github-pr={pullRequest.number}
                disabled={busy}
                onClick={() => openPullRequest(pullRequest.number)}
                style={{ ...buttonStyle, width: '100%', textAlign: 'left', fontWeight: 500 }}
              >
                #{pullRequest.number} {pullRequest.title} · {pullRequestStateLabel(pullRequest)} · {pullRequest.headRef} → {pullRequest.baseRef}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {brief ? (
        <div data-quantora-github-brief="true" style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
          <div style={{ color: '#e2e8f0', fontWeight: 700 }}>
            #{brief.summary.number} {brief.summary.title}
          </div>
          <div style={{ color: '#94a3b8' }}>
            {brief.summary.author} · {pullRequestStateLabel(brief.summary)} · +{brief.summary.additions} −{brief.summary.deletions} in {brief.summary.changedFiles} file(s) · {brief.summary.headSha.slice(0, 12)}
          </div>
          <div data-quantora-github-checks={brief.checks.state} style={{ color: TONE_COLORS[checkStateLabel(brief.checks.state).tone] }}>
            {checkStateLabel(brief.checks.state).text}
            {brief.checks.failing.length ? ':' : ''}
          </div>
          {brief.checks.failing.map((failure) => (
            <a
              key={failure.name}
              href={failure.url || brief.summary.htmlUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#f87171' }}
            >
              {failure.name} ({failure.conclusion}) — open the log
            </a>
          ))}
          {brief.threads.length ? (
            <div style={{ color: '#94a3b8' }}>
              {brief.threads.length} review comment(s): {brief.threads.slice(0, 3).map((thread) => `${thread.path}${thread.line ? `:${thread.line}` : ''}`).join(', ')}
            </div>
          ) : null}
          <div style={{ color: '#94a3b8' }}>
            {brief.files.map((file) => `${file.path} (+${file.additions} −${file.deletions})`).join(', ')}
            {brief.truncated.files ? ' … more files were not loaded' : ''}
          </div>

          <textarea
            data-quantora-github-comment="true"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Comment on this pull request as yourself"
            rows={2}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#e2e8f0', padding: '6px 8px', font: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" data-quantora-github-post-comment="true" disabled={busy || !comment.trim()} onClick={postComment} style={buttonStyle}>
              Post comment
            </button>
            <button
              type="button"
              data-quantora-github-merge="true"
              disabled={busy || Boolean(blockedReason)}
              title={blockedReason || `Squash-merge ${brief.summary.headSha.slice(0, 12)}`}
              onClick={mergeCurrent}
              style={buttonStyle}
            >
              {blockedReason ? `Cannot merge — ${blockedReason}` : `Squash merge ${brief.summary.headSha.slice(0, 7)}`}
            </button>
            <a href={brief.summary.htmlUrl} target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>
              Open on GitHub
            </a>
          </div>
        </div>
      ) : null}

      {connected && repoUrl ? (
        <button type="button" data-quantora-github-open-pr="true" disabled={busy} onClick={openDraftPullRequest} style={buttonStyle}>
          Open draft PR from {headBranch || 'quantora-desk'} → {baseBranch || 'main'}
        </button>
      ) : null}
    </div>
  );
}

const buttonStyle = {
  border: '1px solid rgba(249,115,22,0.35)',
  background: 'rgba(249,115,22,0.12)',
  color: '#fdba74',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};
