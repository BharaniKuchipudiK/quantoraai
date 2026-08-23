import assert from 'node:assert/strict';
import test from 'node:test';
import { DESK_PROBE_FACT_KEYS, DESK_PROBE_FN_SOURCE, DESK_PROBE_ITEM_TEXT } from './desk-probe-script.js';

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
