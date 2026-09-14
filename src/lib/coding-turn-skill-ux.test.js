import assert from 'node:assert/strict';
import test from 'node:test';
import { planCodingTurn } from './coding-turn-planner.js';

function plan(message, overrides = {}) {
  return planCodingTurn({
    message,
    codingDeskOpen: true,
    autoMode: false,
    ...overrides,
  });
}

test('website work visibly assigns the Senior Web Product Engineer', () => {
  const result = plan('Build a responsive website for my tutoring business');
  assert.equal(result.mode, 'execute');
  assert.equal(result.assignedSkill?.skillId, 'coding.senior-web-product-engineer');
  assert.equal(result.assignedSkill?.version, '1.0.0');
  assert.match(result.statusLabel, /^Assigned: Senior Web Product Engineer · /);
  assert.match(result.statusLabel, /Building a result you can open in Preview/);
});

test('shop work keeps the specialist visible while preserving truthful work status', () => {
  const result = plan('Build an online shop for fox and wolf kids merchandise');
  assert.equal(result.assignedSkill?.name, 'Senior Web Product Engineer');
  assert.match(result.statusLabel, /^Assigned: Senior Web Product Engineer · Building the shop for Preview/);
});

test('failure-shaped desk repair visibly assigns the recovery specialist', () => {
  const result = plan('Fix the broken checkout button; it does not work', {
    refineDesk: true,
    vfsFileCount: 3,
  });
  assert.equal(result.mode, 'execute');
  assert.equal(result.assignedSkill?.skillId, 'coding.debugger-recovery-engineer');
  assert.match(result.statusLabel, /^Assigned: Debugger & Recovery Engineer · Updating the running desk/);
});

test('ordinary desk refinement stays with the product engineer', () => {
  const result = plan('Change the hero heading and keep the rest of the page intact', {
    refineDesk: true,
    vfsFileCount: 2,
  });
  assert.equal(result.assignedSkill?.skillId, 'coding.senior-web-product-engineer');
  assert.match(result.statusLabel, /^Assigned: Senior Web Product Engineer · Updating the running desk/);
});

test('work without a governed high-level Skill does not show a fake assignment', () => {
  const result = plan('Create two files: report.py and test_report.py, then run both');
  assert.equal(result.intent.kind, 'python_build');
  assert.equal(result.assignedSkill, null);
  assert.doesNotMatch(result.statusLabel, /^Assigned:/);
});

test('ordinary chat has no assignment or execution status', () => {
  const result = planCodingTurn({ message: 'What is recursion?', codingDeskOpen: false, autoMode: false });
  assert.equal(result.mode, 'pass');
  assert.equal(result.assignedSkill, null);
  assert.equal(result.statusLabel, '');
});
