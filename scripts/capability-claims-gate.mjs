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
import {
  describeUnbackedToolClaims,
  extractPlacesToolClaims,
  findUnbackedToolClaims,
} from '../src/lib/tool-claims.js';
import { STUDIO_DOMAIN, studioDomainPolicy } from '../src/lib/studio-domain-policy.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onDisk = (relative) => fs.existsSync(path.join(repoRoot, relative));

const policies = Object.fromEntries(
  Object.values(STUDIO_DOMAIN).map((domain) => [domain, studioDomainPolicy(domain)]),
);

/*
 * Second surface, same failure: a capability chip promises a human, and a tool
 * description promises the model. search_hotels advertised photos its field
 * mask never requested, so the model invented a reason for their absence and
 * the traveller read it as fact. This half of the gate reads that surface.
 */
const TOOL_SOURCE = path.join(repoRoot, 'api/_lib/agent-tools-core.ts');
const parsedTools = extractPlacesToolClaims(fs.readFileSync(TOOL_SOURCE, 'utf8'));
if (parsedTools.missing.length) {
  console.error(`\nCapability claims gate FAILED — tool(s) declared but not parsed: ${parsedTools.missing.join(', ')}.`);
  console.error('A tool the gate cannot read is a tool it is not checking. Update extractPlacesToolClaims.\n');
  process.exit(1);
}

if (parsedTools.unbound.length) {
  console.error(`\nCapability claims gate FAILED — known Places tool(s) could not be bound to a call site: ${parsedTools.unbound.join(', ')}.`);
  console.error(`
The gate reads each tool's own case block to learn which field mask it sends.
A tool it cannot find there drops out of the check silently — which is how
search_hotels, the tool this gate exists to police, could vanish from coverage
while the run still reported a pass.

Either update extractPlacesToolClaims to match the new dispatch shape, or, if
the tool genuinely no longer calls Places, remove it from KNOWN_PLACES_TOOLS in
src/lib/tool-claims.js in the same change.
`);
  process.exit(1);
}

// Each tool is checked against the mask ITS OWN call site sends, not a union.

/*
 * Order matters: the specific diagnoses above run first. The generic
 * "could not read" message is the last resort, and letting it win would
 * replace "search_hotels could not be bound" with something unactionable —
 * which is how a gate gets muted rather than fixed.
 */
if (!parsedTools.ok) {
  console.error(`\nCapability claims gate FAILED — could not read tool definitions from api/_lib/agent-tools-core.ts.`);
  console.error(`
The gate parses that file for tool descriptions and field masks. Finding none
means the file's shape changed, NOT that every claim is honest — so this fails
rather than reporting a clean run over nothing. Update extractPlacesToolClaims
in src/lib/tool-claims.js to match the new shape.
`);
  process.exit(1);
}

const toolFindings = parsedTools.places
  .flatMap((tool) => findUnbackedToolClaims([tool], tool.fieldMask));

const unbacked = findUnbackedCapabilities(policies, onDisk);
const added = newUnbackedClaims(unbacked);
const resolved = resolvedUnbackedClaims(unbacked);

if (resolved.length) {
  console.log(`Capability claims improved — ${resolved.length} claim(s) are now answerable:`);
  for (const claim of resolved) console.log(`  - ${claim}`);
  console.log('Remove them from KNOWN_UNBACKED_CLAIMS in src/lib/capability-claims.js.\n');
}

if (toolFindings.length) {
  console.error(`\n${describeUnbackedToolClaims(toolFindings)}\n`);
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

// Exit once, after both halves have had their say: a branch that breaks both
// should not cost two CI cycles to learn about.
if (toolFindings.length || resolved.length) process.exit(1);

console.log(
  `Capability claims gate passed — every advertised capability is answerable`
  + ` (${KNOWN_UNBACKED_CLAIMS.length} known painted door(s) held at baseline),`
  + ` and ${parsedTools.places.length} Places-backed tool description(s) promise only fields the request asks for.`,
);
