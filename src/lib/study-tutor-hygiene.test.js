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
  assert.match(shell, /askOrSend\(studyPracticeAsk\(topic\), 'practice'\)/);
  assert.match(shell, /askOrSend\(studyQuizAsk\(topic\), 'quiz'\)/);
  assert.match(shell, /activity === 'check' && assessment\?\.status === 'error'/);
});

/*
 * WHICHEVER component is showing Study results has to render this.
 *
 * The first version read StudyTutorBoard.jsx by path. PR #359 replaces that
 * board with StudyTutorShell.jsx, so on the merge that lands second this test
 * would have thrown ENOENT — a crash that says a file is missing, not that a
 * feature lost its renderer. Worse, had the path simply been updated, the
 * server would have gone on returning a next move that nothing displayed.
 *
 * So the assertion is on the CAPABILITY, not on a filename: some Study result
 * component renders the server's line, and no Study component computes the
 * learner model in the browser.
 */
const STUDY_RESULT_COMPONENTS = [
  'src/components/StudyTutorBoard.jsx',
  'src/components/StudyTutorShell.jsx',
];

test('Study next move is rendered from the server learner model, not inferred in the browser', () => {
  const present = STUDY_RESULT_COMPONENTS
    .map((relative) => [relative, path.join(root, relative)])
    .filter(([, full]) => fs.existsSync(full))
    .map(([relative, full]) => [relative, fs.readFileSync(full, 'utf8')]);

  assert.ok(present.length, `no Study result component exists: ${STUDY_RESULT_COMPONENTS.join(', ')}`);

  /*
   * The chain, not its punctuation. Pinning `assessment.result.learnerModel?...`
   * with plain dots failed against a component reaching the same field through
   * optional chaining — pinning an exact expression is the same mistake as
   * pinning exact prose.
   */
  const RENDERS_SERVER_MOVE = /learnerModel[?.\s]*nextLearningMove[?.\s]*learnerFacingText/;
  const renders = present.filter(([, source]) => RENDERS_SERVER_MOVE.test(source));
  assert.ok(
    renders.length,
    `The server returns a next learning move and no Study component renders it. `
    + `Port the learnerFacingText line into: ${present.map(([relative]) => relative).join(', ')}`,
  );

  /*
   * IMPORTED OR CALLED, not merely mentioned.
   *
   * A raw substring check counts a COMMENT as a violation — the same flaw the
   * wiring gate had before it learned to skip comments and strings, where a
   * docblock cleared the very symbol it documented. Naming the server function
   * in a comment is how a reader learns where mastery is decided; importing or
   * calling it in the browser is the thing that must never happen.
   */
  const COMPUTES_LOCALLY = /\bimport\b[^;]*\bbuildStudyLearnerModel\b|\bbuildStudyLearnerModel\s*\(/;
  for (const [relative, source] of present) {
    assert.equal(
      COMPUTES_LOCALLY.test(source),
      false,
      `${relative} computes the learner model in the browser; the server decides mastery`,
    );
  }
});
