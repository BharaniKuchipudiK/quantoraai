import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudioJobCard } from './studio-job-card.js';
import {
  applyWorkspaceFromChat,
  messageHasExtractableWorkspaceCode,
  assembleStudioPreview,
  assessCodingReply,
  studioAssemblyBase,
  canOpenStudioPreviewPane,
  extractRunnableCode,
  runningPreviewCode,
  writeHealedPreviewToVfs,
  applyDeskReviewPatch,
  ensureShopPhotosInVfs,
  ensureShopDeskInVfs,
  userAskedForDeskReview,
  userAskedForPreviewPhotos,
  userAskedForBrokenPreviewPhotos,
  userAskedForSemanticPhotoEdit,
  userAskedForShopDeskFix,
  previewAssemblyFingerprint,
  isNativeSidecarPath,
} from './studio-preview-helpers.js';
import { deskChecksRegressed, probeRunningDesk } from './studio-desk-context.js';

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

test('the turn gate accepts ten successive patches against the current project, not an empty desk', () => {
  let vfs = assembleStudioPreview(splitApp).vfs;
  for (let i = 0; i < 10; i += 1) {
    const before = vfs['styles.css'].content;
    const after = `.key{color:rgb(${i},0,0)}`;
    const reply = `\`\`\`css filepath="styles.css"\n<<<<\n${before.trim()}\n====\n${after}\n>>>>\n\`\`\``;
    const result = assessCodingReply(reply, vfs);
    assert.equal(result.accepted, true);
    assert.equal(result.assembled.vfs['index.html'].content, vfs['index.html'].content);
    assert.equal(result.assembled.vfs['script.js'].content, vfs['script.js'].content);
    assert.ok(result.assembled.vfs['styles.css'].content.includes(`rgb(${i},0,0)`));
    vfs = result.assembled.vfs;
  }
  assert.equal(assessCodingReply('I changed it.', vfs).accepted, false);
  const missing = '```css filepath="styles.css"\n<<<<\nnot present\n====\nnew value\n>>>>\n```';
  assert.equal(assessCodingReply(missing, vfs).detailCode, 'patch-conflict');
});

test('assembled preview keeps HTML as the entry and sibling CSS/JS in the VFS', () => {
  const assembled = assembleStudioPreview(splitApp);
  assert.match(assembled.code, /<!DOCTYPE html>/);
  assert.ok(assembled.vfs['styles.css']);
  assert.ok(assembled.vfs['script.js']);
});

test('a travel answer with a fenced hotel name is not previewable', () => {
  const text = 'Stay in Ubud.\n\n```text\nHotel Indigo\n```\n';
  assert.equal(canOpenStudioPreviewPane(text), false);
  assert.equal(extractRunnableCode(text), null);
});

test('Swift-only iOS source does not open Live Preview', () => {
  const text = `Here is the app.

\`\`\`swift filepath="ScientificCalculator.swift"
import SwiftUI
struct ScientificCalculator: View { var body: some View { Text("0") } }
\`\`\`
`;
  assert.equal(canOpenStudioPreviewPane(text), false);
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

/*
 * The stress gate's one real defect (scripts/stress/pipeline-stress.mjs,
 * `unfenced-html`): the fenced path merges into the workspace, but an unfenced
 * document came back as `{ 'index.html' }` alone, so a model that forgot its
 * fence on a same-product turn silently deleted every sibling — products.json,
 * styles.css — on 8 of 8 arrival shapes. Reported as `file-lost`, muted under
 * continue-on-error since the gate was written. A page is not a project.
 */
test('[was-red] an unfenced document on an existing project replaces the page and keeps its siblings', () => {
  const base = {
    'index.html': { content: '<!DOCTYPE html><html><body><h1>Kaapi Bharat</h1><button id="add">Add to Cart</button></body></html>', language: 'html' },
    'products.json': { content: '[{"id":"araku","name":"Araku","price":1200}]', language: 'json' },
    'styles.css': { content: '.product-card{padding:8px}', language: 'css' },
  };
  const reply = 'Here you go.\n\n<!DOCTYPE html><html><body><h1>Kaapi Bharat</h1><p>New hero.</p><button id="add">Add to Cart</button></body></html>';
  const out = applyWorkspaceFromChat(reply, base, null, { brief: 'build my coffee shop' });
  assert.equal(out.didUpdate, true, 'a complete page is a build');
  assert.match(out.vfs['index.html'].content, /New hero/, 'the page is the new page');
  assert.equal(out.vfs['products.json']?.content, base['products.json'].content, 'products.json survived the turn');
  assert.equal(out.vfs['styles.css']?.content, base['styles.css'].content, 'styles.css survived the turn');
  // With no workspace to keep, the shape is unchanged: one file, the page.
  assert.deepEqual(Object.keys(assembleStudioPreview(reply, {}).vfs), ['index.html']);
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

test('plain chat does not revive or reopen a project, and does not erase it either', () => {
  const desk = {
    'index.html': { content: '<!DOCTYPE html><html><body>Hi</body></html>', language: 'html' },
  };
  const follow = applyWorkspaceFromChat('Looks good. What next?', desk);
  assert.equal(follow.didUpdate, false);
  assert.equal(follow.reopenDesk, false);

  /*
   * `vfs` used to be {} here, and that emptiness was the hazard: any caller
   * reading it without first checking didUpdate replaced a working project with
   * an empty desk. The desk that should EXIST after a chat turn is the one that
   * already existed.
   */
  assert.deepEqual(follow.vfs, desk, 'a chat turn must not blank the desk');

  // What the turn PRODUCED is still nothing, and the proof plane reads that.
  assert.deepEqual(follow.producedVfs, {}, 'nothing was built this turn');
});

test('error-path provider death still exposes extractable fences for workspace apply', () => {
  const partial = [
    'Building the boutique…',
    '',
    '```html filepath="index.html"',
    '<!DOCTYPE html><html><body><h1>Saree Boutique</h1>',
    '<button type="button">Add to Cart</button></body></html>',
    '```',
    '',
    'The connection to the model died before Preview was ready.',
  ].join('\n');
  assert.equal(messageHasExtractableWorkspaceCode(partial), true);
  assert.equal(messageHasExtractableWorkspaceCode('⚠️ no healthy AI route'), false);
  const assembled = applyWorkspaceFromChat(partial, {});
  assert.equal(assembled.didUpdate, true);
  assert.match(assembled.vfs['index.html'].content, /Saree Boutique/);
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

test('healing a boutique with no product images does NOT fabricate stock photos (honest gap)', () => {
  const vfs = {
    'index.html': { content: '<!DOCTYPE html><html><body><p>old</p></body></html>', language: 'html' },
    'products.json': { content: '[{"id":"a","name":"Silk"}]', language: 'json' },
  };
  const healed = '<!DOCTYPE html><html><body><main><div class="hero">Kanjeevaram</div></main></body></html>';
  const next = writeHealedPreviewToVfs(vfs, healed);
  // The model shipped no images. We never inject fabricated stock photos to mask
  // that: the healed page keeps the model's real content, honest gap and all.
  assert.match(next.vfs['index.html'].content, /Kanjeevaram/);
  assert.doesNotMatch(next.vfs['index.html'].content, /picsum\.photos/);
  assert.doesNotMatch(next.vfs['index.html'].content, /data-quantora-shop-photo="true"/);
});

test('broken-photo asks are not treated as semantic catalog edits', () => {
  assert.equal(userAskedForBrokenPreviewPhotos('Why are the images broken?'), true);
  assert.equal(userAskedForSemanticPhotoEdit('Why are the images broken?'), false);
  assert.equal(userAskedForSemanticPhotoEdit('replace photos with blue dresses'), true);
  assert.equal(userAskedForBrokenPreviewPhotos('replace photos with blue dresses'), false);
});

test('a talk-only turn never fabricates stock photos onto a boutique desk', () => {
  assert.equal(userAskedForPreviewPhotos('no images .. please fix'), true);
  const before = {
    'index.html': {
      content: `<!DOCTYPE html><html><body><div class="product-card"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${'M'.repeat(200)}</svg><p>Kanjeevaram</p></div></body></html>`,
      language: 'html',
    },
    'products.json': { content: '[{"id":"a","name":"Silk"}]', language: 'json' },
  };
  const next = ensureShopPhotosInVfs(before);
  // The model shipped no image FILES to wire in, so nothing changes — and we
  // never inject picsum stock photos or a fabricated catalog to fill the gap.
  assert.equal(next.changed, false);
  assert.doesNotMatch(next.vfs['index.html'].content, /picsum\.photos/);
  assert.doesNotMatch(next.vfs['products.json'].content, /picsum\.photos/);
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

test('Review this is a desk review ask', () => {
  assert.equal(userAskedForDeskReview('Review this'), true);
  assert.equal(userAskedForDeskReview('review the preview'), true);
  assert.equal(userAskedForDeskReview('build a calculator'), false);
});

test('Review this wires a dead Add to Cart without dropping photos', () => {
  const photo = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#333"/><text>quantora-photo-1</text></svg>');
  const html = `<!DOCTYPE html><html><body>
    <header>Aaranya</header>
    <label>Currency <select id="quantora-currency"><option>INR</option><option>USD</option></select></label>
    <div class="product-card"><img src="${photo}" alt="Silk"><button type="button">Add to Cart</button></div>
  </body></html>`;
  const vfs = {
    'index.html': { content: html, language: 'html' },
    'products.json': { content: `[{"id":"silk","name":"Kanjeevaram Silk","image":"${photo}"}]`, language: 'json' },
  };
  const job = { purpose: 'A shop website', mustWork: ['Catalog and bag still work'] };
  const before = probeRunningDesk({ html, vfs, job });
  assert.equal(before.facts.hasPhotos, true);
  const patched = applyDeskReviewPatch(vfs, job);
  assert.equal(patched.rejected, false);
  assert.equal(patched.changed, true);
  assert.match(patched.vfs['index.html'].content, /addEventListener\('click'/);
  const after = probeRunningDesk({ html: patched.vfs['index.html'].content, vfs: patched.vfs, job });
  assert.equal(after.facts.hasPhotos, true);
  assert.equal(deskChecksRegressed(before.checks, after.checks), false);
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


test('python-only refine keeps Preview entry and flags needsWebEntry', () => {
  const html = '<!DOCTYPE html><html><body><div class="display">0</div><button>1</button></body></html>';
  const current = { 'index.html': { content: html, language: 'html' } };
  const follow = applyWorkspaceFromChat(
    'Updated to a scientific calculator.\n\n```python filepath="calculator.py"\nprint("sin")\n```\n```python filepath="gui_calculator.py"\nprint("DEG")\n```',
    current,
    { purpose: 'A working calculator', mustWork: ['Number buttons still change the display'] },
  );
  assert.equal(follow.didUpdate, true);
  assert.equal(follow.needsWebEntry, true);
  assert.equal(follow.previewChanged, false);
  assert.match(follow.vfs['index.html'].content, /class="display"/);
  assert.match(follow.vfs['calculator.py'].content, /sin/);
  assert.equal(isNativeSidecarPath('calculator.py'), true);
  assert.equal(previewAssemblyFingerprint(current), previewAssemblyFingerprint(follow.vfs));
});

test('scientific HTML refine updates the Preview assembly fingerprint', () => {
  const html = '<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></body></html>';
  const current = { 'index.html': { content: html, language: 'html' } };
  const follow = applyWorkspaceFromChat(
    '```html filepath="index.html"\n<!DOCTYPE html><html><body><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button><button>sin</button><button>cos</button></body></html>\n```',
    current,
    { purpose: 'A scientific calculator', mustWork: ['Scientific keys (sin/cos) appear on Preview'] },
  );
  assert.equal(follow.needsWebEntry, false);
  assert.equal(follow.previewChanged, true);
  assert.match(follow.vfs['index.html'].content, />sin</);
});

test('preview assembly fingerprint includes products.json catalog changes', () => {
  const before = {
    'index.html': { content: '<!DOCTYPE html><html><body>shop</body></html>', language: 'html' },
    'products.json': { content: '[{"id":"a","name":"Silk"}]', language: 'json' },
  };
  const after = {
    ...before,
    'products.json': { content: '[{"id":"a","name":"Silk"},{"id":"b","name":"Cotton"}]', language: 'json' },
  };
  assert.notEqual(previewAssemblyFingerprint(before), previewAssemblyFingerprint(after));
});

test('non-shop desk after boutique VFS merge has no saree stock image URLs', () => {
  const boutique = {
    'index.html': {
      content: `<!DOCTYPE html><html><body><div class="product-card"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${'M'.repeat(200)}</svg><p>Kanjeevaram</p></div></body></html>`,
      language: 'html',
    },
    'products.json': { content: '[{"id":"a","name":"Silk Saree"}]', language: 'json' },
  };
  const shopJob = { purpose: 'A shop website', mustWork: ['Catalog and bag still work', 'Keep this a shop, not a different app'] };
  const next = applyWorkspaceFromChat(
    '```html filepath="index.html"\n<!DOCTYPE html><html><body><main><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></main></body></html>\n```',
    boutique,
    shopJob,
    { brief: 'Build me a simple calculator' },
  );
  assert.equal(next.rejected, false);
  assert.equal(Boolean(next.vfs['products.json']), false);
  const html = next.vfs['index.html'].content;
  assert.match(html, /calculator-display/);
  assert.doesNotMatch(html, /photo-1610030469983|kanjeevaram|data-quantora-shop-photo|images\.unsplash\.com/i);
  assert.match(next.job?.purpose || '', /calculator/i);
});

test('leftover boutique products.json does not paint silk onto a Drive cleaner', () => {
  const sticky = {
    'index.html': {
      content: '<!DOCTYPE html><html><body><main><h1>Drive Cleaner</h1><ul class="catalog"><li>report.pdf</li></ul></main></body></html>',
      language: 'html',
    },
    'products.json': { content: '[{"id":"silk","name":"Kanjeevaram Silk"}]', language: 'json' },
  };
  const job = { purpose: 'A Drive cleaner agent', mustWork: ['Keep this a Drive cleaner'] };
  const next = ensureShopDeskInVfs(sticky, job);
  assert.equal(Boolean(next.vfs['products.json']), false);
  assert.doesNotMatch(next.vfs['index.html'].content, /images\.unsplash\.com|data-quantora-shop-photo|kanjeevaram/i);
});


test('shipping calculator on a boutique does not strip shop catalog', () => {
  const boutique = {
    'index.html': {
      content: '<!DOCTYPE html><html><body><div class="product-card"><p>Kanjeevaram boutique</p><button>Add to Cart</button></div></body></html>',
      language: 'html',
    },
    'products.json': { content: '[{"id":"a","name":"Silk Saree","priceCents":4999}]', language: 'json' },
  };
  const shopJob = { purpose: 'A shop website', mustWork: ['Catalog and bag still work', 'Keep this a shop, not a different app'] };
  const next = applyWorkspaceFromChat(
    [
      'Added a shipping calculator widget near checkout.',
      '',
      '```html filepath="index.html"',
      '<!DOCTYPE html><html><body><div class="product-card"><p>Kanjeevaram boutique</p><button>Add to Cart</button><label>Shipping calculator<input/></label></div></body></html>',
      '```',
    ].join('\n'),
    boutique,
    shopJob,
    { brief: 'Add a shipping calculator to the boutique' },
  );
  assert.equal(next.rejected, false);
  assert.equal(Boolean(next.vfs['products.json']), true);
  assert.match(next.vfs['index.html'].content, /product-card|boutique|Add to Cart/i);
  assert.match(next.job?.purpose || '', /shop/i);
});

/*
 * ---------------------------------------------------------------------------
 * A NEW PRODUCT IS NOT A REGRESSION OF THE OLD ONE.
 *
 * The regression guard in applyWorkspaceFromChat protects a STATED contract:
 * the job card's mustWork list ("Number buttons still change the display",
 * "Keep this a calculator, not a different app"). isStudioProductSwitch is what
 * lets a deliberate switch through — and it returns false the moment there is
 * no prior job card, because it has nothing to compare the new brief against.
 *
 * So a desk that kept its FILES but lost its JOB CARD could never be recognised
 * as switching product, and the guard judged a brand-new build a regression of
 * the old one. Silently: `rejected` returns with no error raised anywhere.
 *
 * Measured before the fix, as pure functions:
 *   bakery onto an empty desk               -> rejected: false
 *   bakery onto a calculator desk, job null -> rejected: TRUE
 *   bakery onto a calculator desk, job set  -> rejected: false
 * ---------------------------------------------------------------------------
 */
const calculatorDesk = () => ({
  'package.json': { content: '{"name":"app","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}', language: 'json' },
  'src/main.jsx': { content: "import { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\ncreateRoot(document.getElementById('root')).render(<App />);", language: 'jsx' },
  'src/App.jsx': { content: "import React,{useState} from 'react';\nexport default function App(){const [v,setV]=useState('0');\nreturn <main><h1>Calculator</h1><output data-testid=\"calculator-display\">{v}</output><button data-testid=\"calculator-one\" onClick={()=>setV('1')}>1</button></main>;}", language: 'jsx' },
  'src/styles.css': { content: 'body{margin:0}', language: 'css' },
});

const bakeryReply = [
  'Here is the complete, self-contained Vite React project for Sunrise Bakery.',
  '',
  '```json filepath="package.json"',
  '{"name":"bakery","dependencies":{"react":"^18.2.0","react-dom":"^18.2.0"}}',
  '```',
  '',
  '```jsx filepath="src/main.jsx"',
  "import { createRoot } from 'react-dom/client';",
  "import App from './App.jsx';",
  "createRoot(document.getElementById('root')).render(<App />);",
  '```',
  '',
  '```jsx filepath="src/App.jsx"',
  "import React from 'react';",
  'export default function App(){return <main><h1>Sunrise Bakery</h1><button data-testid="website-cta">View the menu</button></main>;}',
  '```',
  '',
  '```css filepath="src/styles.css"',
  'body{margin:0}',
  '```',
].join('\n');

const BAKERY_BRIEF = 'Create a simple polished one-page React website for a neighborhood bakery.';

test('a complete new build over a desk with no job card is not rejected', () => {
  const result = applyWorkspaceFromChat(bakeryReply, calculatorDesk(), null, { brief: BAKERY_BRIEF });
  assert.equal(result.rejected, false, 'with no stated contract there is nothing to regress against');
  assert.equal(result.didUpdate, true, 'and the new product must actually reach the desk');
});

test('the guard still protects a product that DID state its contract', () => {
  /*
   * §4: what does this check do when the defect is present? A same-product
   * refinement that drops the calculator's own promises must still be refused,
   * or the guard is decorative.
   */
  const job = buildStudioJobCard({ brief: 'Create a simple working React calculator', vfs: calculatorDesk(), existing: null });
  assert.ok(job?.mustWork?.length, 'the calculator states what must keep working');

  const guttedCalculator = [
    'Updated the calculator.',
    '',
    '```jsx filepath="src/App.jsx"',
    "import React from 'react';",
    'export default function App(){return <main><h1>Calculator</h1></main>;}',
    '```',
  ].join('\n');
  const refined = applyWorkspaceFromChat(guttedCalculator, calculatorDesk(), job, { brief: 'make the calculator prettier' });
  assert.equal(refined.rejected, true, 'losing the display and the keys is a real regression');
});

test('a stated switch is still allowed, exactly as before', () => {
  const job = buildStudioJobCard({ brief: 'Create a simple working React calculator', vfs: calculatorDesk(), existing: null });
  const switched = applyWorkspaceFromChat(bakeryReply, calculatorDesk(), job, { brief: BAKERY_BRIEF });
  assert.equal(switched.rejected, false);
});

test('product-switch assessment cannot borrow the previous app to accept sidecars', () => {
  const prior = calculatorDesk();
  const job = buildStudioJobCard({ brief: 'Create a simple working React calculator', vfs: prior });
  const freshBase = studioAssemblyBase(prior, BAKERY_BRIEF, job);
  assert.deepEqual(freshBase, {});
  for (const reply of ['```css filepath="styles.css"\nbody{color:red}\n```', '```md filepath="README.md"\nBakery\n```']) {
    assert.equal(assessCodingReply(reply, freshBase).accepted, false);
  }
  assert.equal(studioAssemblyBase(prior, 'make the calculator prettier', job), prior);
  assert.equal(assessCodingReply(bakeryReply, freshBase).accepted, true);
});
