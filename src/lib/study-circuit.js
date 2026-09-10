// One battery + internal resistance + one ohmic lamp/load. Steady-state model.
// https://openstax.org/books/university-physics-volume-2/pages/10-1-electromotive-force
// Display phase/speed is illustrative, NOT charge drift or signal propagation.
const bounds = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function createStudyCircuitState() {
  return { voltage: 6, resistance: 10, internalResistance: 0, connected: true, playing: false, phase: 0 };
}

export function studyCircuitModel(state) {
  if (!state || typeof state.connected !== 'boolean'
    || !bounds(state.voltage, 1, 12) || !bounds(state.resistance, 2, 30)
    || !bounds(state.internalResistance, 0, 5)) return null;
  const current = state.connected ? state.voltage / (state.resistance + state.internalResistance) : 0;
  return {
    current,
    terminalVoltage: state.voltage - current * state.internalResistance,
    loadPower: current * current * state.resistance,
    internalPower: current * current * state.internalResistance,
    sourcePower: state.voltage * current,
    lampOn: state.connected && current > 0,
  };
}

export function transitionStudyCircuit(state, event) {
  if (!state || !event) return state;
  switch (event.type) {
    case 'play': return { ...state, playing: true };
    case 'pause': return { ...state, playing: false };
    case 'open': return { ...state, connected: false };
    case 'reconnect': return { ...state, connected: true };
    case 'reset': return createStudyCircuitState();
    case 'voltage': return bounds(event.value, 1, 12) ? { ...state, voltage: event.value } : state;
    case 'resistance': return bounds(event.value, 2, 30) ? { ...state, resistance: event.value } : state;
    case 'internalResistance': return bounds(event.value, 0, 5) ? { ...state, internalResistance: event.value } : state;
    case 'step': return state.connected ? { ...state, phase: (state.phase + 0.025) % 1 } : state;
    case 'tick': {
      if (!state.connected || !state.playing || !bounds(event.deltaMs, 0, 100)) return state;
      return { ...state, phase: (state.phase + event.deltaMs / 6000) % 1 };
    }
    default: return state;
  }
}

// Clockwise conventional-current path: positive terminal at upper left,
// load at right, return wire along the bottom, negative terminal at lower left.
export function studyCircuitPoint(phase) {
  const p = typeof phase === 'number' && Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
  const distance = p * 824;
  if (distance < 255) return { x: 75 + distance, y: 58 };
  if (distance < 412) return { x: 330, y: 58 + distance - 255 };
  if (distance < 667) return { x: 330 - (distance - 412), y: 215 };
  return { x: 75, y: 215 - (distance - 667) };
}
