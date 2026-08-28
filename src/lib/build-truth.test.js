import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeBuildTruth,
  findBrokenLinks,
  findDeadControls,
  findFabricatedContent,
  findNumbersThatDisagree,
  inspectBuildTruth,
} from './build-truth.js';

/**
 * The bar these checks have to clear.
 *
 * A finding is shown to somebody who cannot open devtools and cannot argue with
 * it. Telling them their working page is broken is its own kind of lie, and it
 * is the lie this product exists to stop telling. So roughly half of this file
 * asserts SILENCE on pages that are fine — the false-positive cases are the
 * ones that decide whether any of this can ship.
 */

const page = (body, scripts = '') =>
  `<!DOCTYPE html><html><body>${body}${scripts ? `<script>${scripts}</script>` : ''}</body></html>`;

// ---------------------------------------------------------------- controls --

test('a button with no wiring anywhere is named as doing nothing', () => {
  // The commonest generated-page failure: it looks finished, and every button
  // is a lie. Nobody who cannot read source will find this by looking.
  const result = findDeadControls(page('<button class="cta">Buy now</button>'));
  assert.equal(result.checked, true);
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].what, /"Buy now" doesn't do anything/);
});

test('an inline handler counts as wiring', () => {
  const result = findDeadControls(page('<button onclick="alert(1)">Buy now</button>'));
  assert.deepEqual(result.findings, []);
});

test('a control reached by id, class or data attribute counts as wiring', () => {
  for (const [markup, code] of [
    ['<button id="pay">Pay</button>', "document.getElementById('pay').onclick = go;"],
    ['<button class="js-pay">Pay</button>', "document.querySelector('.js-pay').addEventListener('click', go);"],
    ['<button data-action="pay">Pay</button>', "for (const el of document.querySelectorAll('[data-action]')) el.onclick = go;"],
  ]) {
    assert.deepEqual(findDeadControls(page(markup, code)).findings, [], markup);
  }
});

test('a submit button inside a form that goes somewhere is wired', () => {
  const result = findDeadControls(page('<form action="/subscribe"><button type="submit">Join</button></form>'));
  assert.deepEqual(result.findings, []);
});

test('a submit button in a form that goes nowhere is not', () => {
  const result = findDeadControls(page('<form><button type="submit">Join</button></form>'));
  assert.equal(result.findings.length, 1);
});

test('a disabled control is deliberate, not broken', () => {
  assert.deepEqual(findDeadControls(page('<button disabled>Sold out</button>')).findings, []);
  assert.deepEqual(findDeadControls(page('<button aria-disabled="true">Sold out</button>')).findings, []);
  // But a data-disabled attribute is not the same word, and must not silence it.
  assert.equal(findDeadControls(page('<button data-disabled-style="x">Buy</button>')).findings.length, 1);
});

test('INVARIANT: the control check stands down when a framework owns the wiring', () => {
  // Wiring lives in a runtime this cannot follow. Saying nothing is the correct
  // answer to a question you cannot answer.
  const html = page('<button>Buy now</button>', 'ReactDOM.createRoot(el).render(<App />);');
  const result = findDeadControls(html);
  assert.equal(result.checked, false);
  assert.deepEqual(result.findings, []);
  assert.match(result.reason, /framework/);
});

test('INVARIANT: the control check stands down on a delegated listener', () => {
  // One document-level listener can wire every button on the page, and which
  // ones it wires cannot be read off the markup.
  const html = page('<button>A</button><button>B</button>', "document.addEventListener('click', route);");
  const result = findDeadControls(html);
  assert.equal(result.checked, false);
  assert.deepEqual(result.findings, []);
});

test('a link with a real destination is left alone', () => {
  for (const href of ['/pricing', 'https://example.org/docs', 'mailto:hi@quantora.app', '#features']) {
    assert.deepEqual(
      findDeadControls(page(`<a href="${href}">Go</a><div id="features"></div>`)).findings,
      [],
      href,
    );
  }
});

test('a link to nowhere is named as going nowhere', () => {
  for (const href of ['#', 'javascript:void(0)', '']) {
    const result = findDeadControls(page(`<a href="${href}">Learn more</a>`));
    assert.equal(result.findings.length, 1, href);
    assert.match(result.findings[0].what, /doesn't go anywhere/);
  }
});

test('an anchor with no href is a styled span, not a broken promise', () => {
  assert.deepEqual(findDeadControls(page('<a>Section title</a>')).findings, []);
});

// ------------------------------------------------------------------- links --

test('an in-page jump to a section that is not there is reported', () => {
  const result = findBrokenLinks(page('<a href="#pricing">Pricing</a>'));
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].what, /isn't on the page/);
});

test('an in-page jump that lands is silent, by id or by name', () => {
  assert.deepEqual(findBrokenLinks(page('<a href="#pricing">P</a><section id="pricing"></section>')).findings, []);
  assert.deepEqual(findBrokenLinks(page('<a href="#top">T</a><a name="top"></a>')).findings, []);
});

test('a link to a file that was not built is reported, but only when the build is known', () => {
  const html = page('<a href="about.html">About</a>');
  assert.deepEqual(findBrokenLinks(html).findings, [], 'no file list means no judgement');
  assert.equal(findBrokenLinks(html, { files: ['index.html'] }).findings.length, 1);
  assert.deepEqual(findBrokenLinks(html, { files: ['index.html', 'about.html'] }).findings, []);
});

test('INVARIANT: a remote URL is never judged without contacting it', () => {
  // This module makes no network calls. Guessing about a host it has not
  // reached is the confident wrongness it exists to prevent.
  const html = page('<a href="https://a-host-that-may-not-exist.invalid/x">Docs</a>');
  assert.deepEqual(findBrokenLinks(html).findings, []);
});

// ----------------------------------------------------------------- content --

test('filler text the model wrote to fill space is named', () => {
  const cases = [
    ['<p>Lorem ipsum dolor sit amet.</p>', /Lorem ipsum/],
    ['<h1>Your headline here</h1>', /your text here/i],
    ['<p>TODO: write the copy</p>', /TODO/],
    ['<p>Contact example@example.com</p>', /example@example\.com/],
    ['<p>123 Main Street</p>', /123 Main Street/],
    ['<li>Product One</li>', /unnamed products/],
    ['<p>John Doe, CEO</p>', /John\/Jane Doe/],
  ];
  for (const [body, expected] of cases) {
    const result = findFabricatedContent(page(body));
    assert.equal(result.findings.length, 1, body);
    assert.match(result.findings[0].what, expected, body);
  }
});

test('a grey placeholder image is named as not being a picture', () => {
  const result = findFabricatedContent(page('<img src="https://via.placeholder.com/400x300">'));
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].what, /not a real picture/);
});

test('INVARIANT: real copy is never called fabricated', () => {
  // Each of these contains a near-miss for one of the patterns.
  const realPages = [
    '<h1>Products</h1><p>Our Kanchipuram silk is woven in Tamil Nadu.</p>',
    '<p>Doe Run Farm has supplied the market since 1974.</p>',
    '<p>We ship from 12 Main Terrace, Hyderabad.</p>',
    '<img src="/api/preview-image?u=photo.jpg" alt="Saree">',
    '<p>This product line launched in March.</p>',
    '<p>Read about our placeholder-free policy.</p>',
  ];
  for (const body of realPages) {
    assert.deepEqual(findFabricatedContent(page(body)).findings, [], body);
  }
});

// ----------------------------------------------------------------- report ---

test('a page that is fine produces no report at all', () => {
  const html = page(
    '<a href="#buy">Buy</a><section id="buy"><button id="go">Go</button></section>',
    "document.getElementById('go').onclick = checkout;",
  );
  const report = inspectBuildTruth(html);
  assert.deepEqual(report.findings, []);
  assert.equal(describeBuildTruth(report), '', 'silence, not a clean bill of health');
});

test('a report says what is wrong in words its reader can act on', () => {
  const html = page('<button class="cta">Buy now</button><a href="#pricing">Pricing</a><p>Lorem ipsum dolor.</p>');
  const report = inspectBuildTruth(html);
  assert.equal(report.findings.length, 3);
  const text = describeBuildTruth(report);
  assert.match(text, /3 things on this page don't work yet/);
  assert.match(text, /"Buy now" doesn't do anything/);
  assert.match(text, /isn't on the page/);
  assert.match(text, /Lorem ipsum/);
  assert.doesNotMatch(text, /querySelector|addEventListener|href=/, 'no code in a report for a non-technical reader');
});

test('INVARIANT: a check that stood down is reported, never quietly omitted', () => {
  // A report that hides what it could not check is claiming more than it knows.
  const html = page('<button>Buy</button>', 'ReactDOM.createRoot(el).render(<App />);');
  const report = inspectBuildTruth(html);
  assert.equal(report.skipped.length, 1);
  assert.equal(report.checked, 3, 'links, content and numbers still ran');
  const withFinding = inspectBuildTruth(page('<p>Lorem ipsum.</p><button>Buy</button>', 'createRoot(x)'));
  assert.match(describeBuildTruth(withFinding), /Not everything could be checked/);
});

test('one finding reads as one, not as a count', () => {
  assert.match(describeBuildTruth(inspectBuildTruth(page('<p>Lorem ipsum.</p>'))), /^One thing/);
});

test('a long list is capped so the report stays readable', () => {
  const many = Array.from({ length: 12 }, (_, i) => `<button>Action ${i}</button>`).join('');
  const text = describeBuildTruth(inspectBuildTruth(page(many)));
  assert.match(text, /12 things on this page don't work yet/);
  assert.match(text, /…and 4 more like these\./);
});

test('an empty or absent build says nothing rather than inventing a complaint', () => {
  for (const input of ['', null, undefined]) {
    assert.deepEqual(inspectBuildTruth(input).findings, []);
  }
});

/*
 * The regression that mattered most, kept as a whole page rather than a
 * fragment.
 *
 * Every unit case above passed while this page — an ordinary, working task
 * tracker of the kind the Coding Desk produces on a good day — was reported as
 * broken. Its form is held by getElementById + addEventListener('submit'),
 * which is how a person actually writes one, and the form check only looked for
 * `action` and an inline `onsubmit`. A fragment-sized fixture could not have
 * caught it; only a page that looks like real work could.
 */
const WORKING_TASK_TRACKER = `<!DOCTYPE html><html><head><title>Task Tracker</title></head><body>
<nav><a href="#tasks">Tasks</a> <a href="#done">Done</a> <a href="https://quantora.app">Home</a></nav>
<h1>Sunita's Task Tracker</h1>
<form id="add-form"><input id="new-task" placeholder="What needs doing?"><button type="submit">Add</button></form>
<section id="tasks"><ul id="task-list"></ul></section>
<section id="done"><h2>Completed</h2><ul id="done-list"></ul></section>
<button id="clear-done">Clear completed</button>
<script>
  const form = document.getElementById('add-form');
  form.addEventListener('submit', (e) => { e.preventDefault(); addTask(); });
  document.getElementById('clear-done').addEventListener('click', () => {});
  function addTask() {}
</script></body></html>`;

test('INVARIANT: an ordinary working page is reported as nothing at all', () => {
  const report = inspectBuildTruth(WORKING_TASK_TRACKER);
  assert.deepEqual(report.findings, [], describeBuildTruth(report));
  assert.deepEqual(report.skipped, [], 'and it is checked, not skipped');
});

test('a form held only by a script still counts as wired', () => {
  const html = page('<form id="signup"><button type="submit">Join</button></form>',
    "document.getElementById('signup').addEventListener('submit', send);");
  assert.deepEqual(findDeadControls(html).findings, []);
});

test('a form nothing holds does not', () => {
  const html = page('<form id="signup"><button type="submit">Join</button></form>', 'const x = 1;');
  assert.equal(findDeadControls(html).findings.length, 1);
});

test('the page this exists to catch is caught in full', () => {
  const storefront = `<!DOCTYPE html><html><body>
<nav><a href="#">Home</a> <a href="#about">About</a></nav>
<div class="card"><img src="https://via.placeholder.com/300"><h3>Product One</h3><p>Lorem ipsum dolor sit amet.</p><button class="btn">Add to Cart</button></div>
<footer><p>Contact: example@example.com</p><a href="terms.html">Terms</a></footer></body></html>`;
  const kinds = inspectBuildTruth(storefront, { files: ['index.html'] }).findings.map((f) => f.kind);
  assert.ok(kinds.includes('dead-control'), 'the Add to Cart button');
  assert.ok(kinds.includes('broken-link'), 'the #about jump and the missing terms.html');
  assert.ok(kinds.includes('placeholder-content'), 'the lorem ipsum and the grey image');
});

// ---------------------------------------------------------------- numbers --

const row = (label, amount) => `<tr><td>${label}</td><td>${amount}</td></tr>`;
const table = (...rows) => `<table><tr><th>Item</th><th>Price</th></tr>${rows.join('')}</table>`;

test('a total that is not the sum of its rows is named, with both figures', () => {
  const result = findNumbersThatDisagree(table(row('Saree', '1200'), row('Blouse', '800'), row('Total', '1900')));
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].what, /total says 1,900/);
  assert.match(result.findings[0].what, /add up to 2,000/);
});

test('INVARIANT: correct arithmetic is silent in every number format', () => {
  /*
   * This is the case that caught a real bug. The money pattern let the
   * comma-grouped branch match with zero commas, and because alternation takes
   * the first branch that matches at all rather than the longest, a bare 1200
   * was read as 120 and 1900 as 190 — turning a page whose sums were right into
   * an accusation aimed at somebody who cannot check the working.
   */
  const correct = [
    ['plain', table(row('A', '1200'), row('B', '800'), row('Total', '2000'))],
    ['western grouping', table(row('A', '1,200.50'), row('B', '800.50'), row('Total', '2,001.00'))],
    ['indian grouping', table(row('A', '1,00,000'), row('B', '50,000'), row('Total', '1,50,000'))],
    ['currency symbols', table(row('A', '₹1,200'), row('B', '₹800'), row('Total', '₹2,000'))],
    ['dollars', table(row('A', '$19.99'), row('B', '$5.01'), row('Total', '$25.00'))],
    ['per-line rounding', table(row('A', '10.005'), row('B', '20.005'), row('Total', '30.01'))],
  ];
  for (const [label, html] of correct) {
    assert.deepEqual(findNumbersThatDisagree(html).findings, [], label);
  }
});

test('INVARIANT: a total that legitimately differs from a plain sum is left alone', () => {
  // Tax, shipping and discounts all make a total correctly exceed or undercut
  // the lines above it. Arithmetic pedantry here would be noise, not truth.
  for (const adjustment of ['Tax', 'GST', 'Shipping', 'Discount', 'Handling fee']) {
    const html = table(row('Saree', '1200'), row(adjustment, '216'), row('Total', '9999'));
    assert.deepEqual(findNumbersThatDisagree(html).findings, [], adjustment);
  }
});

test('the check stands down when the structure is not a sum', () => {
  // A subtotal is not the claim; one line is not a sum; no labelled total is
  // no claim at all.
  assert.deepEqual(findNumbersThatDisagree(table(row('A', '1'), row('Subtotal', '99'))).findings, []);
  assert.deepEqual(findNumbersThatDisagree(table(row('A', '1200'), row('Total', '99'))).findings, []);
  assert.deepEqual(findNumbersThatDisagree(table(row('A', '1'), row('B', '2'), row('C', '3'))).findings, []);
  assert.deepEqual(findNumbersThatDisagree('<p>Total: 500</p>').findings, [], 'prose is not a table');
});

test('a wrong total joins the report alongside the other checks', () => {
  const html = page(`<p>Lorem ipsum.</p>${table(row('A', '10'), row('B', '10'), row('Total', '30'))}`);
  const kinds = inspectBuildTruth(html).findings.map((f) => f.kind);
  assert.ok(kinds.includes('numbers-disagree'));
  assert.ok(kinds.includes('placeholder-content'));
});
