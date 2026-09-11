import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  checkFramedDocumentContract,
  matchingHeaderRules,
  requiresCorp,
  resolveHeadersForPath,
  sourceToRegExp,
  crossOriginHeadersForPath,
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
      `${parent} should be cross-origin-isolated (require-corp or credentialless)`,
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

test('preview shell is never served X-Frame-Options: DENY', () => {
  // DENY blocks ALL framing, including the app framing its own same-origin
  // Preview shell → "quantoraai.app refused to connect" and a Preview stuck on
  // "Verifying — running the preview…". The shell must rely on frame-ancestors,
  // never inherit an app-page DENY.
  const headers = resolveHeadersForPath(config, PREVIEW_EMBED);
  assert.notEqual(headers['x-frame-options'], 'DENY');
});

test('app pages use X-Frame-Options: SAMEORIGIN, consistent with frame-ancestors', () => {
  // XFO must not contradict the CSP frame-ancestors 'self' already on these
  // pages: DENY there is what leaks onto (or is inherited by) the Preview shell.
  for (const parent of ['/desk', '/', '/studio']) {
    const headers = resolveHeadersForPath(config, parent);
    if (headers['x-frame-options']) {
      assert.equal(
        headers['x-frame-options'],
        'SAMEORIGIN',
        `${parent} must frame same-origin content (its own Preview), so XFO must be SAMEORIGIN not DENY`,
      );
    }
  }
});

test('app pages allow WebAssembly compilation without allowing general eval', () => {
  // Pyodide powers Coding Desk Python verification in a worker. Production CSP
  // must permit WebAssembly compilation, while continuing to forbid JavaScript
  // eval/new Function via the broader and less safe `unsafe-eval` source.
  for (const path of ['/desk', '/', '/studio']) {
    const csp = resolveHeadersForPath(config, path)['content-security-policy'];
    assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/, `${path} must allow Pyodide WASM`);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/, `${path} must not allow JS eval`);
  }
});

test('the Python worker can fetch pinned pytest packages under its own CSP', () => {
  // A module worker follows the CSP on its /assets/* response, not only the
  // document that created it. Pyodide's pinned pytest wheel and dependencies
  // come from this exact versioned registry; omitting it makes plain scripts
  // run while every pytest command fails with "No module named pytest".
  const workerCsp = resolveHeadersForPath(
    config,
    '/assets/python-runtime.worker-production.js',
  )['content-security-policy'];
  assert.match(workerCsp, /connect-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  assert.match(workerCsp, /script-src[^;]*'wasm-unsafe-eval'/);
  assert.doesNotMatch(workerCsp, /script-src[^;]*'unsafe-eval'/);
});

test('contract check catches an X-Frame-Options: DENY on the framed shell', () => {
  // Guard the guard: a config that puts DENY on /preview/* must be flagged.
  const broken = JSON.parse(JSON.stringify(config));
  const previewRule = broken.headers.find((rule) => rule.source === '/preview/(.*)');
  previewRule.headers.push({ key: 'X-Frame-Options', value: 'DENY' });
  const problems = checkFramedDocumentContract(broken, {
    framedPath: PREVIEW_EMBED,
    parentPaths: FRAMING_PARENTS,
  });
  assert.ok(
    problems.some((problem) => /X-Frame-Options: DENY/.test(problem)),
    'expected the framing contract to flag XFO DENY on the preview shell',
  );
});

test('dev-server parity: cross-origin headers come from vercel.json', () => {
  // vite.config.ts serves exactly these, so dev and prod cannot drift again.
  assert.deepEqual(crossOriginHeadersForPath(config, PREVIEW_EMBED), {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  // App pages use COEP credentialless: still cross-origin-isolated (WebContainers
  // work) but cross-origin images/avatars/preview photos load credential-stripped
  // instead of being blocked by ERR_BLOCKED_BY_RESPONSE ...ByCoep.
  assert.deepEqual(crossOriginHeadersForPath(config, '/desk'), {
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  assert.deepEqual(crossOriginHeadersForPath(config, '/'), {
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  });
});

test('app pages stay cross-origin-isolated, and the preview shell keeps its COEP', () => {
  // credentialless still isolates (WebContainers need it) — and a nested frame
  // under it is still blocked unless the frame itself carries COEP. So the
  // preview shell MUST keep require-corp + CORP, or Preview dies with
  // net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep.
  for (const parent of ['/desk', '/', '/studio']) {
    assert.equal(requiresCorp(config, parent), true, `${parent} must remain cross-origin-isolated`);
  }
  const shell = resolveHeadersForPath(config, PREVIEW_EMBED);
  assert.equal(shell['cross-origin-embedder-policy'], 'require-corp');
  assert.equal(shell['cross-origin-resource-policy'], 'cross-origin');
  // The framing contract must still hold end-to-end.
  assert.deepEqual(
    checkFramedDocumentContract(config, { framedPath: PREVIEW_EMBED, parentPaths: FRAMING_PARENTS }),
    [],
  );
});

test('dev-server parity reflects a broken config instead of masking it', () => {
  // The whole point: if COEP is dropped from vercel.json, the dev server stops
  // sending it too, so the failure shows up locally instead of only in prod.
  const broken = JSON.parse(JSON.stringify(config));
  const rule = broken.headers.find((r) => r.source === '/preview/(.*)');
  rule.headers = rule.headers.filter((h) => h.key.toLowerCase() !== 'cross-origin-embedder-policy');
  assert.equal(
    crossOriginHeadersForPath(broken, PREVIEW_EMBED)['Cross-Origin-Embedder-Policy'],
    undefined,
  );
});

test('CSP is never mirrored into the dev server', () => {
  // Production CSP forbids the eval/websocket traffic Vite needs for HMR.
  for (const path of [PREVIEW_EMBED, '/desk', '/']) {
    const keys = Object.keys(crossOriginHeadersForPath(config, path)).map((k) => k.toLowerCase());
    assert.ok(!keys.includes('content-security-policy'), `${path} must not carry CSP into dev`);
  }
});
