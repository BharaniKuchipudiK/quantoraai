import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPABILITY_BACKING,
  KNOWN_UNBACKED_CLAIMS,
  findUnbackedCapabilities,
  newUnbackedClaims,
  resolvedUnbackedClaims,
} from './capability-claims.js';
import { STUDIO_DOMAIN, studioDomainPolicy } from './studio-domain-policy.js';

/*
 * Built through the public accessor the app itself calls, so this can never
 * drift from the policy the user is actually shown.
 */
const STUDIO_DOMAIN_POLICY = Object.fromEntries(
  Object.values(STUDIO_DOMAIN).map((domain) => [domain, studioDomainPolicy(domain)]),
);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const onDisk = (relative) => fs.existsSync(path.join(repoRoot, relative));

/*
 * The bug this exists to stop.
 *
 * Finance advertised "Portfolio" on the landing page and the workspace picker.
 * Nothing answered it. A visitor reading the front door was told the platform
 * did something no line of code could do, and the turn fell through to a
 * general model guessing about their money.
 */
test('INVARIANT: no workspace advertises a capability nothing can answer', () => {
  const unbacked = findUnbackedCapabilities(STUDIO_DOMAIN_POLICY, onDisk);
  assert.deepEqual(
    newUnbackedClaims(unbacked),
    [],
    'A capability was advertised with no module behind it. Either build what answers it, or stop claiming it.',
  );
});

test('the debt baseline may only shrink', () => {
  const unbacked = findUnbackedCapabilities(STUDIO_DOMAIN_POLICY, onDisk);
  const resolved = resolvedUnbackedClaims(unbacked);
  assert.deepEqual(
    resolved,
    [],
    `These claims are backed now — delete them from KNOWN_UNBACKED_CLAIMS: ${resolved.join(', ')}`,
  );
});

test('every module named as backing actually exists', () => {
  const missing = [];
  for (const [domain, capabilities] of Object.entries(CAPABILITY_BACKING)) {
    for (const [capability, paths] of Object.entries(capabilities)) {
      for (const relative of paths) {
        if (!onDisk(relative)) missing.push(`${domain}::${capability} -> ${relative}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'A backing path points at a file that is not there.');
});

test('Finance no longer claims a portfolio it cannot read', () => {
  const finance = studioDomainPolicy(STUDIO_DOMAIN.FINANCE);
  assert.ok(!finance.capabilities.includes('Portfolio'), 'the painted door is back');
  assert.doesNotMatch(finance.placeholder, /portfolio/i, 'the placeholder still invites portfolio questions');
  assert.deepEqual(findUnbackedCapabilities({ finance }, onDisk), [], 'every Finance claim is answerable');
});

test('an unbacked claim is caught, and a backed one is not', () => {
  const policies = { finance: { capabilities: ['Debt', 'Crystal ball'] } };
  assert.deepEqual(findUnbackedCapabilities(policies, () => true), ['finance::Crystal ball']);
  assert.deepEqual(findUnbackedCapabilities({ finance: { capabilities: ['Debt'] } }, () => true), []);
});

test('a capability whose backing file has been deleted is caught', () => {
  const policies = { finance: { capabilities: ['Debt'] } };
  assert.deepEqual(findUnbackedCapabilities(policies, () => false), ['finance::Debt']);
});

test('the known-unbacked list names the Research workspace, not a blanket exemption', () => {
  assert.ok(KNOWN_UNBACKED_CLAIMS.every((claim) => claim.startsWith('research::')));
  assert.equal(KNOWN_UNBACKED_CLAIMS.length, 4);
});
