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
  assert.match(preview, /deskHasHtml/);
  assert.match(preview, /shouldShowPreviewShellTombstone/);
  assert.match(preview, /Files landed after a premature fail/);
  assert.match(preview, /Connecting Preview to your files/);
  assert.match(
    fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8'),
    /turnBusy=\{isGenerating\}/,
  );
});


test('Proof Control Plane owns coding turn success', () => {
  const stream = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const plane = fs.readFileSync(new URL('./proof-control-plane.js', import.meta.url), 'utf8');
  assert.match(plane, /export function proveCodingTurn/);
  assert.match(plane, /export function codingTurnMayClaimSuccess/);
  assert.match(stream, /proveCodingTurn/);
  assert.match(stream, /codingTurnMayClaimSuccess/);
  assert.match(stream, /onCodingTurnProved/);
  assert.match(stream, /proofFailureCopy/);
});

test('build timeout and deployed canary credentials honor the release contract', () => {
  const stream = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  const canary = fs.readFileSync(new URL('../../scripts/deployed-golden-transactions.mjs', import.meta.url), 'utf8');
  /*
   * The client deadline must OUTLAST the server's TOTAL_CHAT_BUDGET_MS or the UI
   * aborts a turn the server is still working on: the user gets a dead spinner
   * and the server's honest failure never arrives. Assert the RELATIONSHIP rather
   * than a magic number, so raising one budget can never silently invert them.
   */
  const serverBudgetMs = Number(
    (fs.readFileSync(new URL('../../api/_lib/chat-handler.ts', import.meta.url), 'utf8')
      .match(/TOTAL_CHAT_BUDGET_MS = ([\d_]+)/) || [])[1]?.replace(/_/g, ''),
  );
  assert.ok(Number.isFinite(serverBudgetMs), 'TOTAL_CHAT_BUDGET_MS must be declared');
  /*
   * EVERY client deadline, not just the build one.
   *
   * This gate originally checked BUILD_TURN_DEADLINE_MS alone, so the chat path
   * kept the identical inversion unnoticed: CHAT_TURN_DEADLINE_MS sat at 90s
   * against a 165s server budget, and any chat turn over a minute and a half was
   * killed by the browser while the server was still working - tokens generated,
   * billed and thrown away, surfaced as "Request timed out".
   *
   * Guarding one instance of a defect is how the other instances survive, so the
   * gate now enumerates the deadlines from the source. A new one is covered the
   * moment it is declared.
   */
  const deadlines = [...stream.matchAll(/const (\w*TURN_DEADLINE_MS) = ([\d_]+)/g)]
    .map(([, name, value]) => ({ name, ms: Number(value.replace(/_/g, '')) }));
  assert.ok(deadlines.length >= 2, `expected the chat and build deadlines, found ${deadlines.length}`);
  for (const { name, ms } of deadlines) {
    assert.ok(
      ms > serverBudgetMs,
      `${name} (${ms}ms) must exceed the server budget (${serverBudgetMs}ms), or the browser `
      + 'aborts a turn the server would have finished',
    );
  }
  // Vercel allows this function 180s (vercel.json -> api/pipeline.ts); staying
  // under it is what lets the server return its own error instead of being killed.
  assert.ok(serverBudgetMs <= 175_000, 'server budget must stay under the 180s function ceiling');
  assert.match(stream, /controller\.abort\('timeout'\), attemptBudgetMs/);
  /*
   * The two wall clocks are not directly comparable unless the client's is
   * restarted once the server has the request: the client timer is armed before
   * fetch, while TOTAL_CHAT_BUDGET_MS begins inside the handler after the body
   * lands. With multi-megabyte image uploads now supported, a slow connection
   * could spend the entire margin on transport and abort a turn the server had
   * only just begun - the same inversion, arriving through the network instead
   * of through a constant.
   */
  assert.match(
    stream,
    /clearTimeout\(timeoutId\);\s*\n\s*timeoutId = setTimeout\(\(\) => controller\.abort\('timeout'\), attemptBudgetMs\);/,
    'the turn deadline must be re-armed when response headers arrive, so upload time is not charged to the server budget',
  );
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
