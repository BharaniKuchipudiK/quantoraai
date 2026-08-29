import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/*
 * A stylesheet can be dead the same way a control can, so this checks that the
 * attribute src/index.css keys off is actually written by something that runs.
 *
 * It also exists because of how easily that question is answered wrongly. The
 * CSS says data-quantora-domain; the code says dataset.quantoraDomain. A search
 * for the CSS spelling finds nothing in src/, which reads exactly like dead
 * CSS and is not — publishStudioDomainState has always set it. A grep is not a
 * reachability proof when the two sides spell the same thing differently, and
 * this test is the proof that grep could not be.
 */
test('the domain attribute the stylesheet keys off is actually set', () => {
  const css = read('src/index.css');
  const events = read('src/lib/studio-shell-events.js');

  const styled = [...css.matchAll(/data-quantora-domain="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(styled.length > 0, 'no domain-keyed rules found — did the attribute name change?');

  // The DOM API camel-cases it: data-quantora-domain <-> dataset.quantoraDomain.
  assert.match(
    events,
    /document\.documentElement\.dataset\.quantoraDomain\s*=/,
    'src/index.css styles by data-quantora-domain and nothing sets it.',
  );

  // Every domain the stylesheet styles must survive normalization, or the rule
  // is written for a value the setter can never produce.
  const valid = /VALID_STUDIO_DOMAINS = new Set\(\[([^\]]+)\]\)/.exec(events);
  assert.ok(valid, 'could not read the accepted studio domains');
  for (const domain of styled) {
    assert.ok(valid[1].includes(`'${domain}'`), `index.css styles "${domain}", which normalizeStudioDomain rejects.`);
  }
});

test('only one place writes the domain attribute', () => {
  /*
   * Two writers is worse than none. A second effect that cleared the attribute
   * on unmount raced the real setter and blanked it on every domain change,
   * which took four browser gates red — they wait on exactly this attribute.
   */
  const sources = ['src/components/AiStudio.jsx', 'src/App.jsx', 'src/lib/studio-shell-events.js'];
  const writers = sources.filter((file) => /dataset\.quantoraDomain\s*=|setAttribute\(\s*['"]data-quantora-domain['"]/.test(read(file)));
  assert.deepEqual(writers, ['src/lib/studio-shell-events.js']);
});

test('the Study reading face is loaded, not just named', () => {
  const css = read('src/index.css');
  // A named-but-unloaded family falls back silently, which is invisible in
  // every check except someone's eyes.
  const declared = /--font-study-body:\s*'([^']+)'/.exec(css);
  assert.ok(declared, 'no --font-study-body declared');
  const family = declared[1].replace(/\s+/g, '+');
  const html = read('index.html');
  assert.ok(
    css.includes(`family=${family}`) || html.includes(`family=${family}`),
    `${declared[1]} is used for Study prose but never loaded — it would fall back to the chat font.`,
  );
});
