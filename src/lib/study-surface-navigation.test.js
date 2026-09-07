import assert from 'node:assert/strict';
import test from 'node:test';
import { requestStudySurface, STUDY_SURFACE } from './study-surface-navigation.js';

function withFakeWindow(dispatchEvent, run) {
  const previous = globalThis.window;
  class FakeCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  globalThis.window = { dispatchEvent, CustomEvent: FakeCustomEvent };
  try {
    run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test('Study surface requests fail closed when no mounted consumer acknowledges them', () => {
  withFakeWindow(() => true, () => {
    assert.equal(requestStudySurface(STUDY_SURFACE.ASSESSMENT), false);
    assert.equal(requestStudySurface(STUDY_SURFACE.NOTEBOOK), false);
  });
});

test('Study surface requests succeed only after a consumer acknowledges synchronously', () => {
  withFakeWindow((event) => {
    event.detail.handled = true;
    return true;
  }, () => {
    assert.equal(requestStudySurface(STUDY_SURFACE.ASSESSMENT), true);
    assert.equal(requestStudySurface(STUDY_SURFACE.NOTEBOOK), true);
  });
});

test('unknown Study surfaces never dispatch', () => {
  let dispatches = 0;
  withFakeWindow(() => {
    dispatches += 1;
    return true;
  }, () => {
    assert.equal(requestStudySurface('not-a-study-surface'), false);
    assert.equal(dispatches, 0);
  });
});
