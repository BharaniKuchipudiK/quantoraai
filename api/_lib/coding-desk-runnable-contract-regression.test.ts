import assert from 'node:assert/strict';
import test from 'node:test';
import { hasBrowserPreviewArtifact, validateBuildArtifactResponse } from './build-artifact-contract.js';
import { parseVFSWithReport } from '../../src/lib/vfs-parser.js';
import { pickPreviewEntryPath } from '../../src/lib/preview-utils.js';

function browserEntryFor(reply: string, currentVfs: Record<string, string> = {}): string | null {
  const parsed = parseVFSWithReport(reply, currentVfs);
  return pickPreviewEntryPath(parsed.vfs);
}

test('[was-red] CSS-only output is not a runnable Coding Desk build', () => {
  const reply = 'Here are the styles.\n\n```css\nbody { font-family: system-ui; }\n```';

  assert.equal(browserEntryFor(reply), null, 'Coding Desk has no page/JS entry to mount');
  assert.equal(hasBrowserPreviewArtifact(reply), false, 'server must use the same runnable-entry meaning');
  assert.deepEqual(validateBuildArtifactResponse(reply, null), {
    ok: false,
    detailCode: 'browser-preview-missing',
  });
});

test('[was-red] an existing-file patch is not mistaken for a fresh non-runnable reply', () => {
  const currentVfs = {
    'index.html': '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body>Works</body></html>',
    'styles.css': 'body { color: black; }',
  };
  const reply = '```css filepath="styles.css"\n<<<<\nbody { color: black; }\n====\nbody { color: navy; }\n>>>>\n```';

  assert.equal(browserEntryFor(reply, currentVfs), 'index.html', 'Coding Desk applies the patch to its existing runnable VFS');
  assert.equal(hasBrowserPreviewArtifact(reply), true, 'server preserves a governed patch it cannot apply without currentVfs');
  assert.deepEqual(validateBuildArtifactResponse(reply, null), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});

test('a self-contained HTML page is runnable on both sides', () => {
  const reply = '```html\n<!DOCTYPE html><html><body><button>Works</button></body></html>\n```';

  assert.equal(browserEntryFor(reply), 'index.html');
  assert.equal(hasBrowserPreviewArtifact(reply), true);
  assert.deepEqual(validateBuildArtifactResponse(reply, null), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});

test('a JavaScript/React entry remains a valid Preview artifact', () => {
  const reply = '```jsx\nexport default function App(){ return <main>Hello</main>; }\n```';

  assert.equal(browserEntryFor(reply), 'App.jsx');
  assert.equal(hasBrowserPreviewArtifact(reply), true);
  assert.deepEqual(validateBuildArtifactResponse(reply, null), {
    ok: true,
    detailCode: 'build-artifact-valid',
  });
});
