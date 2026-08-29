#!/usr/bin/env node
/**
 * A workspace may not advertise a capability nothing can answer.
 *
 * Finance told every visitor it did "Portfolio", on the landing page and again
 * on the workspace picker, with no holdings store and no gateway behind it.
 * Nobody noticed because nothing checked. This is what checks.
 *
 * The baseline may only shrink: a claim that becomes answerable must be removed
 * from it, and a new painted door fails the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_UNBACKED_CLAIMS,
  findUnbackedCapabilities,
  newUnbackedClaims,
  resolvedUnbackedClaims,
} from '../src/lib/capability-claims.js';
import { STUDIO_DOMAIN, studioDomainPolicy } from '../src/lib/studio-domain-policy.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onDisk = (relative) => fs.existsSync(path.join(repoRoot, relative));

const policies = Object.fromEntries(
  Object.values(STUDIO_DOMAIN).map((domain) => [domain, studioDomainPolicy(domain)]),
);

const unbacked = findUnbackedCapabilities(policies, onDisk);
const added = newUnbackedClaims(unbacked);
const resolved = resolvedUnbackedClaims(unbacked);

if (resolved.length) {
  console.log(`Capability claims improved — ${resolved.length} claim(s) are now answerable:`);
  for (const claim of resolved) console.log(`  - ${claim}`);
  console.log('Remove them from KNOWN_UNBACKED_CLAIMS in src/lib/capability-claims.js.\n');
}

if (added.length) {
  console.error(`\nCapability claims gate FAILED — ${added.length} advertised capability(ies) nothing can answer:\n`);
  for (const claim of added) console.error(`  ${claim}`);
  console.error(`
A capability chip is a promise made on the front door. Finance advertised
"Portfolio" with no module behind it, so anyone who asked got a general model
guessing about their money.

Either add the module that answers it to CAPABILITY_BACKING, or stop making
the claim. Do not add it to KNOWN_UNBACKED_CLAIMS — that list only shrinks.
`);
  process.exit(1);
}

if (resolved.length) process.exit(1);

console.log(
  `Capability claims gate passed — every advertised capability is answerable`
  + ` (${KNOWN_UNBACKED_CLAIMS.length} known painted door(s) held at baseline).`,
);
