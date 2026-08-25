import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  checkFramedDocumentContract,
  matchingHeaderRules,
  requiresCorp,
  resolveHeadersForPath,
  sourceToRegExp,
} from './vercel-headers.js';

const config = JSON.parse(
  fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
);

const PREVIEW_EMBED = '/preview/embed.html';
// Every document that frames the Preview shell. `/desk` has its own rule; the
// SPA is served by the catch-all, which any non-preview route falls into.
const FRAMING_PARENTS = ['/desk', '/', '/studio'];

test('source patterns anchor correctly', () => {
  assert.equal(sourceToRegExp('/preview/(.*)').test(PREVIEW_EMBED), true);
  assert.equal(sourceToRegExp('/desk').test('/desk'), true);
  assert.equal(sourceToRegExp('/desk').test('/desktop'), false);
  // The catch-all deliberately excludes preview/ and desk.
  const catchAll = sourceToRegExp('/((?!preview/|desk).*)');
  assert.equal(catchAll.test('/'), true);
  assert.equal(catchAll.test('/studio'), true);
  assert.equal(catchAll.test(PREVIEW_EMBED), false);
  assert.equal(catchAll.test('/desk'), false);
});

test('the catch-all COEP rule does not reach the preview shell', () => {
  // This is the trap: preview/ is excluded from the rule that carries COEP, so
  // /preview/* must declare COEP itself. Documents the reason the bug was
  // invisible — nothing "removed" a header, the rule simply never applied.
  const sources = matchingHeaderRules(config, PREVIEW_EMBED).map((rule) => rule.source);
  assert.deepEqual(sources, ['/preview/(.*)']);
});

test('framing parents are cross-origin isolated', () => {
  for (const parent of FRAMING_PARENTS) {
    assert.equal(
      requiresCorp(config, parent),
      true,
      `${parent} should be served with COEP require-corp`,
    );
  }
});

test('preview shell satisfies the COEP framing contract', () => {
  const problems = checkFramedDocumentContract(config, {
    framedPath: PREVIEW_EMBED,
    parentPaths: FRAMING_PARENTS,
  });
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('preview shell carries both CORP and COEP explicitly', () => {
  const headers = resolveHeadersForPath(config, PREVIEW_EMBED);
  assert.equal(headers['cross-origin-resource-policy'], 'cross-origin');
  assert.equal(headers['cross-origin-embedder-policy'], 'require-corp');
  assert.ok(headers['content-security-policy'], 'preview shell needs its relaxed CSP');
});

test('contract check actually fails when COEP is missing', () => {
  // Guard the guard: reproduce the shipped-broken config and prove we catch it.
  const broken = JSON.parse(JSON.stringify(config));
  const previewRule = broken.headers.find((rule) => rule.source === '/preview/(.*)');
  previewRule.headers = previewRule.headers.filter(
    (header) => header.key.toLowerCase() !== 'cross-origin-embedder-policy',
  );
  const problems = checkFramedDocumentContract(broken, {
    framedPath: PREVIEW_EMBED,
    parentPaths: FRAMING_PARENTS,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /embed-ready never fires/);
});
