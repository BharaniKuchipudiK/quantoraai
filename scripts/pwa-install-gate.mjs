#!/usr/bin/env node
/*
 * Prove the app can still be installed to a phone's home screen.
 *
 * Every failure in this class is SILENT. A manifest that names an icon which is
 * not there, or is not the size it claims, does not raise an error anywhere —
 * iOS and Android simply decline to install, or install a blank square, and the
 * only way to find out is to try it on a handset. That is exactly the shape of
 * defect this repo keeps paying for: a claim in one file with nothing backing
 * it in another (CLAUDE.md §7).
 *
 * Deliberately narrow (§5). It checks only things that are unambiguously broken
 * — a missing file, a size that disagrees with the bytes, a pair of settings
 * that is dangerous when half-applied. It does not grade the manifest against
 * taste or lighthouse scores, because a gate that fires on opinion is the next
 * one muted.
 *
 * It does NOT check for a service worker, because there deliberately is not
 * one: iOS installs from the manifest plus the apple-* tags alone, and a
 * service worker persists in browsers after removal. See index.html.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { imageSize } from 'image-size';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'public/manifest.webmanifest';
const INDEX = 'index.html';

const failures = [];
const fail = (what, remedy) => failures.push({ what, remedy });
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

/* ---- the manifest itself ---- */
let manifest = null;
if (!existsSync(path.join(repoRoot, MANIFEST))) {
  fail(`${MANIFEST} is missing.`, `Restore it, or drop the <link rel="manifest"> from ${INDEX}.`);
} else {
  try {
    manifest = JSON.parse(read(MANIFEST));
  } catch (error) {
    fail(`${MANIFEST} is not valid JSON (${error.message}).`, 'Fix the JSON — a browser silently ignores a manifest it cannot parse.');
  }
}

if (manifest) {
  for (const field of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    if (!manifest[field]) fail(`${MANIFEST} has no "${field}".`, `Add "${field}" — without it the install prompt does not appear.`);
  }
  if (manifest.display && manifest.display !== 'standalone' && manifest.display !== 'fullscreen') {
    fail(
      `${MANIFEST} display is "${manifest.display}", so the app opens in browser chrome.`,
      'Use "standalone" if the home-screen icon is meant to feel like an app.',
    );
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  if (!icons.length) {
    fail(`${MANIFEST} declares no icons.`, 'Declare at least a 192x192 and a 512x512 PNG.');
  }

  // The heart of it: every declared icon must exist AND actually be the size it
  // claims. A 1024px file labelled 192x192 installs as a blurred or blank icon.
  for (const icon of icons) {
    const src = String(icon.src || '');
    if (!src.startsWith('/')) {
      fail(`Icon src "${src}" is not root-relative.`, 'Use a leading slash so the icon resolves from any route.');
      continue;
    }
    const rel = path.join('public', src.replace(/^\//, ''));
    if (!existsSync(path.join(repoRoot, rel))) {
      fail(`Icon "${src}" is declared but ${rel} does not exist.`, `Add the file, or remove the entry from ${MANIFEST}.`);
      continue;
    }
    const declared = String(icon.sizes || '');
    const match = declared.match(/^(\d+)x(\d+)$/);
    if (!match) {
      fail(`Icon "${src}" declares sizes "${declared}".`, 'Use an explicit WxH such as "192x192".');
      continue;
    }
    const [, w, h] = match;
    const actual = imageSize(readFileSync(path.join(repoRoot, rel)));
    if (actual.width !== Number(w) || actual.height !== Number(h)) {
      fail(
        `Icon "${src}" says ${declared} but the file is ${actual.width}x${actual.height}.`,
        'Regenerate the file at the declared size, or correct "sizes".',
      );
    }
  }

  if (icons.length && !icons.some((i) => String(i.purpose || '').includes('maskable'))) {
    fail(
      `${MANIFEST} has no maskable icon.`,
      'Add one with "purpose": "maskable" and ~20% padding, or Android crops the logo inside its mask.',
    );
  }
}

/* ---- what iOS actually reads ---- */
const html = existsSync(path.join(repoRoot, INDEX)) ? read(INDEX) : '';
if (!html) {
  fail(`${INDEX} is missing.`, 'Nothing to check — restore it.');
} else {
  if (!/<link[^>]+rel=["']manifest["']/.test(html)) {
    fail(`${INDEX} does not link the manifest.`, 'Add <link rel="manifest" href="/manifest.webmanifest" />.');
  }

  // iOS ignores manifest icons for Add to Home Screen. No apple-touch-icon and
  // it screenshots the page as the icon instead.
  const apple = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/);
  if (!apple) {
    fail(`${INDEX} has no apple-touch-icon.`, 'Add <link rel="apple-touch-icon" href="/apple-touch-icon.png" /> or iOS uses a screenshot of the page.');
  } else {
    const rel = path.join('public', apple[1].replace(/^\//, ''));
    if (!existsSync(path.join(repoRoot, rel))) {
      fail(`apple-touch-icon points at ${apple[1]} but ${rel} does not exist.`, 'Add the file, or remove the tag.');
    }
  }

  if (!/name=["']apple-mobile-web-app-capable["'][^>]*content=["']yes["']/.test(html)) {
    fail(
      `${INDEX} does not set apple-mobile-web-app-capable.`,
      'Add it, or the home-screen icon opens Safari with full browser chrome.',
    );
  }

  /*
   * The pairing that matters most, and the one a well-meaning edit breaks.
   *
   * viewport-fit=cover paints under the notch; the safe-area padding is what
   * keeps the header out from under the clock. Either alone is a bug:
   * cover without padding hides the header, padding without cover leaves a
   * dead band. So they are required to travel together, in both directions.
   */
  /*
   * Read the viewport META's content, never the whole document. The first cut
   * of this check grepped the file for "viewport-fit=cover" and passed while
   * the tag did not have it — because the comment above the tag says the words.
   * A gate that matches prose is not checking configuration (§8), and it only
   * surfaced because the reverse direction was actually run with the bug in.
   */
  const viewportTag = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i)?.[0] || '';
  const viewportContent = viewportTag.match(/content=["']([^"']*)["']/i)?.[1] || '';
  const hasCover = /viewport-fit\s*=\s*cover/.test(viewportContent);

  const css = existsSync(path.join(repoRoot, 'src/index.css')) ? read('src/index.css') : '';
  // Likewise scoped to a real declaration, not a mention in a comment.
  const hasSafeArea = /padding[^;{}]*:\s*[^;{}]*env\(\s*safe-area-inset-top\s*\)/.test(css);

  if (!viewportTag) {
    fail(`${INDEX} has no viewport meta tag.`, 'Add one — without it iOS renders the desktop layout scaled down.');
  }

  if (hasCover && !hasSafeArea) {
    fail(
      'index.html sets viewport-fit=cover but src/index.css has no safe-area-inset padding.',
      'Add the safe-area padding, or drop viewport-fit=cover — on its own it puts the header under the notch.',
    );
  }
  if (hasSafeArea && !hasCover) {
    fail(
      'src/index.css pads for safe-area insets but index.html does not set viewport-fit=cover.',
      'Add viewport-fit=cover, or drop the padding — without cover the insets are 0 and the rule is dead code.',
    );
  }
}

/* Per §4: a check that finds nothing to inspect has not passed, it has failed
 * to run. Reporting "0 problems" over an empty scan is how a decorative gate
 * survives. */
if (!manifest && !html) {
  console.error('PWA install gate found neither a manifest nor an index.html to inspect — it checked nothing.');
  process.exit(1);
}

if (failures.length) {
  console.error(`PWA install gate FAILED — ${failures.length} problem(s) that silently break home-screen install:\n`);
  for (const { what, remedy } of failures) {
    console.error(`  ✗ ${what}`);
    console.error(`    → ${remedy}\n`);
  }
  process.exit(1);
}

const iconCount = Array.isArray(manifest?.icons) ? manifest.icons.length : 0;
console.log(
  `PWA install gate passed — manifest valid, ${iconCount} icon(s) exist at their declared sizes, `
  + 'iOS install tags present, viewport-fit and safe-area padding agree.',
);
