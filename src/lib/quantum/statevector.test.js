/*
 * Tests for the state-vector simulator.
 *
 * Every expectation here is a value the textbook fixes independently of this
 * implementation — a Bell pair is exactly 50/50 across |00> and |11> with
 * nothing in between, X on |0> is certainly |1>, and H twice is the identity.
 * Checking the code against itself would prove nothing; these check it against
 * quantum mechanics.
 *
 * Run with:  node --test src/lib/quantum/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StateVector, GATES, RX, RY, runCircuit, sample, MAX_QUBITS } from './statevector.js';

const close = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;
const probsOf = (state) => Array.from(state.probabilities());

test('a fresh register is certainly |0...0>', () => {
  const s = new StateVector(3);
  const p = probsOf(s);
  assert.ok(close(p[0], 1), 'all probability should sit on |000>');
  assert.ok(close(p.slice(1).reduce((a, b) => a + b, 0), 0));
});

test('X flips |0> to |1> with certainty', () => {
  const s = new StateVector(1);
  s.applySingle(0, GATES.X);
  const p = probsOf(s);
  assert.ok(close(p[0], 0));
  assert.ok(close(p[1], 1));
});

test('H on |0> is an exact coin', () => {
  const s = new StateVector(1);
  s.applySingle(0, GATES.H);
  const p = probsOf(s);
  assert.ok(close(p[0], 0.5), `expected 0.5, got ${p[0]}`);
  assert.ok(close(p[1], 0.5));
});

test('H is its own inverse — interference, not randomness', () => {
  // If H merely randomised, applying it twice would leave a coin flip.
  // It restores |0> exactly, which is the whole point.
  const s = new StateVector(1);
  s.applySingle(0, GATES.H);
  s.applySingle(0, GATES.H);
  assert.ok(close(probsOf(s)[0], 1), 'H twice must return to |0>');
});

test('Bell state: 50/50 on |00> and |11>, exactly zero elsewhere', () => {
  const s = runCircuit(2, [
    { gate: 'H', target: 0 },
    { gate: 'CNOT', control: 0, target: 1 },
  ]);
  const p = probsOf(s);
  assert.ok(close(p[0], 0.5), `|00> expected 0.5, got ${p[0]}`);
  assert.ok(close(p[1], 0), `|01> must be impossible, got ${p[1]}`);
  assert.ok(close(p[2], 0), `|10> must be impossible, got ${p[2]}`);
  assert.ok(close(p[3], 0.5), `|11> expected 0.5, got ${p[3]}`);
});

test('CNOT does nothing when the control is |0>', () => {
  const s = runCircuit(2, [{ gate: 'CNOT', control: 0, target: 1 }]);
  assert.ok(close(probsOf(s)[0], 1));
});

test('CNOT flips the target when the control is |1>', () => {
  const s = runCircuit(2, [
    { gate: 'X', target: 0 },
    { gate: 'CNOT', control: 0, target: 1 },
  ]);
  // q0=1, q1=1 -> index 3
  assert.ok(close(probsOf(s)[3], 1));
});

test('qubit 0 is the least significant bit, matching Qiskit', () => {
  const s = runCircuit(2, [{ gate: 'X', target: 0 }]);
  const p = probsOf(s);
  assert.ok(close(p[1], 1), 'X on qubit 0 must land on index 1, not 2');
});

test('GHZ state spreads across |000> and |111> only', () => {
  const s = runCircuit(3, [
    { gate: 'H', target: 0 },
    { gate: 'CNOT', control: 0, target: 1 },
    { gate: 'CNOT', control: 0, target: 2 },
  ]);
  const p = probsOf(s);
  assert.ok(close(p[0], 0.5));
  assert.ok(close(p[7], 0.5));
  for (const i of [1, 2, 3, 4, 5, 6]) assert.ok(close(p[i], 0), `|${s.label(i)}> should be empty`);
});

test('Z leaves probabilities alone but is not the identity', () => {
  // Phase is invisible to measurement on its own, and decisive after interference.
  const a = runCircuit(1, [{ gate: 'H', target: 0 }, { gate: 'Z', target: 0 }]);
  assert.ok(close(probsOf(a)[0], 0.5), 'Z must not change measured probabilities here');

  const b = runCircuit(1, [{ gate: 'H', target: 0 }, { gate: 'Z', target: 0 }, { gate: 'H', target: 0 }]);
  assert.ok(close(probsOf(b)[1], 1), 'H-Z-H must flip |0> to |1>');
});

test('RY(pi) behaves as a bit flip', () => {
  const s = new StateVector(1);
  s.applySingle(0, RY(Math.PI));
  assert.ok(close(probsOf(s)[1], 1, 1e-10));
});

test('RX(pi/2) puts a qubit on the equator', () => {
  const s = new StateVector(1);
  s.applySingle(0, RX(Math.PI / 2));
  const p = probsOf(s);
  assert.ok(close(p[0], 0.5, 1e-12) && close(p[1], 0.5, 1e-12));
});

test('SWAP exchanges two qubits', () => {
  const s = runCircuit(2, [{ gate: 'X', target: 0 }, { gate: 'SWAP', control: 0, target: 1 }]);
  assert.ok(close(probsOf(s)[2], 1), 'the excitation should move to qubit 1');
});

test('Toffoli fires only when both controls are set', () => {
  const off = runCircuit(3, [{ gate: 'X', target: 0 }, { gate: 'TOFFOLI', controls: [0, 1], target: 2 }]);
  assert.ok(close(probsOf(off)[1], 1), 'one control set is not enough');

  const on = runCircuit(3, [
    { gate: 'X', target: 0 }, { gate: 'X', target: 1 },
    { gate: 'TOFFOLI', controls: [0, 1], target: 2 },
  ]);
  assert.ok(close(probsOf(on)[7], 1), 'both controls set must flip the target');
});

test('probability is conserved across a long random circuit', () => {
  const gates = ['H', 'X', 'Y', 'Z', 'S', 'T'];
  const circuit = [];
  for (let i = 0; i < 200; i++) {
    circuit.push({ gate: gates[i % gates.length], target: i % 4 });
    if (i % 5 === 0) circuit.push({ gate: 'CNOT', control: i % 4, target: (i + 1) % 4 });
  }
  const s = runCircuit(4, circuit);
  assert.ok(close(s.norm(), 1, 1e-9), `norm drifted to ${s.norm()}`);
});

test('sampling reproduces the distribution it was drawn from', () => {
  const s = runCircuit(2, [{ gate: 'H', target: 0 }, { gate: 'CNOT', control: 0, target: 1 }]);
  let seed = 42;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const counts = sample(s, 20000, rng);
  const total = counts.reduce((a, b) => a + b, 0);
  assert.equal(total, 20000, 'every shot must be accounted for');
  assert.equal(counts[1], 0, 'an impossible outcome must never be sampled');
  assert.equal(counts[2], 0);
  assert.ok(Math.abs(counts[0] / total - 0.5) < 0.02, `|00> share was ${counts[0] / total}`);
});

test('rejects registers it cannot honestly simulate', () => {
  assert.throws(() => new StateVector(0));
  assert.throws(() => new StateVector(MAX_QUBITS + 1));
  assert.throws(() => new StateVector(2.5));
});

test('rejects a gate controlled by its own target', () => {
  const s = new StateVector(2);
  assert.throws(() => s.applyControlled(1, 1, GATES.X));
});
