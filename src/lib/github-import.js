/**
 * Client helpers for Studio "Import Repository" and Git pane GitHub links.
 * Import loads read-only context via /api/github/preview — it is not a full clone.
 *
 * Pull request requests live in github-workspace.js, because they need the
 * user's own connected GitHub principal and this module does not.
 */

export const GITHUB_IMPORT_ENDPOINT = '/api/github/preview';

export const DEFAULT_REPOSITORY_IMPORT_TASK =
  'Load key source files as coding context for AI Studio. Prefer README, package manifests, and primary application entrypoints.';

/**
 * Build the pipeline body for a repository context import.
 * Always includes targetStage so Vercel rewrites to /api/pipeline still work.
 */
export function buildGithubImportRequestBody(repoUrl, task = DEFAULT_REPOSITORY_IMPORT_TASK) {
  return {
    targetStage: 'repository-preview',
    repoUrl: String(repoUrl || '').trim(),
    task: String(task || DEFAULT_REPOSITORY_IMPORT_TASK).trim() || DEFAULT_REPOSITORY_IMPORT_TASK,
  };
}

/**
 * Parse an Import Repository (or GitHub API) response without throwing
 * JSON.parse cryptic "Unexpected token 'T'" errors on HTML 404/login pages.
 */
export async function readGithubApiJson(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  const raw = await response.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: humanGithubHttpError(response.status, 'empty'),
    };
  }

  const looksJson = contentType.includes('application/json')
    || trimmed.startsWith('{')
    || trimmed.startsWith('[');

  if (!looksJson) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: humanGithubHttpError(response.status, 'html', trimmed),
    };
  }

  let data;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: humanGithubHttpError(response.status, 'invalid-json', trimmed),
    };
  }

  if (!response.ok) {
    const message = typeof data?.error === 'string' && data.error.trim()
      ? data.error.trim()
      : humanGithubHttpError(response.status, 'api');
    return { ok: false, status: response.status, data, error: message };
  }

  return { ok: true, status: response.status, data, error: null };
}

export function humanGithubHttpError(status, kind, raw = '') {
  const snippet = String(raw || '').replace(/\s+/g, ' ').slice(0, 80);
  if (status === 401) {
    return 'Sign in to Quantora to import a GitHub repository.';
  }
  if (status === 403) {
    return 'GitHub rate-limited this request, or the configured token lacks permission. Try again later or set GITHUB_TOKEN in Vercel.';
  }
  if (status === 404) {
    return 'Repository not found. Public repos should work without a token; private repos require GITHUB_TOKEN in Vercel.';
  }
  if (status === 429) {
    return 'Too many GitHub import requests. Please wait a minute and try again.';
  }
  if (kind === 'html' || kind === 'invalid-json' || kind === 'empty') {
    if (/could not be found|page not found|404/i.test(snippet)) {
      return 'Import endpoint was not found. Quantora expected JSON from /api/github/preview.';
    }
    if (/sign in|login|log in/i.test(snippet)) {
      return 'GitHub or Quantora returned a login page instead of repository data. Sign in and try again.';
    }
    return 'GitHub import returned a non-JSON response. Check that you are signed in and the repository URL is valid.';
  }
  return `Could not import this repository (HTTP ${status || 'error'}).`;
}

/**
 * Compare URL for opening a PR draft on github.com after the user pushes a branch.
 */
export function githubCompareUrl(repoUrl, headBranch = 'quantora-desk', baseBranch = 'main') {
  try {
    const parsed = new URL(String(repoUrl || '').trim());
    if (parsed.hostname.toLowerCase() !== 'github.com') return '';
    const [owner, repoRaw] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repoRaw) return '';
    const repo = repoRaw.replace(/\.git$/i, '');
    const head = encodeURIComponent(String(headBranch || 'quantora-desk').trim() || 'quantora-desk');
    const base = encodeURIComponent(String(baseBranch || 'main').trim() || 'main');
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${base}...${head}?expand=1`;
  } catch {
    return '';
  }
}
