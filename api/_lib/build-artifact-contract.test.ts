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
