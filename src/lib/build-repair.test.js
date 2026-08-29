import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBuildTruth } from './build-truth.js';
import {
  describeRepair,
  refuseUnfixable,
  repairBuild,
  resolveAnchor,
} from './build-repair.js';

/**
 * Repair is judged by RE-RUNNING the checks, never by what it claims.
 *
 * A repair pass that reports its own success is the same shape as a proof gate
 * that reports its own success, and this codebase has already paid for that
 * once. So the central test here fixes a page, inspects the result, and asserts
 * that exactly the refused findings survive — the fixed ones are gone because
 * they are gone, not because a function said so.
 */

const BROKEN_PAGE = `<!DOCTYPE html><html><body>
<nav><a href="#pricing">Pricing</a> <a href="#nowhere">Gone</a></nav>
<section id="pricing-section"><h2>Pricing</h2>
<table><tr><th>Item</th><th>Price</th></tr>
<tr><td>Saree</td><td>1200</td></tr><tr><td>Blouse</td><td>800</td></tr>
<tr><td>Total</td><td>1900</td></tr></table></section>
<p>Lorem ipsum dolor sit amet.</p>
<button class="cta">Buy now</button>
</body></html>`;

test('the loop closes: what was fixed is gone, what was refused remains', () => {
  const found = inspectBuildTruth(BROKEN_PAGE);
  assert.equal(found.findings.length, 5);

  const repair = repairBuild(BROKEN_PAGE, found.findings);
  assert.equal(repair.fixes.length, 2);
  assert.equal(repair.refusals.length, 3);

  // The proof: re-run the checks over the repaired page.
  const after = inspectBuildTruth(repair.html).findings.map((f) => f.what);
  assert.equal(after.length, 3);
  for (const refusal of repair.refusals) {
    assert.ok(after.includes(refusal.finding.what), `still present: ${refusal.finding.what}`);
  }
  for (const fix of repair.fixes) {
    assert.ok(!after.includes(fix.finding.what), `resolved: ${fix.finding.what}`);
  }
});

test('INVARIANT: a repair pass never leaves a page worse than it found it', () => {
  // The strongest safety property available. Anything that raises the count has
  // broken the document, and a repair that breaks a page is worse than none.
  const pages = [
    BROKEN_PAGE,
    '<a href="#a">x</a><div id="a-section"></div>',
    '<table><tr><th>a</th><th>b</th></tr><tr><td>x</td><td>5</td></tr><tr><td>y</td><td>5</td></tr><tr><td>Total</td><td>7</td></tr></table>',
    '<!DOCTYPE html><html><body><p>Nothing wrong here.</p></body></html>',
    '',
  ];
  for (const html of pages) {
    const before = inspectBuildTruth(html).findings;
    const repair = repairBuild(html, before);
    const after = inspectBuildTruth(repair.html).findings;
    assert.ok(after.length <= before.length, `${before.length} -> ${after.length}`);
  }
});

// ----------------------------------------------------------------- anchors --

test('an anchor with one plausible target is corrected', () => {
  assert.equal(resolveAnchor('pricing', ['pricing-section']), 'pricing-section');
  assert.equal(resolveAnchor('Pricing', ['our-pricing']), 'our-pricing');
  assert.equal(resolveAnchor('contact', ['header', 'contact-us', 'footer']), 'contact-us');
});

test('INVARIANT: two plausible targets is a guess, and a guess is a refusal', () => {
  assert.equal(resolveAnchor('pricing', ['pricing-section', 'pricing-table']), null);
  assert.equal(resolveAnchor('price', ['enterprise-pricing']), null, 'partial words do not match');
  assert.equal(resolveAnchor('missing', ['header', 'footer']), null);
  assert.equal(resolveAnchor('', ['header']), null);
});

test('an ambiguous anchor is refused in words that say why', () => {
  const html = '<a href="#pricing">P</a><div id="pricing-section"></div><div id="pricing-table"></div>';
  const repair = repairBuild(html, inspectBuildTruth(html).findings);
  assert.deepEqual(repair.fixes, []);
  assert.match(repair.refusals[0].why, /more than one section/);
});

test('every anchor carrying the same broken href is corrected together', () => {
  const html = '<a href="#faq">Top</a><p>x</p><a href="#faq">Bottom</a><div id="faq-section"></div>';
  const repair = repairBuild(html, inspectBuildTruth(html).findings);
  assert.equal((repair.html.match(/#faq-section/g) || []).length, 2);
});

test('a missing FILE is never repaired by inventing the page', () => {
  const html = '<a href="about.html">About</a>';
  const repair = repairBuild(html, inspectBuildTruth(html, { files: ['index.html'] }).findings);
  assert.deepEqual(repair.fixes, []);
  assert.match(repair.refusals[0].why, /creating a page nobody asked for/);
});

test('a pathological anchor cannot hang the turn', () => {
  // The first version walked matches by hand and reset lastIndex inside the
  // loop, which spins forever when a replacement does not change the match.
  const html = `${'<a href="#a+b">x</a>'.repeat(50)}<div id="a-b-section"></div>`;
  const started = Date.now();
  repairBuild(html, inspectBuildTruth(html).findings);
  assert.ok(Date.now() - started < 2_000, 'a repair pass must terminate');
});

// ------------------------------------------------------------------ totals --

test('a wrong total is rewritten to what the rows add up to', () => {
  const html = '<table><tr><th>I</th><th>P</th></tr><tr><td>A</td><td>1200</td></tr>'
    + '<tr><td>B</td><td>800</td></tr><tr><td>Total</td><td>1900</td></tr></table>';
  const repair = repairBuild(html, inspectBuildTruth(html).findings);
  assert.match(repair.html, /<td>Total<\/td><td>2000<\/td>/);
  assert.deepEqual(inspectBuildTruth(repair.html).findings, []);
});

test('a grouped total is rewritten in the grouping the page already used', () => {
  const html = '<table><tr><th>I</th><th>P</th></tr><tr><td>A</td><td>1,200</td></tr>'
    + '<tr><td>B</td><td>800</td></tr><tr><td>Total</td><td>1,900</td></tr></table>';
  const repair = repairBuild(html, inspectBuildTruth(html).findings);
  assert.match(repair.html, /2,000/, 'commas kept, because the page uses them');
});

test('an identical number elsewhere on the page is left alone', () => {
  const html = '<p>Established 1900.</p><table><tr><th>I</th><th>P</th></tr>'
    + '<tr><td>A</td><td>1200</td></tr><tr><td>B</td><td>800</td></tr>'
    + '<tr><td>Total</td><td>1900</td></tr></table>';
  const repair = repairBuild(html, inspectBuildTruth(html).findings);
  assert.match(repair.html, /Established 1900\./, "somebody else's number");
  assert.match(repair.html, /<td>Total<\/td><td>2000<\/td>/);
});

// ---------------------------------------------------------------- refusals --

test('INVARIANT: a dead control and invented copy are always refused', () => {
  /*
   * Both refusals are the product's promise showing up where it costs
   * something. A button that looks wired and is not would read as success; so
   * would copy written about a business we know nothing about.
   *
   * Asserted through repairBuild, which is the guarantee that actually matters.
   * A dead BUTTON has no derivable destination and must stay refused however
   * the internals are split up; asserting refuseUnfixable directly would pass
   * even if repairBuild stopped calling it.
   */
  const page = [
    '<!DOCTYPE html><html><body>',
    '<button>Buy now</button>',
    '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do.</p>',
    '</body></html>',
  ].join('\n');
  const repair = repairBuild(page, inspectBuildTruth(page).findings);
  assert.deepEqual(repair.fixes, [], 'nothing here is derivable from the build');
  const why = repair.refusals.map((refusal) => refusal.why).join('\n');
  assert.match(why, /worse than one that plainly is not/);
  assert.match(why, /does not invent/);
});

/*
 * The blanket dead-control refusal used to cover this too, and it was wrong.
 * A nav that reads <a href="#">Pricing</a> above a real <section id="pricing">
 * says exactly what the link should do, twice, in the build's own markup.
 */
test('a dead link is pointed at the section its own label names', () => {
  const page = [
    '<!DOCTYPE html><html><body>',
    '<nav><a href="#">Pricing</a></nav>',
    '<section id="pricing"><h2>Pricing</h2></section>',
    '</body></html>',
  ].join('\n');
  const repair = repairBuild(page, inspectBuildTruth(page).findings);
  assert.match(repair.html, /<a href="#pricing">Pricing<\/a>/);
  assert.equal(repair.fixes.length, 1);
  assert.match(repair.fixes[0].what, /Pointed the "Pricing" link at the "pricing" section/);
  assert.equal(repair.refusals.length, 0);
  // The proof, per this file's rule: re-run the checks, do not trust the report.
  assert.deepEqual(inspectBuildTruth(repair.html).findings, [], 'the control is genuinely alive now');
});

test('a dead link naming nothing on the page stays refused', () => {
  const page = '<!DOCTYPE html><html><body><a href="#">Careers</a><section id="pricing">x</section></body></html>';
  const repair = repairBuild(page, inspectBuildTruth(page).findings);
  assert.equal(repair.fixes.length, 0, 'a section nobody wrote is not a repair');
  assert.equal(repair.refusals.length, 1);
});

test('an ambiguous dead link is refused rather than guessed', () => {
  const page = [
    '<!DOCTYPE html><html><body>',
    '<a href="#">Plans</a>',
    '<section id="plans">a</section><section id="plans">b</section>',
    '</body></html>',
  ].join('\n');
  const repair = repairBuild(page, inspectBuildTruth(page).findings);
  assert.equal(repair.fixes.length, 0, 'two candidates is a guess');
  assert.equal(repair.refusals.length, 1);
});

test('a dead BUTTON is never repaired from its label', () => {
  const page = '<!DOCTYPE html><html><body><button>Pricing</button><section id="pricing">x</section></body></html>';
  const repair = repairBuild(page, inspectBuildTruth(page).findings);
  assert.equal(repair.fixes.length, 0, 'a button\'s behaviour is not derivable from a label');
  assert.match(repair.html, /<button>Pricing<\/button>/, 'the button is left exactly as written');
});

test('two identical dead links are both repaired, not one repaired twice', () => {
  const page = [
    '<!DOCTYPE html><html><body>',
    '<nav><a href="#">Pricing</a></nav>',
    '<section id="pricing">x</section>',
    '<footer><a href="#">Pricing</a></footer>',
    '</body></html>',
  ].join('\n');
  const repair = repairBuild(page, inspectBuildTruth(page).findings);
  assert.equal(repair.fixes.length, 2);
  assert.equal((repair.html.match(/href="#pricing"/g) || []).length, 2, 'both occurrences are connected');
  assert.doesNotMatch(repair.html, /<a href="#">/, 'no dead link is left behind');
  assert.deepEqual(inspectBuildTruth(repair.html).findings, [], 'neither link is still dead');
});

test('INVARIANT: refusals are never dropped from the account', () => {
  // Somebody told two things were fixed, and not told three were left, will
  // believe their page is finished.
  const repair = repairBuild(BROKEN_PAGE, inspectBuildTruth(BROKEN_PAGE).findings);
  const text = describeRepair(repair);
  assert.match(text, /I fixed 2 things:/);
  assert.match(text, /3 things I left alone:/);
  for (const refusal of repair.refusals) {
    assert.ok(text.includes(refusal.why), refusal.why);
  }
});

test('with nothing fixed, the account leads with what it cannot do', () => {
  const html = '<p>Lorem ipsum dolor.</p>';
  const text = describeRepair(repairBuild(html, inspectBuildTruth(html).findings));
  assert.match(text, /^One thing I can't fix for you:/);
});

test('a clean page produces no repair account at all', () => {
  const html = '<!DOCTYPE html><html><body><p>All fine.</p></body></html>';
  const repair = repairBuild(html, inspectBuildTruth(html).findings);
  assert.equal(repair.changed, false);
  assert.equal(describeRepair(repair), '');
});
