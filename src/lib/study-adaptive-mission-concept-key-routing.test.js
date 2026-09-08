import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Compass canonical concept key reaches the governed assessment owner', () => {
  const shell = read('components/StudyTutorShell.jsx');
  const workspace = read('components/StudyTutorWorkspace.jsx');
  const missionCheck = shell.slice(shell.indexOf('const requestMissionCheck'), shell.indexOf('const beginCompassMission'));
  const requestOwner = workspace.slice(workspace.indexOf('const handleRequestAssessment'), workspace.indexOf('const handleSubmitAssessment'));

  assert.match(missionCheck, /onRequestAssessment\(\{ explicitRetry, conceptKey: targetKey \}\)/,
    'the mission must forward the known Compass canonical key instead of dropping it');
  assert.match(requestOwner, /\{ explicitRetry = false, conceptKey = '' \}/,
    'the existing Workspace assessment owner must accept the optional canonical key');
  assert.match(requestOwner, /assessmentConceptKey = String\(conceptKey \|\| ''\)\.trim\(\) \|\| brief\.conceptId/,
    'ordinary non-mission checks must retain the existing brief concept fallback');
  assert.match(requestOwner, /requestStudyAssessment\(\{[\s\S]*conceptId: assessmentConceptKey/,
    'the governed issue request must use the unambiguous Compass key when supplied');
});
