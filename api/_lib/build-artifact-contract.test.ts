import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBuildArtifactResponse } from './build-artifact-contract.js';

const website = `
\`\`\`json filepath="package.json"
{"dependencies":{"react":"^18.2.0"}}
\`\`\`
\`\`\`jsx filepath="src/main.jsx"
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
createRoot(document.getElementById('root')).render(<App />);
\`\`\`
\`\`\`jsx filepath="src/App.jsx"
export default function App(){return <><h1>Sunrise Bakery</h1><button data-testid="website-cta">View today's menu</button></>}
\`\`\`
\`\`\`css filepath="src/styles.css"
body { margin: 0 }
\`\`\``;

const calculator = website
  .replace('Sunrise Bakery', 'Calculator')
  .replace(
    '<button data-testid="website-cta">View today\'s menu</button>',
    '<output data-testid="calculator-display">{value}</output><button data-testid="calculator-one" onClick={() => setValue(\'1\')}>1</button>',
  )
  .replace('export default function App(){return', "import { useState } from 'react'; export default function App(){const [value,setValue]=useState('0');return");

test('accepts an executable golden website contract', () => {
  assert.deepEqual(validateBuildArtifactResponse(website, 'simple-website'), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});

test('rejects opaque-origin storage before committing a model route', () => {
  const result = validateBuildArtifactResponse(website.replace('export default', 'localStorage.getItem("theme"); export default'), 'simple-website');
  assert.deepEqual(result, { ok: false, detailCode: 'opaque-storage-access' });
});

test('rejects a golden artifact that omits its observable interaction contract', () => {
  const result = validateBuildArtifactResponse(website.replace('website-cta', 'generic-button'), 'simple-website');
  assert.deepEqual(result, { ok: false, detailCode: 'website-contract-missing' });
});

test('rejects a golden VFS whose entry imports the app but never mounts it', () => {
  const result = validateBuildArtifactResponse(
    website.replace("createRoot(document.getElementById('root')).render(<App />);", ''),
    'simple-website',
  );
  assert.deepEqual(result, { ok: false, detailCode: 'golden-root-mount-missing' });
});

test('accepts a golden VFS that mounts through a named root variable', () => {
  const result = validateBuildArtifactResponse(
    website.replace(
      "createRoot(document.getElementById('root')).render(<App />);",
      "const root = createRoot(document.querySelector('#root')); root.render(<App />);",
    ),
    'simple-website',
  );
  assert.deepEqual(result, { ok: true, detailCode: 'build-artifact-valid' });
});

test('accepts a state-backed calculator interaction contract', () => {
  assert.deepEqual(validateBuildArtifactResponse(calculator, 'calculator'), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});

test('rejects a calculator button that cannot update its display', () => {
  const result = validateBuildArtifactResponse(calculator.replace("onClick={() => setValue('1')}", ''), 'calculator');
  assert.deepEqual(result, { ok: false, detailCode: 'calculator-interaction-missing' });
});

test('a normal user tool in one unfenced HTML document is a valid artifact', () => {
  const html = '<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body><button>Go</button></body></html>';
  assert.deepEqual(validateBuildArtifactResponse(html, null), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});

test('a normal user calculator in one HTML file is not held to the golden VFS canary', () => {
  const html = '```html\n<!DOCTYPE html><html><body><script>function add(){}</script></body></html>\n```';
  assert.deepEqual(validateBuildArtifactResponse(html, null), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});

test('accepts numeric state and a named calculator click handler', () => {
  const namedHandler = calculator
    .replace("useState('0')", 'useState(0)')
    .replace("return <>", "const chooseOne = () => setValue(1); return <>")
    .replace("onClick={() => setValue('1')}", 'onClick={chooseOne}');
  assert.deepEqual(validateBuildArtifactResponse(namedHandler, 'calculator'), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});

test('Swift-only iOS source is not a Preview artifact', () => {
  const swift = `
\`\`\`swift filepath="ContentView.swift"
import SwiftUI
struct ContentView: View { var body: some View { Text("0") } }
\`\`\`
`;
  assert.deepEqual(validateBuildArtifactResponse(swift, null), {
    ok: false,
    detailCode: 'browser-preview-missing',
  });
});

/*
 * THE GUIDED-INTAKE CONTRADICTION (2026-09-01, boutique incident).
 *
 * GUIDED_BUILD_DIRECTIVE orders the model, on a first-turn website ask
 * ("help me build a website for a client who is running a Boutique…"):
 * "you MUST NOT output HTML or a ```html code block… ask ONE natural
 * question… append <quantora-modal>… Wait for their answer."
 *
 * This contract then failed every reply that obeyed: no code fences →
 * BUILD_ARTIFACT_CONTRACT → the reply was withheld, the route ladder burned
 * every provider on the same compliant answer, and the user saw "The model
 * answered in chat without files" / "no healthy AI route". Deterministic,
 * not flaky: obedient models failed, only disobedient ones shipped.
 *
 * The fix: a guided intake turn owes EITHER a runnable artifact OR a genuine
 * intake move. Everything below pins both directions.
 */

const guidedIntakeReply = `Love this — a boutique for Kanjivaram, Uppada and Gadwal sarees, ready-made dresses, plus stitching, draping and mehndi services. One thing before I build: what's the boutique called?

<quantora-modal>
{"question":"What's it called?","options":[{"id":"type","title":"I'll type the name in chat"},{"id":"placeholder","title":"Use a placeholder name for now"}]}
</quantora-modal>`;

test('[was-red] a compliant guided first-turn intake passes when the turn allows intake', () => {
  assert.deepEqual(validateBuildArtifactResponse(guidedIntakeReply, null, { allowIntake: true }), {
    ok: true,
    detailCode: 'guided-intake-valid',
  });
});

test('the same intake reply still fails a turn that owes an artifact', () => {
  assert.deepEqual(validateBuildArtifactResponse(guidedIntakeReply, null), {
    ok: false,
    detailCode: 'code-fences-missing',
  });
});

test('allowIntake is not a free pass: prose that neither asks nor builds still fails', () => {
  const plan = 'Here is my plan: first I will scaffold the layout, then add the saree catalog, then wire the cart.';
  assert.deepEqual(validateBuildArtifactResponse(plan, null, { allowIntake: true }), {
    ok: false,
    detailCode: 'code-fences-missing',
  });
});

test('a guided turn that ships an artifact anyway is validated as an artifact, not waved through', () => {
  const html = '<!DOCTYPE html><html><body><script>localStorage.getItem("x")</script></body></html>';
  assert.deepEqual(validateBuildArtifactResponse(html, null, { allowIntake: true }), {
    ok: false,
    detailCode: 'opaque-storage-access',
  });
});

test('quantora-choices is an intake move too', () => {
  const reply = 'What vibe should the boutique site have?\n\n<quantora-choices>{"items":[{"id":"warm","label":"Cozy & warm"}]}</quantora-choices>';
  assert.deepEqual(validateBuildArtifactResponse(reply, null, { allowIntake: true }), {
    ok: true,
    detailCode: 'guided-intake-valid',
  });
});

test('golden canary turns never allow intake in place of the artifact', () => {
  // The caller passes a transaction only for golden turns; those turns demand
  // the artifact contract regardless of intake allowances upstream.
  assert.deepEqual(validateBuildArtifactResponse(guidedIntakeReply, 'simple-website', { allowIntake: true }), {
    ok: false,
    detailCode: 'code-fences-missing',
  });
});
