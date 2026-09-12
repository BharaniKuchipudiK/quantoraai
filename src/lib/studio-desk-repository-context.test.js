import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeskContextPacket,
  codingTurnRequestFields,
  formatDeskContextForPrompt,
  sanitizeDeskContext,
  summarizeDeskSources,
} from './studio-desk-context.js';

test('a checked-out repository sends real source to every coding model route', () => {
  const vfs = {
    'src/components/ResumeStudio.jsx': {
      content: 'export function ResumeStudio() { return <main>Resume Studio</main>; }',
    },
    'src/hooks/useResumeData.js': {
      content: 'export const useResumeData = () => ({ sections: [] });',
    },
    'README.md': { content: '# Sartho AI' },
  };
  const packet = buildDeskContextPacket({
    vfs,
    job: {
      purpose: 'bharanikh-design/Sartho-ai-cp',
      mustWork: ['Do not replace this with a different product'],
    },
  });

  assert.ok(packet.sourceFiles.length > 0);
  assert.equal(packet.fileCount, 3);
  assert.equal(packet.sourceFiles[0].path, 'src/components/ResumeStudio.jsx');

  const fields = codingTurnRequestFields({ isCodingRequest: true, packet });
  assert.match(fields.deskContext.sourceFiles[0].content, /Resume Studio/);

  const prompt = formatDeskContextForPrompt(fields.deskContext);
  assert.match(prompt, /REPOSITORY WORKING COPY: bharanikh-design\/Sartho-ai-cp is already loaded/);
  assert.match(prompt, /src\/components\/ResumeStudio\.jsx/);
  assert.match(prompt, /export function ResumeStudio/);
  assert.match(prompt, /Do NOT ask the user to upload, paste, clone, or re-share source/);
  assert.match(prompt, /Never claim the repository is inaccessible/);
});

test('repository prompt context excludes secret-bearing local files', () => {
  const vfs = {
    '.env': { content: 'OPENROUTER_API_KEY=do-not-send' },
    'src/App.jsx': { content: 'export default function App() { return null; }' },
    'credentials.json': { content: '{"token":"do-not-send"}' },
  };
  const sourceFiles = summarizeDeskSources(vfs);
  assert.deepEqual(sourceFiles.map((row) => row.path), ['src/App.jsx']);
  const prompt = formatDeskContextForPrompt(buildDeskContextPacket({
    vfs,
    job: { purpose: 'owner/repo', mustWork: [] },
  }));
  assert.doesNotMatch(prompt, /do-not-send/);
});

test('server sanitization keeps repository source bounded and drops injected secret paths', () => {
  const clean = sanitizeDeskContext({
    files: ['src/App.jsx'],
    fileCount: 300,
    sourceFiles: [
      { path: '.env.production', content: 'SECRET=1' },
      { path: 'src/App.jsx', content: 'x'.repeat(20_000) },
    ],
  });
  assert.equal(clean.fileCount, 300);
  assert.equal(clean.sourceFiles.length, 1);
  assert.equal(clean.sourceFiles[0].path, 'src/App.jsx');
  assert.ok(clean.sourceFiles[0].content.length <= 12_000);
  assert.equal(clean.sourceFiles[0].truncated, true);
});
