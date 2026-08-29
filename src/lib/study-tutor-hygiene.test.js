import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const TUTOR_UI_MODULES = [
  'src/components/StudyTutorShell.jsx',
  'src/lib/study-tutor-brief.js',
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

test('Study tutor focus is a persistent workspace sibling, not mounted under the latest message', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/AiStudio.jsx'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'src/components/StudyTutorWorkspace.jsx'), 'utf8');
  const feedIndex = source.indexOf('{renderedChatFeed}');
  const boardIndex = source.indexOf('<StudyTutorWorkspace');
  assert.ok(feedIndex >= 0 && boardIndex > feedIndex, 'Study focus must render after the chat feed');
  assert.equal(
    source.includes("studioDomain === 'education' && msg.id === latestAiId && studyTutorBrief?.active"),
    false,
    'Study focus must not be keyed to the latest AI message',
  );
  assert.match(workspace, /key=\{`\$\{activeSessionId\}:\$\{brief\.conceptId\}`\}/);
  assert.match(source, /lazy\(\(\) => import\('\.\/StudyTutorWorkspace\.jsx'\)\)/);
});

test('Study tutor focus has no hidden legacy board or More dashboard', () => {
  const shell = fs.readFileSync(path.join(root, 'src/components/StudyTutorShell.jsx'), 'utf8');
  /*
   * USED, not merely named.
   *
   * A bare /StudyTutorBoard/ counts a COMMENT as a revival — and a comment
   * explaining why a render moved out of the deleted board is exactly the
   * context the next reader needs. The wiring gate had this same flaw, where a
   * docblock cleared the very symbol it documented, and #362's hygiene check
   * had it too.
   *
   * Importing the legacy board or rendering it is the thing that must never
   * happen, so that is what these match.
   */
  assert.doesNotMatch(shell, /\bimport\b[^;]*\bStudyTutorBoard\b|<StudyTutorBoard\b/);
  assert.doesNotMatch(shell, /data-quantora-study-focus-detail/);
  assert.doesNotMatch(shell, />\s*(?:More|Less)\s*</);
});

test('Study assessment responses are generation-guarded across topic and session changes', () => {
  const workspace = fs.readFileSync(path.join(root, 'src/components/StudyTutorWorkspace.jsx'), 'utf8');
  assert.match(workspace, /const assessmentGeneration = useRef\(0\)/);
  assert.match(workspace, /assessmentGeneration\.current \+= 1/);
  assert.ok(
    (workspace.match(/assessmentGeneration\.current !== generation/g) || []).length >= 3,
    'issue and grade continuations must reject stale responses',
  );
});

test('Study keeps contextual tutoring prose out of the persistent UI layer', () => {
  const shell = fs.readFileSync(path.join(root, 'src/components/StudyTutorShell.jsx'), 'utf8');
  const brief = fs.readFileSync(path.join(root, 'src/lib/study-tutor-brief.js'), 'utf8');
  assert.doesNotMatch(shell, /brief\?\.next|encouragement|progress\.caption|miniPracticeFor|local-check|gradeStudyCheck/);
  assert.doesNotMatch(brief, /encouragement|nextBeat|deriveSessionCheck|Quick honesty check|No fake score/);
  assert.match(shell, /askOrSend\(studyPracticeAsk\(topic\)\)/);
  assert.match(shell, /askOrSend\(studyQuizAsk\(topic\)\)/);
  assert.match(shell, /activity === 'check' && assessment\?\.status === 'error'/);
});
