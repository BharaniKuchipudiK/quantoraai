import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/*
 * A stylesheet can be dead the same way a control can.
 *
 * src/index.css carried four rule blocks under
 * html[data-quantora-domain="education"] — the Study reading face, the heading
 * pairing, the paragraph rhythm, the thread spacing — and nothing in the
 * application had ever set that attribute. Every rule was inert from the day it
 * was written, and the newest of them was added the day before anyone noticed.
 * Nothing failed: lint passes, the build passes, the tests passed. It just
 * never rendered, and Study prose fell back to the generic chat font.
 *
 * Any attribute the stylesheet keys off must be set by something that runs.
 */
test('every domain the stylesheet styles is an attribute the app actually sets', () => {
  const css = read('src/index.css');
  const studio = read('src/components/AiStudio.jsx');

  const styled = [...css.matchAll(/data-quantora-domain="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(styled.length > 0, 'no domain-keyed rules found — did the attribute name change?');

  assert.match(
    studio,
    /setAttribute\(\s*['"]data-quantora-domain['"]/,
    'src/index.css styles by data-quantora-domain, but nothing sets it. Those rules render for nobody.',
  );
  // Set from the live domain, never a literal: a hardcoded value would style one
  // workspace and silently kill the rest.
  assert.match(studio, /setAttribute\(\s*['"]data-quantora-domain['"]\s*,\s*studioDomain\s*\)/);
  // And removed when there is no domain, so it cannot leak across workspaces.
  assert.match(studio, /removeAttribute\(\s*['"]data-quantora-domain['"]\s*\)/);
});

test('the Study reading face is the one the stylesheet names', () => {
  const css = read('src/index.css');
  // Nunito must actually be loaded, not just named. A named-but-unloaded family
  // falls back silently, which looks exactly like the bug above.
  const declared = /--font-study-body:\s*'([^']+)'/.exec(css);
  assert.ok(declared, 'no --font-study-body declared');
  const family = declared[1].replace(/\s+/g, '+');
  const html = read('index.html');
  assert.ok(
    css.includes(`family=${family}`) || html.includes(`family=${family}`),
    `${declared[1]} is used for Study prose but never loaded — it would fall back to the chat font.`,
  );
});
