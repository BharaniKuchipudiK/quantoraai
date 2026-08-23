import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkspaceFromChat,
  assembleStudioPreview,
  canOpenStudioPreviewPane,
  extractHtmlFromResponse,
  extractRunnableCode,
  hasPreviewableContent,
  preparePreviewHtml,
  runningPreviewCode,
  writeHealedPreviewToVfs,
  ensureShopPhotosInVfs,
  ensureShopDeskInVfs,
  userAskedForPreviewPhotos,
  userAskedForShopDeskFix,
} from './studio-preview-helpers.js';

const splitApp = `Here is the app.

\`\`\`html filepath="index.html"
<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><button class="key">7</button><script src="script.js"></script></body></html>
\`\`\`

\`\`\`css filepath="styles.css"
.key{display:grid;border-radius:40px}
\`\`\`

\`\`\`javascript filepath="script.js"
document.querySelector(".key").onclick = () => {};
\`\`\`
`;

test('assembled preview keeps HTML as the entry and sibling CSS/JS in the VFS', () => {
  const assembled = assembleStudioPreview(splitApp);
  assert.match(assembled.code, /<!DOCTYPE html>/);
  assert.ok(assembled.vfs['styles.css']);
  assert.ok(assembled.vfs['script.js']);
});

test('HTML with a filepath attribute is not treated as a CSS-first fence', () => {
  const html = extractHtmlFromResponse(splitApp);
  assert.match(html, /<button class="key">/);
  assert.doesNotMatch(html, /filepath=/);
});

test('preparePreviewHtml inlines sibling CSS so chat Preview matches the workspace', () => {
  const prepared = preparePreviewHtml(splitApp);
  assert.match(prepared, /\.key\{display:grid/);
  assert.match(prepared, /document\.querySelector/);
});

test('a travel answer with a fenced hotel name is not previewable', () => {
  const text = 'Stay in Ubud.\n\n```text\nHotel Indigo\n```\n';
  assert.equal(hasPreviewableContent(text), false);
  assert.equal(extractRunnableCode(text), null);
});

test('unfenced HTML documents are still previewable', () => {
  const html = '<!DOCTYPE html><html><head><style>body{color:red}</style></head><body>Hi</body></html>';
  assert.equal(hasPreviewableContent(html), true);
  assert.match(extractHtmlFromResponse(html), /color:red/);
});

test('Swift-only iOS source does not open Live Preview', () => {
  const text = `Here is the app.

\`\`\`swift filepath="ScientificCalculator.swift"
import SwiftUI
struct ScientificCalculator: View { var body: some View { Text("0") } }
\`\`\`
`;
  assert.equal(canOpenStudioPreviewPane(text), false);
  assert.equal(hasPreviewableContent(text), false);
});

test('a CSS patch on an existing workspace still counts as a previewable follow-up', () => {
  const first = `\`\`\`html filepath="index.html"\n<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><button class="key">7</button></body></html>\n\`\`\`\n\`\`\`css filepath="styles.css"\n.key{display:grid}\n\`\`\``;
  const patch = [
    '```css filepath="styles.css"',
    '<<<<',
    '.key{display:grid}',
    '====',
    '.key{display:grid;grid-template-columns:repeat(5,1fr)}',
    '>>>>',
    '```',
  ].join('\n');
  const previous = assembleStudioPreview(first);
  assert.equal(canOpenStudioPreviewPane(patch), false);
  assert.equal(canOpenStudioPreviewPane(patch, previous.vfs), true);
  const next = assembleStudioPreview(patch, previous.vfs);
  assert.match(next.code, /<!DOCTYPE html>/);
  assert.match(next.vfs['styles.css'].content, /repeat\(5,1fr\)/);
});

test('chat plus an HTML page does not preview the chat', () => {
  const text = `Got it! You want a weather application for iOS.

I will use OpenWeatherMap.

\`\`\`html filepath="index.html"
<!DOCTYPE html><html><body><h1>Weather</h1></body></html>
\`\`\`
`;
  const assembled = assembleStudioPreview(text);
  assert.doesNotMatch(assembled.code, /Got it/);
  assert.doesNotMatch(assembled.code, /filepath=/);
  assert.match(assembled.code, /<h1>Weather<\/h1>/);
});

test('unfenced HTML after chat is sliced from the document start', () => {
  const text = 'Got it! Here is a replica.\n\n<!DOCTYPE html><html><body>Hi</body></html>';
  const assembled = assembleStudioPreview(text);
  assert.equal(assembled.code.startsWith('<!DOCTYPE html>'), true);
  assert.doesNotMatch(assembled.code, /Got it/);
});

test('a follow-up that only sends one file keeps the rest of the project', () => {
  const first = assembleStudioPreview(`\`\`\`json filepath="package.json"
{"name":"mission"}
\`\`\`
\`\`\`html filepath="index.html"
<!DOCTYPE html><html><body><div id="root"></div></body></html>
\`\`\`
\`\`\`jsx filepath="src/App.jsx"
export default function App(){return <main><h1>Mission Control is alive</h1></main>}
\`\`\``);
  const follow = applyWorkspaceFromChat(
    '```jsx filepath="src/App.jsx"\nexport default function App(){return <main><h1>Mission Control is patched</h1></main>}\n```',
    first.vfs,
  );
  assert.equal(follow.didUpdate, true);
  assert.equal(follow.reopenDesk, true);
  assert.equal(follow.vfs['package.json'].content.includes('mission'), true);
  assert.ok(follow.vfs['index.html']);
  assert.match(follow.vfs['src/App.jsx'].content, /patched/);
});

test('the first build does not force the coding desk open', () => {
  const first = applyWorkspaceFromChat(splitApp, {});
  assert.equal(first.didUpdate, true);
  assert.equal(first.reopenDesk, false);
});

test('plain chat does not revive or reopen a project', () => {
  const follow = applyWorkspaceFromChat('Looks good. What next?', {
    'index.html': { content: '<!DOCTYPE html><html><body>Hi</body></html>', language: 'html' },
  });
  assert.equal(follow.didUpdate, false);
  assert.equal(follow.reopenDesk, false);
  assert.deepEqual(follow.vfs, {});
});

test('Preview runs the project entry, not the file open in the editor', () => {
  const vfs = {
    'index.html': { content: '<!DOCTYPE html><html><body><h1>Live</h1></body></html>', language: 'html' },
    'src/App.jsx': { content: 'export default function App(){ return <main>Editor</main> }', language: 'jsx' },
  };
  assert.match(runningPreviewCode(vfs, 'export default function App(){ return <main>Editor</main> }'), /<h1>Live<\/h1>/);
});

test('a healed HTML page writes into index.html and does not overwrite React source', () => {
  const vfs = {
    'App.jsx': { content: 'export default function App(){ return <main>Old</main> }', language: 'jsx' },
  };
  const healed = '<!DOCTYPE html><html><body><h1>Fixed</h1></body></html>';
  const next = writeHealedPreviewToVfs(vfs, healed);
  assert.equal(next.wrote, true);
  assert.equal(next.path, 'index.html');
  assert.match(next.vfs['index.html'].content, /Fixed/);
  assert.match(next.vfs['App.jsx'].content, /Old/);
});

test('healing a boutique writes real photos, not gold frames', () => {
  const vfs = {
    'index.html': { content: '<!DOCTYPE html><html><body><p>old</p></body></html>', language: 'html' },
    'products.json': { content: '[{"id":"a","name":"Silk"}]', language: 'json' },
  };
  const healed = '<!DOCTYPE html><html><body><main><div class="hero">Kanjeevaram</div></main></body></html>';
  const next = writeHealedPreviewToVfs(vfs, healed);
  assert.match(next.vfs['index.html'].content, /images\.unsplash\.com/);
});

test('a chat that only talks still gets shop photos when the desk already has a boutique', () => {
  assert.equal(userAskedForPreviewPhotos('no images .. please fix'), true);
  const before = {
    'index.html': {
      content: `<!DOCTYPE html><html><body><div class="product-card"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${'M'.repeat(200)}</svg><p>Kanjeevaram</p></div></body></html>`,
      language: 'html',
    },
    'products.json': { content: '[{"id":"a","name":"Silk"}]', language: 'json' },
  };
  const next = ensureShopPhotosInVfs(before);
  assert.equal(next.changed, true);
  assert.match(next.vfs['index.html'].content, /images\.unsplash\.com/);
  assert.match(next.vfs['products.json'].content, /images\.unsplash\.com/);
});

test('currency and Add to Cart land on the boutique desk, not only in chat', () => {
  assert.equal(userAskedForShopDeskFix('Please include a currency converter'), true);
  assert.equal(userAskedForShopDeskFix('Please give an option to Add to Cart'), true);
  const vfs = {
    'index.html': {
      content: '<!DOCTYPE html><html><body><header>Aaranya</header><main><div class="product-card">Silk</div></main></body></html>',
      language: 'html',
    },
    'products.json': { content: '[{"id":"a","name":"Silk"}]', language: 'json' },
  };
  const next = ensureShopDeskInVfs(vfs);
  assert.match(next.vfs['index.html'].content, /Add to Cart/);
  assert.match(next.vfs['index.html'].content, /USD/);
  assert.match(next.vfs['index.html'].content, /quantora-currency|quantora-shop-ui/);
});

test('a one-file patch that breaks a running calculator is rejected', () => {
  const html = '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></body></html>';
  const current = { 'index.html': { content: html, language: 'html' } };
  const follow = applyWorkspaceFromChat(
    '```html filepath="index.html"\n<!DOCTYPE html><html><body><p>broken</p></body></html>\n```',
    current,
    { purpose: 'A working calculator', mustWork: ['Number buttons still change the display'] },
  );
  assert.equal(follow.rejected, true);
  assert.equal(follow.didUpdate, false);
  assert.match(follow.vfs['index.html'].content, /calculator-display/);
});

test('healing must not replace a working calculator with a dead page', () => {
  const html = '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></body></html>';
  const vfs = { 'index.html': { content: html, language: 'html' } };
  const next = writeHealedPreviewToVfs(vfs, '<!DOCTYPE html><html><body><p>error</p></body></html>', { purpose: 'A working calculator' });
  assert.equal(next.wrote, false);
  assert.equal(next.rejected, true);
  assert.match(next.vfs['index.html'].content, /calculator-display/);
});

test('a calculator is not given a clothing catalog', () => {
  const vfs = {
    'index.html': { content: '<!DOCTYPE html><html><body><button class="key">7</button></body></html>', language: 'html' },
  };
  const next = ensureShopDeskInVfs(vfs);
  assert.equal(next.changed, false);
  assert.doesNotMatch(next.vfs['index.html'].content, /unsplash/);
  assert.doesNotMatch(next.vfs['index.html'].content, /Add to Cart/);
});
