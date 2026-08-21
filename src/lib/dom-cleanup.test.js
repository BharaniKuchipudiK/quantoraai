import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

test('native Studio owns the recovered controls and workspace boundaries', () => {
  const studio = fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /data-quantora-sidebar-profile/);
  assert.match(studio, /data-quantora-sidebar-canvas/);
  assert.match(studio, /data-quantora-dual-arena/);
  assert.match(studio, /data-quantora-message-fork/);
  assert.match(studio, /data-quantora-code-workspace/);
  assert.match(studio, /canAutoOpenCodeWorkspace\(studioDomain\)/);
});

test('multi-file project preview is a React-owned runtime', () => {
  const preview = fs.readFileSync(new URL('../components/LivePreviewCanvas.jsx', import.meta.url), 'utf8');
  assert.match(preview, /ProjectRuntimePreview/);
  assert.match(preview, /isProjectRuntimeVfs/);
});
