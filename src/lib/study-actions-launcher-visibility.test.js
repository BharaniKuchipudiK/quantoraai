import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function orderedIndexes(source, labels) {
  return labels.map((label) => source.indexOf(label));
}

test('Study actions render as one continuous vertical list in the intended order', () => {
  const menu = read('src/components/StudioToolsMenu.jsx');
  const model = read('src/lib/studio-tools-menu.js');

  assert.match(menu, /display: 'flex', flexDirection: 'column', gap: '7px'/);
  assert.doesNotMatch(menu, /gridTemplateColumns:\s*'repeat\(2/);
  assert.doesNotMatch(menu, /const isWide/);

  const indexes = orderedIndexes(model, [
    "title: 'New topic'",
    "title: 'Assessment'",
    "title: 'Flashcards'",
    "title: 'Notebook'",
  ]);
  assert.ok(indexes.every((index) => index >= 0), 'One or more Study actions are missing from the menu model.');
  assert.deepEqual([...indexes].sort((a, b) => a - b), indexes, 'Study actions are not in the intended continuous order.');
});

test('Study AI launcher is visible for the session before a topic, but interventions stay locked', () => {
  const workspace = read('src/components/StudyTutorWorkspace.jsx');
  const launcher = read('src/components/StudyHubLauncher.jsx');

  assert.match(workspace, /if \(!activeSessionId\) return null;/);
  assert.match(workspace, /onboarding\.status === 'loading' \|\| !brief\?\.active[\s\S]*<StudyHubLauncher[\s\S]*ready=\{false\}/);
  assert.match(workspace, /topic=\{brief\.label\}[\s\S]*ready/);

  assert.match(launcher, /ready = true/);
  assert.match(launcher, /data-quantora-study-hub-ready=\{ready \? 'true' : 'false'\}/);
  assert.match(launcher, /disabled=\{!ready\}/);
  assert.match(launcher, /if \(!ready\) return;/);
  assert.match(launcher, /Start a Study topic to unlock tutor tools\./);
});
