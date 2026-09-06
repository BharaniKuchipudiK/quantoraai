import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Assessment owns setup, running, summary, and History while Study AI stays intervention-only', () => {
  const workspace = read('src/components/StudyAssessmentWorkspace.jsx');
  const tutor = read('src/components/StudyTutorWorkspace.jsx');
  const hub = read('src/components/StudyHubLauncher.jsx');
  const shell = read('src/components/StudyTutorShell.jsx');

  for (const label of ['How many questions?', 'One at a time', 'All at once', 'After each question', 'At the end', 'Assessment history']) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(workspace, /data-quantora-study-assessment-setup="true"/);
  assert.match(workspace, /data-quantora-study-assessment-running="one_at_a_time"/);
  assert.match(workspace, /data-quantora-study-assessment-running="all_at_once"/);
  assert.match(workspace, /data-quantora-study-assessment-summary="true"/);
  assert.match(workspace, /<StudyAssessmentHistory/);

  assert.doesNotMatch(hub, /Assessment history/);
  assert.doesNotMatch(hub, /StudyAssessmentHistory/);
  assert.doesNotMatch(shell, /STUDY_SURFACE_REQUEST_EVENT|STUDY_SURFACE\.ASSESSMENT/);
  assert.match(tutor, /STUDY_SURFACE\.ASSESSMENT/);
  assert.match(tutor, /event\.detail\.handled = true/);
  assert.match(tutor, /setAssessmentWorkspaceOpen\(true\)/);
});

test('Assessment surface listener is mounted above the onboarding render guard', () => {
  const tutor = read('src/components/StudyTutorWorkspace.jsx');
  const listener = tutor.indexOf("event?.detail?.surface !== STUDY_SURFACE.ASSESSMENT");
  const loadingGuard = tutor.indexOf("if (onboarding.status === 'loading') return null;");
  assert.ok(listener >= 0, 'Assessment listener is missing');
  assert.ok(loadingGuard > listener, 'Assessment listener must mount before onboarding can suppress rendering');
});

test('Assessment sessions reuse the governed issue and grade paths for both presentation modes', () => {
  const tutor = read('src/components/StudyTutorWorkspace.jsx');
  const client = read('src/lib/study-evidence-client.js');
  const server = read('api/_lib/study-assessment.ts');

  assert.match(tutor, /requestStudyAssessment\(/);
  assert.match(tutor, /gradeStudyAssessment\(/);
  assert.match(tutor, /issueAssessmentBatch/);
  assert.match(tutor, /excludeItemRefs:\s*exclusions/);
  assert.match(tutor, /submitAssessmentBatch/);
  assert.match(client, /excludeItemRefs/);
  assert.match(server, /request\.excludeItemRefs/);
  assert.match(server, /usedItemRefs\.add\(itemRef\)/);

  // The browser can narrow a governed candidate set, never receive the answer key.
  assert.doesNotMatch(client, /correctOptionId|correct_option_id/);
  assert.doesNotMatch(tutor, /correctOptionId|correct_option_id/);
});

test('quick Check remains a separate inline learner move and explicit retry stays explicit', () => {
  const shell = read('src/components/StudyTutorShell.jsx');
  assert.match(shell, /aria-label="Test me on this"/);
  assert.match(shell, /requestCheck\(\{ explicitRetry: completedCheck \}\)/);
  assert.match(shell, /Retry this one/);
  assert.match(shell, /requestCheck\(\{ explicitRetry: true \}\)/);
});
