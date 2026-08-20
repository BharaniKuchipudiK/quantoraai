import assert from 'node:assert/strict';
import test from 'node:test';
import { inferCodeProjectCognition } from './code-project-cognition.js';
import { chooseCodeRuntime } from './code-runtime-broker.js';
import {
  buildCodeAgentPlan,
  CodeAgentRegistry,
  runCodeAgentPlan,
  validateCodeAgentResult,
  type CodeAgentAdapter,
  type CodeWorkspaceSnapshot,
} from './code-agent-fabric.js';

function workspace(): CodeWorkspaceSnapshot {
  const files = [
    { path: 'src/App.jsx', content: 'export default function App(){ return <main>Hello</main> }', language: 'javascript' },
    { path: 'package.json', content: JSON.stringify({ dependencies: { react: 'latest' } }), language: 'json' },
  ];
  const cognition = inferCodeProjectCognition({ prompt: 'Fix the React app and keep it simple.', files });
  return {
    id: 'workspace-1',
    projectName: 'Test App',
    objective: 'Fix the React app and keep it simple.',
    cognition,
    runtime: chooseCodeRuntime({ cognition }),
    files,
    diagnostics: [{ id: 'd1', source: 'runtime', severity: 'error', message: 'Synthetic crash', path: 'src/App.jsx' }],
    checkpointId: 'checkpoint-before-agent',
  };
}

const fullCapabilities = [
  'repository_read',
  'repository_search',
  'architecture_reasoning',
  'multi_file_edit',
  'diagnostics',
  'command_execution',
  'test_execution',
  'preview_verification',
  'diff_explanation',
] as const;

test('repair plan understands and plans before mutation, then verifies', () => {
  const ws = workspace();
  const plan = buildCodeAgentPlan({ operation: 'repair', objective: ws.objective, workspace: ws });
  assert.deepEqual(plan.tasks.map((item) => item.operation), ['understand', 'plan', 'repair', 'execute', 'verify']);
  assert.equal(plan.requiresCheckpoint, true);
  assert.equal(plan.requiresVerification, true);
});

test('review plan is read-only and does not require a checkpoint', () => {
  const ws = workspace();
  const plan = buildCodeAgentPlan({ operation: 'review', objective: 'Review efficiency and bugs.', workspace: ws });
  assert.deepEqual(plan.tasks.map((item) => item.operation), ['understand', 'review']);
  assert.equal(plan.tasks.some((item) => item.mutation), false);
  assert.equal(plan.requiresCheckpoint, false);
});

test('adapter result validator rejects unsafe paths and unverified success', () => {
  const ws = workspace();
  const plan = buildCodeAgentPlan({ operation: 'repair', objective: ws.objective, workspace: ws });
  const repairTask = plan.tasks.find((item) => item.operation === 'repair')!;
  const badPatch = validateCodeAgentResult({
    task: repairTask,
    result: {
      status: 'success',
      patches: [{ path: '../escape.sh', content: 'bad', reason: 'escape' }],
    },
  });
  assert.equal(badPatch.ok, false);
  assert.match(badPatch.issues.join(' '), /unsafe patch path/i);

  const verifyTask = plan.tasks.find((item) => item.operation === 'verify')!;
  const fakeSuccess = validateCodeAgentResult({ task: verifyTask, result: { status: 'success', verification: {} } });
  assert.equal(fakeSuccess.ok, false);
  assert.match(fakeSuccess.issues.join(' '), /without positive execution evidence/i);
});

test('agent fabric falls back between specialists without exposing vendor choice to the workspace', async () => {
  const ws = workspace();
  const plan = buildCodeAgentPlan({ operation: 'repair', objective: ws.objective, workspace: ws });
  const registry = new CodeAgentRegistry();

  const flaky: CodeAgentAdapter = {
    id: 'opencode-synthetic',
    kind: 'opencode',
    priority: 100,
    capabilities: [...fullCapabilities],
    async invoke() {
      throw new Error('synthetic provider outage');
    },
  };

  const native: CodeAgentAdapter = {
    id: 'quantora-native-synthetic',
    kind: 'quantora-native',
    priority: 10,
    capabilities: [...fullCapabilities],
    async invoke(context) {
      if (context.task.operation === 'repair') {
        return {
          status: 'success',
          summary: 'Minimal repair prepared.',
          patches: [{ path: 'src/App.jsx', content: 'export default function App(){ return <main>Fixed</main> }', reason: 'Repair synthetic crash.' }],
        };
      }
      if (context.task.operation === 'execute') {
        return {
          status: 'success',
          summary: 'Synthetic build executed.',
          commands: [{ command: 'npm test', purpose: 'Verify changed behavior.' }],
        };
      }
      if (context.task.operation === 'verify') {
        return {
          status: 'success',
          summary: 'Verified with synthetic execution evidence.',
          verification: { buildPassed: true, testsPassed: true, previewLoaded: true, runtimeClean: true },
        };
      }
      return { status: 'success', summary: `${context.task.operation} completed.` };
    },
  };

  registry.register(flaky);
  registry.register(native);

  const result = await runCodeAgentPlan({ plan, workspace: ws, registry });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.adapterTrace.understand, ['opencode-synthetic', 'quantora-native-synthetic']);
  assert.deepEqual(result.adapterTrace.verify, ['opencode-synthetic', 'quantora-native-synthetic']);
  assert.equal(result.results.verify.verification?.testsPassed, true);
});
