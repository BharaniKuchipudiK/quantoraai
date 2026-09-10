import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
const consent = "${{ github.event_name == 'workflow_dispatch' && inputs.confirm_live_model_spend == true }}";
const noConsent = "${{ github.event_name != 'workflow_dispatch' || inputs.confirm_live_model_spend != true }}";
const workflow = (name) => read(name).replace(/^\s*#.*$/gm, '');
const step = (source, name) => {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing maintained step: ${name}`);
  const end = source.indexOf('\n      - ', start + marker.length);
  return source.slice(start, end < 0 ? source.length : end);
};

for (const name of ['deployed-golden-transactions.yml', 'provider-health.yml', 'desk-eval.yml', 'study-native-deployed-visuals.yml']) {
  test(`${name}: paid automation needs a per-run boolean confirmation, default off`, () => {
    const source = workflow(name);
    assert.match(source, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+confirm_live_model_spend:/);
    const input = source.slice(source.indexOf('confirm_live_model_spend:'), source.indexOf('type: boolean') + 13);
    assert.match(input, /required: true/);
    assert.match(input, /default: false/);
    assert.match(input, /type: boolean/);
    assert.doesNotMatch(source, /continue-on-error:\s*true/);
  });
}

test('[was-red] PR opening, ready and deployment events cannot invoke the golden generator or its paid fallback', () => {
  const source = workflow('deployed-golden-transactions.yml');
  const live = step(source, 'Prove prompt to rendered calculator and website');
  assert.ok(live.includes(`if: ${consent}`));
  assert.match(live, /run: node scripts\/deployed-golden-transactions\.mjs/);
  assert.equal((source.match(/run: node scripts\/deployed-golden-transactions\.mjs/g) || []).length, 1);
  assert.match(source, /Deployed non-model checks \(live tests NOT RUN\)/);
});

test('non-model deployed readiness, durability and shop checks remain automatic and blocking', () => {
  const source = workflow('deployed-golden-transactions.yml');
  for (const [name, script] of [
    ['Deployed readiness (inference ready, every function boots)', 'deployed-readiness-gate.mjs'],
    ['Deployed QIR durability (a Run outlives the worker that made it)', 'deployed-qir-durability-gate.mjs'],
    ['Prove deployed shop Preview paints photos and cart increments', 'deployed-shop-preview-gate.mjs'],
  ]) {
    const check = step(source, name);
    assert.ok(check.includes(`run: node scripts/${script}`));
    assert.ok(!check.includes('confirm_live_model_spend'));
    assert.doesNotMatch(check, /continue-on-error/);
  }
});

test('paid verification skipped for cost is stated as NOT RUN; a requested live failure remains failing', () => {
  const report = step(workflow('deployed-golden-transactions.yml'), 'Report deployed golden chat outcome');
  assert.match(report, /if \[ "\$GOLDEN_CHAT_OUTCOME" = "skipped" \]/);
  assert.match(report, /LIVE MODEL VERIFICATION NOT RUN/);
  assert.match(report, /GITHUB_STEP_SUMMARY/);
  assert.match(report, /if \[ "\$GOLDEN_CHAT_OUTCOME" != "success" \]; then[\s\S]*?exit 1/);
});

test('[was-red] half-hourly monitoring no longer generates Gemini tokens', () => {
  const source = workflow('provider-health.yml');
  const live = step(source, 'Read the production providers');
  assert.ok(live.includes(`if: ${consent}`));
  assert.match(live, /run: node scripts\/provider-health-probe\.mjs/);
  const readiness = step(source, 'Read production readiness without model generation');
  assert.ok(readiness.includes(`if: ${noConsent}`));
  assert.match(readiness, /node scripts\/deployed-readiness-gate\.mjs/);
  assert.match(readiness, /set -euo pipefail/);
  assert.match(readiness, /Live inference NOT TESTED/);
  assert.doesNotMatch(readiness, /probe=gemini|provider-health-probe\.mjs|\/api\/chat/);
});

test('[was-red] the daily paid Desk Eval schedule is removed; manual confirmation is mandatory', () => {
  const source = workflow('desk-eval.yml');
  assert.doesNotMatch(source, /^\s*schedule:|^\s*- cron:/m);
  assert.ok(source.includes(`  eval:\n    if: ${consent}`));
  assert.match(source, /run: node scripts\/desk-eval\.mjs/);
});

test('manual goldens resolve the selected commit rather than guessing a deployed revision', () => {
  const source = workflow('deployed-golden-transactions.yml');
  assert.ok(source.includes("github.event.deployment.sha || github.sha"));
  assert.ok(source.includes("github.event.pull_request.head.sha || github.sha"));
  assert.ok(source.includes("github.ref == 'refs/heads/main' && 'Production' || 'Preview'"));
  assert.match(source, /deployments\?sha=\$PR_SHA&environment=\$TARGET_ENVIRONMENT/);
});

test('[was-red] Study live turns require per-run consent; native fixture tests remain automatic', () => {
  const source = workflow('study-native-deployed-visuals.yml');
  const live = source.slice(source.indexOf('  live-routing:'));
  assert.ok(live.includes(`if: ${consent}`));
  assert.doesNotMatch(live, /contains\(github\.event\.pull_request\.title/);
  const native = source.slice(source.indexOf('  native-visuals:'), source.indexOf('  live-routing:'));
  assert.match(native, /node scripts\/study-native-lab-browser-proof\.mjs/);
  assert.ok(!native.includes('confirm_live_model_spend'));
  assert.doesNotMatch(native, /continue-on-error/);
});
