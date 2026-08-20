import assert from 'node:assert/strict';
import test from 'node:test';
import { isBlockedPrRepairPath, parsePrFixResponse } from './pr-fix-handler.js';

test('blocks secret-bearing paths from PR repair model context', () => {
  assert.equal(isBlockedPrRepairPath('.env'), true);
  assert.equal(isBlockedPrRepairPath('config/.env.production'), true);
  assert.equal(isBlockedPrRepairPath('certs/service.pem'), true);
  assert.equal(isBlockedPrRepairPath('certs/private.key'), true);
  assert.equal(isBlockedPrRepairPath('src/config.ts'), false);
  assert.equal(isBlockedPrRepairPath('.env.example'), true);
});

test('accepts a bounded same-file repair proposal', () => {
  const before = 'export const value = input;';
  const proposal = parsePrFixResponse(JSON.stringify({
    path: 'src/value.ts',
    content: 'export const value = clamp(input, 0, 1);',
    summary: 'Clamp the unsafe input',
    reason: 'The finding is isolated to the value boundary.',
  }), 'src/value.ts', before);

  assert.equal(proposal.path, 'src/value.ts');
  assert.equal(proposal.before, before);
  assert.equal(proposal.after, 'export const value = clamp(input, 0, 1);');
  assert.equal(proposal.changed, true);
  assert.match(proposal.summary, /Clamp/);
});

test('rejects a repair proposal that attempts to modify another file', () => {
  assert.throws(() => parsePrFixResponse(JSON.stringify({
    path: 'src/other.ts',
    content: 'export const changed = true;',
  }), 'src/value.ts', 'export const value = 1;'), /outside the selected finding/i);
});

test('rejects invalid or empty repair payloads', () => {
  assert.throws(() => parsePrFixResponse('not json', 'src/value.ts', 'before'), /valid reviewable patch payload/i);
  assert.throws(() => parsePrFixResponse(JSON.stringify({ path: 'src/value.ts', content: '' }), 'src/value.ts', 'before'), /empty or exceeds/i);
});
