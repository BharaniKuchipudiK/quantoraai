import assert from 'node:assert/strict';
import test from 'node:test';
import { collectLiveDeskFacts, DESK_PAGE_COUNT_KEYS, DESK_PAGE_FACT_KEYS, DESK_PROBE_FACT_KEYS, DESK_PROBE_FN_SOURCE, DESK_PROBE_ITEM_TEXT } from './desk-probe-script.js';

test('the probe is a self-contained function both runtimes can inline', () => {
  assert.match(DESK_PROBE_FN_SOURCE, /^function __quantoraDeskProbe\(report\)\{/);
  assert.equal(DESK_PROBE_FN_SOURCE.includes('</script'), false);
  assert.equal(DESK_PROBE_FN_SOURCE.includes('import '), false);
  assert.equal(DESK_PROBE_FN_SOURCE.includes('`'), false);
});

test('the probe reads the live DOM rather than any source text', () => {
  assert.match(DESK_PROBE_FN_SOURCE, /document\.querySelectorAll/);
  assert.match(DESK_PROBE_FN_SOURCE, /\.click\(\)/);
  assert.match(DESK_PROBE_FN_SOURCE, /dispatchEvent\(new Event\('input'/);
  assert.ok(DESK_PROBE_FN_SOURCE.includes(JSON.stringify(DESK_PROBE_ITEM_TEXT)));
});

test('every reported fact is one the desk knows how to read', () => {
  for (const key of DESK_PROBE_FACT_KEYS) {
    assert.match(DESK_PROBE_FN_SOURCE, new RegExp(`facts\\.${key}\\s*=`));
  }
});

test('facts the probe could not observe are left off the payload', () => {
  // itemAdded and controlResponded are assigned inside guards; pageRendered is
  // unconditional. A guard that disappears would launder silence into a fail.
  assert.match(DESK_PROBE_FN_SOURCE, /if \(field \|\| adder\) \{\s*facts\.itemAdded/);
  assert.match(DESK_PROBE_FN_SOURCE, /if \(clicked\) facts\.controlResponded/);
});

test('the probe leaves destructive controls alone', () => {
  assert.match(DESK_PROBE_FN_SOURCE, /delete\|remove\|clear\|reset/);
});

test('shop and calculator facts are read from the live document, not source text', () => {
  assert.match(DESK_PROBE_FN_SOURCE, /document\.querySelectorAll\('img'\)/);
  assert.match(DESK_PROBE_FN_SOURCE, /add to \(bag\|cart\)/);
  assert.match(DESK_PROBE_FN_SOURCE, /quantora-currency/);
  assert.match(DESK_PROBE_FN_SOURCE, /catalogCount/);
  assert.match(DESK_PROBE_FN_SOURCE, /calculator-display/);
  assert.match(DESK_PROBE_FN_SOURCE, /bagIncremented/);
  assert.match(DESK_PROBE_FN_SOURCE, /(?:Bag\|Cart)/);
  for (const key of [...DESK_PAGE_FACT_KEYS, ...DESK_PAGE_COUNT_KEYS]) {
    assert.match(DESK_PROBE_FN_SOURCE, new RegExp(`facts\\.${key}\\s*=`));
  }
  const body = DESK_PROBE_FN_SOURCE.slice(DESK_PROBE_FN_SOURCE.indexOf('var facts = {}'));
  assert.ok(body.indexOf('facts.photoCount') < body.indexOf('clicked.click'), 'catalog photos must be counted before the probe mutates the page');
  assert.ok(body.indexOf('facts.catalogCount') < body.indexOf('clicked.click'), 'catalog count must be read before the probe mutates the page');
});

test('collectLiveDeskFacts keeps only observed booleans and counts', () => {
  const live = collectLiveDeskFacts({
    facts: { hasCart: true, catalogCount: 3, itemAdded: false, junk: 'yes' },
    hasCurrency: true,
  });
  assert.equal(live.hasCart, true);
  assert.equal(live.hasCurrency, true);
  assert.equal(live.catalogCount, 3);
  assert.equal(live.itemAdded, false);
  assert.equal('junk' in live, false);
  assert.equal('hasCalculatorDisplay' in live, false);
});
