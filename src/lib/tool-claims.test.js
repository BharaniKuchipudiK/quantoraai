/**
 * The gate is only worth having if it fails when the bug is present.
 *
 * These tests carry the real incident as a fixture: the exact search_hotels
 * description that shipped, against the exact twelve-field mask that shipped
 * beside it. If this suite ever goes green on that pair, the gate has stopped
 * working and the next tool to over-promise will ship the same way.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KNOWN_PLACES_TOOLS,
  describeUnbackedToolClaims,
  extractPlacesToolClaims,
  findUnbackedToolClaims,
} from './tool-claims.js';

/* The description exactly as it shipped, photos claim and all. */
const SHIPPED_DESCRIPTION = 'REQUIRED for hotels, stays, property ratings, websites, Google Maps links, or photos. Uses Google Places API (New). Returns name, address, Google user rating, website and Maps URI. Do not use get_places_routing for hotels. Google Places does not provide date-specific room inventory or bookable rates.';

/* The mask exactly as it shipped: twelve fields, no places.photos. */
const SHIPPED_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
  'places.googleMapsUri', 'places.websiteUri', 'places.rating', 'places.userRatingCount',
  'places.primaryType', 'places.types', 'places.businessStatus', 'places.priceLevel',
].join(',');

test('THE INCIDENT: the shipped pair is caught', () => {
  const findings = findUnbackedToolClaims(
    [{ name: 'search_hotels', description: SHIPPED_DESCRIPTION }],
    SHIPPED_MASK,
  );
  assert.equal(findings.length, 1, 'the photos claim must be caught');
  assert.equal(findings[0].tool, 'search_hotels');
  assert.equal(findings[0].requiredField, 'places.photos');
});

test('adding the field makes the same description pass', () => {
  const findings = findUnbackedToolClaims(
    [{ name: 'search_hotels', description: SHIPPED_DESCRIPTION }],
    `${SHIPPED_MASK},places.photos`,
  );
  assert.deepEqual(findings, [], 'requesting the field is one of the two valid fixes');
});

test('removing the word makes the same mask pass', () => {
  const withoutPhotos = SHIPPED_DESCRIPTION.replace(', or photos', '');
  const findings = findUnbackedToolClaims(
    [{ name: 'search_hotels', description: withoutPhotos }],
    SHIPPED_MASK,
  );
  assert.deepEqual(findings, [], 'not making the claim is the other valid fix');
});

test('claims the mask already backs are not flagged', () => {
  // The shipped description also says "ratings", "websites" and "address" —
  // all three ARE in the shipped mask, so only photos should ever have fired.
  const findings = findUnbackedToolClaims(
    [{ name: 'search_hotels', description: SHIPPED_DESCRIPTION }],
    `${SHIPPED_MASK},places.photos`,
  );
  assert.deepEqual(findings, [], 'no false positives on backed claims');
});

test('whole words only — no substring false positives', () => {
  const findings = findUnbackedToolClaims(
    [{ name: 'x', description: 'Uses Google Places API. Photographic evidence and photocopies are unrelated.' }],
    SHIPPED_MASK,
  );
  assert.deepEqual(findings, [], '"photographic" and "photocopies" are not a photos claim');
});

test('the failure message names the tool, the claim and the remedy', () => {
  const message = describeUnbackedToolClaims(
    findUnbackedToolClaims([{ name: 'search_hotels', description: SHIPPED_DESCRIPTION }], SHIPPED_MASK),
  );
  // Rule 8: a gate is not verified until you have read what it says with the
  // bug present. An unactionable message is one the next person mutes.
  assert.match(message, /search_hotels/);
  assert.match(message, /places\.photos/);
  assert.match(message, /remove the word/);
  assert.ok(!/undefined/.test(message), 'the message must not print undefined anywhere');
});

test('a parse that finds nothing reports NOT ok, so the gate fails loudly', () => {
  assert.equal(extractPlacesToolClaims('').ok, false);
  assert.equal(extractPlacesToolClaims('const unrelated = 1;').ok, false);
  // A file with a mask but no Places tools is equally not something to pass.
  assert.equal(extractPlacesToolClaims("const A_FIELD_MASK = ['places.id'];").ok, false);
});

test('LIVE: the real tool definitions parse and are currently honest', () => {
  // Resolved from this file, not from cwd: every other test in src/lib is
  // cwd-independent, and an ENOENT here would read as a gate regression.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const source = fs.readFileSync(path.join(repoRoot, 'api/_lib/agent-tools-core.ts'), 'utf8');
  const parsed = extractPlacesToolClaims(source);
  assert.ok(parsed.ok, 'agent-tools-core.ts must still be parseable by the gate');
  assert.deepEqual(parsed.missing, [], 'every declared tool must be parsed');
  // Named explicitly: "at least one" let a reformat drop search_hotels — the
  // one tool this gate exists to police — while still reporting a pass.
  for (const expected of ['search_hotels', 'search_attractions', 'get_places_routing']) {
    assert.ok(
      parsed.places.some((tool) => tool.name === expected),
      `${expected} must be inside the gate`,
    );
  }
  assert.deepEqual(
    parsed.places.flatMap((tool) => findUnbackedToolClaims([tool], tool.fieldMask)),
    [],
    'a shipped tool description must not promise a field the request never asks for',
  );
});

test('THE REGRESSION: removing withPhotos from the call site is caught', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const source = fs.readFileSync(path.join(repoRoot, 'api/_lib/agent-tools-core.ts'), 'utf8');
  /*
   * Exactly the edit that restores the production incident. An earlier version
   * of this gate returned no findings for it, because it unioned masks across
   * the file instead of reading the call site.
   *
   * The mutation is anchored on the CASE BLOCK, not on the comment above the
   * line. It used to match `// Only this tool advertises photos…` and broke the
   * moment that sentence stopped being true — a second tool started requesting
   * photos, the comment was corrected, and this test failed on its own
   * precondition while the gate it checks was working perfectly. CLAUDE.md §6:
   * anchor on durable structure, never on prose.
   */
  const cut = (text, toolName) => {
    const start = text.indexOf(`case '${toolName}':`);
    assert.notEqual(start, -1, `${toolName} case block must still be findable`);
    const after = text.slice(start);
    const end = after.indexOf("\n    case '");
    const block = end === -1 ? after : after.slice(0, end);
    assert.match(block, /withPhotos:\s*true/, `${toolName} must still request photos`);
    return text.slice(0, start) + block.replace(/\n\s*withPhotos:\s*true,/, '') + (end === -1 ? '' : after.slice(end));
  };

  for (const tool of ['search_hotels', 'search_attractions']) {
    const broken = cut(source, tool);
    assert.notEqual(broken, source, `${tool}'s withPhotos call site must still be findable`);

    const parsed = extractPlacesToolClaims(broken);
    const findings = parsed.places.flatMap((entry) => findUnbackedToolClaims([entry], entry.fieldMask));
    assert.equal(findings.length, 1, `the gate must catch the incident for ${tool}`);
    assert.equal(findings[0].tool, tool);
    assert.equal(findings[0].requiredField, 'places.photos');
  }
});

test('a tool the parser cannot read fails loudly rather than passing quietly', () => {
  const parsed = extractPlacesToolClaims("    name: 'search_hotels',\n    somethingElse: 1,");
  assert.equal(parsed.ok, false, 'an unparsed tool must not report a clean run');
  assert.deepEqual(parsed.missing, ['search_hotels']);
});

test('WAS RED: a reshaped dispatch cannot silently drop a tool from coverage', () => {
  /*
   * Raised in review. Discovering Places tools purely by scanning case blocks
   * meant a tool whose dispatch shape changed just vanished from `places` —
   * and `ok` stayed true because the other two still parsed. A clean run over
   * two of three tools, with the one the gate exists to police missing.
   *
   * Both mutations below are ordinary reformats, not sabotage.
   */
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const source = fs.readFileSync(path.join(repoRoot, 'api/_lib/agent-tools-core.ts'), 'utf8');

  const reshapes = [
    ['double-quoted case label', source.replace("case 'search_hotels': {", 'case "search_hotels": {')],
    ['dispatch moved to a shared handler',
      source.replace("case 'search_hotels': {", "case 'search_hotels':\n      return handleHotels(args);\n    case '__never': {")],
  ];

  for (const [label, mutated] of reshapes) {
    assert.notEqual(mutated, source, `${label}: the mutation must actually apply`);
    const parsed = extractPlacesToolClaims(mutated);
    assert.ok(
      !parsed.places.some((tool) => tool.name === 'search_hotels'),
      `${label}: this reshape is expected to break the binding`,
    );
    assert.deepEqual(parsed.unbound, ['search_hotels'], `${label}: the lost tool must be named`);
    assert.equal(parsed.ok, false, `${label}: losing a known Places tool must fail the gate`);
  }
});

test('every known Places tool binds to a call site today', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const parsed = extractPlacesToolClaims(
    fs.readFileSync(path.join(repoRoot, 'api/_lib/agent-tools-core.ts'), 'utf8'),
  );
  assert.deepEqual(parsed.unbound, [], 'a known Places tool that cannot be bound is a hole in the gate');
  for (const name of KNOWN_PLACES_TOOLS) {
    assert.ok(parsed.places.some((tool) => tool.name === name), `${name} must be covered`);
  }
});
