import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDeskRename,
  brandCandidates,
  deriveCurrentBrand,
  describeDeskRename,
  detectRenameRequest,
  planDeskRename,
} from './desk-rename.js';

/** The storefront from the session that exposed this. */
const STORE_HTML = `<!doctype html><html><head>
<title>Kaapi Bharat &mdash; Coffee &amp; Tea Merchants</title>
<meta property="og:site_name" content="Kaapi Bharat">
</head><body>
<header><h1>Kaapi Bharat</h1></header>
<button class="kaapi-cart">Add to Cart</button>
<footer>&copy; 2025 Kaapi Bharat. All rights reserved.</footer>
</body></html>`;

const STORE_VFS = {
  'index.html': STORE_HTML,
  'products.json': '[{"id":"araku","brand":"Kaapi Bharat"}]',
  'styles.css': '.kaapi-cart{color:#000}',
  'package-lock.json': '{"name":"Kaapi Bharat"}',
};

test('the real request is understood', () => {
  assert.deepEqual(
    detectRenameRequest("can you rename or rebrand this as Hiran's Coffee"),
    { newName: "Hiran's Coffee" },
    'the apostrophe is part of the name, not a quote to strip',
  );
  assert.deepEqual(detectRenameRequest('call it Blue Bottle instead'), { newName: 'Blue Bottle' });
  assert.deepEqual(detectRenameRequest('change the name to Third Wave.'), { newName: 'Third Wave' });
  assert.deepEqual(detectRenameRequest('rename it to "Filter Room"'), { newName: 'Filter Room' });
});

test('a file rename is a different operation and is not claimed', () => {
  assert.equal(detectRenameRequest('rename src/App.jsx to src/Main.jsx'), null);
  assert.equal(detectRenameRequest('rename index.html to home.html'), null);
});

test('talking about names is not asking for one', () => {
  assert.equal(detectRenameRequest('what is wrong with the name?'), null);
  assert.equal(detectRenameRequest('I might rebrand the business someday'), null);
  // A sentence is an explanation, not a brand.
  assert.equal(
    detectRenameRequest('rename it to whatever you think works best for a south indian coffee house'),
    null,
  );
});

test('the current brand is read from where a site states its identity', () => {
  assert.deepEqual(brandCandidates(STORE_HTML), ['Kaapi Bharat', 'Kaapi Bharat', 'Kaapi Bharat']);
  assert.equal(deriveCurrentBrand(STORE_HTML), 'Kaapi Bharat', 'the title tagline is not part of the name');
});

test('a site that disagrees with itself is refused, not guessed', () => {
  const html = `<title>Kaapi Bharat</title><footer>&copy; 2025 Coorg Estates. All rights reserved.</footer>`;
  assert.equal(deriveCurrentBrand(html), null);
  const plan = planDeskRename({ vfs: { 'index.html': html }, html, newName: 'Hiran' });
  assert.equal(plan.ok, false);
  assert.match(plan.refusal, /could not tell what this site is currently called/i);
  assert.match(plan.refusal, /rename NAME to Hiran/, 'the refusal says exactly how to answer it');
});

test('a rename is a find and replace, not a regeneration', () => {
  const plan = planDeskRename({ vfs: STORE_VFS, html: STORE_HTML, newName: "Hiran's Coffee" });
  assert.equal(plan.ok, true);
  assert.equal(plan.from, 'Kaapi Bharat');
  assert.equal(plan.total, 5);
  assert.deepEqual(plan.edits, [
    { path: 'index.html', count: 4 },
    { path: 'products.json', count: 1 },
  ]);

  const next = applyDeskRename(STORE_VFS, plan);
  assert.match(next['index.html'], /<title>Hiran's Coffee &mdash; Coffee/);
  assert.match(next['index.html'], /&copy; 2025 Hiran's Coffee\./);
  assert.match(next['products.json'], /"brand":"Hiran's Coffee"/);

  // Internal identifiers stay put — an apostrophe does not survive a selector.
  assert.match(next['index.html'], /class="kaapi-cart"/);
  assert.equal(next['styles.css'], '.kaapi-cart{color:#000}');
  // Lock files are never rewritten.
  assert.equal(next['package-lock.json'], '{"name":"Kaapi Bharat"}');
  // The caller decides when to commit; planning never mutates.
  assert.match(STORE_VFS['index.html'], /Kaapi Bharat/);
});

/*
 * THE TWO WAYS THIS QUIETLY MANGLES A BUILD.
 *
 * Both were live in the first draft and caught by running it, not by reading
 * it. A rename that eats prose is worse than a rename that refuses.
 */
test("a single-word brand does not eat the user's prose", () => {
  const html = `<title>Roastery</title><h1>Roastery</h1>
<p>Visit our roastery in Bengaluru. The roastery opens at 9am.</p>`;
  const plan = planDeskRename({ vfs: { 'index.html': html }, html, newName: 'Hiran' });
  assert.equal(plan.total, 2, 'only the title and the heading are the brand');
  const out = applyDeskRename({ 'index.html': html }, plan)['index.html'];
  assert.match(out, /Visit our roastery in Bengaluru/, 'lowercase prose is left alone');
  assert.match(out, /The roastery opens at 9am/);
});

test('a brand does not match inside a longer word', () => {
  const html = `<title>Roastery</title><p>Roasterymen and roasteries are other businesses.</p>`;
  const plan = planDeskRename({ vfs: { 'index.html': html }, html, newName: 'Hiran' });
  const out = applyDeskRename({ 'index.html': html }, plan)['index.html'];
  assert.match(out, /Roasterymen and roasteries/, 'word boundaries hold');
  assert.equal(plan.total, 1);
});

test('a brand that ends in punctuation still renames', () => {
  // \b before/after a non-word char never matches, so an unconditional
  // boundary would silently rename nothing.
  const html = `<title>Joe &amp; Sons</title><h1>Joe &amp; Sons</h1>`;
  const plan = planDeskRename({ vfs: { 'index.html': html }, html, newName: 'Hiran' });
  assert.equal(plan.ok, true);
  assert.equal(plan.total, 2);
});

test('renaming to the same name is refused rather than reported as work', () => {
  const plan = planDeskRename({ vfs: STORE_VFS, html: STORE_HTML, newName: 'kaapi bharat' });
  assert.equal(plan.ok, false);
  assert.match(plan.refusal, /already called Kaapi Bharat/);
});

test('what it reports is what it did', () => {
  const plan = planDeskRename({ vfs: STORE_VFS, html: STORE_HTML, newName: "Hiran's Coffee" });
  assert.equal(
    describeDeskRename(plan),
    "Renamed Kaapi Bharat to Hiran's Coffee — 5 mentions across 2 files. No other line changed.",
  );
  const refused = planDeskRename({ vfs: {}, html: '<p>nothing</p>', newName: 'Hiran' });
  assert.equal(describeDeskRename(refused), refused.refusal);
});

test('an empty desk cannot be renamed and says so', () => {
  const plan = planDeskRename({ vfs: {}, html: '', newName: 'Hiran' });
  assert.equal(plan.ok, false);
  assert.ok(plan.refusal);
});
