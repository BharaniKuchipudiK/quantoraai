import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateBuildArtifactResponse } from './build-artifact-contract.js';
import { resolveBudgetedTurnRecovery } from '../../src/lib/turn-recovery.js';
import { planTurnEscalation } from '../../src/lib/turn-escalation.js';

const request = 'Create a simple working React calculator. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes. Do not return index.html or use any CDN.';
const fence = (language: string, path: string, content: string) =>
  '```' + language + ' filepath="' + path + '"\n' + content + '\n```';
const reactFiles = [
  fence('json', 'package.json', '{"dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}'),
  fence('jsx', 'src/main.jsx', 'import React from "react"; import {createRoot} from "react-dom/client"; import App from "./App.jsx"; import "./styles.css"; createRoot(document.getElementById("root")).render(<App />);'),
  fence('jsx', 'src/App.jsx', 'import React, {useState} from "react"; export default function App() { const [value, setValue] = useState("0"); return <main><output data-testid="calculator-display">{value}</output><button data-testid="calculator-one" onClick={() => setValue("1")}>1</button></main>; }'),
  fence('css', 'src/styles.css', 'body { margin: 0; font-family: sans-serif; }'),
].join('\n\n');

// Repository fixtures, never generated or claimed to have been produced by
// the failed live run. Exercise the actual server admission contract.
test('standalone HTML cannot satisfy the existing calculator VFS contract', () => {
  const html = fence('html', 'index.html', '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></body></html>');
  assert.deepEqual(validateBuildArtifactResponse(html, 'calculator'), {
    ok: false, detailCode: 'golden-vfs-shape-missing',
  });
  assert.deepEqual(validateBuildArtifactResponse(reactFiles, 'calculator'), {
    ok: true, detailCode: 'build-artifact-valid',
  });
});

function recoverThroughActualHook(existing = false) {
  const source = readFileSync(new URL('../../src/hooks/useChatStream.js', import.meta.url), 'utf8');
  const body = source.match(/const recoverTurn = \(input\) => \{([\s\S]*?)\n    \};/);
  assert.ok(body, 'the actual recovery boundary must remain identifiable');
  const events: unknown[][] = [];
  const recover = new Function(
    'resolveBudgetedTurnRecovery', 'escalationNow', 'artifactRepairCount', 'artifactBaseVfs',
    'recordClientBoundary', 'turnCorrelationId', 'attemptEngineId', 'targetModel',
    'turnStartedAt', 'nextFallbackEngine', 'turnPlan', 'pythonBuildRequested',
    `return (input) => {${body[1]}\n};`,
  )(
    resolveBudgetedTurnRecovery,
    (attempt: number) => planTurnEscalation({ elapsedMs: 50_000, turnDeadlineMs: 175_000, engineCount: 3, attemptsStarted: attempt }),
    0, existing ? { 'src/App.jsx': { content: 'existing source' } } : {},
    (...args: unknown[]) => { events.push(args); return Promise.resolve(); },
    'format-contract-fixture', () => 'fixture-engine', { id: 'fixture-engine' },
    Date.now(), () => ({ id: 'fixture-fallback' }), { intent: { kind: 'app_build' } }, false,
  );
  const result = recover({ attempt: 1, code: 'BUILD_ARTIFACT_CONTRACT', failureDetail: 'calculator-interaction-missing' });
  assert.equal(events.length, 2, 'existing attempt and recovery evidence still travels');
  return { source, result };
}

test('[was-red] the wired recovery preserves the original multi-file request in the actual payload expression', () => {
  const { source, result } = recoverThroughActualHook();
  const line = source.split('\n').find((line) => line.trimStart().startsWith('message: retryBrief ?'));
  assert.ok(line, 'useChatStream must still send the recovery brief with the original request');
  const expression = line.trim().replace(/^message:\s*/, '').replace(/,$/, '');
  const compose = new Function('messageForModel', 'retryBrief', `return (${expression});`);
  const payload = compose(request, result.retryBrief);
  assert.ok(payload.startsWith(request + '\n\n'));
  assert.match(payload, /Preserve the original request's language, runtime, framework, required filenames and project layout/);
  assert.match(payload, /Only for a web page request with no specified framework or file layout: Return EXACTLY one/);
  assert.doesNotMatch(result.notice, /Rebuilding once as a self-contained page/);
});

test('the wired recovery treats explicit Python deliverables as Python even when the planner says app_build', () => {
  const source = readFileSync(new URL('../../src/hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(source, /hasRequestedPythonSource\(visibleUserText\)/);
  assert.match(source, /turnPlan\?\.intent\?\.kind === 'python_build' \|\| pythonBuildRequested/);
});

test('the wired existing-project branch still requests patches instead of a replacement application', () => {
  const { result } = recoverThroughActualHook(true);
  assert.match(result.retryBrief, /search\/replace patches/);
  assert.match(result.retryBrief, /Preserve unrelated files, behavior and project structure/);
  assert.doesNotMatch(result.retryBrief, /Return EXACTLY one complete self-contained HTML/);
});

test('the server still rejects a non-interactive calculator fixture', () => {
  assert.deepEqual(validateBuildArtifactResponse(reactFiles.replace('onClick={() => setValue("1")}', ''), 'calculator'), {
    ok: false, detailCode: 'calculator-interaction-missing',
  });
});
