import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const TUTOR_UI_MODULES = [
  'src/components/StudyTutorBoard.jsx',
  'src/lib/study-tutor-brief.js',
  'src/lib/study-practice-desk.js',
  'src/lib/study-learning-resources.js',
  'src/lib/study-syllabus-overlay.js',
];

const LESSON_TITLE_BAIT = [
  /newton'?s?\s+laws/i,
  /\bfaraday\b/i,
  /mole concept/i,
  /\bkinematics\b/i,
  /projectile motion/i,
];

test('Study tutor UI modules do not hard-wire famous chapter titles', () => {
  for (const relative of TUTOR_UI_MODULES) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const bait of LESSON_TITLE_BAIT) {
      assert.equal(
        bait.test(source),
        false,
        `${relative} must not contain hardcoded lesson title bait ${bait}`,
      );
    }
  }
});

test('Study tutor board is a persistent workspace sibling, not mounted under the latest message', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/AiStudio.jsx'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'src/components/StudyTutorWorkspace.jsx'), 'utf8');
  const feedIndex = source.indexOf('{renderedChatFeed}');
  const boardIndex = source.indexOf('<StudyTutorWorkspace');
  assert.ok(feedIndex >= 0 && boardIndex > feedIndex, 'Study board must render after the chat feed');
  assert.equal(
    source.includes("studioDomain === 'education' && msg.id === latestAiId && studyTutorBrief?.active"),
    false,
    'Study board must not be keyed to the latest AI message',
  );
  assert.match(workspace, /key=\{`\$\{activeSessionId\}:\$\{brief\.conceptId\}`\}/);
  assert.match(source, /lazy\(\(\) => import\('\.\/StudyTutorWorkspace\.jsx'\)\)/);
});
