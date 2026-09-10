import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBudgetedTurnRecovery, resolveTurnRecovery } from './turn-recovery.js';
import { planTurnEscalation } from './turn-escalation.js';

// These are instruction-contract tests, not claims that a real model obeyed
// the brief. The original request is already retained by useChatStream.
const failures = [
  'calculator-interaction-missing',
  'golden-vfs-shape-missing',
  'code-fences-missing',
];

for (const detail of failures) {
  for (const repairs of [0, 1]) {
    test(`[was-red] ${detail}: repair ${repairs} preserves the requested runtime and files`, () => {
      const result = resolveTurnRecovery({
        attempt: repairs + 1, maxAttempts: 6, artifactRepairCount: repairs,
        code: 'BUILD_ARTIFACT_CONTRACT', failureDetail: detail,
        fallbackEngineName: 'Available fallback',
      });
      assert.equal(result.retry, true);
      assert.equal(result.switchModel, repairs === 1);
      assert.equal(result.reason, repairs ? 'build-contract-escalation' : 'build-contract');
      assert.ok(result.retryBrief.includes(detail));
      const preserve = result.retryBrief.indexOf("Preserve the original request's language, runtime, framework, required filenames and project layout.");
      const conditional = result.retryBrief.indexOf('Only for a web page request with no specified framework or file layout:');
      const html = result.retryBrief.indexOf('Return EXACTLY one complete self-contained HTML document');
      assert.ok(preserve >= 0 && conditional > preserve && html > conditional,
        'HTML is a fallback format, not an override of requested React/Python files');
      assert.match(result.retryBrief, /separate fenced code blocks with filepath attributes/);
      assert.match(result.retryBrief, /Do not replace a requested multi-file project or non-web deliverable with a webpage/);
      assert.doesNotMatch(result.retryBrief, /Do not answer with prose, a plan, CSS-only, JS-only, or native source\./,
        'an unconditional native-source ban contradicts an explicit non-web request');
      assert.doesNotMatch(result.notice, /Rebuilding once as a self-contained page/);
    });
  }
}

test('the generic web fallback still owes a complete runnable page, not CSS alone', () => {
  const result = resolveTurnRecovery({ code: 'BUILD_ARTIFACT_CONTRACT' });
  assert.match(result.retryBrief, /EXACTLY one complete self-contained HTML document/);
  assert.match(result.retryBrief, /single ```html code fence/);
  assert.match(result.retryBrief, /Inline the CSS and JavaScript/);
  assert.match(result.retryBrief, /CSS-only/);
});

for (const repairs of [0, 1]) {
  test(`existing-project repair ${repairs} keeps its patch-and-preserve instruction`, () => {
    const result = resolveTurnRecovery({
      attempt: repairs + 1, maxAttempts: 6, artifactRepairCount: repairs,
      code: 'BUILD_ARTIFACT_CONTRACT', hasExistingProject: true,
      fallbackEngineName: 'Available fallback',
    });
    assert.match(result.retryBrief, /search\/replace patches against the provided current source/);
    assert.match(result.retryBrief, /Preserve unrelated files, behavior and project structure/);
    assert.match(result.retryBrief, /Do not replace the application with a new self-contained page/);
    assert.doesNotMatch(result.retryBrief, /Return EXACTLY one complete self-contained HTML/);
  });
}

test('opaque-origin storage restrictions remain intact in both repair paths', () => {
  for (const hasExistingProject of [false, true]) {
    const result = resolveTurnRecovery({
      code: 'BUILD_ARTIFACT_CONTRACT', failureDetail: 'opaque-storage-access',
      hasExistingProject,
    });
    assert.match(result.retryBrief, /Remove every localStorage, sessionStorage, and IndexedDB access/);
    assert.match(result.retryBrief, /do not claim persistence/);
  }
});

test('format preservation does not introduce extra attempts or override Stop', () => {
  for (const input of [
    { stoppedByUser: true },
    { attempt: 6, maxAttempts: 6 },
    { attempt: 2, maxAttempts: 6, artifactRepairCount: 1 },
    { status: 429, retryable: true, fallbackEngineName: 'Available fallback' },
    { status: 402, retryable: true, fallbackEngineName: 'Available fallback' },
  ]) {
    assert.equal(resolveTurnRecovery({ code: 'BUILD_ARTIFACT_CONTRACT', ...input }).retry, false);
  }
  const spent = planTurnEscalation({ elapsedMs: 174_000, turnDeadlineMs: 175_000, engineCount: 5, attemptsStarted: 1 });
  assert.equal(resolveBudgetedTurnRecovery({ attempt: 1, code: 'BUILD_ARTIFACT_CONTRACT' }, spent).retry, false);
});

test('transport recovery remains a route decision, with no format-changing instructions', () => {
  const result = resolveTurnRecovery({ attempt: 1, status: 503, fallbackEngineName: 'Available fallback' });
  assert.equal(result.retry, true);
  assert.equal(result.switchModel, true);
  assert.equal(result.reason, 'route');
  assert.equal(result.retryBrief, undefined);
});
