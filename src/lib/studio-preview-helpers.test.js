import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleStudioPreview,
  canOpenStudioPreviewPane,
  extractHtmlFromResponse,
  extractRunnableCode,
  hasPreviewableContent,
  preparePreviewHtml,
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
