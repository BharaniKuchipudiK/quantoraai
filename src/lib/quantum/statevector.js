/*
 * A state-vector quantum simulator.
 *
 * This replaces a Math.random() call that pretended to be quantum mechanics.
 * Everything here is exact: amplitudes are tracked as complex numbers and the
 * probabilities that come out are the real Born-rule probabilities, not an
 * approximation and not a decoration.
 *
 * How it works, briefly. A register of n qubits is described by 2^n complex
 * amplitudes — one per basis state. Applying a gate is a linear map on that
 * vector. That is the entire model; there is no shortcut and no cleverness
 * required. Two Float64Arrays hold the real and imaginary parts, which keeps
 * the arithmetic explicit and avoids allocating an object per amplitude.
 *
 * Cost is 2^n, so this is honest only for small registers. Twelve qubits is
 * 4096 amplitudes and instantaneous; twenty is a million and starts to hurt;
 * fifty would need more memory than exists on Earth. That ceiling is not a
 * limitation of this code — it is the reason quantum computers are interesting.
 *
 * Convention: qubit 0 is the LEAST significant bit, matching Qiskit, so the
 * basis label for |q1 q0> reads right-to-left. Getting this backwards is the
 * single most common source of "my simulator disagrees with the textbook".
 */

export const MAX_QUBITS = 12;

export class StateVector {
  constructor(numQubits) {
    if (!Number.isInteger(numQubits) || numQubits < 1 || numQubits > MAX_QUBITS) {
      throw new Error(`Qubit count must be a whole number between 1 and ${MAX_QUBITS}.`);
    }
    this.n = numQubits;
    this.size = 1 << numQubits;
    this.re = new Float64Array(this.size);
    this.im = new Float64Array(this.size);
    this.re[0] = 1; // start in |00...0>
  }

  clone() {
    const copy = new StateVector(this.n);
    copy.re.set(this.re);
    copy.im.set(this.im);
    return copy;
  }

  /*
   * Apply a 2x2 unitary to one qubit.
   *
   * The amplitudes split into pairs that differ only in bit `q`. Each pair is
   * a little 2-vector, and the gate acts on it independently of every other
   * pair — which is why this is a loop over half the state and not a 2^n x 2^n
   * matrix multiplication.
   */
  applySingle(q, m) {
    if (q < 0 || q >= this.n) throw new Error(`Qubit ${q} is outside this register.`);
    const bit = 1 << q;
    const { re, im } = this;

    for (let i = 0; i < this.size; i++) {
      if (i & bit) continue;         // visit each pair once, from its 0-branch
      const j = i | bit;

      const ar = re[i], ai = im[i];
      const br = re[j], bi = im[j];

      re[i] = m[0].re * ar - m[0].im * ai + m[1].re * br - m[1].im * bi;
      im[i] = m[0].re * ai + m[0].im * ar + m[1].re * bi + m[1].im * br;
      re[j] = m[2].re * ar - m[2].im * ai + m[3].re * br - m[3].im * bi;
      im[j] = m[2].re * ai + m[2].im * ar + m[3].re * bi + m[3].im * br;
    }
    return this;
  }

  /* Same, but only on the branches where every control qubit is 1. */
  applyControlled(controls, target, m) {
    const list = Array.isArray(controls) ? controls : [controls];
    for (const c of list) {
      if (c === target) throw new Error('A qubit cannot control a gate applied to itself.');
      if (c < 0 || c >= this.n) throw new Error(`Qubit ${c} is outside this register.`);
    }
    if (target < 0 || target >= this.n) throw new Error(`Qubit ${target} is outside this register.`);

    let mask = 0;
    for (const c of list) mask |= (1 << c);
    const bit = 1 << target;
    const { re, im } = this;

    for (let i = 0; i < this.size; i++) {
      if (i & bit) continue;
      if ((i & mask) !== mask) continue;   // controls not all set: leave alone
      const j = i | bit;

      const ar = re[i], ai = im[i];
      const br = re[j], bi = im[j];

      re[i] = m[0].re * ar - m[0].im * ai + m[1].re * br - m[1].im * bi;
      im[i] = m[0].re * ai + m[0].im * ar + m[1].re * bi + m[1].im * br;
      re[j] = m[2].re * ar - m[2].im * ai + m[3].re * br - m[3].im * bi;
      im[j] = m[2].re * ai + m[2].im * ar + m[3].re * bi + m[3].im * br;
    }
    return this;
  }

  /* Born rule: probability of each basis state is |amplitude|^2. */
  probabilities() {
    const out = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) {
      out[i] = this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    return out;
  }

  /* Total probability. Should be 1; drift means a non-unitary gate slipped in. */
  norm() {
    let sum = 0;
    const p = this.probabilities();
    for (let i = 0; i < this.size; i++) sum += p[i];
    return sum;
  }

  /* Basis label for index i, most-significant qubit first, as people write it. */
  label(i) {
    return i.toString(2).padStart(this.n, '0');
  }
}

/* ---- Gate matrices, in row-major order [m00, m01, m10, m11] ---- */

const C = (re, im = 0) => ({ re, im });
const INV_SQRT2 = 1 / Math.SQRT2;

export const GATES = {
  I: [C(1), C(0), C(0), C(1)],
  X: [C(0), C(1), C(1), C(0)],
  Y: [C(0), C(0, -1), C(0, 1), C(0)],
  Z: [C(1), C(0), C(0), C(-1)],
  H: [C(INV_SQRT2), C(INV_SQRT2), C(INV_SQRT2), C(-INV_SQRT2)],
  S: [C(1), C(0), C(0), C(0, 1)],
  SDG: [C(1), C(0), C(0), C(0, -1)],
  T: [C(1), C(0), C(0), C(INV_SQRT2, INV_SQRT2)],
  TDG: [C(1), C(0), C(0), C(INV_SQRT2, -INV_SQRT2)],
};

export const RX = (t) => [C(Math.cos(t / 2)), C(0, -Math.sin(t / 2)), C(0, -Math.sin(t / 2)), C(Math.cos(t / 2))];
export const RY = (t) => [C(Math.cos(t / 2)), C(-Math.sin(t / 2)), C(Math.sin(t / 2)), C(Math.cos(t / 2))];
export const RZ = (t) => [C(Math.cos(t / 2), -Math.sin(t / 2)), C(0), C(0), C(Math.cos(t / 2), Math.sin(t / 2))];

/*
 * Run a circuit and return the final state.
 *
 * A circuit is a plain array of steps, deliberately serialisable so it can be
 * saved, shared, or produced by a model:
 *   { gate: 'H',    target: 0 }
 *   { gate: 'CNOT', control: 0, target: 1 }
 *   { gate: 'RY',   target: 1, angle: Math.PI / 4 }
 */
export function runCircuit(numQubits, circuit) {
  const state = new StateVector(numQubits);

  for (const step of circuit || []) {
    if (!step || typeof step.gate !== 'string') continue;
    const name = step.gate.toUpperCase();
    const target = step.target ?? 0;

    if (name === 'CNOT' || name === 'CX') {
      state.applyControlled(step.control ?? 0, target, GATES.X);
    } else if (name === 'CZ') {
      state.applyControlled(step.control ?? 0, target, GATES.Z);
    } else if (name === 'TOFFOLI' || name === 'CCX') {
      state.applyControlled(step.controls ?? [0, 1], target, GATES.X);
    } else if (name === 'SWAP') {
      // Three CNOTs, the standard identity — cheaper than a bespoke 4x4 path.
      const a = step.control ?? 0, b = target;
      state.applyControlled(a, b, GATES.X);
      state.applyControlled(b, a, GATES.X);
      state.applyControlled(a, b, GATES.X);
    } else if (name === 'RX') {
      state.applySingle(target, RX(step.angle ?? Math.PI / 2));
    } else if (name === 'RY') {
      state.applySingle(target, RY(step.angle ?? Math.PI / 2));
    } else if (name === 'RZ') {
      state.applySingle(target, RZ(step.angle ?? Math.PI / 2));
    } else if (GATES[name]) {
      state.applySingle(target, GATES[name]);
    }
  }

  return state;
}

/*
 * Sample measurement outcomes.
 *
 * Deliberately separate from probabilities(). A real device does not hand you
 * a distribution — it hands you one outcome at a time, and the distribution
 * only appears once you have repeated the experiment. Showing 512 noisy shots
 * next to the exact curve is how the difference between amplitude and
 * observation stops being an abstract sentence.
 */
export function sample(state, shots = 1024, rng = Math.random) {
  const probs = state.probabilities();
  const cumulative = new Float64Array(probs.length);
  let running = 0;
  for (let i = 0; i < probs.length; i++) {
    running += probs[i];
    cumulative[i] = running;
  }

  const counts = new Uint32Array(probs.length);
  for (let s = 0; s < shots; s++) {
    const r = rng() * running;   // scaled by the true total, so float drift cannot lose a shot
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r <= cumulative[mid]) hi = mid; else lo = mid + 1;
    }
    counts[lo] += 1;
  }
  return counts;
}

/*
 * The reduced density matrix of a single qubit.
 *
 * A qubit inside an entangled register has no state of its own — the register
 * has a state, and the qubit is only part of it. Tracing out every other qubit
 * is what makes that concrete: the result is a 2x2 matrix that describes
 * everything measurable about this one qubit alone.
 *
 * This is the object the Bloch sphere is drawn from, and the reason an
 * entangled qubit lands at the centre of the sphere instead of on its surface.
 */
export function reducedDensityMatrix(state, q) {
  if (q < 0 || q >= state.n) throw new Error(`Qubit ${q} is outside this register.`);
  const bit = 1 << q;
  let r00 = 0, r11 = 0, r01re = 0, r01im = 0;

  for (let i = 0; i < state.size; i++) {
    if (i & bit) continue;
    const j = i | bit;
    const ar = state.re[i], ai = state.im[i];   // amplitude with this qubit = 0
    const br = state.re[j], bi = state.im[j];   // amplitude with this qubit = 1

    r00 += ar * ar + ai * ai;
    r11 += br * br + bi * bi;
    // rho01 = sum over the rest of  a * conj(b)
    r01re += ar * br + ai * bi;
    r01im += ai * br - ar * bi;
  }
  return { r00, r11, r01re, r01im };
}

/*
 * Bloch vector for one qubit: rho = (I + r.sigma) / 2.
 *
 * The length of r is the whole story. A qubit in a definite state of its own
 * sits on the surface (|r| = 1). Entangle it with another and r shrinks toward
 * the origin — at |r| = 0 the qubit has no individual state at all, only a
 * relationship. Watching the arrow collapse the moment a CNOT is applied
 * explains entanglement better than any sentence about it.
 */
export function blochVector(state, q) {
  const { r00, r11, r01re, r01im } = reducedDensityMatrix(state, q);
  const x = 2 * r01re;
  const y = -2 * r01im;
  const z = r00 - r11;
  return { x, y, z, purity: Math.sqrt(x * x + y * y + z * z) };
}

/*
 * The state after the first `steps` gates.
 *
 * Step-through is not a debugging convenience here, it is the pedagogy: the
 * final distribution tells you where you ended up, and says nothing about how.
 * Replaying gate by gate is where the intuition forms.
 */
export function runCircuitTo(numQubits, circuit, steps) {
  const limit = Math.max(0, Math.min(steps, (circuit || []).length));
  return runCircuit(numQubits, (circuit || []).slice(0, limit));
}
