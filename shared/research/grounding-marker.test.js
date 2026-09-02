/**
 * The marker's two contracts, both of which were measured rather than assumed.
 *
 * 1. It must be INVISIBLE to the reader. An HTML comment was the obvious first
 *    choice and is wrong: react-markdown runs here without rehype-raw, so it
 *    escapes HTML and the reader would have seen `<!--quantora-grounded-->`
 *    printed in the chat. `[//]: # (...)` is a link reference definition — valid
 *    markdown that resolves to nothing and renders as nothing.
 * 2. The model must never SEE it. A marker inside model-visible text that the
 *    model can read is a marker it can imitate, and assistant turns go back
 *    into context verbatim. Without the strip this whole mechanism is
 *    decorative, which CLAUDE.md §4 rates as worse than nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GROUNDING_MARKER,
  GROUNDING_MARKER_LINE,
  buildGroundedSourceBlock,
  stripGroundingMarker,
  stripGroundingMarkerFromMessage,
} from './grounding-marker.js';

const SOURCES = [
  { title: 'NEJM', uri: 'https://www.nejm.org/x' },
  { title: 'FDA', uri: 'https://www.fda.gov/y' },
];

test('the emitted block carries the marker above the heading', () => {
  const block = buildGroundedSourceBlock(SOURCES);
  const lines = block.split('\n');
  const headingAt = lines.findIndex((line) => /^\*\*Sources\*\*$/.test(line));
  assert.ok(headingAt > 0, 'the block has a Sources heading');

  // Only rule and whitespace may sit between the marker and the heading —
  // that adjacency is what the board's parser requires.
  let index = headingAt - 1;
  let found = false;
  while (index >= 0) {
    if (GROUNDING_MARKER_LINE.test(lines[index])) { found = true; break; }
    if (!/^\s*(-{3,})?\s*$/.test(lines[index])) break;
    index -= 1;
  }
  assert.ok(found, `no marker directly above the heading in:\n${block}`);
});

test('no sources means no block, so an empty ledger is never attested', () => {
  assert.equal(buildGroundedSourceBlock([]), '');
  assert.equal(buildGroundedSourceBlock(), '');
  assert.equal(buildGroundedSourceBlock(null), '');
});

test('the block caps at the limit it is given', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, uri: `https://e.com/${i}` }));
  const rows = buildGroundedSourceBlock(many).split('\n').filter((l) => /^\d+\. \[/.test(l));
  assert.equal(rows.length, 5, 'default limit');
  assert.equal(buildGroundedSourceBlock(many, 2).split('\n').filter((l) => /^\d+\. \[/.test(l)).length, 2);
});

test('THE POINT: the marker is gone from anything heading back to a model', () => {
  const reply = `An answer.${buildGroundedSourceBlock(SOURCES)}`;
  assert.ok(reply.includes(GROUNDING_MARKER), 'precondition: the reply is attested');

  const stripped = stripGroundingMarker(reply);
  assert.ok(!stripped.includes('quantora-grounded'), 'a model that sees the marker can copy it');

  // The sources themselves stay: the model may still imitate the BLOCK, and
  // that is fine — an unmarked block is honestly counted as ungrounded. What it
  // must never reproduce is the server's attestation.
  assert.ok(stripped.includes('**Sources**'), 'context is not what we are removing');
  assert.ok(stripped.includes('https://www.nejm.org/x'));
});

test('stripping is idempotent and leaves unmarked text untouched by identity', () => {
  const plain = 'No block here at all.';
  assert.equal(stripGroundingMarker(plain), plain);
  const once = stripGroundingMarker(`x${buildGroundedSourceBlock(SOURCES)}`);
  assert.equal(stripGroundingMarker(once), once);
  for (const value of [null, undefined, 42, {}]) assert.equal(stripGroundingMarker(value), value);
});

test('stripping a message preserves every other field, and the object when unchanged', () => {
  const message = { sender: 'ai', text: `hi${buildGroundedSourceBlock(SOURCES)}`, id: 'm1', ts: 7 };
  const out = stripGroundingMarkerFromMessage(message);
  assert.equal(out.sender, 'ai');
  assert.equal(out.id, 'm1');
  assert.equal(out.ts, 7);
  assert.ok(!out.text.includes('quantora-grounded'));

  // An untouched message is returned by identity, so history mapping stays cheap.
  const clean = { sender: 'user', text: 'plain' };
  assert.equal(stripGroundingMarkerFromMessage(clean), clean);
  assert.equal(stripGroundingMarkerFromMessage(null), null);
  assert.equal(stripGroundingMarkerFromMessage({ sender: 'ai' }).sender, 'ai');
});

test('the marker line pattern matches the machine form and not loose prose', () => {
  assert.ok(GROUNDING_MARKER_LINE.test(GROUNDING_MARKER));
  assert.ok(GROUNDING_MARKER_LINE.test(`  ${GROUNDING_MARKER}  `), 'leading/trailing space is harmless');
  assert.ok(!GROUNDING_MARKER_LINE.test(`text ${GROUNDING_MARKER}`), 'not when embedded in a sentence');
  assert.ok(!GROUNDING_MARKER_LINE.test('[//]: # (quantora-grounded) trailing'), 'nor with anything after it');
});

test('a paren URL and a newline title still land on the board ledger', async () => {
  // OpenRouter's web plugin returns raw web URLs; a ')' inside one closes the
  // markdown link early and the board's row regex silently drops a real
  // source. The builder percent-encodes parens and collapses title
  // whitespace, so this asserts through the REAL parser, not a copied regex.
  const { deriveResearchBrief } = await import('../../src/lib/research-brief.js');
  const block = buildGroundedSourceBlock([
    { title: 'Mercury\n(planet)  overview', uri: 'https://en.wikipedia.org/wiki/Mercury_(planet)' },
  ]);
  const brief = deriveResearchBrief({
    messages: [
      { id: 'u1', sender: 'user', text: 'What do we know about Mercury?' },
      { id: 'a1', sender: 'ai', text: `Mercury is the smallest planet.${block}` },
    ],
  });
  assert.equal(brief.sources.length, 1, 'the row must survive into the ledger');
  assert.equal(brief.sources[0].uri, 'https://en.wikipedia.org/wiki/Mercury_%28planet%29');
  assert.equal(brief.sources[0].title, 'Mercury (planet) overview');
});
