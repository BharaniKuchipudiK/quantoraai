import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changedIndependentVerificationFile,
  changedRequiredVerificationScript,
} from './qir-repository-runtime.js';

const baseline = {
  'package.json': JSON.stringify({ scripts: { test: 'vitest run', build: 'vite build' } }),
  'src/cart.js': 'export const total = items => items.reduce((n, item) => n + item.price, 0);',
  'src/cart.test.js': 'import { total } from "./cart.js"; test("total", () => expect(total([{price: 2}])).toBe(2));',
  'tests/checkout.spec.ts': 'test("checkout", async () => { /* independent acceptance */ });',
  'vitest.config.ts': 'export default { test: { environment: "node" } };',
};

test('baseline independent verification files are immutable', () => {
  for (const path of ['src/cart.test.js', 'tests/checkout.spec.ts', 'vitest.config.ts']) {
    const candidate = { ...baseline, [path]: '// weakened by candidate' };
    assert.equal(changedIndependentVerificationFile(baseline, candidate), path);
    assert.equal(changedRequiredVerificationScript(baseline, candidate), null);
  }
});

test('deleting an independent verification file is also tampering', () => {
  const candidate = { ...baseline };
  delete (candidate as Partial<typeof baseline>)['src/cart.test.js'];
  assert.equal(changedIndependentVerificationFile(baseline, candidate as Record<string, string>), 'src/cart.test.js');
});

test('implementation changes and newly added tests remain allowed', () => {
  const candidate = {
    ...baseline,
    'src/cart.js': 'export const total = items => items.reduce((n, item) => n + item.price, 0) + 1;',
    'src/new-behavior.test.js': 'test("new behavior", () => {});',
  };
  assert.equal(changedIndependentVerificationFile(baseline, candidate), null);
  assert.equal(changedRequiredVerificationScript(baseline, candidate), null);
});

test('changing the baseline test command remains blocked by the existing guard', () => {
  const candidate = {
    ...baseline,
    'package.json': JSON.stringify({ scripts: { test: 'echo pass', build: 'vite build' } }),
  };
  assert.equal(changedRequiredVerificationScript(baseline, candidate), 'test');
});
