import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  OFFICE_CLIENT_COMPILE_ABORT_MS,
  OFFICE_HOST_PROXY_LIMIT_MS,
  OFFICE_PROXY_BUDGET_MS,
} from '../../api/_lib/office-generation-budget.js';

test('Office compile/download abort stays inside the host budget, not a 90s leak', () => {
  const source = fs.readFileSync(new URL('./office-export.js', import.meta.url), 'utf8');
  assert.match(source, /OFFICE_CLIENT_COMPILE_ABORT_MS/);
  assert.doesNotMatch(source, /90_000/);
  assert.equal(OFFICE_CLIENT_COMPILE_ABORT_MS, 55_000);
  assert.ok(OFFICE_CLIENT_COMPILE_ABORT_MS <= OFFICE_PROXY_BUDGET_MS);
  assert.ok(OFFICE_CLIENT_COMPILE_ABORT_MS < OFFICE_HOST_PROXY_LIMIT_MS);
});
