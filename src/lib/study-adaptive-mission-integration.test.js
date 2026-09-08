import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STUDY_ADAPTIVE_MISSION_REQUEST_EVENT,
  requestStudyAdaptiveMission,
} from './study-adaptive-mission-event.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('mission request bridge is synchronous and falls back cleanly when no Study shell owns it', () => {
  const originalWindow = globalThis.window;
  const originalCustomEvent = globalThis.CustomEvent;
  const listeners = new Map();

  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  globalThis.CustomEvent = FakeCustomEvent;
  globalThis.window = {
    addEventListener(type, listener) {
      const rows = listeners.get(type) || [];
      rows.push(listener);
      listeners.set(type, rows);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    },
  };

  try {
    assert.equal(requestStudyAdaptiveMission({ source: 'guided_chip', item: { id: 'study-work-together' } }), false);
    window.addEventListener(STUDY_ADAPTIVE_MISSION_REQUEST_EVENT, (event) => {
      event.detail.handled = true;
    });
    assert.equal(requestStudyAdaptiveMission({ source: 'guided_chip', item: { id: 'study-work-together' } }), true);
    assert.equal(requestStudyAdaptiveMission({ source: 'unknown' }), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = originalCustomEvent;
  }
});

test('Compass and the work-together chip both hand off to one persistent mission owner with legacy fallback intact', () => {
  const hub = read('components/StudyHubLauncher.jsx');
  const suggestions = read('components/StudioInlineSuggestions.jsx');
  const shell = read('components/StudyTutorShell.jsx');

  assert.match(hub, /requestStudyAdaptiveMission\(\{ source: 'compass', recommendation \}\)/);
  assert.match(hub, /if \(!missionHandled\)[\s\S]*studyCompassMissionAsk/);
  assert.match(suggestions, /item\?\.id === 'study-work-together'[\s\S]*requestStudyAdaptiveMission/);
  assert.match(suggestions, /onSelectContinue\?\.\(item\)/, 'unhandled chips must keep their existing continuation behavior');

  assert.match(shell, /addEventListener\(STUDY_ADAPTIVE_MISSION_REQUEST_EVENT/);
  assert.match(shell, /data-quantora-study-adaptive-mission=\{mission\.phase\}/);
  assert.match(shell, /onRequestAssessment\(\{ explicitRetry \}\)/, 'mission checks must reuse the existing governed assessment owner');
  assert.doesNotMatch(shell, /requestStudyAssessment|gradeStudyAssessment|saveStudyMasteryEstimate/);
});

test('mission check wiring fails closed instead of converting unavailable verified evidence into a model quiz', () => {
  const shell = read('components/StudyTutorShell.jsx');
  const missionCheck = shell.slice(shell.indexOf('const requestMissionCheck'), shell.indexOf('const beginCompassMission'));
  assert.match(missionCheck, /CHECK_UNAVAILABLE/);
  assert.doesNotMatch(missionCheck, /studyQuizAsk|askOrSend/);
  assert.match(missionCheck, /sameStudyMissionLabel\(topic, label\)/);
});
