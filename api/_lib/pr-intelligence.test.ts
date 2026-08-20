import assert from 'node:assert/strict';
import test from 'node:test';
import {
  architectureAreasForFiles,
  buildDeterministicPrReview,
  deterministicPrFindings,
  parseGitHubPullRequestUrl,
  type PullRequestSnapshot,
} from './pr-intelligence.js';

function snapshot(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
  return {
    repository: 'acme/widget',
    number: 42,
    url: 'https://github.com/acme/widget/pull/42',
    title: 'Add checkout validation',
    body: 'Prevent invalid checkout submissions and improve error handling.',
    state: 'open',
    draft: false,
    author: 'builder',
    base: { ref: 'main', sha: 'base-sha' },
    head: { ref: 'feature/checkout', sha: 'head-sha' },
    commits: 3,
    additions: 120,
    deletions: 24,
    changedFiles: 3,
    files: [
      { path: 'src/api/checkout.ts', status: 'modified', additions: 60, deletions: 12, changes: 72, patch: '@@\n+export function validateCheckout() {}' },
      { path: 'src/components/Checkout.tsx', status: 'modified', additions: 50, deletions: 12, changes: 62, patch: '@@\n+export function Checkout() {}' },
      { path: 'README.md', status: 'modified', additions: 10, deletions: 0, changes: 10, patch: '@@\n+Checkout validation' },
    ],
    checks: [{ name: 'CI', status: 'completed', conclusion: 'success' }],
    ...overrides,
  };
}

test('parses canonical GitHub PR URLs and rejects non-PR URLs', () => {
  assert.deepEqual(parseGitHubPullRequestUrl('https://github.com/acme/widget/pull/42'), {
    owner: 'acme', repo: 'widget', number: 42, url: 'https://github.com/acme/widget/pull/42',
  });
  assert.throws(() => parseGitHubPullRequestUrl('https://github.com/acme/widget'), /pull-request URL/i);
  assert.throws(() => parseGitHubPullRequestUrl('https://example.com/acme/widget/pull/42'), /github\.com/i);
});

test('classifies architecture areas from changed files', () => {
  const areas = architectureAreasForFiles([
    { path: 'src/auth/session.ts', status: 'modified', additions: 1, deletions: 1, changes: 2, patch: '' },
    { path: 'api/users.ts', status: 'modified', additions: 1, deletions: 0, changes: 1, patch: '' },
    { path: 'src/components/Profile.tsx', status: 'modified', additions: 1, deletions: 0, changes: 1, patch: '' },
    { path: 'migrations/002_users.sql', status: 'added', additions: 3, deletions: 0, changes: 3, patch: '' },
  ]);
  assert.ok(areas.includes('Identity / Security'));
  assert.ok(areas.includes('API / Backend'));
  assert.ok(areas.includes('Frontend / Experience'));
  assert.ok(areas.includes('Data / Schema'));
});

test('flags failed checks as blockers and prevents ready-for-review status', () => {
  const pr = snapshot({ checks: [{ name: 'Browser gate', status: 'completed', conclusion: 'failure' }] });
  const review = buildDeterministicPrReview(pr);
  assert.equal(review.readyForReview, false);
  assert.ok(review.findings.some(item => item.severity === 'blocker' && /Browser gate/.test(item.title)));
  assert.ok(review.score < 100);
});

test('flags secret-like files and security changes with high confidence', () => {
  const pr = snapshot({
    changedFiles: 2,
    files: [
      { path: '.env.production', status: 'added', additions: 2, deletions: 0, changes: 2, patch: '@@\n+API_KEY="abcdefghijklmnopqrstuvwxyz123456"' },
      { path: 'src/auth/session.ts', status: 'modified', additions: 10, deletions: 2, changes: 12, patch: '@@\n+export const session = true' },
    ],
  });
  const findings = deterministicPrFindings(pr);
  assert.ok(findings.some(item => item.severity === 'blocker' && /Environment secret file/i.test(item.title)));
  assert.ok(findings.some(item => item.severity === 'risk' && /Security-sensitive/i.test(item.title)));
});

test('nudges implementation changes that lack regression-test evidence', () => {
  const review = buildDeterministicPrReview(snapshot());
  assert.ok(review.findings.some(item => /No test change/i.test(item.title)));
  assert.match(review.featureIntent, /checkout validation/i);
  assert.ok(review.verificationPlan.some(item => /automated tests/i.test(item)));
});

test('detects dependency manifest changes without a lockfile', () => {
  const pr = snapshot({
    files: [
      { path: 'package.json', status: 'modified', additions: 2, deletions: 1, changes: 3, patch: '@@\n+"three":"latest"' },
      { path: 'src/main.ts', status: 'modified', additions: 2, deletions: 1, changes: 3, patch: '@@\n+import * as THREE from "three"' },
    ],
    changedFiles: 2,
  });
  const findings = deterministicPrFindings(pr);
  assert.ok(findings.some(item => /lockfile/i.test(item.title)));
});
