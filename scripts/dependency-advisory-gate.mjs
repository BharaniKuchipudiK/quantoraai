#!/usr/bin/env node
/**
 * A high-severity advisory nobody decided to accept — and an acceptance that
 * outlived its reason.
 *
 * This replaces a one-line allowlist that suppressed by PACKAGE NAME and
 * printed, on every green run:
 *
 *   Audit OK (allowlisted unreachable transitives: image-size, pptxgenjs )
 *
 * Both halves of that sentence were wrong for image-size. It is a direct
 * production dependency, not a transitive, and api/_lib/office-images.js calls
 * it on bytes a stranger supplies — a crafted 16-byte file hung the deployed
 * function until Vercel killed it. The suppression was written once, read as
 * settled ever after, and the word "unreachable" is why nobody looked.
 *
 * Suppressing by name has a second failure that costs nothing to fix: a BRAND
 * NEW critical advisory on an already-listed package is swallowed in silence,
 * because the name is still on the list. So acceptance here is per CAUSE — a
 * GHSA id, or the name of the vulnerable dependency for a package whose only
 * sin is depending on one — and it fails four distinct ways:
 *
 *   1. a high/critical advisory on a package nobody has accepted
 *   2. a NEW cause on a package that was accepted for a different one
 *   3. an accepted cause npm audit no longer reports — the reason is gone, so
 *      the line must go too, or it silences the next one to arrive
 *   4. an audit that produced no vulnerabilities map at all, which the old
 *      `a.vulnerabilities || {}` read as a clean run (CLAUDE.md §4)
 *
 * Every acceptance states its reason in prose and, where a gate proves the
 * reason, names that gate. The reasons are printed on success, because a
 * justification nobody reads is the thing that rotted last time.
 */
import { spawnSync } from 'node:child_process';

const ACCEPTED = {
  'image-size': {
    causes: ['GHSA-w3rx-r6r6-pgpr', 'GHSA-5p2g-fcmc-qvqq'],
    why:
      'Reachable, NOT unreachable: api/generate-office.ts embeds pictures a deck ' +
      'names and resizeImageForEmbed hands the bytes to image-size when Jimp cannot ' +
      'decode them. Both advisories are unbounded loops in the ICNS, HEIF and JXL ' +
      'parsers, and 2.0.2 is the newest published version while the advisory range ' +
      'is <=2.0.2, so there is nothing to upgrade to. Those three parsers are ' +
      'switched off with image-size\'s own disableTypes() in api/_lib/office-images.js, ' +
      'which is checked before calculate() runs. Accepted because the vulnerable code ' +
      'cannot be entered, not because it cannot be reached.',
    provenBy: 'scripts/image-parser-dos-gate.mjs',
  },
  pptxgenjs: {
    causes: ['image-size'],
    why:
      'Carries no advisory of its own — npm reports it solely because it depends on ' +
      'image-size (its own nested copy, 1.2.1). Its single call site, getSizeFromImage ' +
      'in dist/pptxgen.cjs.js, sits inside a block comment marked "FIXME: TODO: ' +
      'currently unused", so the parser is never entered from this package. npm\'s only ' +
      'offered fix is a downgrade to pptxgenjs 1.1.5, a major version back.',
    provenBy: null,
  },
};

const BLOCKING = new Set(['high', 'critical']);

function fail(lines) {
  console.error('\nFAILED\n');
  for (const line of lines) console.error(`  - ${line}\n`);
  process.exit(1);
}

// npm audit exits non-zero whenever anything is found, so its status says
// nothing about whether the audit itself worked. The report is the evidence.
const run = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(run.stdout || '');
} catch {
  fail([
    'npm audit did not produce parseable JSON, so nothing was checked. Treating ' +
    'that as a clean run is how a broken audit passes for months.\n' +
    `      exit ${run.status}, stderr: ${(run.stderr || '').trim().split('\n').slice(-3).join(' / ') || '(none)'}`,
  ]);
}

if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
  fail([
    'npm audit returned JSON with no "vulnerabilities" map. That is a failed or ' +
    'changed audit, not a clean one — the previous gate read it as clean.',
  ]);
}

const failures = [];
const seenCauses = new Map(); // package -> Set(cause)
const rows = [];

for (const [name, vuln] of Object.entries(report.vulnerabilities)) {
  if (!BLOCKING.has(vuln.severity)) continue;

  const causes = new Set();
  for (const via of vuln.via || []) {
    if (typeof via === 'string') causes.add(via);
    else if (via && typeof via.url === 'string') {
      const id = /(GHSA-[a-z0-9-]+)/i.exec(via.url);
      causes.add(id ? id[1] : via.url);
    } else if (via && via.source != null) causes.add(String(via.source));
  }

  const accepted = ACCEPTED[name];
  if (!accepted) {
    failures.push(
      `${name} (${vuln.severity}) has no entry in this gate's register. Either fix it ` +
      `— npm reports fixAvailable: ${JSON.stringify(vuln.fixAvailable)} — or add an ` +
      `entry naming ${[...causes].join(', ') || 'its cause'} and stating, in prose, why ` +
      `this repository can live with it.`,
    );
    continue;
  }

  if (causes.size === 0) {
    failures.push(
      `${name} (${vuln.severity}) is accepted, but npm audit named no cause for it, so ` +
      `there is nothing to check the register against. Read the raw report before trusting this.`,
    );
    continue;
  }

  const unknown = [...causes].filter((c) => !accepted.causes.includes(c));
  if (unknown.length) {
    failures.push(
      `${name} (${vuln.severity}) carries ${unknown.length === 1 ? 'a cause' : 'causes'} ` +
      `nobody has accepted: ${unknown.join(', ')}. The register accepts only ` +
      `${accepted.causes.join(', ')} — a name-based allowlist would have swallowed this. ` +
      `Read the new advisory, decide separately, and either fix it or extend the entry ` +
      `with its own reason.`,
    );
  }

  seenCauses.set(name, causes);
  rows.push({ name, severity: vuln.severity, causes: [...causes], accepted });
}

// An acceptance whose advisory is gone is a silencer left armed over nothing.
for (const [name, entry] of Object.entries(ACCEPTED)) {
  const seen = seenCauses.get(name);
  if (!seen) {
    failures.push(
      `${name} is accepted in this register but npm audit no longer reports a ` +
      `high or critical advisory for it. Delete the entry — while it stands it also ` +
      `silences the next advisory to land on this package.`,
    );
    continue;
  }
  const gone = entry.causes.filter((c) => !seen.has(c));
  if (gone.length) {
    failures.push(
      `${name}: ${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} accepted here but ` +
      `no longer reported by npm audit. Remove ${gone.length === 1 ? 'it' : 'them'} from ` +
      `the entry, and drop any guard that existed only for ${gone.length === 1 ? 'it' : 'them'}.`,
    );
  }
}

console.log('DEPENDENCY ADVISORY GATE');
console.log(`  ${rows.length} high/critical advisor${rows.length === 1 ? 'y' : 'ies'}, each accepted by cause and reason.\n`);
for (const row of rows) {
  console.log(`  ${row.name} (${row.severity}) — ${row.causes.join(', ')}`);
  console.log(`      why: ${row.accepted.why}`);
  console.log(`      proven by: ${row.accepted.provenBy || 'nothing — reason is a code reading, not a gate'}\n`);
}

if (failures.length) fail(failures);
console.log(`Dependency advisory gate OK — ${rows.length} accepted, 0 unaccounted, 0 stale.`);
