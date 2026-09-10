import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createStudyCircuitState, studyCircuitModel, studyCircuitPoint, transitionStudyCircuit } from './study-circuit.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test('DC circuit obeys Ohm and power conservation across the supported parameter range', () => {
  for (const voltage of [1, 6, 12]) for (const resistance of [2, 10, 30]) for (const internalResistance of [0, 1, 5]) {
    const model = studyCircuitModel({ voltage, resistance, internalResistance, connected: true });
    near(model.current, voltage / (resistance + internalResistance));
    near(model.terminalVoltage, model.current * resistance);
    near(model.sourcePower, model.loadPower + model.internalPower);
    assert.equal(model.lampOn, true);
  }
});
test('opening the return wire stops sustained DC but does not erase battery voltage', () => {
  let state = transitionStudyCircuit(createStudyCircuitState(), { type: 'play' });
  state = transitionStudyCircuit(state, { type: 'tick', deltaMs: 50 });
  const opened = transitionStudyCircuit(state, { type: 'open' });
  const model = studyCircuitModel(opened);
  assert.equal(model.current, 0);
  assert.equal(model.loadPower, 0);
  assert.equal(model.terminalVoltage, 6);
  assert.equal(model.lampOn, false);
  assert.equal(transitionStudyCircuit(opened, { type: 'tick', deltaMs: 50 }), opened);
  assert.equal(transitionStudyCircuit(opened, { type: 'step' }), opened);
  assert.equal(studyCircuitModel(transitionStudyCircuit(opened, { type: 'reconnect' })).current, 0.6);
});
test('Pause freezes the illustration, NOT the physical circuit current', () => {
  const playing = transitionStudyCircuit(createStudyCircuitState(), { type: 'play' });
  const moved = transitionStudyCircuit(playing, { type: 'tick', deltaMs: 50 });
  assert.ok(moved.phase > 0);
  const paused = transitionStudyCircuit(moved, { type: 'pause' });
  assert.equal(transitionStudyCircuit(paused, { type: 'tick', deltaMs: 50 }), paused);
  near(studyCircuitModel(paused).current, 0.6);
  assert.ok(transitionStudyCircuit(paused, { type: 'step' }).phase > paused.phase);
});
test('Reset restores circuit, controls and display; events are pure and fail closed', () => {
  const initial = createStudyCircuitState();
  const original = JSON.stringify(initial);
  const changed = transitionStudyCircuit(transitionStudyCircuit(initial, { type: 'voltage', value: 12 }), { type: 'open' });
  assert.deepEqual(transitionStudyCircuit(changed, { type: 'reset' }), initial);
  assert.equal(JSON.stringify(initial), original);
  for (const value of [-1, Infinity, NaN, '6', null, 500]) {
    assert.equal(transitionStudyCircuit(initial, { type: 'voltage', value }), initial);
    assert.equal(studyCircuitModel({ ...initial, voltage: value }), null);
  }
  assert.equal(transitionStudyCircuit(initial, { type: 'unknown' }), initial);
});
test('current markers trace a closed clockwise loop with finite deterministic coordinates', () => {
  assert.deepEqual(studyCircuitPoint(0), { x: 75, y: 58 });
  assert.deepEqual(studyCircuitPoint(1), studyCircuitPoint(0));
  near(studyCircuitPoint(255 / 824).x, 330);
  near(studyCircuitPoint(412 / 824).y, 215);
  for (let i = -30; i <= 60; i += 1) {
    const point = studyCircuitPoint(i / 30);
    assert.ok(point.x >= 75 - 1e-9 && point.x <= 330 + 1e-9);
    assert.ok(point.y >= 58 - 1e-9 && point.y <= 215 + 1e-9);
  }
});
test('circuit is a native illustration, not a new evidence, persistence or executable-content authority', () => {
  const model = readFileSync(new URL('./study-circuit.js', import.meta.url), 'utf8');
  assert.doesNotMatch(model, /fetch\s*\(|localStorage|sessionStorage|supabase|eval\s*\(|new Function|Math\.random/);
  const component = readFileSync(new URL('../components/StudyCircuitLab.jsx', import.meta.url), 'utf8');
  assert.match(component, /cancelAnimationFrame\(frame\)/);
  assert.match(component, /observer\.disconnect\(\)/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /visibilitychange/);
  assert.doesNotMatch(component, /setInterval|fetch\s*\(|localStorage|sessionStorage|masteryUpdated|supabase/);
});
