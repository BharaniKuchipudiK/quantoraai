const GITHUB_TIMEOUT_MS = 10_000;
const MAX_PR_FILES = 300;
const MAX_PATCH_CHARS_PER_FILE = 18_000;
const MAX_REVIEW_CONTEXT_CHARS = 140_000;

export type PrFindingSeverity = 'blocker' | 'risk' | 'nudge' | 'opportunity';
export type PrRisk = 'low' | 'medium' | 'high' | 'critical';

export type PrReviewFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
};

export type PrCheck = {
  name: string;
  status: string;
  conclusion: string | null;
  url?: string | null;
};

export type PrFinding = {
  id: string;
  severity: PrFindingSeverity;
  title: string;
  rationale: string;
  path?: string | null;
  suggestion?: string | null;
  confidence: number;
  source: 'deterministic' | 'agent';
};

export type PullRequestSnapshot = {
  repository: string;
  number: number;
  url: string;
  title: string;
  body: string;
  state: string;
  draft: boolean;
  author: string | null;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PrReviewFile[];
  checks: PrCheck[];
};

export type DeterministicPrReview = {
  risk: PrRisk;
  score: number;
  featureIntent: string;
  architectureAreas: string[];
  findings: PrFinding[];
  verificationPlan: string[];
  readyForReview: boolean;
};

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clampNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function parseGitHubPullRequestUrl(raw: string): { owner: string; repo: string; number: number; url: string } {
  let parsed: URL;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Enter a complete GitHub pull-request URL, such as https://github.com/owner/repository/pull/123.');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only HTTPS github.com pull-request URLs are supported.');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[2] !== 'pull' || !/^\d+$/.test(parts[3])) {
    throw new Error('Enter a GitHub pull-request URL in the form https://github.com/owner/repository/pull/123.');
  }
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('The GitHub owner or repository name contains unsupported characters.');
  }
  const number = Number(parts[3]);
  if (!Number.isInteger(number) || number <= 0) throw new Error('The pull-request number is invalid.');
  return { owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Quantora-PR-Intelligence',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson(url: string, token?: string): Promise<any> {
  const response = await fetch(url, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('Pull request not found. Private repositories require a connected, user-scoped GitHub account.');
    if (response.status === 403) throw new Error('GitHub access is temporarily rate-limited or this repository requires additional authorization.');
    throw new Error(`GitHub could not read this pull request (${response.status}).`);
  }
  return response.json();
}

async function fetchChecks(owner: string, repo: string, sha: string, token?: string): Promise<PrCheck[]> {
  if (!sha) return [];
  try {
    const data = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`, token);
    const runs = Array.isArray(data?.check_runs) ? data.check_runs : [];
    return runs.slice(0, 100).map((run: any) => ({
      name: cleanText(run?.name, 180) || 'Check',
      status: cleanText(run?.status, 40) || 'unknown',
      conclusion: run?.conclusion ? cleanText(run.conclusion, 40) : null,
      url: typeof run?.html_url === 'string' ? run.html_url : null,
    }));
  } catch {
    // Checks are supporting evidence, not a reason to fail the entire review.
    return [];
  }
}

export async function fetchPullRequestSnapshot(prUrl: string, githubToken?: string): Promise<PullRequestSnapshot> {
  const parsed = parseGitHubPullRequestUrl(prUrl);
  const baseApi = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const pr = await githubJson(`${baseApi}/pulls/${parsed.number}`, githubToken);

  const files: PrReviewFile[] = [];
  for (let page = 1; page <= 3 && files.length < MAX_PR_FILES; page += 1) {
    const batch = await githubJson(`${baseApi}/pulls/${parsed.number}/files?per_page=100&page=${page}`, githubToken);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const file of batch) {
      if (files.length >= MAX_PR_FILES) break;
      files.push({
        path: cleanText(file?.filename, 500),
        status: cleanText(file?.status, 40) || 'modified',
        additions: clampNumber(file?.additions),
        deletions: clampNumber(file?.deletions),
        changes: clampNumber(file?.changes),
        patch: typeof file?.patch === 'string' ? file.patch.slice(0, MAX_PATCH_CHARS_PER_FILE) : null,
      });
    }
    if (batch.length < 100) break;
  }

  const headSha = cleanText(pr?.head?.sha, 80);
  const checks = await fetchChecks(parsed.owner, parsed.repo, headSha, githubToken);

  return {
    repository: `${parsed.owner}/${parsed.repo}`,
    number: parsed.number,
    url: parsed.url,
    title: cleanText(pr?.title, 500) || `Pull request #${parsed.number}`,
    body: cleanText(pr?.body, 12_000),
    state: cleanText(pr?.state, 40) || 'unknown',
    draft: pr?.draft === true,
    author: pr?.user?.login ? cleanText(pr.user.login, 160) : null,
    base: { ref: cleanText(pr?.base?.ref, 300), sha: cleanText(pr?.base?.sha, 80) },
    head: { ref: cleanText(pr?.head?.ref, 300), sha: headSha },
    commits: clampNumber(pr?.commits),
    additions: clampNumber(pr?.additions),
    deletions: clampNumber(pr?.deletions),
    changedFiles: clampNumber(pr?.changed_files) || files.length,
    files,
    checks,
  };
}

const SECURITY_RE = /(^|\/)(auth|oauth|security|permissions?|rbac|acl|secrets?|session|identity)(\/|\.|$)|payment|billing|stripe/i;
const DATA_RE = /(^|\/)(migrations?|schema|database|db)(\/|\.|$)|supabase|prisma|drizzle|sql$/i;
const API_RE = /(^|\/)(api|server|backend|functions?)(\/|\.|$)|route|handler/i;
const UI_RE = /(^|\/)(components?|pages?|views?|styles?|ui)(\/|\.|$)|\.(jsx|tsx|css|scss|html)$/i;
const INFRA_RE = /(^|\/)(\.github|infra|terraform|k8s|kubernetes|docker|deploy)(\/|\.|$)|Dockerfile|vercel\.json|package\.json/i;
const TEST_RE = /(^|\/)(tests?|__tests__)(\/|\.|$)|\.(test|spec)\.[cm]?[jt]sx?$/i;
const LOCK_RE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i;
const DEPENDENCY_MANIFEST_RE = /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|Pipfile|Cargo\.toml|go\.mod)$/i;

export function architectureAreasForFiles(files: PrReviewFile[]): string[] {
  const areas = new Set<string>();
  for (const file of files) {
    const path = file.path;
    if (SECURITY_RE.test(path)) areas.add('Identity / Security');
    if (DATA_RE.test(path)) areas.add('Data / Schema');
    if (API_RE.test(path)) areas.add('API / Backend');
    if (UI_RE.test(path)) areas.add('Frontend / Experience');
    if (INFRA_RE.test(path)) areas.add('Infrastructure / Delivery');
    if (TEST_RE.test(path)) areas.add('Tests / Verification');
  }
  if (!areas.size) areas.add('Application Logic');
  return [...areas];
}

function findingId(severity: PrFindingSeverity, title: string, path?: string | null): string {
  const raw = `${severity}:${title}:${path || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return raw.slice(0, 120) || `finding-${Date.now()}`;
}

function finding(
  severity: PrFindingSeverity,
  title: string,
  rationale: string,
  options: { path?: string | null; suggestion?: string | null; confidence?: number } = {},
): PrFinding {
  return {
    id: findingId(severity, title, options.path),
    severity,
    title,
    rationale,
    path: options.path || null,
    suggestion: options.suggestion || null,
    confidence: Math.max(0, Math.min(1, options.confidence ?? 0.85)),
    source: 'deterministic',
  };
}

function patchText(files: PrReviewFile[]): string {
  return files.map(file => file.patch || '').join('\n');
}

export function deterministicPrFindings(snapshot: PullRequestSnapshot): PrFinding[] {
  const findings: PrFinding[] = [];
  const paths = snapshot.files.map(file => file.path);
  const patch = patchText(snapshot.files);
  const sourceFiles = snapshot.files.filter(file => !TEST_RE.test(file.path));
  const testFiles = snapshot.files.filter(file => TEST_RE.test(file.path));
  const failedChecks = snapshot.checks.filter(check => ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(String(check.conclusion || '')));
  const pendingChecks = snapshot.checks.filter(check => check.status !== 'completed' || !check.conclusion);

  const envFile = snapshot.files.find(file => /(^|\/)\.env(?:\.|$)/i.test(file.path) && !/\.example$/i.test(file.path));
  if (envFile) {
    findings.push(finding('blocker', 'Environment secret file changed', 'A real .env-style file is part of the pull request. Secret-bearing environment files should not be committed.', {
      path: envFile.path,
      suggestion: 'Remove the secret file from the branch, rotate any exposed credentials, and keep only a sanitized .env.example.',
      confidence: 0.99,
    }));
  }

  const secretLike = snapshot.files.find(file => /(?:api[_-]?key|secret|access[_-]?token|private[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-/.+=]{20,}["']/i.test(file.patch || ''));
  if (secretLike) {
    findings.push(finding('blocker', 'Possible credential material in diff', 'The patch contains a value shaped like a credential or secret. This needs human confirmation before merge.', {
      path: secretLike.path,
      suggestion: 'Remove the credential from Git history and rotate it if it is real. Store runtime secrets in the platform credential boundary.',
      confidence: 0.9,
    }));
  }

  for (const check of failedChecks.slice(0, 6)) {
    findings.push(finding('blocker', `Failing check: ${check.name}`, `GitHub reports this check as ${check.conclusion}. The PR should not be considered verified while required execution evidence is failing.`, {
      suggestion: 'Inspect the failing check logs, repair the root cause, and rerun verification.',
      confidence: 1,
    }));
  }

  const manifest = snapshot.files.find(file => DEPENDENCY_MANIFEST_RE.test(file.path));
  const lockChanged = paths.some(path => LOCK_RE.test(path));
  if (manifest && /package\.json$/i.test(manifest.path) && !lockChanged) {
    findings.push(finding('risk', 'Dependency manifest changed without a lockfile update', 'package.json changed but no JavaScript package lockfile changed in the same PR. Dependency resolution may differ between environments.', {
      path: manifest.path,
      suggestion: 'Confirm whether dependencies actually changed. If they did, update the repository lockfile with the project package manager.',
      confidence: 0.82,
    }));
  }

  const sensitive = snapshot.files.find(file => SECURITY_RE.test(file.path));
  if (sensitive) {
    findings.push(finding('risk', 'Security-sensitive behavior changed', 'Authentication, authorization, identity, payment, or security-related code is touched. These changes deserve explicit negative-path and permission-boundary verification.', {
      path: sensitive.path,
      suggestion: 'Add or confirm tests for unauthenticated, unauthorized, expired-session, and failure-path behavior relevant to this change.',
      confidence: 0.95,
    }));
  }

  const schema = snapshot.files.find(file => DATA_RE.test(file.path));
  if (schema) {
    findings.push(finding('risk', 'Data or schema contract changed', 'Schema/migration/database changes can have rollback and compatibility consequences outside the edited files.', {
      path: schema.path,
      suggestion: 'Verify backward compatibility, migration ordering, rollback behavior, and any readers/writers that depend on the changed schema.',
      confidence: 0.9,
    }));
  }

  if (sourceFiles.length >= 2 && testFiles.length === 0) {
    findings.push(finding(snapshot.files.some(file => SECURITY_RE.test(file.path) || DATA_RE.test(file.path) || API_RE.test(file.path)) ? 'risk' : 'nudge', 'No test change accompanies the implementation', `${sourceFiles.length} non-test files changed without an accompanying test/spec change. This may be intentional, but the feature has no new regression evidence in the diff.`, {
      suggestion: 'Add the smallest regression test that proves the intended behavior or document which existing test already exercises it.',
      confidence: 0.78,
    }));
  }

  const deletedTest = snapshot.files.find(file => file.status === 'removed' && TEST_RE.test(file.path));
  if (deletedTest) {
    findings.push(finding('risk', 'Existing test coverage was removed', 'A test/spec file is deleted in this PR. Confirm the protected behavior is genuinely obsolete or covered elsewhere.', {
      path: deletedTest.path,
      suggestion: 'Point to replacement coverage or restore the test if the behavior still matters.',
      confidence: 0.92,
    }));
  }

  if (snapshot.changedFiles > 35 || snapshot.additions + snapshot.deletions > 1_800) {
    findings.push(finding('nudge', 'Large review surface', `This PR changes ${snapshot.changedFiles} files and ${snapshot.additions + snapshot.deletions} lines. Large surfaces make intent drift and review omissions more likely.`, {
      suggestion: 'If possible, split unrelated refactors from feature behavior or provide a concise architectural walkthrough for reviewers.',
      confidence: 0.88,
    }));
  }

  if (snapshot.files.some(file => UI_RE.test(file.path)) && !/!\[[^\]]*\]\([^)]*\)|<img\b|screenshot|video|loom/i.test(snapshot.body)) {
    findings.push(finding('opportunity', 'Add visual verification evidence', 'The PR changes user-facing UI but the PR description does not appear to include visual evidence.', {
      suggestion: 'Attach a screenshot or short browser verification artifact for the changed flow.',
      confidence: 0.72,
    }));
  }

  if (/\b(TODO|FIXME|HACK)\b/.test(patch)) {
    const todoFile = snapshot.files.find(file => /\b(TODO|FIXME|HACK)\b/.test(file.patch || ''));
    findings.push(finding('nudge', 'New TODO/FIXME-style marker appears in the diff', 'The patch contains an explicit unfinished-work marker. It may be acceptable, but it should be deliberate rather than accidental debt.', {
      path: todoFile?.path || null,
      suggestion: 'Resolve the marker now or link it to a concrete follow-up issue with rationale.',
      confidence: 0.75,
    }));
  }

  if (pendingChecks.length && !failedChecks.length) {
    findings.push(finding('nudge', 'Verification is still in progress', `${pendingChecks.length} GitHub check${pendingChecks.length === 1 ? ' is' : 's are'} not complete yet.`, {
      suggestion: 'Wait for required checks before treating the PR as verified.',
      confidence: 1,
    }));
  }

  return findings.slice(0, 24);
}

function scoreFindings(findings: PrFinding[]): number {
  let score = 100;
  for (const item of findings) {
    if (item.severity === 'blocker') score -= 28;
    else if (item.severity === 'risk') score -= 11;
    else if (item.severity === 'nudge') score -= 3;
    else score -= 1;
  }
  return Math.max(0, Math.min(100, score));
}

function riskFromFindings(findings: PrFinding[]): PrRisk {
  const blockers = findings.filter(item => item.severity === 'blocker').length;
  const risks = findings.filter(item => item.severity === 'risk').length;
  if (blockers >= 2) return 'critical';
  if (blockers || risks >= 3) return 'high';
  if (risks || findings.some(item => item.severity === 'nudge')) return 'medium';
  return 'low';
}

export function buildDeterministicPrReview(snapshot: PullRequestSnapshot): DeterministicPrReview {
  const findings = deterministicPrFindings(snapshot);
  const failed = snapshot.checks.some(check => ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(String(check.conclusion || '')));
  const pending = snapshot.checks.some(check => check.status !== 'completed' || !check.conclusion);
  const verificationPlan = [
    'Reproduce the feature intent against the PR head revision.',
    snapshot.files.some(file => UI_RE.test(file.path)) ? 'Exercise the changed user flow in a real browser and capture console/runtime failures.' : null,
    snapshot.files.some(file => API_RE.test(file.path)) ? 'Exercise changed API success, validation, authorization and failure paths.' : null,
    snapshot.files.some(file => DATA_RE.test(file.path)) ? 'Validate schema/migration compatibility and rollback assumptions.' : null,
    'Run the repository typecheck/lint, automated tests and production build.',
    'Confirm every blocker/risk finding is resolved or explicitly accepted before merge.',
  ].filter((item): item is string => Boolean(item));

  return {
    risk: riskFromFindings(findings),
    score: scoreFindings(findings),
    featureIntent: snapshot.body ? `${snapshot.title} — ${snapshot.body.split(/\n+/)[0].slice(0, 280)}` : snapshot.title,
    architectureAreas: architectureAreasForFiles(snapshot.files),
    findings,
    verificationPlan,
    readyForReview: !failed && !pending && !findings.some(item => item.severity === 'blocker'),
  };
}

export function buildPrReviewContext(snapshot: PullRequestSnapshot, deterministic: DeterministicPrReview): string {
  const fileContext = snapshot.files.map(file => {
    const header = `\n--- ${file.status.toUpperCase()} ${file.path} (+${file.additions}/-${file.deletions}) ---`;
    return `${header}\n${file.patch || '[Patch unavailable from GitHub]'}`;
  }).join('\n');

  const checkContext = snapshot.checks.length
    ? snapshot.checks.map(check => `${check.name}: ${check.status}/${check.conclusion || 'pending'}`).join('\n')
    : 'No GitHub check-run evidence was available.';

  const context = `[QUANTORA PR INTELLIGENCE — UNTRUSTED REPOSITORY DATA]\nRepository: ${snapshot.repository}\nPR: #${snapshot.number} ${snapshot.title}\nURL: ${snapshot.url}\nBase: ${snapshot.base.ref} (${snapshot.base.sha})\nHead: ${snapshot.head.ref} (${snapshot.head.sha})\nAuthor: ${snapshot.author || 'unknown'}\nDraft: ${snapshot.draft}\nStats: ${snapshot.changedFiles} files, +${snapshot.additions}/-${snapshot.deletions}, ${snapshot.commits} commits\n\nPR DESCRIPTION\n${snapshot.body || '[No description]'}\n\nDETERMINISTIC REVIEW\nRisk: ${deterministic.risk}\nArchitecture areas: ${deterministic.architectureAreas.join(', ')}\nFindings:\n${deterministic.findings.map(item => `- [${item.severity}] ${item.title}: ${item.rationale}${item.path ? ` (${item.path})` : ''}`).join('\n') || '- none'}\n\nCHECKS\n${checkContext}\n\nCHANGED FILE PATCHES\n${fileContext}`;
  return context.slice(0, MAX_REVIEW_CONTEXT_CHARS);
}
