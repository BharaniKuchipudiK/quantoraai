/**
 * A template placeholder is not a missing file, and must not be explained as one.
 *
 * THE INCIDENT (boutique storefront). The model shipped
 * `<img src="${item.image}">` — a template literal written inside quotes instead
 * of backticks, so the browser received the literal characters and every product
 * card rendered broken.
 *
 * findBrokenLinks read that raw attribute, found no shipped file of that name,
 * and reported `"${item.image}" points at a file that wasn't built.`
 * repairFileLinks refused it with MISSING_FILE_REFUSAL — "it points at a file,
 * and creating a page nobody asked for is not a repair" — and the desk told the
 * user, in its own words, that it could not fix this.
 *
 * Every clause of that was false. There is no file. Creating a page would not
 * help. The defect is in the code that BUILT the markup, and the reader was sent
 * hunting for an asset that never existed.
 *
 * This is the same shape as the photo bug and the turn-ladder bug fixed
 * alongside it: Detect was right, Diagnose put it in the wrong class, and the
 * wrong class routed a knowable thing into "unfixable".
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { findBrokenLinks } from './build-truth.js';
import { MISSING_FILE_REFUSAL, UNINTERPOLATED_TEMPLATE_REFUSAL, repairFileLinks } from './build-repair.js';

const SHIPPED = ['index.html', 'app.js', 'styles.css'];
const findingsFor = (html) => findBrokenLinks(html, { files: SHIPPED }).findings;

test('[was-red] an uninterpolated placeholder is not reported as a missing file', () => {
  const html = '<img src="${item.image}" alt="Tailored Cashmere Coat">';
  const [finding, ...rest] = findingsFor(html);

  assert.equal(rest.length, 0, 'one reference, one finding');
  assert.equal(finding.kind, 'uninterpolated-template', 'it has its own class, not broken-link');
  assert.doesNotMatch(
    finding.what,
    /points at a file/i,
    'there is no file: sending the reader to look for one is the defect this closes',
  );
});

test('[was-red] the account names the real defect and where the fix belongs', () => {
  const [finding] = findingsFor('<img src="${product.image}">');

  assert.match(
    finding.what,
    /placeholder/i,
    `the account must say this is an uninterpolated placeholder, not a missing asset. Got: ${finding.what}`,
  );
  assert.match(
    finding.what,
    /backtick/i,
    `the account must name the concrete fix (quotes -> backticks), or the reader is told a problem with no move. Got: ${finding.what}`,
  );
  assert.equal(finding.data.expression, 'product.image', 'carries the expression structurally, so a retry brief need not regex the English back out');
});

test('[was-red] it is refused for the true reason, not the missing-file one', () => {
  const html = '<img src="${item.image}">';
  const { refusals, fixes } = repairFileLinks(html, findingsFor(html), SHIPPED);

  assert.equal(fixes.length, 0, 'nothing is invented: the fix is in the source, not the markup');
  assert.equal(refusals.length, 1, 'and it is still REPORTED — a finding no stage claims is one the user never sees');
  assert.equal(refusals[0].why, UNINTERPOLATED_TEMPLATE_REFUSAL);
  assert.notEqual(refusals[0].why, MISSING_FILE_REFUSAL, 'the wrong explanation is the whole bug');
});

test('a genuinely missing file is untouched — the old class still works', () => {
  const html = '<img src="missing.png">';
  const [finding] = findingsFor(html);
  assert.equal(finding.kind, 'broken-link');
  assert.match(finding.what, /points at a file that wasn't built/);

  const { refusals } = repairFileLinks(html, findingsFor(html), SHIPPED);
  assert.equal(refusals[0].why, MISSING_FILE_REFUSAL, 'narrowing one class must not blunt the other');
});

test('a broken anchor is untouched, and all three classes stay distinguishable', () => {
  const html = '<a href="#story">Story</a><img src="${item.image}"><img src="missing.png">';
  const kinds = findingsFor(html).map((f) => f.kind);

  assert.deepEqual(kinds, ['broken-link', 'uninterpolated-template', 'broken-link']);
  const whats = findingsFor(html).map((f) => f.what);
  assert.match(whats[0], /jumps to a section/);
  assert.match(whats[1], /placeholder/);
  assert.match(whats[2], /points at a file/);
  assert.equal(new Set(whats).size, 3, 'three defects must read as three different problems');
});

test('the rule stays precise: only ${...}, and only where a browser would receive it', () => {
  // A page shipping a client-side template engine may legitimately serve {{ }}.
  // Firing on that would be the ambiguous gate §5 says gets muted under pressure.
  assert.equal(findingsFor('<img src="{{ item.image }}">')[0]?.kind, 'broken-link');
  // Href placeholders count too — the same mistake in an anchor.
  assert.equal(findingsFor('<a href="${route.path}">Go</a>')[0]?.kind, 'uninterpolated-template');
  // And a real relative path with a dollar in its name is not a placeholder.
  assert.equal(findingsFor('<img src="price$.png">')[0]?.kind, 'broken-link');
});
