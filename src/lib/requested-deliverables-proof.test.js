import assert from 'node:assert/strict';
import test from 'node:test';
import {
  codingTurnMayClaimSuccess,
  evaluateProofEvidence,
  proofFailureCopy,
  proveCodingTurn,
} from './proof-control-plane.js';

const ASK = "Write a modular 3-file Python utility (parser.py, cleaner.py and README.md) for financial data processing.";
const plan = {
  mode: 'execute',
  isCodingTurn: true,
  intent: { kind: 'app_build' },
  skillsRequired: [],
  messageForModel: ASK,
  displayUserText: ASK,
};

test('[was-red] runnable HTML that only displays requested filenames is not completion proof', () => {
  const vfs = {
    'index.html': { content: '<!DOCTYPE html><html><body><pre>parser.py cleaner.py README.md</pre></body></html>' },
  };
  const evidence = evaluateProofEvidence(plan, { vfs, brief: ASK });
  assert.equal(evidence.evidence.hasHtml, true, 'the page really is runnable; that is not the disputed fact');
  assert.deepEqual(evidence.missingDeliverables, ['parser.py', 'cleaner.py', 'README.md']);
  assert.equal(evidence.ok, false);

  const verdict = proveCodingTurn({ plan, vfs, brief: ASK, allowRepair: false });
  assert.equal(codingTurnMayClaimSuccess(verdict), false);
  assert.equal(verdict.outcomeKind, 'missing-deliverables');
  assert.ok(verdict.gaps.includes('requested deliverable parser.py'));
  assert.match(proofFailureCopy(verdict, plan), /Completion proof did not pass/);
  assert.match(proofFailureCopy(verdict, plan), /rendered page cannot stand in for files/i);
});

test('the same runnable companion may pass once the requested files exist and Python ran', () => {
  const vfs = {
    'parser.py': { content: 'class FinancialParser: pass' },
    'cleaner.py': { content: 'class FinancialCleaner: pass' },
    'README.md': { content: '# Financial Pipeline' },
    'index.html': { content: '<!DOCTYPE html><html><body>Companion preview</body></html>' },
  };
  const verdict = proveCodingTurn({
    plan,
    vfs,
    brief: ASK,
    allowRepair: false,
    runtimeEvidence: { ok: true, level: 'syntax', command: 'python -m py_compile parser.py cleaner.py' },
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, 'pass');
  assert.equal(codingTurnMayClaimSuccess(verdict), true);
});

test('a normal website discussing code is still judged by its actual preview contract', () => {
  const brief = 'Build a small website explaining parser.py and README.md.';
  const webPlan = { ...plan, messageForModel: brief, displayUserText: brief };
  const verdict = proveCodingTurn({
    plan: webPlan,
    vfs: { 'index.html': { content: '<!DOCTYPE html><html><body>Code reader</body></html>' } },
    brief,
    allowRepair: false,
  });
  assert.equal(verdict.ok, true);
});
