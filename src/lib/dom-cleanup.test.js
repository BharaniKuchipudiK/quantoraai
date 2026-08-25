import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getChatDisplayText } from './build-communication.js';

const legacyInstallers = [
  'installSpecialistExperience',
  'installAgenticWorkspaceUiPolicy',
  'installWorkspaceCardPolish',
  'installStudioResponsePresentation',
  'installYoutubeMediaExperience',
  'installProfileMenuBridge',
  'installProfilePersonalization',
  'installStudioRegressionRecovery',
  'installStudioStabilityBoundary',
];

test('Studio boot no longer installs post-render DOM repair layers', () => {
  const main = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
  for (const installer of legacyInstallers) {
    assert.equal(main.includes(installer), false, `${installer} must not be active at runtime`);
  }
});

test('shared shell owns Profile and Canvas/Journey while Studio owns workspace controls', () => {
  const studio = fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  const header = fs.readFileSync(new URL('../components/Header.jsx', import.meta.url), 'utf8');

  assert.doesNotMatch(studio, /data-quantora-sidebar-profile/);
  assert.doesNotMatch(studio, /data-quantora-sidebar-canvas/);
  assert.match(header, /aria-controls="quantora-profile-menu"/);
  assert.match(header, /setActiveTab\('canvas'\)/);
  assert.match(header, /compact \? 'Journey' : 'Dream-to-Action Canvas'/);

  assert.match(studio, /data-quantora-dual-arena/);
  assert.match(studio, /data-quantora-message-fork/);
  assert.match(studio, /data-quantora-code-workspace/);
  assert.match(studio, /data-quantora-sidebar-history/);
  assert.match(studio, /data-quantora-sidebar-history-list/);
  assert.match(studio, /studioSidebarHistoryTitle/);
  assert.match(studio, /studioSidebarMembershipCopy/);
  assert.match(studio, /studioSidebarHistoryPaneStyle/);
  assert.match(studio, /studioSidebarFrameStyle/);
  assert.match(studio, /studioSidebarYieldingSectionStyle/);
  assert.match(studio, /handleMoveChatToProject/);
  assert.doesNotMatch(studio, /Resume this outcome/);
  assert.match(studio, /canAutoOpenCodeWorkspace\(studioDomain\)/);
  assert.doesNotMatch(studio, /Live API Engine Active/);
  assert.doesNotMatch(studio, /Selected Model:/);
});

test('one component renders the chat feed, so a fix cannot land on a dead copy', () => {
  const components = new URL('../components/', import.meta.url);
  const renderers = fs.readdirSync(components)
    .filter((name) => name.endsWith('.jsx'))
    .filter((name) => /messages\s*\.filter\(\s*msg\s*=>\s*msg\.type !== 'greeting'\s*\)/
      .test(fs.readFileSync(new URL(name, components), 'utf8')));

  assert.deepEqual(renderers, ['AiStudio.jsx']);
  assert.equal(fs.existsSync(new URL('StudioChatFeed.jsx', components)), false);
});

test('the desk ships no syntax highlighter, because chat strips every fence before one could run', () => {
  const components = new URL('../components/', import.meta.url);
  const importers = fs.readdirSync(components)
    .filter((name) => name.endsWith('.jsx') || name.endsWith('.tsx'))
    .filter((name) => /react-syntax-highlighter/.test(fs.readFileSync(new URL(name, components), 'utf8')));

  assert.deepEqual(importers, []);

  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal('react-syntax-highlighter' in (pkg.dependencies || {}), false);

  // The rule that makes highlighting unreachable, asserted next to its consequence.
  assert.equal(getChatDisplayText('Here it is:\n\n```js\nconst a = 1;\n```'), 'Here it is:');
});

test('multi-file project preview is a React-owned runtime', () => {
  const preview = fs.readFileSync(new URL('../components/LivePreviewCanvas.jsx', import.meta.url), 'utf8');
  assert.match(preview, /ProjectRuntimePreview/);
  assert.match(preview, /isProjectRuntimeVfs/);
  assert.match(preview, /createInlineReactRuntimeVfs/);
  assert.match(preview, /data-quantora-preview-contract-error/);
  assert.match(preview, /project-runtime-contract-missing/);
  // Endless "retrying the shell" theater: fail clock must not restart on assembly churn.
  assert.doesNotMatch(preview, /Still starting Preview — retrying the shell/);
  assert.match(preview, /omit assemblyKey \/ currentCode/);
  assert.match(preview, /canUseBlobPreviewEmbed/);
  assert.match(preview, /turnBusy/);
  assert.match(preview, /shell fail clock paused|Building — Preview waits/);
  assert.match(
    fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8'),
    /turnBusy=\{isGenerating\}/,
  );
});

test('build timeout and deployed canary credentials honor the release contract', () => {
  const stream = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const canary = fs.readFileSync(new URL('../../scripts/deployed-golden-transactions.mjs', import.meta.url), 'utf8');
  assert.match(stream, /BUILD_TURN_DEADLINE_MS = 135_000/);
  assert.match(stream, /controller\.abort\('timeout'\), attemptBudgetMs/);
  // A self-healing retry must spend what is left of the turn deadline, never a fresh one.
  assert.match(stream, /turnDeadlineMs - \(Date\.now\(\) - turnStartedAt\)/);
  assert.match(stream, /buildMode: isCodingRequest/);
  assert.match(stream, /resolveIsCodingRequest/);
  assert.match(stream, /advisorBlocksPreviewBuild\(turnDomain\)/);
  assert.match(fs.readFileSync(new URL('../../api/_lib/chat-handler.ts', import.meta.url), 'utf8'), /error\?\.code !== 'BUILD_ARTIFACT_CONTRACT'/);
  assert.doesNotMatch(canary, /extraHTTPHeaders/);
  assert.match(canary, /new URL\(request\.url\(\)\)\.origin !== BASE_ORIGIN/);
  assert.match(canary, /\/api\/inference-health/);
});
