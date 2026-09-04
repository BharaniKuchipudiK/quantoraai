import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANT: generated code never renders through srcDoc.
 *
 * A srcdoc document INHERITS the embedder's Content-Security-Policy. The app's
 * CSP is `script-src 'self' blob:` with no 'unsafe-inline' (vercel.json), so
 * every inline script inside a generated application is refused, the harness
 * never runs, and the parent times out with "compiled, but the generated
 * application did not report that it rendered".
 *
 * LivePreviewCanvas hit this, fixed it by rendering through /preview/embed.html
 * — a real same-origin response that carries its OWN relaxed CSP — and wrote
 * the lesson at the top of its own file. ProjectRuntimePreview kept srcDoc, and
 * on 2026-09-04 the deployed golden failed exactly that way, with two "Refused
 * to execute inline script" errors in the console beside it. The instance was
 * fixed; the CLASS was left open. This closes it.
 *
 * A source assertion because the failure only reproduces in a real browser
 * under real response headers — there is no unit seam that carries a CSP.
 */
const COMPONENTS = ['ProjectRuntimePreview.jsx', 'LivePreviewCanvas.jsx'];
const read = (name) => readFileSync(path.join(import.meta.dirname, '..', 'components', name), 'utf8');

test('no preview component hands generated code to srcDoc', () => {
  for (const name of COMPONENTS) {
    assert.doesNotMatch(
      read(name),
      /srcDoc\s*=\s*\{/,
      `${name} renders generated code through srcDoc, which inherits the app CSP and kills its inline scripts`,
    );
  }
});

test('the generated app is served from the shell that carries its own CSP', () => {
  assert.match(
    read('ProjectRuntimePreview.jsx'),
    /src="\/preview\/embed\.html"/,
    'the shell is what supplies the relaxed CSP; without it inline scripts are refused',
  );
});

test('the sandbox still withholds allow-same-origin', () => {
  /*
   * Same-origin SERVING is what supplies the shell's CSP. The sandbox is what
   * keeps the generated code at an opaque origin. Loading the shell by src must
   * never be mistaken for a reason to relax the sandbox — that would hand
   * untrusted generated code our origin, cookies and storage.
   */
  const source = read('ProjectRuntimePreview.jsx');
  // Comments stripped first: this file EXPLAINS the token, and prose about a
  // rule must not read as a violation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(code, /sandbox=\{buildPreviewSandbox\(\)\}/,
    'called with no trustedRuntimeUrl — that argument is the only way to earn allow-same-origin');
  assert.doesNotMatch(code, /allow-same-origin/);
});

test('the shell and the generated app cannot be confused for one another', () => {
  /*
   * The shell announces `__quantora` / embed-ready; the compiled app announces
   * `__quantoraProjectPreview` / ready. If one marker satisfied the other, the
   * shell merely loading would certify that the user's application rendered —
   * a green light for a blank page.
   */
  const source = read('ProjectRuntimePreview.jsx');
  assert.match(source, /__quantora\s*&&\s*event\.data\.kind === 'embed-ready'/);
  assert.match(source, /if \(!event\.data\?\.__quantoraProjectPreview\) return;/);
  const embedReadyAt = source.indexOf("'embed-ready'");
  const appGuardAt = source.indexOf('__quantoraProjectPreview) return;');
  assert.ok(embedReadyAt < appGuardAt, 'the shell branch must return before the app-message guard');
});
